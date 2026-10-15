// P8-4's HTTP acceptance against two real handler instances and concurrent
// PostgreSQL sessions. No production DB, provider credential or Google call.
import crypto from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
const holder=vi.hoisted(()=>({pool:null,googleCalls:0}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(strings,...values)=>{
 let text=strings[0];
 for(let i=0;i<values.length;i++)text+='$'+(i+1)+strings[i+1];
 return (await holder.pool.query(text,values)).rows;
}}));
vi.mock('../../src/auth/google-auth-hosted.js',()=>({buildHostedApiClients:async()=>{
 holder.googleCalls++;
 throw Error('Identity and rate-limit routes must never call Google.');
}}));
const url=process.env.TEST_DATABASE_URL;
if(!url)console.warn('[P8-4 HTTP/PG] TEST_DATABASE_URL absent; shared HTTP rate proof SKIPPED.');
function response(){
 const r={statusCode:200,headers:{},body:null};
 r.setHeader=(key,value)=>{r.headers[key]=value;};
 r.status=n=>{r.statusCode=n;return r;};
 r.json=value=>{r.body=value;return r;};
 return r;
}
describe.skipIf(!url)('P8-4 two independent HTTP handler instances with shared real Postgres',()=>{
 let admin,schema,db,left,right,oldDatabase,oldAccounts;
 const account='rtc-http@example.test';
 const invoke=async(handler,token)=>{
  const res=response();
  await handler({method:'GET',query:{door:'whoami'},headers:{authorization:'Bearer '+token}},res);
  return res;
 };
 const makePass=rateLimit=>db.createRtcPass({googleAccount:account,rateLimit});
 beforeAll(async()=>{
  oldDatabase=process.env.DATABASE_URL;oldAccounts=process.env.RTC_TEST_ACCOUNT_EMAILS;
  process.env.DATABASE_URL=url;process.env.RTC_TEST_ACCOUNT_EMAILS=account;
  admin=new pg.Client({connectionString:url});await admin.connect();
  schema='rtc_http_'+crypto.randomBytes(6).toString('hex');
  await admin.query('CREATE SCHEMA '+schema);
  // Each query can run on a separate backend; a single pg.Client would
  // serialize 150 promises and conceal a broken read-then-update counter.
  holder.pool=new pg.Pool({connectionString:url,max:12,options:'-c search_path='+schema});
  db=await import('../../src/db.js');await db.initSchema();
  await db.saveGoogleTokensFor(account,{access_token:'synthetic-google-access'});
  const {createRtcGateway}=await import('../../api/rtc-gateway.js');
  left=createRtcGateway();right=createRtcGateway();
  expect(left).not.toBe(right);
  // Warm both schema gates without charging a valid pass. PostgreSQL DDL
  // cold-start coordination is independent from the request-counter test.
  expect((await invoke(left,'invalid')).statusCode).toBe(401);
  expect((await invoke(right,'invalid')).statusCode).toBe(401);
 });
 afterAll(async()=>{
  await holder.pool?.end();
  if(admin){try{if(schema)await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await admin.end();}}
  if(oldDatabase===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDatabase;
  if(oldAccounts===undefined)delete process.env.RTC_TEST_ACCOUNT_EMAILS;else process.env.RTC_TEST_ACCOUNT_EMAILS=oldAccounts;
 });
 it('allows exactly 120 of 150 overlapping requests across two instances',async()=>{
  const {token,id}=await makePass(120);
  const out=await Promise.all(Array.from({length:150},(_,i)=>invoke(i%2?left:right,token)));
  expect(out.filter(x=>x.statusCode===200)).toHaveLength(120);
  const limited=out.filter(x=>x.statusCode===429);
  expect(limited).toHaveLength(30);
  for(const r of limited){
   expect(r.body).toMatchObject({ok:false,error:{code:'rate_limited'}});
   expect(Number(r.headers['Retry-After'])).toBeGreaterThan(0);
  }
  const stored=await holder.pool.query('SELECT count FROM rtc_rate_limits WHERE pass_id=$1',[id]);
  expect(stored.rows).toEqual([{count:120}]);
  expect(holder.googleCalls).toBe(0);
 });
 it('uses each pass’s configured limit, resets at a new window, and keeps passes independent',async()=>{
  const small=await makePass(5),other=await makePass(5);
  const out=await Promise.all(Array.from({length:6},(_,i)=>invoke(i%2?left:right,small.token)));
  expect(out.filter(r=>r.statusCode===200)).toHaveLength(5);
  expect(out.filter(r=>r.statusCode===429)).toHaveLength(1);
  expect((await invoke(right,other.token)).statusCode).toBe(200);
  // Move only this disposable pass's receipt to the previous window. The
  // following request executes the production SQL with the actual DB clock.
  await holder.pool.query("UPDATE rtc_rate_limits SET window_start=window_start-interval '2 minutes' WHERE pass_id=$1",[small.id]);
  expect((await invoke(left,small.token)).statusCode).toBe(200);
  await db.revokeRtcPass(small.id);
  expect((await invoke(right,small.token)).body.error.code).toBe('pass_revoked');
  expect((await invoke(left,other.token)).statusCode).toBe(200);
  expect(holder.googleCalls).toBe(0);
 });
});
