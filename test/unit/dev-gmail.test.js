import {describe,it,expect,vi,beforeEach} from 'vitest';
import {makeFakeClients,googleError} from '../helpers/fake-google.js';
import {createFakeDb} from '../helpers/fake-db.js';
const ref=vi.hoisted(()=>({db:null}));
vi.mock('../../src/db.js',async actual=>{
 const real=await actual();
 return Object.fromEntries(Object.keys(real).map(name=>[name,(...args)=>ref.db[name](...args)]));
});
const {handlers}=await import('../../src/tools/dev-fixtures.js');
const {allowedTool}=await import('../../src/rtc/catalog.js');
const parsed=r=>JSON.parse(r.content[0].text);
const runId='92222222-3333-4444-8555-666666666666',args={scenario:'gmail',runId};
beforeEach(()=>{ref.db=createFakeDb();});
function testGmail(){
 const {clients,calls,when}=makeFakeClients();
 clients.connection='test-mail';
 clients.rtcPolicy={mode:'test',profile:'full',areas:['workspace','mail']};
 const labels=new Map(),messages=new Map();
 let next=0,labelSeq=0;
 const readMime=base64=>{
  const data=Buffer.from(base64,'base64url').toString('utf8').split('\r\n');
  return data.slice(0,data.indexOf('')).map(row=>{
   const i=row.indexOf(':');
   return {name:row.slice(0,i),value:row.slice(i+1).trim()};
  });
 };
 when('gmail.users.labels.create').resolves(({requestBody})=>{
  const label={id:'Label_'+(++labelSeq),type:'user',...requestBody};
  labels.set(label.id,label);return {data:label};
 });
 when('gmail.users.labels.get').resolves(({id})=>{
  if(!labels.has(id))throw googleError(404,'notFound','missing label');
  return {data:labels.get(id)};
 });
 when('gmail.users.labels.list').resolves(()=>({data:{labels:[...labels.values()]}}));
 when('gmail.users.labels.delete').resolves(({id})=>{labels.delete(id);return {data:{}};});
 when('gmail.users.messages.insert').resolves(({requestBody})=>{
  const id='message-'+(++next);
  const item={id,labelIds:requestBody.labelIds||[],payload:{headers:readMime(requestBody.raw)}};
  messages.set(id,item);return {data:{id}};
 });
 when('gmail.users.messages.get').resolves(({id})=>({
  data:messages.get(id)||{id,labelIds:[],payload:{headers:[]}}
 }));
 when('gmail.users.messages.list').resolves(({labelIds})=>({
  data:{messages:[...messages.values()].filter(m=>labelIds.every(x=>m.labelIds.includes(x))).map(m=>({id:m.id}))}
 }));
 when('gmail.users.messages.trash').resolves(({id})=>{
  const msg=messages.get(id);msg.labelIds=[...new Set([...msg.labelIds,'TRASH'])];return {data:msg};
 });
 return {clients,calls,when,labels,messages};
}
describe('P8-7 isolated Gmail fixtures',()=>{
 it('dry-run creates no label/messages and read-only profile refuses mutating scenario',async()=>{
  const s=testGmail();
  const res=parsed(await handlers.workspace_dev_create_fixtures({...args,dryRun:true},s.clients));
  expect(res.dryRun).toBe(true);
  expect(s.calls).toEqual([]);
  expect(allowedTool('workspace_dev_create_fixtures',{profile:'read_only'})).toBe(false);
 });
 it('inserts two self-addressed messages without sending, records exact IDs and readbacks',async()=>{
  const s=testGmail();
  const result=parsed(await handlers.workspace_dev_create_fixtures(args,s.clients));
  expect(result).toMatchObject({done:true,confirmed:true});
  expect(result.details.objects.map(x=>x.kind)).toEqual(['label','message1','message2']);
  expect(s.labels.size).toBe(1);
  expect(s.messages.size).toBe(2);
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.insert')).toHaveLength(2);
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.send')).toHaveLength(0);
  expect(s.calls.filter(x=>x.path==='gmail.users.labels.create')).toHaveLength(1);
  for(const msg of s.messages.values()){
   expect(msg.payload.headers).toContainEqual({name:'To',value:s.clients.actingAs});
   expect(msg.payload.headers).toContainEqual({name:'From',value:s.clients.actingAs});
   expect(msg.payload.headers).toContainEqual({name:'X-RTC-Run',value:runId});
  }
  const records=await ref.db.getDevRun({runId,actingAs:s.clients.actingAs,connection:s.clients.connection});
  expect(records.steps.every(x=>x.state==='recorded')).toBe(true);
  expect(records.objects.map(x=>x.google_id)).toEqual(['Label_1','message-1','message-2']);
 });
 it('exact same run never inserts duplicates',async()=>{
  const s=testGmail();
  await handlers.workspace_dev_create_fixtures(args,s.clients);
  const again=parsed(await handlers.workspace_dev_create_fixtures(args,s.clients));
  expect(again.confirmed).toBe(true);
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.insert')).toHaveLength(2);
  expect(s.calls.filter(x=>x.path==='gmail.users.labels.create')).toHaveLength(1);
 });
 it('database exception after provider creation recovers by exact mailbox run markers',async()=>{
  const s=testGmail(),original=ref.db.recordDevObject.bind(ref.db);
  let first=true;
  ref.db.recordDevObject=async p=>{if(first){first=false;throw Error('failed ledger write')}return original(p);};
  await expect(handlers.workspace_dev_create_fixtures(args,s.clients)).rejects.toThrow(/uncertain/);
  ref.db.recordDevObject=original;
  const result=parsed(await handlers.workspace_dev_create_fixtures(args,s.clients));
  expect(result.confirmed).toBe(true);
  expect(s.calls.filter(x=>x.path==='gmail.users.labels.list')).toHaveLength(1);
  expect(s.calls.filter(x=>x.path==='gmail.users.labels.create')).toHaveLength(1);
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.insert')).toHaveLength(2);
 });
 it('timeout before known provider ID refuses recreation and remains discoverable',async()=>{
  const s=testGmail();
  s.when('gmail.users.labels.create').rejects(Error('provider timeout'));
  await expect(handlers.workspace_dev_create_fixtures(args,s.clients)).rejects.toThrow(/uncertain/);
  await expect(handlers.workspace_dev_create_fixtures(args,s.clients)).rejects.toThrow(/exact run matches/);
  expect(s.calls.filter(x=>x.path==='gmail.users.labels.create')).toHaveLength(1);
  const run=parsed(await handlers.workspace_dev_list_runs({},s.clients)).runs.find(x=>x.id===runId);
  expect(run.pending).toBe(1);
 });
 it('previews cleanup, requires independent confirmation and trashes only recorded exact messages',async()=>{
  const s=testGmail();
  await handlers.workspace_dev_create_fixtures(args,s.clients);
  const foreign={id:'not-recorded',labelIds:['Label_1'],payload:{headers:[]}};
  s.messages.set('not-recorded',foreign);
  expect(parsed(await handlers.workspace_dev_cleanup({runId,dryRun:true},s.clients)).dryRun).toBe(true);
  expect(parsed(await handlers.workspace_dev_cleanup({runId},s.clients)).needsConfirmation).toBe(true);
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.trash')).toHaveLength(0);
  const cleaned=parsed(await handlers.workspace_dev_cleanup({runId,confirm:true},s.clients));
  expect(cleaned.confirmed).toBe(true);
  expect(cleaned.details.fullyCleaned).toBe(true);
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.trash').map(x=>x.args[0].id)).toEqual(['message-1','message-2']);
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.delete')).toHaveLength(0);
  expect(s.calls.filter(x=>x.path==='gmail.users.labels.delete').map(x=>x.args[0].id)).toEqual(['Label_1']);
  expect(s.messages.get('not-recorded')).toEqual(foreign);
  expect(s.labels.size).toBe(0);
 });
 it('replaying fully cleaned run does not delete other objects',async()=>{
  const s=testGmail();
  await handlers.workspace_dev_create_fixtures(args,s.clients);
  await handlers.workspace_dev_cleanup({runId,confirm:true},s.clients);
  const again=parsed(await handlers.workspace_dev_cleanup({runId,confirm:true},s.clients));
  expect(again.confirmed).toBe(true);
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.trash')).toHaveLength(2);
  expect(s.calls.filter(x=>x.path==='gmail.users.labels.delete')).toHaveLength(1);
 });
 it('tampered sender, subject or foreign connection causes refusal without any deletion',async()=>{
  const s=testGmail();
  await handlers.workspace_dev_create_fixtures(args,s.clients);
  s.messages.get('message-1').payload.headers.find(h=>h.name==='From').value='foreign@example.test';
  await expect(handlers.workspace_dev_cleanup({runId,confirm:true},s.clients)).rejects.toThrow(/mismatch/);
  await expect(handlers.workspace_dev_cleanup({runId,confirm:true},{...s.clients,connection:'stranger'})).rejects.toThrow();
  expect(s.calls.filter(x=>x.path==='gmail.users.messages.trash')).toHaveLength(0);
 });
 it('TEST and mail area gates fail closed before reading/creating Gmail objects',async()=>{
  const s=testGmail();
  for(const policy of [{mode:'live',profile:'full',areas:['workspace','mail']},
    {mode:'test',profile:'full',areas:['workspace']},
    {mode:'test',profile:'read_only',areas:['workspace','mail']}]){
    await expect(handlers.workspace_dev_create_fixtures({...args,dryRun:true},{...s.clients,rtcPolicy:policy})).rejects.toThrow();
  }
  expect(s.calls).toEqual([]);
 });
});
