import {describe,it,expect} from 'vitest';
import {PROVIDER_READ_PROOFS,INTERNAL_READ_PROOFS,verifiedProviderReadResult} from '../../scripts/smoke-provider-shapes.mjs';
import {SAFE_READ_PROBES} from '../../scripts/smoke-readonly-catalog.mjs';
import {providerReadFixture} from '../helpers/smoke-provider-fixtures.js';
import {handlers as gmail} from '../../src/tools/gmail.js';
import {handlers as drive} from '../../src/tools/drive.js';
import {handlers as calendar} from '../../src/tools/calendar.js';
import {handlers as tasks} from '../../src/tools/tasks.js';
import {handlers as sharedDrives} from '../../src/tools/shared-drives.js';

const account='scratch@example.test';
const parse=response=>JSON.parse(response.content[0].text);
const read=(name,value)=>verifiedProviderReadResult(name,value,account);
const allNames=Object.keys(PROVIDER_READ_PROOFS);
describe('P0-2 safe catalog provider evidence',()=>{
 it('gives every reviewed probe exactly one intentionally bound result validator',()=>{
  const actual=SAFE_READ_PROBES.filter(p=>p.name!=='workspace_whoami').map(p=>p.name);
  expect(new Set(actual).size).toBe(actual.length);
  expect(actual.sort()).toEqual(allNames.sort());
  expect(INTERNAL_READ_PROOFS).toEqual(new Set(['workspace_recent_changes','workspace_dev_list_runs','workspace_dev_get_run','workspace_list_accounts','workspace_list_connections','workspace_admin_console_capabilities','workspace_where_is_setting','workspace_delegation_status']));
  expect(SAFE_READ_PROBES.every(p=>p.area&&typeof p.args==='object')).toBe(true);
 });
 it('accepts the native full-detail shape for all 29 safe read workflows',()=>{
  for(const name of allNames){
   const shape=providerReadFixture(name,account);
   expect(read(name,shape),name).toBe(true);
  }
 });
 it('never accepts an arbitrary 200 transport envelope or a Google error as provider evidence',()=>{
  for(const name of allNames){
   for(const bad of [null,'OK',{ok:true,result:{}},{isError:true},{error:{code:403}},
    {data:{result:{}}},{message:'success'},0,undefined]){
     expect(read(name,bad),name+' rejected '+String(bad)).toBe(false);
   }
  }
 });
 it('accepts a native empty thread snippet while preserving identity, cursor and type checks',async()=>{
  const page={threads:[{id:'test-thread',snippet:'',historyId:'123'}],nextPageToken:'next',resultSizeEstimate:1};
  const client={gmail:{users:{threads:{list:async args=>{
   expect(args).toMatchObject({userId:'me',maxResults:1});return {data:page};
  }}}}};
  expect(read('workspace_gmail_list_threads',parse(await gmail.gmail_list_threads({maxResults:1},client)))).toBe(true);
  for(const row of [{snippet:''},{id:''},{id:'x',snippet:null},{id:'x',snippet:3},{id:'x',snippet:{}}])
   expect(read('workspace_gmail_list_threads',{...page,threads:[row]})).toBe(false);
  expect(read('workspace_gmail_list_threads',{...page,nextPageToken:3})).toBe(false);
  expect(read('workspace_gmail_list_threads',{...page,threads:[page.threads[0],page.threads[0]]})).toBe(false);
 });
 it('validates service delegation metadata without claiming Google delegation works',()=>{
  const shape={configured:true,serviceAccountEmail:'robot@example.test',clientId:'123',projectId:'test-project',scopesToAuthorize:['https://www.googleapis.com/auth/fake'],test:'Pass testUser to prove it works'};
  expect(read('workspace_delegation_status',shape)).toBe(true);
  expect(read('workspace_delegation_status',{configured:false,scopesToAuthorize:shape.scopesToAuthorize})).toBe(true);
  for(const invalid of [{},{configured:true},{...shape,configured:'true'},{...shape,scopesToAuthorize:null},{...shape,scopesToAuthorize:[3]},{...shape,clientId:''}])
   expect(read('workspace_delegation_status',invalid)).toBe(false);
  expect(verifiedProviderReadResult('workspace_delegation_status',shape,account,{testUser:account})).toBe(false);
  expect(INTERNAL_READ_PROOFS.has('workspace_delegation_status')).toBe(true);
 });
 it('keeps mailbox identity bound to the current connection rather than only Gmail 200',()=>{
  expect(read('workspace_gmail_get_profile',{emailAddress:'other@example.test'})).toBe(false);
  expect(read('workspace_gmail_get_profile',{emailAddress:account.toUpperCase()})).toBe(true);
  expect(read('workspace_gmail_get_profile',{emailAddress:'not an email'})).toBe(false);
 });
 it('proves real content identity, rejects array impostors, and checks query page limit',()=>{
  const cases=[
   ['workspace_gmail_list_labels',[{id:'LBL',name:'Owned',type:'user'}]],
   ['workspace_gmail_list_filters',[{id:'flt',criteria:{from:'a'},action:{addLabelIds:['x']}}]],
   ['workspace_gmail_list_send_as',[{sendAsEmail:account}]],
   ['workspace_gmail_list_forwarding_addresses',[{forwardingEmail:account}]],
   ['workspace_gmail_list_delegates',[{delegateEmail:account}]],
   ['workspace_drive_list_starred',[{id:'f1'}]],
   ['workspace_drive_list_shared_with_me',[{id:'f1'}]],
   ['workspace_calendar_list_calendars',[{id:'calendar',summary:'Test'}]],
   ['workspace_calendar_list_events',[{id:'evt'}]],
   ['workspace_tasks_list_tasklists',[{id:'list-1',title:'tasks'}]],
   ['workspace_tasks_list_tasks',[{id:'t1',title:'task'}]]
  ];
  for(const [name,value] of cases){
    expect(read(name,value),name).toBe(true);
    expect(read(name,[{}]),name).toBe(false);
    expect(read(name,[{notAnId:'looks fine'}]),name).toBe(false);
  }
  for(const name of ['workspace_gmail_list_messages','workspace_gmail_list_threads',
   'workspace_gmail_list_drafts','workspace_drive_list_files','workspace_drive_list_shared_drives',
   'workspace_calendar_list_events','workspace_drive_list_recent_files','workspace_drive_list_trash']){
    const item=name.includes('shared_drives')?{id:'d',name:'Drive'}:{id:'id'};
    const key=name.endsWith('messages')?'messages':name.endsWith('threads')?'threads':
      name.endsWith('drafts')?'drafts':name.endsWith('files')?'files':
      name.endsWith('shared_drives')?'drives':null;
    const over=Array.from({length:2},()=>item);
    expect(read(name,key?{[key]:over}:over),name).toBe(false);
  }
 });
 it('rejects invalid next tokens, malformed native settings and unrelated color payloads',()=>{
  for(const name of ['workspace_gmail_list_messages','workspace_gmail_list_threads',
    'workspace_gmail_list_drafts','workspace_drive_list_files','workspace_drive_list_shared_drives']){
   const shape=providerReadFixture(name);
   expect(read(name,{...shape,nextPageToken:12}),name).toBe(false);
   expect(read(name,{...shape,nextPageToken:''}),name).toBe(false);
  }
  for(const name of ['workspace_gmail_get_imap_settings','workspace_gmail_get_forwarding_settings']){
   expect(read(name,{enabled:'false'})).toBe(false);
   expect(read(name,{enabled:false})).toBe(true);
  }
  expect(read('workspace_gmail_get_pop_settings',{accessWindow:'unknown'})).toBe(false);
  expect(read('workspace_gmail_get_vacation_settings',{enableAutoReply:0})).toBe(false);
  expect(read('workspace_calendar_list_event_colors',{items:[]})).toBe(false);
  expect(read('workspace_calendar_list_event_colors',{calendar:{'1':{background:'#abc'}},event:{}})).toBe(false);
  expect(read('workspace_drive_get_start_page_token',{startPageToken:''})).toBe(false);
  expect(read('workspace_drive_get_storage_quota',{usage:'not-a-number'})).toBe(false);
 });
 it('honors explicit result truncation only when the provider identifies every included item',()=>{
  expect(read('workspace_calendar_list_calendars',{items:[{id:'a'}],truncated:'Showing the first 200 of 201.'})).toBe(true);
  expect(read('workspace_calendar_list_calendars',{items:[{}],truncated:'Showing the first 200 of 201.'})).toBe(false);
  expect(read('workspace_calendar_list_calendars',{items:[{id:'a'}],truncated:''})).toBe(false);
 });
 it('recognizes service history as service evidence, not a provider success',()=>{
  expect(read('workspace_recent_changes',{changes:[],note:'No changes recorded'})).toBe(true);
  expect(read('workspace_recent_changes',{changes:[]})).toBe(false);
  expect(read('workspace_recent_changes',{success:true})).toBe(false);
 });
});

