// P8-7: prove the actual Google integration boundary used by an app.
// Only read operations against the caller's existing Google identity are made.
// Never grants scopes, impersonates users, creates fixtures, or reports an
// unobservable Admin console authorization as "ready".
import { ok, errorResult } from './util.js';
import { allowedTool } from '../rtc/catalog.js';
import { DELEGATED_SCOPES, describeServiceAccount } from '../auth/service-account.js';
import { normalizeExactAppResources, inspectExactAppResources } from './dev-integration-resources.js';
import { normalizeAppCapabilities, inspectAppCapabilities } from './dev-integration-capabilities.js';
import { normalizeCalendarAvailability, inspectCalendarAvailability } from './dev-integration-calendar-readiness.js';

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
 const fields=['apis','oauthScopes','delegatedScopes','calendars','driveFolders','gmailLabels','documents','spreadsheets','presentations','forms'];
 const out={};
 for(const field of fields){
   const values=input[field]===undefined?(field==='apis'?['gmail','drive','calendar']:[]):input[field];
   if(!Array.isArray(values)||values.length>MAX_ITEMS||values.some(v=>typeof v!=='string'||!v.trim()||v.length>512))throw Error(field+' must be an array of up to 12 nonempty strings.');
   out[field]=[...new Set(values)];
 }
 if(out.apis.some(x=>!Object.hasOwn(API_SPECS,x)))throw Error('Unsupported API. Use gmail, drive, calendar, tasks, chat, people or postmaster.');
 if([...out.oauthScopes,...out.delegatedScopes].some(s=>!(['openid','email','profile'].includes(s)||/^https:\/\/www\.googleapis\.com\/auth\/[A-Za-z0-9._/-]+$/.test(s))))throw Error('Scopes must use approved Google auth scope syntax.');
 if([...out.calendars,...out.driveFolders,...out.gmailLabels,...out.documents,...out.spreadsheets,...out.presentations,...out.forms].some(x=>!GOOGLE_ID.test(x)))throw Error('Invalid Google resource identifier.');
 // Calendar event reads require both exact identifiers. Never infer the
 // calendar from the primary alias or guess an event ID from its summary.
 const events=input.calendarEvents===undefined?[]:input.calendarEvents;
 if(!Array.isArray(events)||events.length>MAX_ITEMS||
    events.some(e=>!e||typeof e!=='object'||Array.isArray(e)||
      typeof e.calendarId!=='string'||typeof e.eventId!=='string'||
      !GOOGLE_ID.test(e.calendarId)||!GOOGLE_ID.test(e.eventId)))
   throw Error('calendarEvents must contain up to 12 {calendarId,eventId} pairs.');
 const pairs=new Set();
 out.calendarEvents=[];
 for(const {calendarId,eventId} of events){
   const key=JSON.stringify([calendarId,eventId]);
   if(!pairs.has(key)){pairs.add(key);out.calendarEvents.push({calendarId,eventId});}
 }
 if(input.serviceAccountClientId!==undefined&&
   (typeof input.serviceAccountClientId!=='string'||!/^[0-9]{10,32}$/.test(input.serviceAccountClientId)))
   throw Error('serviceAccountClientId must be a Google numeric client ID.');
 out.serviceAccountClientId=input.serviceAccountClientId||null;
 Object.assign(out, normalizeExactAppResources(input), normalizeAppCapabilities(input), normalizeCalendarAvailability(input));
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

