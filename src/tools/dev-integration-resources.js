// P8-7 app readiness: independently verify resources an app will actually
// read, rather than inferring their availability from a successful API list.
// All calls are metadata-only; no provider body or message content is returned.
import {allowedTool} from '../rtc/catalog.js';

const MAX_EACH=12,MAX_TOTAL=24;
const ID=/^[^\s/?#<>]{1,256}$/;
const CHAT=/^spaces\/[A-Za-z0-9_-]{1,180}$/;
const PERSON=/^people\/[A-Za-z0-9_-]{1,180}$/;
const SINGLE=Object.freeze({
 gmailMessages:{kind:'gmail_message',tool:'gmail_get_message',area:'mail',
   url:'https://mail.google.com',label:'Gmail message ID',
   read:(c,id)=>c.gmail.users.messages.get({userId:'me',id,format:'minimal'}),
   field:'id'},
 gmailThreads:{kind:'gmail_thread',tool:'gmail_get_thread',area:'mail',
   url:'https://mail.google.com',label:'Gmail conversation/thread ID',
   read:(c,id)=>c.gmail.users.threads.get({userId:'me',id,format:'minimal'}),
   field:'id'},
 driveFiles:{kind:'drive_file',tool:'drive_get_file',area:'files',
   url:'https://drive.google.com',label:'Google Drive file ID',
   read:(c,id)=>c.drive.files.get({fileId:id,fields:'id,mimeType,trashed,owners(emailAddress)',supportsAllDrives:true}),
   field:'id',requireUntrashed:true},
 taskLists:{kind:'task_list',tool:'tasks_get_tasklist',area:'tasks',
   url:'https://tasks.google.com',label:'Google Tasks list ID',
   read:(c,id)=>c.tasks.tasklists.get({tasklist:id}),
   field:'id'},
 chatSpaces:{kind:'chat_space',tool:'chat_get_space',area:'chat',
   url:'https://chat.google.com',label:'Google Chat space resource name',
   read:(c,id)=>c.chat.spaces.get({name:id}),
   field:'name'},
 contacts:{kind:'contact',tool:'contacts_get',area:'people',
   url:'https://contacts.google.com',label:'Google People resource name',
   read:(c,id)=>c.people.people.get({resourceName:id,personFields:'names,emailAddresses'}),
   field:'resourceName'}
});
const nonEmpty=(s,pattern=ID)=>typeof s==='string'&&s.trim()===s&&pattern.test(s);
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const unique=value=>[...new Set(value)];

export function normalizeExactAppResources(input={}){
 if(!isObject(input))throw Error('Exact app resources must be provided as an object.');
 const out={};
 let total=0;
 for(const [field,info] of Object.entries(SINGLE)){
  const items=input[field]===undefined?[]:input[field];
  const rule=field==='chatSpaces'?CHAT:field==='contacts'?PERSON:ID;
  if(!Array.isArray(items)||items.length>MAX_EACH||items.some(v=>!nonEmpty(v,rule)))
   throw Error(field+' must contain up to 12 exact Google resource identifiers.');
  out[field]=unique(items);
  total+=out[field].length;
 }
 const pairs=input.taskItems===undefined?[]:input.taskItems;
 if(!Array.isArray(pairs)||pairs.length>MAX_EACH||pairs.some(p=>!isObject(p)||
   Object.keys(p).sort().join(',')!=='taskId,tasklistId'||
   !nonEmpty(p.taskId)||!nonEmpty(p.tasklistId)))
   throw Error('taskItems must contain up to 12 exact {tasklistId,taskId} pairs.');
 const seen=new Set();
 out.taskItems=[];
 for(const p of pairs){
  const key=JSON.stringify([p.tasklistId,p.taskId]);
  if(!seen.has(key)){seen.add(key);out.taskItems.push({tasklistId:p.tasklistId,taskId:p.taskId});}
 }
 total+=out.taskItems.length;
 if(total>MAX_TOTAL)throw Error('At most 24 exact app-resource reads per integration check.');
 return out;
}
function failed(error,kind){
 const status=Number(error?.response?.status||error?.code)||0;
 const google=error?.response?.data?.error||{};
 const reason=String(google.errors?.[0]?.reason||google.status||'');
 const message=String(google.message||google.errors?.[0]?.message||error?.message||'');
 if(status===404)return {status:'missing',reason:'resource_not_found'};
 // Tasks may report a nonexistent list as 400 "Invalid task list ID" rather
 // than 404. Return a precise bounded classification, not raw Google text.
 if(status===400&&['task_list','task_item'].includes(kind)&&
   /invalid (?:task\s*list|tasklist) (?:id|identifier)/i.test(message))
   return {status:'missing',reason:'invalid_provider_resource'};
 if(['accessNotConfigured','SERVICE_DISABLED'].includes(reason))
  return {status:'missing',reason:'api_not_enabled'};
 if(status===401||status===403)return {status:'not_readable',reason:'scope_or_access_denied'};
 return {status:'not_readable',reason:'google_probe_failed'};
}
const guide=(url,label)=>({url,
 steps:[{n:1,action:'Open',target:url},
  {n:2,action:'Verify',target:'Confirm the requested '+label+' is accessible to the current connected Google account.'}],
 expected:'Confirm ownership or explicit access in the Google interface; this check did not change anything.'});

async function one({kind,tool,url,label,read,field,requireUntrashed},id,clients,args){
 const name=kind==='task_item'?args.tasklistId+'/'+id:id;
 if(!allowedTool(tool,clients.rtcPolicy||{}))
  return {kind,name,status:'not_readable',reason:'connection_area_excluded'};
 try{
  const response=await read(clients,id,args);
  const actual=response?.data;
  if(!isObject(actual)||actual[field]!==id||(requireUntrashed&&actual.trashed===true))
   throw Error('Google did not return the exact requested app resource.');
  return {kind,name,status:'ready'};
 }catch(error){
  return {kind,name,...failed(error,kind),
   fix:guide(url,label)};
 }
}

export async function inspectExactAppResources(request,clients){
 const checks=[];
 for(const [field,info] of Object.entries(SINGLE))
  for(const resourceId of request[field]||[])
   checks.push(await one(info,resourceId,clients));
 const taskTool='tasks_get_task';
 const taskInfo={kind:'task_item',tool:taskTool,url:'https://tasks.google.com',
  label:'Google task on its exact task list',field:'id',
  read:(c,taskId,{tasklistId})=>c.tasks.tasks.get({tasklist:tasklistId,task:taskId})};
 for(const pair of request.taskItems||[])
  checks.push(await one(taskInfo,pair.taskId,clients,pair));
 return checks;
}

export const APP_RESOURCE_FIELDS=Object.freeze([...Object.keys(SINGLE),'taskItems']);