describe('real wrapped handler contract for empty Google pages',()=>{
 it('Gmail label and filter handlers return arrays rather than native list wrappers',async()=>{
  const client={gmail:{users:{
    labels:{list:async()=>({data:{}})},
    settings:{filters:{list:async()=>({data:{}})},sendAs:{list:async()=>({data:{}})}}
  }}};
  expect(read('workspace_gmail_list_labels',parse(await gmail.gmail_list_labels({},client)))).toBe(true);
  expect(read('workspace_gmail_list_filters',parse(await gmail.gmail_list_filters({},client)))).toBe(true);
  expect(read('workspace_gmail_list_send_as',parse(await gmail.gmail_list_send_as({},client)))).toBe(true);
 });
 it('Calendar and Tasks handlers return [] on a provider empty response',async()=>{
  const client={calendar:{calendarList:{list:async()=>({data:{}})},
    settings:{list:async()=>({data:{}})},events:{list:async()=>({data:{}})}},
    tasks:{tasklists:{list:async()=>({data:{}})},tasks:{list:async()=>({data:{}})}}};
  for(const [name,handler,args] of [
    ['workspace_calendar_list_calendars',calendar.calendar_list_calendars,{}],
    ['workspace_calendar_get_settings',calendar.calendar_get_settings,{}],
    ['workspace_calendar_list_events',calendar.calendar_list_events,{calendarId:'primary',maxResults:1}],
    ['workspace_tasks_list_tasklists',tasks.tasks_list_tasklists,{}],
    ['workspace_tasks_list_tasks',tasks.tasks_list_tasks,{}]
  ]) expect(read(name,parse(await handler(args,client))),name).toBe(true);
 });
 it('Drive file and shared-drive wrappers preserve pagination and explicit empty array evidence',async()=>{
  const client={drive:{files:{list:async()=>({data:{nextPageToken:'token-2'}})},
    drives:{list:async()=>({data:{nextPageToken:'token-2'}})}}};
  const files=parse(await drive.drive_list_files({maxResults:1},client));
  const shared=parse(await sharedDrives.drive_list_shared_drives({maxResults:1},client));
  expect(files).toMatchObject({files:[],nextPageToken:'token-2'});
  expect(shared).toMatchObject({drives:[],nextPageToken:'token-2'});
  expect(read('workspace_drive_list_files',files)).toBe(true);
  expect(read('workspace_drive_list_shared_drives',shared)).toBe(true);
 });
});
