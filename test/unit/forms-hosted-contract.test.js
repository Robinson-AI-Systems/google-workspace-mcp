import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createFakeDb} from '../helpers/fake-db.js';
import {buildApiClients} from '../../src/auth/google-auth-hosted.js';
const holder=vi.hoisted(()=>({db:null}));
vi.mock('../../src/db.js',async actual=>{
 const real=await actual();return Object.fromEntries(Object.keys(real).map(name=>[name,(...args)=>holder.db[name](...args)]));
});
const {registry}=await import('../../src/tools/index.js');
const body=r=>JSON.parse(r.content[0].text);
function setup(){
 const calls=[];let state={isPublished:false,isAcceptingResponses:false};
 const clients=buildApiClients({actingAs:'ops@example.test',request:async options=>{
  calls.push(options);
  if(options.method==='POST')state=options.data.publishSettings.publishState;
  return {data:{formId:'fake-form',publishSettings:{publishState:state}}};
 }});
 Object.assign(clients,{connection:'fake-connection',allowedDomains:['example.test'],rtcPolicy:{profile:'full',areas:['files']}});
 return {calls,clients};
}
beforeEach(()=>{holder.db=createFakeDb();});
describe('Forms publishing through the real hosted client and final write guards',()=>{
 it('preserves generated reads and confirms the documented POST by independent readback',async()=>{
  const {calls,clients}=setup();
  expect(typeof clients.forms.forms.get).toBe('function');
  expect(typeof clients.forms.forms.responses.list).toBe('function');
  const result=body(await registry.handlers.forms_set_publish_settings({formId:'fake-form',acceptingResponses:true,confirm:true},clients));
  expect(result.done).toBe(true);expect(result.confirmed).toBe(true);expect(result.logged).toBeTruthy();
  const posts=calls.filter(x=>x.method==='POST');
  expect(posts).toHaveLength(1);
  expect(posts[0]).toEqual({url:'https://forms.googleapis.com/v1/forms/fake-form:setPublishSettings',method:'POST',data:{publishSettings:{publishState:{isPublished:true,isAcceptingResponses:true}}}});
  expect(calls.filter(x=>x.method==='GET')).toHaveLength(2);
 });
 it('preview and missing confirmation do not send the publishing POST',async()=>{
  for(const flags of [{dryRun:true},{}]){
   const {calls,clients}=setup();
   const result=body(await registry.handlers.forms_set_publish_settings({formId:'fake-form',acceptingResponses:true,...flags},clients));
   expect(result.done).toBe(false);
   expect(result.dryRun===true||result.needsConfirmation===true).toBe(true);
   expect(calls.every(x=>x.method==='GET')).toBe(true);
  }
 });
 it('read-only nested dispatch denies before any upstream call',async()=>{
  const {calls,clients}=setup();clients.rtcPolicy.profile='read_only';
  const result=await registry.handlers.workspace_call({name:'forms_set_publish_settings',args:{formId:'fake-form',acceptingResponses:true,confirm:true}},clients);
  expect(result.isError).toBe(true);expect(calls).toEqual([]);
 });
 it('rejects invalid path identifiers and preserves provider failures without retry',async()=>{
  const {calls,clients}=setup();
  for(const formId of ['','../other','id?query','https://foreign.test'])
   await expect(clients.forms.forms.setPublishSettings({formId})).rejects.toThrow(/formId/);
  expect(calls).toEqual([]);
  const denied=Object.assign(new Error('denied'),{code:403});let requests=0;
  const failing=buildApiClients({request:async()=>{requests++;throw denied;}});
  await expect(failing.forms.forms.setPublishSettings({formId:'fake-form',requestBody:{}})).rejects.toBe(denied);
  expect(requests).toBe(1);
 });
});
