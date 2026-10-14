import {describe,it,expect} from 'vitest';
import {inspectGoogleIntegration,validateIntegrationSpec,handlers} from '../../src/tools/dev-integration.js';
import {isWrite,audienceFor} from '../../src/rtc/catalog.js';
function clients({denyApi=null,areas=null,tokenScopes=[]}={}){
 const accessed=[];
 const api=(name,payload)=>{
   accessed.push({name,payload});
   if(name===denyApi){const e=Error('private details must not be echoed');e.response={status:403,data:{error:{errors:[{reason:'forbidden'}]}}};throw e;}
   return {data:name==='folder'?{id:'folder-safe',mimeType:'application/vnd.google-apps.folder',trashed:false}:
     name==='calendarResource'?{id:payload.calendarId==='primary'?'dev@example.test':payload.calendarId}:
     name==='gmailLabel'?{id:payload.id}:name==='calendarEvent'?{id:payload.eventId}:
     {id:'read-ok',emailAddress:'dev@example.test'}};
 };
 const c={
   actingAs:'dev@example.test',
   rtcPolicy:{profile:'read_only',areas},
   auth:{getAccessToken:async()=>({token:'fake-only-access-token'}),getTokenInfo:async()=>({scopes:tokenScopes})},
   gmail:{users:{getProfile:async v=>api('gmail',v),labels:{get:async v=>api('gmailLabel',v)}}},
   drive:{files:{list:async v=>api('drive',v),get:async v=>api('folder',v)}},
   calendar:{calendarList:{list:async v=>api('calendar',v)},calendars:{get:async v=>api('calendarResource',v)},events:{get:async v=>api('calendarEvent',v)}},
   tasks:{tasklists:{list:async v=>api('tasks',v)}},
   chat:{spaces:{list:async v=>api('chat',v)}},
   people:{people:{get:async v=>api('people',v)}},
   postmaster:{domains:{list:async v=>api('postmaster',v)}}
 };
 return {c,accessed};
}
describe('RTC app development integration inspection',()=>{
 it('performs actual zero-write API reads for the supplied mailbox',async()=>{
   const {c,accessed}=clients({tokenScopes:['https://www.googleapis.com/auth/calendar.readonly']});
   const result=await inspectGoogleIntegration({
     apis:['gmail','drive','calendar','tasks'],
     oauthScopes:['https://www.googleapis.com/auth/calendar.readonly'],
     calendars:['primary'],driveFolders:['folder-safe']
   },c,{describe:()=>({configured:false})});
   expect(result.status).toBe('ready');
   expect(result.changesMade).toBe(false);
   expect(result.actingAs).toBe('dev@example.test');
   expect(result.checks).toHaveLength(7);
   expect(result.checks.every(x=>x.status==='ready')).toBe(true);
   expect(accessed.map(x=>x.name)).toEqual(['gmail','drive','calendar','tasks','calendarResource','folder']);
   expect(accessed.every(x=>x.payload&&typeof x.payload==='object')).toBe(true);
 });
 it('refuses successful Gmail profile reads for a different acting mailbox',async()=>{
   const {c}=clients();
   c.gmail.users.getProfile=async()=>({data:{emailAddress:'some-other-business@example.test'}});
   const out=await inspectGoogleIntegration({apis:['gmail','calendar']},c);
   expect(out.status).toBe('not_readable');
   expect(out.checks[0]).toMatchObject({kind:'api',name:'gmail',status:'not_readable',reason:'google_probe_failed'});
   expect(out.checks[1].status).toBe('ready');
   expect(out.changesMade).toBe(false);
 });
 it('reports API permission denial rather than inventing success or printing provider details',async()=>{
   const {c}=clients({denyApi:'drive'});
   const result=await inspectGoogleIntegration({apis:['drive']},c);
   expect(result.status).toBe('not_readable');
   expect(result.checks[0]).toMatchObject({status:'not_readable',reason:'scope_or_access_denied'});
   expect(JSON.stringify(result)).not.toContain('private details');
 });
 it('respects area restrictions for child probes as well as top-level access',async()=>{
   const {c,accessed}=clients({areas:['mail','workspace']});
   const result=await inspectGoogleIntegration({apis:['gmail','drive','calendar'],calendars:['primary'],driveFolders:['folder-safe']},c);
   expect(result.status).toBe('not_readable');
   expect(accessed.map(x=>x.name)).toEqual(['gmail']);
   expect(result.checks.filter(x=>x.reason==='connection_area_excluded')).toHaveLength(4);
 });
 it('checks actual token scopes, not what the config claims',async()=>{
   const {c}=clients({tokenScopes:[]});
   const result=await inspectGoogleIntegration({apis:[],oauthScopes:['https://www.googleapis.com/auth/drive.metadata.readonly']},c);
   expect(result.status).toBe('missing');
   expect(result.checks[0].reason).toBe('oauth_consent_missing');
   const unavailable={...c,auth:{}};
   const second=await inspectGoogleIntegration({apis:[],oauthScopes:['https://www.googleapis.com/auth/drive.metadata.readonly']},unavailable);
   expect(second.status).toBe('not_readable');
   expect(second.checks[0].reason).toBe('token_info_unavailable');
 });
 it('does not mistake declared delegated scopes for admin-console authorization',async()=>{
   const {c}=clients();
   const result=await inspectGoogleIntegration({apis:[],delegatedScopes:['https://www.googleapis.com/auth/calendar'],serviceAccountClientId:'123456789012345678901'},c,{
     describe:()=>({configured:true,clientId:'123456789012345678901'})
   });
   expect(result.checks[0]).toMatchObject({kind:'service_account_client_id',status:'ready'});
   expect(result.checks[1]).toMatchObject({kind:'delegated_scope',status:'not_readable',reason:'admin_console_grant_unverifiable'});
   expect(result.changesMade).toBe(false);
   const wrong=await inspectGoogleIntegration({apis:[],serviceAccountClientId:'123456789012345678901'},c,{describe:()=>({configured:false})});
   expect(wrong.checks[0].status).toBe('missing');
 });
 it('never declares readiness when the caller requested zero observable checks',async()=>{
   const {c}=clients();
   const r=await inspectGoogleIntegration({apis:[]},c);
   expect(r.checks).toHaveLength(0);
   expect(r.status).toBe('not_readable');
 });
 it('rejects malformed specs, unknown APIs and cross-account requests',async()=>{
   expect(()=>validateIntegrationSpec({apis:['writeEverything']})).toThrow('Unsupported API');
   expect(()=>validateIntegrationSpec({apis:Array(15).fill('drive')})).toThrow();
   expect(()=>validateIntegrationSpec({oauthScopes:['https://evil.example.com/admin']})).toThrow();
   expect(()=>validateIntegrationSpec({serviceAccountClientId:'not-an-id'})).toThrow();
   const {c}=clients();
   await expect(inspectGoogleIntegration({apis:[]},{...c,actingAs:'not-a-mailbox'})).rejects.toThrow();
   const r=await handlers.workspace_dev_check_integration({spec:{apis:['delete-all']}},c);
   expect(r.isError).toBe(true);
 });
 it('advertises the checker as a builder-facing read without relaxing any write approval',()=>{
   expect(isWrite('workspace_dev_check_integration')).toBe(false);
   expect(audienceFor('workspace_dev_check_integration')).toEqual(['builder']);
 });
});


