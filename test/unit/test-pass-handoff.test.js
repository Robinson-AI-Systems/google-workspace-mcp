import {describe,it,expect} from 'vitest';
import {generateKeyPairSync,createHash,privateDecrypt,constants} from 'node:crypto';
import {createTestPassHandoff} from '../../src/developer/test-pass-handoff.js';
const origin='https://service.example';
const key=generateKeyPairSync('rsa',{modulusLength:2048});
const pass='rtc_pass_'+'p'.repeat(43),passId='pass_'+'a'.repeat(20),poll='s'.repeat(43);
const hash=v=>createHash('sha256').update(v).digest('hex');
const start={client_id:'registered-client',poll_hash:hash(poll),public_key:key.publicKey.export({type:'spki',format:'pem'}),pass_id:passId};
const response=()=>({headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.data=v;},send(v){this.data=v;},writeHead(n,h){this.statusCode=n;Object.assign(this.headers,h);},end(){}});
function fixture() {
 let row,failures=0;
 const store={start:async p=>{row={...p,status:'pending',expires_at:p.expires};return true;},find:async()=>row,
 approve:async(state,sealed)=>{if(row.status!=='pending')return false;row.status='authorized';row.sealed_code=sealed;return true;},
 poll:async(state,secret)=>row.state===state&&row.poll_hash===secret?{status:row.status,sealed_code:row.sealed_code}:null};
 const calls=[];
 const getPass=async token=>{calls.push(token);return token===pass?{id:passId,mode:'test',expires_at:new Date(Date.now()+86400000)}:null;};
 const loginStore={recordLoginAttempt:async()=>++failures,countRecentFailedLogins:async()=>failures,markLoginAttemptSucceeded:async()=>{failures--;}};
 const deps={store,origin,getClient:async()=>({redirect_uris:[origin+'/api/developer/connect']}),getPass,loginStore,clientIp:()=> 'trusted'};
 const handler=createTestPassHandoff(deps);
 const invoke=async (req)=>{const res=response();await handler({headers:{},...req},res);return res;};
 const begin=()=>invoke({method:'POST',headers:{'content-type':'application/json'},body:start});
 const connect=(extra={})=>invoke({method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:{state:row.state,token:pass},...extra});
 return {invoke,begin,connect,deps,calls,row:()=>row};
}
describe('existing TEST pass handoff',()=>{
 it('connects only the pinned existing pass, stores ciphertext and lets only the original polling runner decrypt it',async()=>{
  const f=fixture(),begin=await f.begin();expect(begin.statusCode).toBe(201);
  const form=await f.invoke({method:'GET',query:{state:f.row().state},headers:{host:'service.example'}});
  expect(form.data).toContain('Sign in with your existing TEST pass');expect(form.headers['Referrer-Policy']).toBe('same-origin');
  const connected=await f.connect();expect(connected.statusCode).toBe(200);
  expect(JSON.stringify(f.row())).not.toContain(pass);expect(connected.data).not.toContain(pass);expect(f.calls).toEqual([pass]);
  const unauthorized=await f.invoke({method:'GET',query:{state:f.row().state},headers:{authorization:'Bearer '+'z'.repeat(43)}});expect(unauthorized.statusCode).toBe(410);
  const r=await f.invoke({method:'GET',query:{state:f.row().state},headers:{authorization:'Bearer '+poll}});
  expect(r.statusCode).toBe(200);expect(privateDecrypt({key:key.privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(r.data.sealed_pass,'base64url')).toString()).toBe(pass);
  const retry=await f.invoke({method:'GET',query:{state:f.row().state},headers:{authorization:'Bearer '+poll}});expect(retry.data).toEqual(r.data);
  expect((await f.connect()).statusCode).toBe(409);
 });
 it('refuses ordinary credentials, wrong pass IDs, expired/revoked passes, before sealing',async()=>{
  for(const metadata of [null,{id:passId,mode:'production',expires_at:new Date(Date.now()+60000)},{id:'pass_'+'b'.repeat(20),mode:'test',expires_at:new Date(Date.now()+60000)},{id:passId,mode:'test',expires_at:new Date(0)}]){
   const f=fixture();f.deps.getPass=async()=>metadata;const handler=createTestPassHandoff(f.deps);await f.begin();const r=response();await handler({method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:{state:f.row().state,token:pass}},r);expect(r.statusCode).toBe(401);expect(f.row().status).toBe('pending');
  }
 });
 it('refuses cross-origin, unknown fields, query-string credentials, and non-form credential submission without looking up the token',async()=>{
  const f=fixture();await f.begin();
  expect((await f.connect({headers:{origin:'https://foreign.example','content-type':'application/x-www-form-urlencoded'}})).statusCode).toBe(403);
  expect((await f.connect({body:{state:f.row().state,token:pass,areas:['admin']}})).statusCode).toBe(400);
  expect((await f.invoke({method:'GET',query:{state:f.row().state,token:pass}})).statusCode).toBe(400);
  expect((await f.connect({headers:{origin,'content-type':'text/plain'}})).statusCode).toBe(415);expect(f.calls).toEqual([]);
 });
 it('applies the shared lockout before credential lookup and masks backend errors',async()=>{
  const f=fixture();await f.begin();for(let i=0;i<5;i++)expect((await f.connect({body:{state:f.row().state,token:'invalid'}})).statusCode).toBe(401);
  expect((await f.connect()).statusCode).toBe(429);expect(f.calls).toEqual([]);
  const g=fixture();await g.begin();g.deps.getPass=async()=>{throw Error('PRIVATE TOKEN DATABASE');};const r=response();await createTestPassHandoff(g.deps)({method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:{state:g.row().state,token:pass}},r);expect(r.statusCode).toBe(503);expect(JSON.stringify(r.data)).not.toContain('PRIVATE');
 });
 it('rejects unregistered clients, invalid keys, expiry and OAuth-namespace rows',async()=>{
  const f=fixture();expect((await f.invoke({method:'POST',headers:{'content-type':'application/json'},body:{...start,public_key:'bad'}})).statusCode).toBe(400);
  await f.begin();f.row().expires_at=new Date(0);expect((await f.connect()).statusCode).toBe(410);
  await f.begin();f.row().client_id='ordinary-oauth-client';expect((await f.connect()).statusCode).toBe(410);
  const r=response();await createTestPassHandoff({...f.deps,getClient:async()=>null})({method:'POST',headers:{'content-type':'application/json'},body:start},r);expect(r.statusCode).toBe(400);
 });
});
