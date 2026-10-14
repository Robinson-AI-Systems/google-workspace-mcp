import {describe,it,expect} from 'vitest';
import {normalizeExactAppResources,inspectExactAppResources,APP_RESOURCE_FIELDS}
 from '../../src/tools/dev-integration-resources.js';
import {inspectGoogleIntegration,validateIntegrationSpec,tools as integrationTools}
 from '../../src/tools/dev-integration.js';
import {allowedTool,rtcArea} from '../../src/rtc/catalog.js';

const base={
 gmailMessages:['m-one'],gmailThreads:['t-one'],driveFiles:['d-one'],taskLists:['list-one'],
 taskItems:[{tasklistId:'list-one',taskId:'task-one'}],
 chatSpaces:['spaces/AAAA'],contacts:['people/c111']
};
function stub({wrong=null,deny=null,areas=null,trashed=false}={}){
 const calls=[];
 const recorded=(type,field,extract)=>async args=>{
  calls.push({type,args});
  if(type===deny){
   const err=Error('Do not leak private provider details');
   err.response={status:403,data:{error:{errors:[{reason:'forbidden'}]}}};throw err;
  }
  return {data:{[field]:type===wrong?'other-ID':extract(args),
    ...(type==='drive' ? {mimeType:'application/pdf',trashed}: {})}};
 };
 const clients={actingAs:'dev@example.test',rtcPolicy:{profile:'read_only',areas},
   gmail:{users:{
    messages:{get:recorded('message','id',x=>x.id)},
    threads:{get:recorded('thread','id',x=>x.id)}
   }},
   drive:{files:{get:recorded('drive','id',x=>x.fileId)}},
   tasks:{tasklists:{get:recorded('tasklist','id',x=>x.tasklist)},
    tasks:{get:recorded('task','id',x=>x.task)}},
   chat:{spaces:{get:recorded('chat','name',x=>x.name)}},
   people:{people:{get:recorded('people','resourceName',x=>x.resourceName)}}
 };
 return {clients,calls};
}
describe('P8-7 exact app resource request contract',()=>{
 it('maintains a seven-family finite request allowlist',()=>{
  expect(APP_RESOURCE_FIELDS).toEqual([
   'gmailMessages','gmailThreads','driveFiles','taskLists','chatSpaces','contacts','taskItems'
  ]);
  expect(Object.keys(normalizeExactAppResources({}))).toEqual(APP_RESOURCE_FIELDS);
  expect(Object.values(normalizeExactAppResources({})).every(v=>Array.isArray(v)&&v.length===0)).toBe(true);
 });
 it('normalizes and deduplicates exact owner-supplied IDs and task list/ID pairs',()=>{
  const result=normalizeExactAppResources({...base,gmailMessages:['m-one','m-one','m-two'],
    taskItems:[base.taskItems[0],base.taskItems[0],{tasklistId:'other-list',taskId:'task-one'}]});
  expect(result.gmailMessages).toEqual(['m-one','m-two']);
  expect(result.taskItems).toEqual([
   {tasklistId:'list-one',taskId:'task-one'},{tasklistId:'other-list',taskId:'task-one'}
  ]);
  expect(validateIntegrationSpec({apis:[],...base}).taskItems).toEqual(base.taskItems);
 });
 it('rejects invalid IDs, private URLs, malformed pairs and oversized requests',()=>{
  const invalid=[
   {gmailMessages:[null]},{gmailMessages:['']},{gmailMessages:[' 	']},
   {gmailMessages:['https://evil.test/a']},{driveFiles:['f/'.repeat(20)]},
   {chatSpaces:['people/123']},{contacts:['spaces/ABC']},
   {taskItems:[{tasklistId:'id',taskId:'id',confirm:true}]},
   {taskItems:[{taskId:'x'}]},
   {taskItems:[{tasklistId:'list',taskId:'https://evil.test/id'}]},
   {taskItems:Array.from({length:13},(_,n)=>({tasklistId:'l',taskId:'t'+n}))},
   {taskLists:Array.from({length:13},(_,n)=>'id'+n)},
   {driveFiles:['x'.repeat(257)]},
   Object.fromEntries(APP_RESOURCE_FIELDS.slice(0,6).map(key=>[key,
     Array.from({length:5},(_,i)=>key==='chatSpaces'?'spaces/A'+i:
      key==='contacts'?'people/c'+i:'id'+i)]))
  ];
  for(const bad of invalid)expect(()=>normalizeExactAppResources(bad),JSON.stringify(bad)).toThrow();
 });
 it('refuses missing acting mailbox before any Google access',async()=>{
  const {clients,calls}=stub();
  await expect(inspectGoogleIntegration({apis:[],gmailMessages:['m-one']},
   {...clients,actingAs:''})).rejects.toThrow('authenticated acting');
  expect(calls).toHaveLength(0);
 });
 it('declares readiness only for seven exact resources with individually scoped metadata reads',async()=>{
  const {clients,calls}=stub();
  const response=await inspectGoogleIntegration({apis:[],...base},clients);
  expect(response).toMatchObject({status:'ready',changesMade:false,actingAs:'dev@example.test'});
  expect(response.checks.map(x=>x.kind)).toEqual([
   'gmail_message','gmail_thread','drive_file','task_list','chat_space','contact','task_item'
  ]);
  expect(response.checks.every(x=>x.status==='ready')).toBe(true);
  expect(calls).toEqual([
   {type:'message',args:{userId:'me',id:'m-one',format:'minimal'}},
   {type:'thread',args:{userId:'me',id:'t-one',format:'minimal'}},
   {type:'drive',args:{fileId:'d-one',fields:'id,mimeType,trashed,owners(emailAddress)',
     supportsAllDrives:true}},
   {type:'tasklist',args:{tasklist:'list-one'}},
   {type:'chat',args:{name:'spaces/AAAA'}},
   {type:'people',args:{resourceName:'people/c111',personFields:'names,emailAddresses'}},
   {type:'task',args:{tasklist:'list-one',task:'task-one'}}
  ]);
  expect(response.checks.every(x=>!('data' in x)&&!('body' in x))).toBe(true);
 });
 it('rejects wrong provider identities separately without echoing private response',async()=>{
  for(const name of ['message','thread','drive','tasklist','chat','people','task']){
   const {clients}=stub({wrong:name});
   const response=await inspectGoogleIntegration({apis:[],...base},clients);
   expect(response.status,name).toBe('not_readable');
   expect(response.checks.filter(x=>x.status==='not_readable'),name).toHaveLength(1);
   expect(response.checks.find(x=>x.status==='not_readable').reason).toBe('google_probe_failed');
  }
  const {clients}=stub({trashed:true});
  const response=await inspectGoogleIntegration({apis:[],...base},clients);
  expect(response.checks.find(x=>x.kind==='drive_file')).toMatchObject({
   status:'not_readable',reason:'google_probe_failed'
  });
 });
 it('does not hide provider permission denials among other ready resources',async()=>{
  const {clients}=stub({deny:'people'});
  const response=await inspectGoogleIntegration({apis:[],...base},clients);
  expect(response.status).toBe('not_readable');
  expect(response.checks.filter(x=>x.status==='ready')).toHaveLength(6);
  expect(response.checks.find(x=>x.kind==='contact')).toMatchObject({
   status:'not_readable',reason:'scope_or_access_denied'
  });
  expect(JSON.stringify(response)).not.toContain('Do not leak private provider details');
 });
 it('honors RTC allowed areas before constructing any provider request',async()=>{
  const {clients,calls}=stub({areas:['mail']});
  const response=await inspectGoogleIntegration({apis:[],...base},clients);
  expect(response.status).toBe('not_readable');
  expect(response.checks.filter(x=>x.reason==='connection_area_excluded')).toHaveLength(5);
  expect(calls.map(x=>x.type)).toEqual(['message','thread']);
 });
 it('recognizes Contacts/Directory as people, not unknown ungrantable areas',()=>{
  expect(rtcArea('contacts_get')).toBe('people');
  expect(rtcArea('directory_list_people')).toBe('people');
  expect(allowedTool('contacts_get',{profile:'read_only',areas:['people']})).toBe(true);
  expect(allowedTool('contacts_get',{profile:'read_only',areas:['mail']})).toBe(false);
  expect(allowedTool('contacts_delete',{profile:'read_only',areas:['people']})).toBe(false);
  expect(allowedTool('directory_list_people',{profile:'read_only',areas:['people']})).toBe(true);
 });
 it('maintains public schema for the new optional fields',()=>{
  const spec=integrationTools[0].inputSchema.properties.spec.properties;
  for(const field of APP_RESOURCE_FIELDS){
   expect(spec[field],field).toBeDefined();
   expect(spec[field].type).toBe('array');
   expect(spec[field].maxItems).toBe(12);
  }
  expect(spec.taskItems.items.required.sort()).toEqual(['taskId','tasklistId']);
 });
 it('preserves missing vs denied vs malformed Google resource evidence',async()=>{
  const {clients,calls}=stub();
  clients.gmail.users.messages.get=async()=>{
   calls.push({type:'gone'});
   const error=Error('not found');error.response={status:404};throw error;
  };
  const response=await inspectGoogleIntegration({apis:[],gmailMessages:['m-one']},clients);
  expect(response.checks).toMatchObject([{kind:'gmail_message',status:'missing',reason:'resource_not_found'}]);
  const empty=await inspectExactAppResources(normalizeExactAppResources({}),clients);
  expect(empty).toEqual([]);
 });
});