describe('P8-7 full supported app readiness probes',()=>{
 it('observes Chat, People and Postmaster through real read-only service calls',async()=>{
  const {c,accessed}=clients();
  const out=await inspectGoogleIntegration({apis:['chat','people','postmaster']},c);
  expect(out.status).toBe('ready');expect(out.changesMade).toBe(false);
  expect(out.checks.map(x=>x.name)).toEqual(['chat','people','postmaster']);
  expect(accessed.map(x=>x.name)).toEqual(['chat','people','postmaster']);
  expect(accessed[0].payload).toEqual({pageSize:1});
  expect(accessed[1].payload).toEqual({resourceName:'people/me',personFields:'names,emailAddresses'});
  expect(accessed[2].payload).toEqual({pageSize:1});
 });
 it('prevents profile area escape and preserves incomplete permission evidence',async()=>{
  const {c,accessed}=clients({areas:['mail']});
  const out=await inspectGoogleIntegration({apis:['chat','people','postmaster']},c);
  expect(out.status).toBe('not_readable');
  expect(out.checks.filter(x=>x.reason==='connection_area_excluded').map(x=>x.name)).toEqual(['chat','people']);
  expect(accessed.map(x=>x.name)).toEqual(['postmaster']);
 });
 it('reports denied Chat API separately instead of hiding it behind other successful API probes',async()=>{
  const {c}=clients({denyApi:'chat'});
  const out=await inspectGoogleIntegration({apis:['gmail','chat','people']},c);
  expect(out.status).toBe('not_readable');
  expect(out.checks.map(x=>x.status)).toEqual(['ready','not_readable','ready']);
  expect(out.checks[1].reason).toBe('scope_or_access_denied');
 });
});