const nonempty=v=>typeof v==='string'&&v.trim().length>0;
function listShape(data,key){
 // Google list endpoints may omit an empty collection. Absence is not affirmative
 // proof of app-list readiness; tell the developer the evidence is unreadable.
 if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data[key]))return false;
 if(data.nextPageToken!==undefined&&typeof data.nextPageToken!=='string')return false;
 return true;
}
function verifiedApiProbe(name,response,actingAs){
 const data=response?.data;
 if(!data||typeof data!=='object'||Array.isArray(data))return false;
 if(name==='gmail')return nonempty(data.emailAddress)&&data.emailAddress.toLowerCase()===actingAs.toLowerCase();
 if(name==='drive')return listShape(data,'files')&&data.files.every(f=>nonempty(f?.id));
 if(name==='calendar')return listShape(data,'items')&&data.items.every(item=>nonempty(item?.id));
 if(name==='tasks')return listShape(data,'items')&&data.items.every(item=>nonempty(item?.id));
 if(name==='chat')return listShape(data,'spaces')&&data.spaces.every(s=>nonempty(s?.name));
 if(name==='people')return nonempty(data.resourceName)&&data.resourceName.startsWith('people/')&&
   Array.isArray(data.emailAddresses)&&data.emailAddresses.some(a=>nonempty(a?.value)&&a.value.toLowerCase()===actingAs.toLowerCase());
 if(name==='postmaster')return listShape(data,'domains')&&data.domains.every(d=>nonempty(d?.name));
 return false;
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
   const info=await observe(api,async()=>{
     const response=await item.probe(clients);
     // Gmail readiness must be for this exact business mailbox, not a
     // different Google account whose profile request also returned 200.
     if(!verifiedApiProbe(api,response,clients.actingAs))
       throw Error('The provider did not prove a correctly shaped API result for the acting account.');
     return response;
   },guide(item.url,'Enable '+item.label+' API and verify consent for this mailbox.'));
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
     const value=await observe(id,async()=>{
       const response=await clients.calendar.calendars.get({calendarId:id});
       const actual=response?.data?.id;
       // Google's 'primary' alias resolves to the acting mailbox ID.
       if(actual!==id&&!(id==='primary'&&actual===clients.actingAs))
         throw Error('The requested calendar identity was not returned.');
       return response;
     },
       guide('https://calendar.google.com','Confirm this calendar is shared with the exact acting mailbox.'));
     checks.push({kind:'calendar',...value});
   }
 }
 // Application readiness must check the exact mailbox-local Gmail label, not
 // merely a successful profile read or a label with the same display name.
 for(const id of request.gmailLabels){
   if(!allowedTool('gmail_get_label',policy)){
     checks.push({kind:'gmail_label',name:id,status:'not_readable',reason:'connection_area_excluded'});continue;
   }
   const observed=await observe(id,async()=>{
     const response=await clients.gmail.users.labels.get({userId:'me',id});
     if(response?.data?.id!==id)throw Error('The requested Gmail label identity was not returned.');
     return response;
   },guide('https://mail.google.com','Check that this label ID belongs to the acting mailbox.'));
   checks.push({kind:'gmail_label',...observed});
 }
 // A calendar list or calendar metadata read cannot prove that an app may
 // open an exact event. This never creates, modifies or deletes an event.
 for(const {calendarId,eventId} of request.calendarEvents){
   const name=calendarId+'/'+eventId;
   if(!allowedTool('calendar_get_event',policy)){
     checks.push({kind:'calendar_event',name,status:'not_readable',reason:'connection_area_excluded'});continue;
   }
   const observed=await observe(name,async()=>{
     const response=await clients.calendar.events.get({calendarId,eventId});
     if(response?.data?.id!==eventId)throw Error('The requested calendar event identity was not returned.');
     return response;
   },guide('https://calendar.google.com','Confirm the exact event ID is accessible on this calendar to the acting mailbox.'));
   checks.push({kind:'calendar_event',...observed});
 }
 // Document-service APIs have no safe general-purpose list probe. Check exact
 // app-owned resources instead: a Drive file listing cannot prove that Docs,
 // Sheets, Slides or Forms actually permits this account to open the object.
 const resourceChecks=[
   {kind:'document',ids:request.documents,tool:'docs_get_document',service:'docs',
     read:(c,id)=>c.docs.documents.get({documentId:id,fields:'documentId,title'}),id:'documentId',
     url:'https://docs.google.com'},
   {kind:'spreadsheet',ids:request.spreadsheets,tool:'sheets_get_spreadsheet',service:'sheets',
     read:(c,id)=>c.sheets.spreadsheets.get({spreadsheetId:id,fields:'spreadsheetId,properties.title'}),id:'spreadsheetId',
     url:'https://sheets.google.com'},
   {kind:'presentation',ids:request.presentations,tool:'slides_get_presentation',service:'slides',
     read:(c,id)=>c.slides.presentations.get({presentationId:id,fields:'presentationId,title'}),id:'presentationId',
     url:'https://slides.google.com'},
   {kind:'form',ids:request.forms,tool:'forms_get',service:'forms',
     read:(c,id)=>c.forms.forms.get({formId:id}),id:'formId',
     url:'https://forms.google.com'}
 ];
 for(const kind of resourceChecks){
   for(const id of kind.ids){
     if(!allowedTool(kind.tool,policy)){
       checks.push({kind:kind.kind,name:id,status:'not_readable',reason:'connection_area_excluded'});continue;
     }
     const checked=await observe(id,async()=>{
       const response=await kind.read(clients,id);
       // Access to a different or unidentified item is not readiness for
       // the exact app fixture requested by the caller.
       if(response?.data?.[kind.id]!==id)throw Error('No exact resource identity returned');
       return response;
     },guide(kind.url,'Confirm the exact '+kind.kind+' exists and is shared with this mailbox.'));
     checks.push({kind:kind.kind,...checked});
   }
 }
 if(request.driveFolders.length){
   for(const id of request.driveFolders){
     if(!allowedTool('drive_get_file',policy)){
       checks.push({kind:'drive_folder',name:id,status:'not_readable',reason:'connection_area_excluded'});continue;
     }
     const item=await observe(id,async()=>{
       const response=await clients.drive.files.get({fileId:id,fields:'id,mimeType,trashed'});
       if(response?.data?.id!==id)throw Error('The requested Drive folder identity was not returned.');
       if(response?.data?.mimeType!=='application/vnd.google-apps.folder'||response.data.trashed) {
         const e=Error('not a usable folder');e.code=404;throw e;
       }
       return response;
     },guide('https://drive.google.com','Check that the folder exists and is accessible to this acting mailbox.'));
     checks.push({kind:'drive_folder',...item});
   }
 }
 checks.push(...await inspectExactAppResources(request,clients));
 checks.push(...await inspectAppCapabilities(request,clients));
 checks.push(...await inspectCalendarAvailability(request,clients));
 const statuses=checks.map(x=>x.status);
 return {actingAs:clients.actingAs,checkedAt:new Date().toISOString(),
   status:checks.length===0?'not_readable':statuses.includes('missing')?'missing':statuses.includes('not_readable')?'not_readable':'ready',
   checks,changesMade:false,
   note:'Only observed reads are marked ready. Domain-wide delegation requires independent Admin console verification.'};
}
export const tools=[{
 name:'workspace_dev_check_integration',
 description:'Verify Google API/scopes, exact app resources and declared Calendar/Drive/Gmail access capabilities with read-only metadata.',
 inputSchema:{type:'object',properties:{
   spec:{type:'object',description:'Requirements the app needs from the existing Google account.',properties:{
     apis:{type:'array',items:{type:'string',enum:Object.keys(API_SPECS)}},
     oauthScopes:{type:'array',items:{type:'string'}},delegatedScopes:{type:'array',items:{type:'string'}},
     serviceAccountClientId:{type:'string'},calendars:{type:'array',items:{type:'string'}},driveFolders:{type:'array',items:{type:'string'}},
     gmailLabels:{type:'array',items:{type:'string'}},
     calendarEvents:{type:'array',maxItems:12,items:{type:'object',required:['calendarId','eventId'],properties:{calendarId:{type:'string'},eventId:{type:'string'}}}},
     documents:{type:'array',items:{type:'string'}},spreadsheets:{type:'array',items:{type:'string'}},
     presentations:{type:'array',items:{type:'string'}},forms:{type:'array',items:{type:'string'}},
     gmailMessages:{type:'array',maxItems:12,items:{type:'string'}},
     gmailThreads:{type:'array',maxItems:12,items:{type:'string'}},
     driveFiles:{type:'array',maxItems:12,items:{type:'string'}},
     taskLists:{type:'array',maxItems:12,items:{type:'string'}},
     taskItems:{type:'array',maxItems:12,items:{type:'object',required:['tasklistId','taskId'],
       properties:{tasklistId:{type:'string'},taskId:{type:'string'}}}},
     chatSpaces:{type:'array',maxItems:12,items:{type:'string'}},
     contacts:{type:'array',maxItems:12,items:{type:'string'}},
     calendarRoles:{type:'array',maxItems:12,items:{type:'object',required:['calendarId','minimumRole'],
       properties:{calendarId:{type:'string'},minimumRole:{type:'string',enum:['reader','writer','owner']}}}},
     driveFolderCapabilities:{type:'array',maxItems:12,items:{type:'object',required:['folderId','capability'],
       properties:{folderId:{type:'string'},capability:{type:'string',
         enum:['canAddChildren','canEdit','canShare','canReadRevisions']}}}},
     driveMemberships:{type:'array',maxItems:12,items:{type:'object',
       required:['driveId','permissionId','role'],properties:{
       driveId:{type:'string'},permissionId:{type:'string'},
       role:{type:'string',enum:['organizer','fileOrganizer','writer','commenter','reader']}}}},
     gmailSendAsAliases:{type:'array',maxItems:12,items:{type:'string'}},
     calendarFreeBusyWindows:{type:'array',maxItems:12,items:{type:'object',
       required:['calendarId','timeMin','timeMax'],
       properties:{calendarId:{type:'string'},timeMin:{type:'string'},timeMax:{type:'string'}}}}
   }}
 },required:['spec']}
}];
export const handlers={async workspace_dev_check_integration(args={},clients){
 try{return ok(await inspectGoogleIntegration(args.spec,clients));}catch(e){return errorResult(e);}
}};
