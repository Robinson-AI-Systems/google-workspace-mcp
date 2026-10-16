import {it,expect} from 'vitest';
import {mkdtemp,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {connectExistingPass} from '../../scripts/connect-existing-test-pass.mjs';
import {createTestPassHandoff} from '../../src/developer/test-pass-handoff.js';
const origin='https://service.example',revision='a'.repeat(40),account='owner@example.test';
const token='rtc_pass_'+'x'.repeat(43),passId='pass_'+createHash('sha256').update(token).digest('hex').slice(0,20);
it('runs the real encrypted start/form/poll boundary and writes only the verified existing token to a private file',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pass-handoff-'));await chmod(root,0o700);
 try{
  const env={RTC_ORIGIN:origin,RTC_EXPECTED_REVISION:revision,RTC_EXISTING_PASS_ID:passId,RTC_EXPECTED_ACCOUNT:account,RTC_HANDOFF_FILE:join(root,'request'),RTC_PASS_OUTPUT_FILE:join(root,'pass.secret')};
  let row,revoked=false;const network=[];
  const store={start:async p=>{row={...p,status:'pending',expires_at:p.expires};return true;},find:async()=>row,approve:async(s,sealed)=>{row.status='authorized';row.sealed_code=sealed;return true;},poll:async(s,h)=>row.state===s&&row.poll_hash===h?row:null};
  const handler=createTestPassHandoff({origin,store,getClient:async()=>({redirect_uris:[origin+'/api/developer/connect']}),getPass:async t=>t===token?{id:passId,mode:'test',expires_at:new Date(Date.now()+60000)}:null,clientIp:()=> 'trusted',loginStore:{recordLoginAttempt:async()=>1,countRecentFailedLogins:async()=>0,markLoginAttemptSucceeded:async()=>{}}});
  const fetcher=async(url,opts={})=>{
   const u=new URL(url);network.push({route:u.pathname,body:opts.body});
   if(u.pathname==='/api/contract')return new Response(JSON.stringify({deployment:{sourceRevision:revision}}));
   if(u.pathname==='/api/oauth/register')return new Response(JSON.stringify({client_id:'registered-client'}),{status:201});
   if(u.pathname==='/api/whoami')return new Response(JSON.stringify(revoked?{error:{code:'pass_revoked'}}:{result:{connection:passId,account,mode:'test',profile:'full',areas:['workspace'],allow_writes:true}}),{status:revoked?401:200});
   const res={statusCode:0,setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.data=v;},send(v){this.data=v;}};
   await handler({method:opts.method||'GET',headers:opts.headers||{},body:opts.body?JSON.parse(opts.body):undefined,query:Object.fromEntries(u.searchParams)},res);
   return new Response(typeof res.data==='string'?res.data:JSON.stringify(res.data),{status:res.statusCode});
  };
  expect((await connectExistingPass({action:'start',env,fetcher})).status).toBe('awaiting_existing_pass_sign_in');
  expect((await readFile(env.RTC_HANDOFF_FILE,'utf8'))).not.toContain(token);
  expect((await connectExistingPass({action:'poll',env,fetcher})).status).toBe('awaiting_existing_pass_sign_in');
  const res={setHeader(){},status(n){this.statusCode=n;return this;},send(v){this.data=v;},json(v){this.data=v;}};
  await handler({method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:{state:row.state,token}},res);expect(res.statusCode).toBe(200);
  revoked=true;await expect(connectExistingPass({action:'poll',env,fetcher})).rejects.toThrow('test_identity_unverified');await expect(readFile(env.RTC_PASS_OUTPUT_FILE)).rejects.toThrow();
  revoked=false;const connected=await connectExistingPass({action:'poll',env,fetcher});expect(connected.status).toBe('connected_existing_test_pass');expect(JSON.stringify(connected)).not.toContain(token);expect(await readFile(env.RTC_PASS_OUTPUT_FILE,'utf8')).toBe(token);
  await expect(connectExistingPass({action:'poll',env,fetcher})).rejects.toThrow();
  expect(network.every(n=>!['/api/rtc/passes','/api/oauth/token'].includes(n.route))).toBe(true);
  expect(network.filter(n=>n.body).every(n=>!n.body.includes(token))).toBe(true);
 }finally{await rm(root,{recursive:true,force:true});}
});
