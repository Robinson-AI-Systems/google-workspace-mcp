// P8-7: prove the actual Google integration boundary used by an app.
// Only read operations against the caller's existing Google identity are made.
// Never grants scopes, impersonates users, creates fixtures, or reports an
// unobservable Admin console authorization as "ready".
import { ok, errorResult } from './util.js';
import { allowedTool } from '../rtc/catalog.js';
import { DELEGATED_SCOPES, describeServiceAccount } from '../auth/service-account.js';

const API_SPECS=Object.freeze({
 gmail:{tool:'gmail_list_messages',label:'Gmail',url:'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
   probe:clients=>clients.gmail.users.getProfile({userId:'me'})},
 drive:{tool:'drive_list_files',label:'Drive',url:'https://console.cloud.google.com/apis/library/drive.googleapis.com',
   probe:clients=>clients.drive.files.list({pageSize:1,fields:'files(id),nextPageToken'})},
 calendar:{tool:'calendar_list_calendars',label:'Calendar',url:'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
   probe:clients=>clients.calendar.calendarList.list({maxResults:1})},
 tasks:{tool:'tasks_list_tasklists',label:'Tasks',url:'https://console.cloud.google.com/apis/library/tasks.googleapis.com',
   probe:clients=>clients.tasks.tasklists.list({maxResults:1})},
 chat:{tool:'chat_list_spaces',label:'Google Chat',url:'https://console.cloud.google.com/apis/library/chat.googleapis.com',
   probe:clients=>clients.chat.spaces.list({pageSize:1})},
 people:{tool:'contacts_get',label:'People/Contacts',url:'https://console.cloud.google.com/apis/library/people.googleapis.com',
   probe:clients=>clients.people.people.get({resourceName:'people/me',personFields:'names,emailAddresses'})},
 postmaster:{tool:'postmaster_list_domains',label:'Gmail Postmaster',url:'https://console.cloud.google.com/apis/library/gmailpostmastertools.googleapis.com',
   probe:clients=>clients.postmaster.domains.list({pageSize:1})}
});
const SAFE_SCOPES=new Set(DELEGATED_SCOPES);
const MAX_ITEMS=12;
const MAILBOX=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_ID=/^[^\s]{1,256}$/;
export function validateIntegrationSpec(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('spec must be an object.');
 const fields=['apis','oauthScopes','delegatedScopes','calendars','driveFolders'];
 const out={};
 for(const field of fields){
   const values=input[field]===undefined?(field==='apis'?['gmail','drive','calendar']:[]):input[field];
   if(!Array.isArray(values)||values.length>MAX_ITEMS||values.some(v=>typeof v!=='string'||!v.trim()||v.length>512))throw Error(field+' must be an array of up to 12 nonempty strings.');
   out[field]=[...new Set(values)];
 }
 if(out.apis.some(x=>!Object.hasOwn(API_SPECS,x)))throw Error('Unsupported API. Use gmail, drive, calendar, tasks, chat, people or postmaster.');
 if([...out.oauthScopes,...out.delegatedScopes].some(s=>!(['openid','email','profile'].includes(s)||/^https:\/\/www\.googleapis\.com\/auth\/[A-Za-z0-9._/-]+$/.test(s))))throw Error('Scopes must use approved Google auth scope syntax.');
 if([...out.calendars,...out.driveFolders].some(x=>!GOOGLE_ID.test(x)))throw Error('Invalid Google resource identifier.');
 if(input.serviceAccountClientId!==undefined&&
   (typeof input.serviceAccountClientId!=='string'||!/^[0-9]{10,32}$/.test(input.serviceAccountClientId)))
   throw Error('serviceAccountClientId must be a Google numeric client ID.');
 out.serviceAccountClientId=input.serviceAccountClientId||null;
 return out;
}
const guide=(url,summary)=>({url,steps:[{n:1,action:'Open',target:url},{n:2,action:'Verify',target:summary}],expected:'Confirm in Google Console; no setting changed automatically.'});
function classifyFailure(e){
 const code=Number(e?.response?.status||e?.code)||0;
 const reason=String(e?.response?.data?.error?.errors?.[0]?.reason||'');
 if(code===404)return {status:'missing',reason:'resource_not_found'};
 if(reason==='accessNotConfigured'||reason==='SERVICE_DISABLED'||reason==='accessNotConfigured')return {status:'missing',reason:'api_not_enabled'};
 if(code===401||code===403)return {status:'not_readable',reason:'scope_or_access_denied'};
 return {status:'not_readable',reason:'google_probe_failed'};
}
async function observe(name,probe,guideTo){
 try{const result=await probe();if(!result||typeof result!=='object')throw Error('Missing Google response');
   return {name,status:'ready'};
 }catch(e){return {name,...classifyFailure(e),fix:guideTo};}
}
export async function inspectGoogleIntegration(spec,clients,{describe=describeServiceAccount}={}){
 const request=validateIntegrationSpec(spec);
 if(!MAILBOX.test(clients?.actingAs||''))throw Error('An authenticated acting Google mailbox is required.');
 const checks=[];
 const policy=clients.rtcPolicy||{};
 for(const api of request.apis){
   const item=API_SPECS[api];
   if(!allowedTool(item.tool,policy)){
     checks.push({kind:'api',name:api,status:'not_readable',reason:'connection_area_excluded'});continue;
   }
   const info=await observe(api,()=>item.probe(clients),guide(item.url,'Enable '+item.label+' API and verify consent for this mailbox.'));
   checks.push({kind:'api',...info});
 }
 if(request.oauthScopes.length){
   let granted=null;
   try{
     if(!clients.auth?.getAccessToken||!clients.auth?.getTokenInfo)throw Error('unavailable');
     const access=await clients.auth.getAccessToken();
     if(!access?.token)throw Error('unavailable');
     const info=await clients.auth.getTokenInfo(access.token);
     if(!Array.isArray(info?.scopes))throw Error('unavailable');
     granted=new Set(info.scopes);
   }catch{granted=null}
   for(const scope of request.oauthScopes){
     checks.push({kind:'oauth_scope',name:scope,status:!granted?'not_readable':granted.has(scope)?'ready':'missing',
       ...(!granted?{reason:'token_info_unavailable'}:!granted.has(scope)?{reason:'oauth_consent_missing'}:{}),
       ...(!granted||!granted.has(scope)?{fix:guide('https://console.cloud.google.com/apis/credentials/consent','Request and approve this scope explicitly for the existing OAuth application.')}: {})});
   }
 }
 if(request.delegatedScopes.length||request.serviceAccountClientId){
   let service=null;try{service=describe()}catch{service=null}
   if(request.serviceAccountClientId)checks.push({
     kind:'service_account_client_id',name:request.serviceAccountClientId,
     status:!service?.configured||service.clientId!==request.serviceAccountClientId?'missing':'ready',
     ...(!service?.configured||service.clientId!==request.serviceAccountClientId?{reason:'service_account_not_matching',fix:guide('https://console.cloud.google.com/iam-admin/serviceaccounts','Verify the configured service account client ID.')}:{})
   });
   for(const scope of request.delegatedScopes){
     const declared=SAFE_SCOPES.has(scope)&&service?.configured;
     checks.push({kind:'delegated_scope',name:scope,
       status:!declared?'missing':'not_readable',
       reason:!declared?'not_configured_or_not_permitted':'admin_console_grant_unverifiable',
       fix:guide('https://admin.google.com/ac/owl/domainwidedelegation','Confirm that this scope is authorized for this service account client ID.')});
   }
 }
 if(request.calendars.length){
   for(const id of request.calendars){
     if(!allowedTool('calendar_get_event',policy)){
       checks.push({kind:'calendar',name:id,status:'not_readable',reason:'connection_area_excluded'});continue;
     }
     const value=await observe(id,()=>clients.calendar.calendars.get({calendarId:id}),
       guide('https://calendar.google.com','Confirm this calendar is shared with the exact acting mailbox.'));
     checks.push({kind:'calendar',...value});
   }
 }
 if(request.driveFolders.length){
   for(const id of request.driveFolders){
     if(!allowedTool('drive_get_file',policy)){
       checks.push({kind:'drive_folder',name:id,status:'not_readable',reason:'connection_area_excluded'});continue;
     }
     const item=await observe(id,async()=>{
       const response=await clients.drive.files.get({fileId:id,fields:'id,mimeType,trashed'});
       if(response?.data?.mimeType!=='application/vnd.google-apps.folder'||response.data.trashed) {
         const e=Error('not a usable folder');e.code=404;throw e;
       }
       return response;
     },guide('https://drive.google.com','Check that the folder exists and is accessible to this acting mailbox.'));
     checks.push({kind:'drive_folder',...item});
   }
 }
 const statuses=checks.map(x=>x.status);
 return {actingAs:clients.actingAs,checkedAt:new Date().toISOString(),
   status:checks.length===0?'not_readable':statuses.includes('missing')?'missing':statuses.includes('not_readable')?'not_readable':'ready',
   checks,changesMade:false,
   note:'Only observed reads are marked ready. Domain-wide delegation requires independent Admin console verification.'};
}
export const tools=[{
 name:'workspace_dev_check_integration',
 description:'Verify an app’s current Google API access, OAuth scopes, delegated identity, calendars and Drive folders without modifying anything.',
 inputSchema:{type:'object',properties:{
   spec:{type:'object',description:'Requirements the app needs from the existing Google account.',properties:{
     apis:{type:'array',items:{type:'string',enum:Object.keys(API_SPECS)}},
     oauthScopes:{type:'array',items:{type:'string'}},delegatedScopes:{type:'array',items:{type:'string'}},
     serviceAccountClientId:{type:'string'},calendars:{type:'array',items:{type:'string'}},driveFolders:{type:'array',items:{type:'string'}}
   }}
 },required:['spec']}
}];
export const handlers={async workspace_dev_check_integration(args={},clients){
 try{return ok(await inspectGoogleIntegration(args.spec,clients));}catch(e){return errorResult(e);}
}};