describe('P8-7 exact Google Docs, Sheets, Slides and Forms app checks',()=>{
 const fixtureIds={documents:['doc-owned-1'],spreadsheets:['sheet-owned-1'],presentations:['deck-owned-1'],forms:['form-owned-1']};
 function resources(c,calls,{wrong=null,deny=null}={}){
  const make=(kind,key)=>async args=>{
   calls.push({kind,args});
   if(deny===kind){const e=Error('Provider secret must stay private');e.response={status:403};throw e;}
   return {data:{[key]:wrong===kind?'another-resource':Object.values(args)[0]}};
  };
  c.docs={documents:{get:make('document','documentId')}};
  c.sheets={spreadsheets:{get:make('spreadsheet','spreadsheetId')}};
  c.slides={presentations:{get:make('presentation','presentationId')}};
  c.forms={forms:{get:make('form','formId')}};
 }
 it('reads exact four app-owned resources without creating or updating them',async()=>{
  const {c}=clients();const calls=[];resources(c,calls);
  const result=await inspectGoogleIntegration({apis:[],...fixtureIds},c);
  expect(result.status).toBe('ready');
  expect(result.changesMade).toBe(false);
  expect(result.checks.map(x=>x.kind)).toEqual(['document','spreadsheet','presentation','form']);
  expect(result.checks.every(x=>x.status==='ready')).toBe(true);
  expect(calls).toEqual([
   {kind:'document',args:{documentId:'doc-owned-1',fields:'documentId,title'}},
   {kind:'spreadsheet',args:{spreadsheetId:'sheet-owned-1',fields:'spreadsheetId,properties.title'}},
   {kind:'presentation',args:{presentationId:'deck-owned-1',fields:'presentationId,title'}},
   {kind:'form',args:{formId:'form-owned-1'}}
  ]);
 });
 it('never mistakes a mismatched resource or failed provider permission for readiness',async()=>{
  const {c}=clients();const calls=[];resources(c,calls,{wrong:'document',deny:'form'});
  const result=await inspectGoogleIntegration({apis:[],...fixtureIds},c);
  expect(result.status).toBe('not_readable');
  expect(result.checks.map(x=>x.status)).toEqual(['not_readable','ready','ready','not_readable']);
  expect(result.checks[0].reason).toBe('google_probe_failed');
  expect(result.checks[3].reason).toBe('scope_or_access_denied');
  expect(JSON.stringify(result)).not.toContain('Provider secret');
 });
 it('blocks all document checks before provider calls outside the files area',async()=>{
  const {c}=clients({areas:['mail']});const calls=[];resources(c,calls);
  const result=await inspectGoogleIntegration({apis:[],...fixtureIds},c);
  expect(result.checks.every(x=>x.reason==='connection_area_excluded')).toBe(true);
  expect(result.status).toBe('not_readable');
  expect(calls).toHaveLength(0);
 });
 it('validates app document identifiers and request size before inspecting Google',()=>{
  expect(()=>validateIntegrationSpec({apis:[],documents:[''] })).toThrow('documents');
  expect(()=>validateIntegrationSpec({apis:[],forms:[ 'x'.repeat(257) ]})).toThrow('Invalid Google resource identifier');
  expect(()=>validateIntegrationSpec({apis:[],presentations:Array(13).fill('deck')})).toThrow('presentations');
  const v=validateIntegrationSpec({apis:[],spreadsheets:['sheet-1','sheet-1']});
  expect(v.spreadsheets).toEqual(['sheet-1']);
 });
});

