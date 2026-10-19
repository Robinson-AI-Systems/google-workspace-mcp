import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import {HANDOFF_SCHEMA,HANDOFF_LIMIT_SCHEMA} from '../../src/developer/handoff-store.js';
import {testPassIssuanceStore} from '../../src/developer/test-pass-issuance-store.js';
const holder=vi.hoisted(()=>({pool:null}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(strings,...values)=>{
 let sql=strings[0];for(let i=0;i<values.length;i++)sql+='$'+(i+1)+strings[i+1];return (await holder.pool.query(sql,values)).rows;
}}));
let admin,schema,store,db,oldEnrollment,oldDatabase;
const account='encrypted-pass@example.test',keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const publicKey=keys.publicKey.export({type:'spki',format:'pem'}),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const query=async(sql,values)=>(await holder.pool.query(sql,values)).rows;
async function begin(extra={}){
 const state=crypto.randomBytes(32).toString('base64url');
 await store.start({state,client_id:'rtc-issue:'+crypto.randomUUID(),challenge:JSON.stringify({account,areas:['chrome','domain']}),poll_hash:hash('poll'),public_key:publicKey,ip:crypto.randomUUID(),expires:new Date(Date.now()+600000),...extra});
 return store.find(state);
}
beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);if(!['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname))throw Error('Isolated localhost PostgreSQL required');
 oldEnrollment=process.env.RTC_TEST_ACCOUNT_EMAILS;oldDatabase=process.env.DATABASE_URL;
 process.env.RTC_TEST_ACCOUNT_EMAILS=account;process.env.DATABASE_URL=url.href;
 admin=new pg.Client({connectionString:url.href});await admin.connect();schema='pass_issue_'+crypto.randomBytes(6).toString('hex');await admin.query('CREATE SCHEMA '+schema);
 holder.pool=new pg.Pool({connectionString:url.href,max:8,options:'-c search_path='+schema});
 db=await import('../../src/db.js');await db.initSchema();await query(HANDOFF_SCHEMA);await query(HANDOFF_LIMIT_SCHEMA);
 await query('INSERT INTO google_accounts(email,tokens) VALUES($1,$2)',[account,'{}']);store=testPassIssuanceStore(query);
});
afterAll(async()=>{
 await holder.pool?.end();if(admin){try{await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await admin.end();}}
 if(oldEnrollment===undefined)delete process.env.RTC_TEST_ACCOUNT_EMAILS;else process.env.RTC_TEST_ACCOUNT_EMAILS=oldEnrollment;
 if(oldDatabase===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDatabase;
});
it('serializes independent instances into exactly one pass plus ciphertext, with fixed24h read-only policy and no mutation of existing passes',async()=>{
 const old=await db.createRtcPass({googleAccount:account,areas:['mail'],hours:1});
 const before=await query('SELECT * FROM rtc_passes WHERE id=$1',[old.id]);const row=await begin();
 const other=testPassIssuanceStore(query),out=await Promise.all([store.issue(row),other.issue(row)]);expect(out.filter(Boolean)).toHaveLength(1);
 expect(await store.issue(row)).toBe(false);const sealed=await store.find(row.state);
 const token=crypto.privateDecrypt({key:keys.privateKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(sealed.sealed_code,'base64url')).toString();
 const stored=await db.getRtcPass(token);expect(stored).toMatchObject({mode:'test',profile:'read_only',areas:['chrome','domain'],allow_writes:false,for_hub:false,rate_limit_per_minute:120});
 const interval=(await query('SELECT extract(epoch FROM(expires_at-created_at))::int AS seconds FROM rtc_passes WHERE id=$1',[stored.id]))[0];expect(interval.seconds).toBe(86400);
 expect((await query('SELECT count(*)::int AS n FROM rtc_passes'))[0].n).toBe(2);
 expect(await query('SELECT * FROM rtc_passes WHERE id=$1',[old.id])).toEqual(before);
 expect(JSON.stringify(sealed)).not.toContain(token);expect((await store.poll(row.state,hash('wrong')))).toBe(null);
 expect((await store.poll(row.state,hash('poll'))).sealed_code).toBe(sealed.sealed_code);
});
it('refuses expired, altered, unenrolled and unknown-mailbox requests without issuing a pass',async()=>{
 const before=(await query('SELECT count(*)::int AS n FROM rtc_passes'))[0].n;
 const row=await begin();expect(await store.issue({...row,public_key:crypto.generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'pem'})})).toBe(false);
 await query("UPDATE developer_oauth_handoffs SET expires_at=now()-interval '1 second' WHERE state=$1",[row.state]);expect(await store.issue(row)).toBe(false);
 process.env.RTC_TEST_ACCOUNT_EMAILS='';await expect(store.issue(row)).rejects.toThrow('invalid_test_account');process.env.RTC_TEST_ACCOUNT_EMAILS=account;
 const unknown=await begin({challenge:JSON.stringify({account:'unknown@example.test',areas:['chrome']})});process.env.RTC_TEST_ACCOUNT_EMAILS=account+',unknown@example.test';expect(await store.issue(unknown)).toBe(false);process.env.RTC_TEST_ACCOUNT_EMAILS=account;
 expect((await query('SELECT count(*)::int AS n FROM rtc_passes'))[0].n).toBe(before);
});
it.each(['test','live'])('rolls back %s issuance when ciphertext persistence fails without an orphan credential',async mode=>{
 const row=await begin(mode==='live'?{challenge:JSON.stringify({account,areas:['chrome','domain'],mode})}:{}),before=(await query('SELECT count(*)::int AS n FROM rtc_passes'))[0].n;
 await query("CREATE FUNCTION refuse_issue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$");
 await query("CREATE TRIGGER refuse_issue BEFORE UPDATE ON developer_oauth_handoffs FOR EACH ROW WHEN(NEW.status='authorized') EXECUTE FUNCTION refuse_issue()");
 try{await expect(store.issue(row)).rejects.toThrow('synthetic failure');}finally{await query('DROP TRIGGER refuse_issue ON developer_oauth_handoffs');}
 expect((await query('SELECT count(*)::int AS n FROM rtc_passes'))[0].n).toBe(before);expect((await store.find(row.state)).status).toBe('pending');
 expect(await store.issue(row)).toBe(true);
});

