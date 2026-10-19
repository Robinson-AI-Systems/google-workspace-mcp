import {describe,it,expect} from 'vitest';
import {generateKeyPairSync,createHash,publicEncrypt,constants} from 'node:crypto';
import {mkdtemp,chmod,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestPassIssuance} from '../../src/developer/test-pass-issuance.js';
import {issueEncryptedTestPass} from '../../scripts/issue-encrypted-test-pass.mjs';
const origin='https://service.example',owner='fake-owner-passphrase',account='scratch@example.test';
const digest=v=>createHash('sha256').update(v).digest('hex');
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const start={client_id:'registered-client',public_key:keys.publicKey.export({type:'spki',format:'pem'}),poll_hash:digest('p'.repeat(43)),account,areas:['chrome','domain']};
const response=()=>({headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.data=v;},send(v){this.data=v;},writeHead(n,h){this.statusCode=n;Object.assign(this.headers,h);},end(){}});
function fixture(){
 let row,failures=0,issues=0;
 const token='rtc_pass_'+'x'.repeat(43);
 const store={start:async p=>{row={...p,status:'pending',expires_at:p.expires};return true;},find:async()=>row,
  poll:async(state,hash)=>row.state===state&&row.poll_hash===hash?{status:row.status,sealed_code:row.sealed_code}:null,
  issue:async r=>{if(row.status!=='pending')return false;issues++;row.status='authorized';row.sealed_code=publicEncrypt({key:r.public_key,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(token)).toString('base64url');return true;}};
 const deps={store,origin,getClient:async()=>({redirect_uris:[origin+'/api/developer/connect']}),clientIp:()=> 'trusted',ownerPassphrase:owner,loginStore:{recordLoginAttempt:async()=>++failures,countRecentFailedLogins:async()=>failures,markLoginAttemptSucceeded:async()=>{failures--;}}};
 const handler=createTestPassIssuance(deps),invoke=async req=>{const res=response();await handler({headers:{},...req},res);return res;};
 const begin=(p=start)=>invoke({method:'POST',headers:{'content-type':'application/json'},body:p});
 const approve=(extra={})=>invoke({method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:{state:row.state,passphrase:owner},...extra});
 return {invoke,begin,approve,deps,token,row:()=>row,issues:()=>issues};
}
describe('encrypted TEST pass issuance',()=>{
 it('displays immutable exact account/areas and issues only after same-origin owner verification, without browser plaintext',async()=>{
  const f=fixture();expect((await f.begin()).statusCode).toBe(201);
  const page=await f.invoke({method:'GET',headers:{host:'service.example'},query:{state:f.row().state}});
  expect(page.data).toContain(account);expect(page.data).toContain('chrome, domain');expect(page.data).toContain('24 hours; read-only; no Toolkit access or writes');
  expect(page.headers['Referrer-Policy']).toBe('same-origin');expect(f.issues()).toBe(0);
  expect((await f.approve()).statusCode).toBe(200);expect(f.issues()).toBe(1);
  expect(JSON.stringify(f.row())).not.toContain(f.token);
  const done=await f.invoke({method:'GET',headers:{host:'service.example'},query:{state:f.row().state}});expect(done.data).toContain('already handled');expect(done.data).not.toContain(f.token);
  expect((await f.approve()).statusCode).toBe(409);expect(f.issues()).toBe(1);
 });
 it('refuses scope/duration/write/hub tampering, unknown clients/keys and foreign submission before issuance',async()=>{
  const f=fixture();for(const bad of [{...start,hours:48},{...start,allow_writes:true},{...start,for_hub:true},{...start,areas:[]},{...start,areas:['unknown']},{...start,public_key:'not-a-key'}])expect((await f.begin(bad)).statusCode).toBe(400);
  await f.begin();expect((await f.approve({headers:{origin:'https://foreign.example','content-type':'application/x-www-form-urlencoded'}})).statusCode).toBe(403);
  expect((await f.approve({body:{state:f.row().state,passphrase:owner,areas:['admin']}})).statusCode).toBe(400);
  expect((await f.approve({headers:{origin,'content-type':'application/json'}})).statusCode).toBe(400);
  expect((await f.approve({headers:{origin,'content-type':'text/plain'}})).statusCode).toBe(415);
  expect(f.issues()).toBe(0);
  const r=response();await createTestPassIssuance({...f.deps,getClient:async()=>null})({method:'POST',headers:{'content-type':'application/json'},body:start},r);expect(r.statusCode).toBe(400);
 });
 it('enforces lockout, expiry, namespace separation and secret-free failures',async()=>{
  const f=fixture();await f.begin();for(let n=0;n<5;n++)expect((await f.approve({body:{state:f.row().state,passphrase:'wrong'}})).statusCode).toBe(401);
  const locked=await f.approve();expect(locked.statusCode).toBe(429);expect(locked.headers['Retry-After']).toBe('900');expect(f.issues()).toBe(0);
  f.row().expires_at=new Date(0);expect((await f.approve()).statusCode).toBe(410);
  await f.begin();f.row().client_id='rtc-pass:other';expect((await f.approve()).statusCode).toBe(410);
  const g=fixture();await g.begin();g.deps.store.issue=async()=>{throw Error('PRIVATE_DIAGNOSTIC');};const res=await g.approve();expect(res.statusCode).toBe(503);expect(JSON.stringify(res.data)).not.toContain('PRIVATE');
 });
 it('makes LIVE issuance explicit and immutable, showing its exact one-hour nonwriting policy before approval',async()=>{
  const f=fixture();expect((await f.begin({...start,mode:'live'})).statusCode).toBe(201);
  expect(JSON.parse(f.row().challenge)).toEqual({account,areas:['chrome','domain'],mode:'live'});
  const page=await f.invoke({method:'GET',headers:{host:'service.example'},query:{state:f.row().state}});
  expect(page.data).toContain('Create encrypted read-only LIVE pass');expect(page.data).toContain('1 hour; read-only');expect(page.data).toContain('Billing denied');expect(f.issues()).toBe(0);
  expect((await f.approve({body:{state:f.row().state,passphrase:owner,mode:'test'}})).statusCode).toBe(400);expect(f.issues()).toBe(0);
  expect((await f.approve()).statusCode).toBe(200);expect(f.issues()).toBe(1);
  expect((await f.approve()).statusCode).toBe(409);expect(f.issues()).toBe(1);
  expect((await f.begin({...start,mode:'production'})).statusCode).toBe(400);
 });
 it('keeps ciphertext delivery bound to the original polling secret',async()=>{
  const f=fixture();await f.begin();expect((await f.invoke({method:'GET',query:{state:f.row().state},headers:{authorization:'Bearer '+'z'.repeat(43)}})).statusCode).toBe(410);
  const request={method:'GET',query:{state:f.row().state},headers:{authorization:'Bearer '+'p'.repeat(43)}};
  expect((await f.invoke(request)).statusCode).toBe(202);await f.approve();const a=await f.invoke(request),b=await f.invoke(request);
  expect(a.statusCode).toBe(200);expect(b.data).toEqual(a.data);expect(a.data).not.toHaveProperty('token');expect(JSON.stringify(a.data)).not.toContain(f.token);
 });
 it.each(['test','live'])('runs %s registration, owner approval, RSA delivery and exact identity verification into a private file',async mode=>{
  const f=fixture(),dir=await mkdtemp(join(tmpdir(),'encrypted-test-pass-'));await chmod(dir,0o700);
  const revision='a'.repeat(40),env={RTC_ORIGIN:origin,RTC_EXPECTED_REVISION:revision,RTC_EXPECTED_ACCOUNT:account,RTC_APPROVED_AREAS:'chrome,domain',RTC_PASS_MODE:mode,RTC_HANDOFF_FILE:join(dir,'handoff'),RTC_PASS_OUTPUT_FILE:join(dir,'pass')};
  let registered=0,wrongMode=false;
  const fetcher=async(url,init)=>{
   const u=new URL(url);let r;
   if(u.pathname==='/api/contract')r={statusCode:200,data:{deployment:{sourceRevision:revision}}};
   else if(u.pathname==='/api/oauth/register'){registered++;r={statusCode:201,data:{client_id:start.client_id}};}
   else if(u.pathname==='/api/whoami'){
    expect(init.headers.authorization).toBe('Bearer '+f.token);r={statusCode:200,data:{result:{connection:'pass_'+digest(f.token).slice(0,20),account,areas:['domain','chrome'],profile:'read_only',mode:wrongMode?(mode==='live'?'test':'live'):mode,allow_writes:false}}};
   }else r=await f.invoke({method:init.method,headers:init.headers,body:init.body?JSON.parse(init.body):undefined,query:Object.fromEntries(u.searchParams)});
   return {status:r.statusCode,text:async()=>JSON.stringify(r.data)};
  };
  try{
   const begin=await issueEncryptedTestPass({action:'start',env,fetcher});expect(begin.status).toBe('awaiting_owner_approval');
   await expect(issueEncryptedTestPass({action:'start',env,fetcher})).rejects.toThrow('existing_checkpoint');expect(registered).toBe(1);
   expect(await issueEncryptedTestPass({action:'poll',env,fetcher})).toEqual({status:'awaiting_owner_approval'});
   await f.approve();wrongMode=true;
   await expect(issueEncryptedTestPass({action:'poll',env,fetcher})).rejects.toThrow('exact_identity_unverified');
   await expect(stat(env.RTC_PASS_OUTPUT_FILE)).rejects.toThrow();wrongMode=false;
   const connected=await issueEncryptedTestPass({action:'poll',env,fetcher});
   expect(connected.status).toBe(mode==='live'?'connected_encrypted_live_pass':'connected_encrypted_test_pass');expect(JSON.stringify(connected)).not.toContain(f.token);
   await expect(issueEncryptedTestPass({action:'poll',env:{...env,RTC_PASS_MODE:mode==='live'?'test':'live'},fetcher})).rejects.toThrow('checkpoint_mismatch');
   expect(await readFile(env.RTC_PASS_OUTPUT_FILE,'utf8')).toBe(f.token);expect((await stat(env.RTC_PASS_OUTPUT_FILE)).mode&0o077).toBe(0);
   await expect(issueEncryptedTestPass({action:'poll',env:{...env,RTC_APPROVED_AREAS:'admin'},fetcher})).rejects.toThrow('checkpoint_mismatch');
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
