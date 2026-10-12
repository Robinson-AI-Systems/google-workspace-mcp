import {describe,it,expect,vi,beforeAll} from 'vitest';
import {createFakeDb} from '../helpers/fake-db.js';
const holder=vi.hoisted(()=>({db:null,labels:new Map(),writes:0}));
vi.mock('../../src/db.js',async importActual=>{
 const real=await importActual();
 return Object.fromEntries(Object.keys(real).map(name=>[name,(...args)=>holder.db[name](...args)]));
});
vi.mock('../../src/auth/google-auth-hosted.js',()=>({
 buildHostedApiClients:async email=>({actingAs:email,gmail:{users:{getProfile:async()=>({data:{emailAddress:email}}),labels:{
 create:async r=>{holder.writes++;const label={id:'Label_test',...r.requestBody};holder.labels.set(label.id,label);return {data:label};},
 get:async r=>{if(!holder.labels.has(r.id))throw Object.assign(Error('not found'),{code:404});return {data:holder.labels.get(r.id)};},
 delete:async r=>{holder.writes++;holder.labels.delete(r.id);return {data:{}};}
}}}})
}));
const {default:handler,manifest,toInternal}=await import('../../api/rtc-gateway.js');
let token;
function res(){
 const r={statusCode:200,body:null,headers:{}};
 r.setHeader=(k,v)=>{r.headers[k]=v;};r.status=n=>{r.statusCode=n;return r;};
 r.json=x=>{r.body=x;return r;};return r;
}
async function invoke(method,query={},body={},authorization=token){
 const r=res();
 await handler({method,query,body,headers:{authorization:authorization?'Bearer '+authorization:''}},r);
 return r;
}
beforeAll(async()=>{
 holder.db=createFakeDb();
 await holder.db.saveGoogleTokensFor('ops@example.test',{access_token:'fake'});
 process.env.RTC_TEST_ACCOUNT_EMAILS='ops@example.test';
 ({token}=await holder.db.createRtcPass({googleAccount:'ops@example.test',rateLimit:120}));
});
describe('RTC HTTPS contract and pass authorization',()=>{
 it('advertises the exact raw public RTC manifest',async()=>{
  const r=await invoke('GET',{door:'contract'}, {}, '');
  expect(r.statusCode).toBe(200);expect(r.body).toMatchObject({rtc:1,prefix:'workspace_'});
  expect(manifest().counts.tools).toBeGreaterThan(350);
 });
 it('rejects missing, connector-shaped and invalid bearers',async()=>{
  expect((await invoke('GET',{door:'tools'},{},'')).statusCode).toBe(401);
  expect((await invoke('GET',{door:'tools'},{},'connector-shaped-token')).statusCode).toBe(401);
 });
 it('uses only prefixed aliases and filters by read-only pass',async()=>{
  const r=await invoke('GET',{door:'tools',listing:'catalog',q:'list',limit:'20'});
  expect(r.statusCode).toBe(200);
  expect(r.body.result.tools.length).toBeGreaterThan(0);
  expect(r.body.result.tools.every(t=>t.name.startsWith('workspace_')&&!t.writes)).toBe(true);
  expect(toInternal('workspace_gmail_list_messages')).toBe('gmail_list_messages');
 });
 it('paginates HTTP catalogs without dropping remaining tools',async()=>{
  const first=await invoke('GET',{door:'tools',listing:'catalog',limit:'2',page:'1'});
  expect(first.body.result.tools).toHaveLength(2);
  expect(first.body.result.next).toBe('2');
  const second=await invoke('GET',{door:'tools',listing:'catalog',limit:'2',page:'2'});
  expect(second.body.result.tools).toHaveLength(2);
  expect(second.body.result.tools[0].name).not.toBe(first.body.result.tools[0].name);
 });
 it('refuses direct writes and mixed write batches before executing handlers',async()=>{
  expect((await invoke('POST',{tool:'workspace_gmail_send_email'},{to:'a@example.test',confirm:true})).body.error.code).toBe('refused_by_guard');
  const batch=await invoke('POST',{tool:'_batch'},{calls:[{name:'workspace_list_accounts'},{name:'workspace_gmail_send_email',args:{confirm:true}}]});
  expect(batch.statusCode).toBe(403);
 });
 it('runs an authorized read via the existing guarded registry',async()=>{
  const r=await invoke('POST',{tool:'workspace_list_accounts'},{});
  expect(r.statusCode).toBe(200);expect(r.body.ok).toBe(true);
  expect(r.body.result[0].email).toBe('ops@example.test');
 });
 it('uses structured not_found rather than outside_scope on nonexistent tools',async()=>{
  const r=await invoke('GET',{tool:'workspace_does_not_exist'});
  expect(r.statusCode).toBe(404);expect(r.body.error.code).toBe('not_found');
 });
 it('rejects a revoked pass immediately',async()=>{
  const pass=await holder.db.getRtcPass(token);
  await holder.db.revokeRtcPass(pass.id);
  const r=await invoke('GET',{door:'whoami'});expect(r.statusCode).toBe(401);expect(r.body.error.code).toBe('pass_revoked');
 });
 it('executes TEST writes through real HTTPS dispatch while preserving preview, confirmation, areas and revocation',async()=>{
  const write=await holder.db.createRtcPass({googleAccount:'ops@example.test',allowWrites:true,confirmedAccount:'ops@example.test',areas:['mail'],hours:1});
  let r=await invoke('POST',{tool:'workspace_gmail_create_label'},{name:'rtc-test',dryRun:true},write.token);
  expect(r.body.result.done).toBe(false);expect(holder.writes).toBe(0);
  r=await invoke('POST',{tool:'workspace_gmail_create_label'},{name:'rtc-test'},write.token);
  expect(r.body.result).toMatchObject({done:true,confirmed:true,logged:true});expect(holder.writes).toBe(1);
  r=await invoke('POST',{tool:'workspace_gmail_delete_label'},{labelId:'Label_test'},write.token);
  expect(r.body.result.needsConfirmation).toBe(true);expect(holder.writes).toBe(1);
  r=await invoke('POST',{tool:'workspace_call'},{name:'workspace_drive_create_folder',args:{name:'denied'}},write.token);
  expect(r.body.ok).toBe(false);expect(holder.writes).toBe(1);
  r=await invoke('POST',{tool:'workspace_gmail_delete_label'},{labelId:'Label_test',confirm:true},write.token);
  expect(r.body.result.confirmed).toBe(true);expect(holder.writes).toBe(2);
  await holder.db.revokeRtcPass(write.id);
  expect((await invoke('POST',{tool:'workspace_gmail_create_label'},{name:'denied'},write.token)).statusCode).toBe(401);
  expect(holder.writes).toBe(2);
 });

});