it('issues LIVE without TEST enrollment, atomically pins one-hour read-only deny-billing scope and refuses duplicates',async()=>{
 const prior=await query('SELECT * FROM rtc_passes ORDER BY id');
 const old=process.env.RTC_TEST_ACCOUNT_EMAILS;process.env.RTC_TEST_ACCOUNT_EMAILS='';
 try{
  const row=await begin({challenge:JSON.stringify({account,areas:['mail','workspace'],mode:'live'})});
  const results=await Promise.all([store.issue(row),testPassIssuanceStore(query).issue(row)]);expect(results.filter(Boolean)).toHaveLength(1);
  const saved=await store.find(row.state);
  const token=crypto.privateDecrypt({key:keys.privateKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(saved.sealed_code,'base64url')).toString();
  const pass=await db.getRtcPass(token);expect(pass).toMatchObject({mode:'live',profile:'read_only',areas:['mail','workspace'],allow_writes:false,for_hub:false,cost_policy:{mode:'deny'}});
  const duration=await query('SELECT extract(epoch FROM(expires_at-created_at))::int AS seconds FROM rtc_passes WHERE id=$1',[pass.id]);expect(duration[0].seconds).toBe(3600);
  expect(await query('SELECT * FROM rtc_passes WHERE id<>$1 ORDER BY id',[pass.id])).toEqual(prior);
  expect(JSON.stringify(saved)).not.toContain(token);
  expect(await store.issue({...row,challenge:JSON.stringify({account,areas:['admin'],mode:'live'})})).toBe(false);
  await expect(store.issue({...row,challenge:JSON.stringify({account,areas:['mail','workspace']})})).rejects.toThrow('invalid_test_account');
  const missing=await begin({challenge:JSON.stringify({account:'absent@example.test',areas:['mail'],mode:'live'})});expect(await store.issue(missing)).toBe(false);
 }finally{process.env.RTC_TEST_ACCOUNT_EMAILS=old;}
});
