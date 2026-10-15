// P8-7: app prerequisite *permissions*, not just object existence.
// Verifies account-visible metadata without invoking any Google mutator.
// No success here proves that a subsequent write will succeed: it reports
// only the permission/capability Google declared at this moment.
import {allowedTool} from '../rtc/catalog.js';

const ID=/^[^\s/?#<>]{1,256}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EACH=12,MAX_TOTAL=24;
const ROLE_ORDER=['none','freeBusyReader','reader','writer','owner'];
const DRIVE_CAPABILITIES=new Set(['canAddChildren','canEdit','canShare','canReadRevisions']);
const DRIVE_ROLES=new Set(['organizer','fileOrganizer','writer','commenter','reader']);
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const identifier=v=>typeof v==='string'&&v.trim()===v&&ID.test(v);
const email=v=>typeof v==='string'&&v.trim()===v&&EMAIL.test(v);
const uniqueRecords=items=>{
 const seen=new Set(),out=[];
 for(const value of items){
  const key=JSON.stringify(value);
  if(!seen.has(key)){seen.add(key);out.push(value);}
 }
 return out;
};

export function normalizeAppCapabilities(input={}){
 if(!isObject(input))throw Error('App capability requirements must be an object.');
 const result={};
 const schemas={
  calendarRoles:{fields:['calendarId','minimumRole'],valid:x=>identifier(x.calendarId)&&
    ['reader','writer','owner'].includes(x.minimumRole)},
  driveFolderCapabilities:{fields:['folderId','capability'],valid:x=>
    identifier(x.folderId)&&DRIVE_CAPABILITIES.has(x.capability)},
  driveMemberships:{fields:['driveId','permissionId','role'],valid:x=>
    identifier(x.driveId)&&identifier(x.permissionId)&&DRIVE_ROLES.has(x.role)}
 };
 let total=0;
 for(const [field,spec] of Object.entries(schemas)){
  const values=input[field]===undefined?[]:input[field];
  if(!Array.isArray(values)||values.length>MAX_EACH||
    values.some(value=>!isObject(value)||Object.keys(value).sort().join(',')!==spec.fields.slice().sort().join(',')||
      !spec.valid(value)))throw Error(field+' must contain up to 12 exact approved capability requirements.');
  result[field]=uniqueRecords(values);
  total+=result[field].length;
 }
 const aliases=input.gmailSendAsAliases===undefined?[]:input.gmailSendAsAliases;
 if(!Array.isArray(aliases)||aliases.length>MAX_EACH||aliases.some(v=>!email(v)))
  throw Error('gmailSendAsAliases must list up to 12 exact email addresses.');
 result.gmailSendAsAliases=[...new Set(aliases.map(v=>v.toLowerCase()))];
 total+=result.gmailSendAsAliases.length;
 if(total>MAX_TOTAL)throw Error('At most 24 app capability checks per integration request.');
 return result;
}
function failure(error){
 const status=Number(error?.response?.status||error?.code)||0;
 if(status===404)return {status:'missing',reason:'resource_not_found'};
 if(status===401||status===403)return {status:'not_readable',reason:'scope_or_access_denied'};
 const reason=String(error?.response?.data?.error?.errors?.[0]?.reason||'');
 if(['SERVICE_DISABLED','accessNotConfigured'].includes(reason))
  return {status:'missing',reason:'api_not_enabled'};
 return {status:'not_readable',reason:'google_probe_failed'};
}
const guide=(url,detail)=>({url,steps:[{n:1,action:'Open',target:url},
 {n:2,action:'Verify',target:detail}],
 expected:'Confirm exact account permissions in Google settings. Nothing changed.'});
async function inspectOne({kind,name,tool,clients,url,detail,read,prove}){
 if(!allowedTool(tool,clients.rtcPolicy||{}))
  return {kind,name,status:'not_readable',reason:'connection_area_excluded'};
 try{
  const value=(await read())?.data;
  if(!isObject(value))return {kind,name,status:'not_readable',
    reason:'google_probe_failed',fix:guide(url,detail)};
  const result=prove(value);
  return {kind,name,...result,...(result.status!=='ready'?{fix:guide(url,detail)}:{})};
 }catch(error){return {kind,name,...failure(error),fix:guide(url,detail)};}
}
const success={status:'ready'};
const mismatch={status:'not_readable',reason:'unexpected_provider_identity'};
const missing={status:'missing',reason:'required_capability_not_available'};

export async function inspectAppCapabilities(request,clients){
 const checks=[];
 for(const {calendarId,minimumRole} of request.calendarRoles||[]){
  checks.push(await inspectOne({kind:'calendar_role',name:calendarId,clients,
   tool:'calendar_list_calendars',url:'https://calendar.google.com',
   detail:'Verify this exact calendar is shared with the expected reader/writer/owner access.',
   read:()=>clients.calendar.calendarList.get({calendarId}),
   prove:v=>v.id!==calendarId?mismatch:
     ROLE_ORDER.indexOf(v.accessRole)<ROLE_ORDER.indexOf(minimumRole)?missing:
     ROLE_ORDER.includes(v.accessRole)?success: {status:'not_readable',reason:'calendar_role_unreadable'}
  }));
 }
 for(const {folderId,capability} of request.driveFolderCapabilities||[]){
  checks.push(await inspectOne({kind:'drive_folder_capability',name:folderId+'/'+capability,clients,
   tool:'drive_get_file',url:'https://drive.google.com',
   detail:'Confirm the exact untrashed folder and Google Drive capability in its sharing details.',
   read:()=>clients.drive.files.get({fileId:folderId,
    fields:'id,mimeType,trashed,capabilities(canAddChildren,canEdit,canShare,canReadRevisions)',
    supportsAllDrives:true}),
   prove:v=>v.id!==folderId?mismatch:
    v.mimeType!=='application/vnd.google-apps.folder'||v.trashed===true?missing:
    v.capabilities?.[capability]===true?success:
    v.capabilities?.[capability]===false?missing:
    {status:'not_readable',reason:'capability_unreadable'}
  }));
 }
 for(const {driveId,permissionId,role} of request.driveMemberships||[]){
  checks.push(await inspectOne({kind:'drive_membership',
   name:driveId+'/'+permissionId,clients,tool:'drive_list_permissions',
   url:'https://drive.google.com',detail:'Verify the exact shared-drive membership ID, this mailbox and the expected role.',
   read:()=>clients.drive.permissions.get({fileId:driveId,permissionId,
     fields:'id,role,emailAddress,type',supportsAllDrives:true}),
   prove:v=>v.id!==permissionId||
      typeof v.emailAddress!=='string'||v.emailAddress.toLowerCase()!==clients.actingAs.toLowerCase()?mismatch:
      v.role===role?success: DRIVE_ROLES.has(v.role)?missing:
       {status:'not_readable',reason:'membership_role_unreadable'}
  }));
 }
 for(const alias of request.gmailSendAsAliases||[]){
  checks.push(await inspectOne({kind:'gmail_send_as',name:alias,clients,
   tool:'gmail_list_send_as',url:'https://mail.google.com',
   detail:'Verify that this mailbox owns and has accepted this exact send-as identity in Gmail settings.',
   read:()=>clients.gmail.users.settings.sendAs.get({userId:'me',sendAsEmail:alias}),
   prove:v=>typeof v.sendAsEmail!=='string'||v.sendAsEmail.toLowerCase()!==alias?mismatch:
     v.isPrimary===true||v.verificationStatus==='accepted'?success:
     v.verificationStatus==='pending'?missing:
     {status:'not_readable',reason:'sender_verification_unreadable'}
  }));
 }
 return checks;
}
export const APP_CAPABILITY_FIELDS=Object.freeze([
 'calendarRoles','driveFolderCapabilities','driveMemberships','gmailSendAsAliases'
]);