describe('P8-7 exact app-owned Gmail and Calendar readiness',()=>{
 it('reads precise Gmail label and Calendar event identifiers without writes',async()=>{
   const {c,accessed}=clients();
   const result=await inspectGoogleIntegration({apis:[],gmailLabels:['Label_42'],
     calendarEvents:[{calendarId:'owned-calendar',eventId:'owned-event'}]},c);
   expect(result.status).toBe('ready');
   expect(result.changesMade).toBe(false);
   expect(result.checks.map(x=>x.kind)).toEqual(['gmail_label','calendar_event']);
   expect(accessed).toEqual([
     {name:'gmailLabel',payload:{userId:'me',id:'Label_42'}},
     {name:'calendarEvent',payload:{calendarId:'owned-calendar',eventId:'owned-event'}}
   ]);
 });
 it('does not grant readiness for a different Gmail label, event, calendar or folder',async()=>{
   const {c}=clients();
   c.gmail.users.labels.get=async()=>({data:{id:'a-different-label'}});
   c.calendar.events.get=async()=>({data:{id:'another-event'}});
   c.calendar.calendars.get=async()=>({data:{id:'an-unrelated-calendar'}});
   c.drive.files.get=async()=>({data:{id:'another-folder',mimeType:'application/vnd.google-apps.folder',trashed:false}});
   const out=await inspectGoogleIntegration({apis:[],gmailLabels:['Label_42'],
     calendarEvents:[{calendarId:'owned-calendar',eventId:'owned-event'}],
     calendars:['owned-calendar'],driveFolders:['folder-safe']},c);
   expect(out.status).toBe('not_readable');
   expect(out.checks.map(x=>x.status)).toEqual(['not_readable','not_readable','not_readable','not_readable']);
   expect(out.checks.every(x=>x.reason==='google_probe_failed')).toBe(true);
 });
 it('allows Google primary calendar alias only for the exact acting mailbox',async()=>{
   const {c}=clients();
   expect((await inspectGoogleIntegration({apis:[],calendars:['primary']},c)).status).toBe('ready');
   c.calendar.calendars.get=async()=>({data:{id:'somebody-else@example.test'}});
   expect((await inspectGoogleIntegration({apis:[],calendars:['primary']},c)).status).toBe('not_readable');
 });
 it('separately reports a missing resource and denied provider read',async()=>{
   const {c}=clients();
   c.gmail.users.labels.get=async()=>{const e=Error('secret provider detail');e.code=404;throw e};
   c.calendar.events.get=async()=>{const e=Error('secret provider detail');e.response={status:403};throw e};
   const out=await inspectGoogleIntegration({apis:[],gmailLabels:['Label_42'],
     calendarEvents:[{calendarId:'owned-calendar',eventId:'owned-event'}]},c);
   expect(out.checks.map(x=>x.status)).toEqual(['missing','not_readable']);
   expect(out.checks.map(x=>x.reason)).toEqual(['resource_not_found','scope_or_access_denied']);
   expect(JSON.stringify(out)).not.toContain('secret provider detail');
 });
 it('checks permission areas before touching restricted label or event resources',async()=>{
   const {c,accessed}=clients({areas:['workspace']});
   const out=await inspectGoogleIntegration({apis:[],gmailLabels:['Label_42'],
     calendarEvents:[{calendarId:'owned-calendar',eventId:'owned-event'}]},c);
   expect(out.checks.map(x=>x.reason)).toEqual(['connection_area_excluded','connection_area_excluded']);
   expect(accessed).toHaveLength(0);
 });
 it('validates, bounds and deduplicates exact event pairs and label identifiers',()=>{
   expect(()=>validateIntegrationSpec({apis:[],calendarEvents:[{calendarId:'owned'}]})).toThrow('calendarEvents');
   expect(()=>validateIntegrationSpec({apis:[],calendarEvents:[{calendarId:'a',eventId:''}]})).toThrow('calendarEvents');
   expect(()=>validateIntegrationSpec({apis:[],calendarEvents:Array.from({length:13},(_,i)=>({calendarId:'cal',eventId:'e'+i}))})).toThrow('calendarEvents');
   expect(()=>validateIntegrationSpec({apis:[],gmailLabels:['bad label'] })).toThrow('Invalid Google resource identifier');
   const x=validateIntegrationSpec({apis:[],gmailLabels:['Label_42','Label_42'],
      calendarEvents:[{calendarId:'cal',eventId:'e1'},{calendarId:'cal',eventId:'e1'},{calendarId:'cal',eventId:'e2'}]});
   expect(x.gmailLabels).toEqual(['Label_42']);
   expect(x.calendarEvents).toEqual([{calendarId:'cal',eventId:'e1'},{calendarId:'cal',eventId:'e2'}]);
 });
});
