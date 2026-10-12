import {describe,it,expect} from 'vitest';
import {inspectGoogleIntegration,validateIntegrationSpec,handlers} from '../../src/tools/dev-integration.js';
import {isWrite,audienceFor} from '../../src/rtc/catalog.js';
function clients({denyApi=null,areas=null,tokenScopes=[]}={}){
 const accessed=[];
 const api=(name,payload)=>{
   accessed.push({name,payload});
   if(name===denyApi){const e=Error('private details must not be echoed');e.response={status:403,data:{error:{errors:[{reason:'forbidden'}]}}};throw e;}
   return {data:name==='folder'?{id:'folder-safe',mimeType:'application/vnd.google-apps.folder',trashed:false}:{id:'read-ok',emailAddress:'dev@example.test'}};
 };
 const c={
   actingAs:'dev@example.test',
   rtcPolicy:{profile:'read_only',areas},
   auth:{getAccessToken:async()=>({token:'fake-only-access-token'}),getTokenInfo:async()=>({scopes:tokenScopes})},
   gmail:{users:{getProfile:async v=>api('gmail',v)}},
   drive:{files:{list:async v=>api('drive',v),get:async v=>api('folder',v)}},
   calendar:{calendarList:{list:async v=>api('calendar',v)},calendars:{get:async v=>api('calendarResource',v)}},
   tasks:{tasklists:{list:async v=>api('tasks',v)}}
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
