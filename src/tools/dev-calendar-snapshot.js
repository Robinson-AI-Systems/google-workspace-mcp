// Read-only preservation evidence for an explicitly owned disposable calendar.
// Event bodies and ACL addresses never leave this handler; only digests do.
import crypto from 'node:crypto';
import {ok} from './util.js';
import {validateCalendarRequest} from './dev-calendar.js';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
async function allPages(list,calendarId){
 const items=[],ids=new Set(),tokens=new Set();let pageToken;
 for(let page=0;page<10;page++){
  const {data}=await list({calendarId,maxResults:100,...(pageToken?{pageToken}:{})});
  if(!Array.isArray(data?.items))throw Error('Calendar snapshot is incomplete: missing items.');
  for(const item of data.items){
   if(typeof item?.id!=='string'||!item.id||ids.has(item.id))throw Error('Calendar snapshot contains missing or duplicate IDs.');
   ids.add(item.id);items.push(item);
  }
  if(!data.nextPageToken)return items.sort((a,b)=>a.id.localeCompare(b.id));
  if(typeof data.nextPageToken!=='string'||tokens.has(data.nextPageToken))throw Error('Calendar snapshot pagination is invalid.');
  tokens.add(data.nextPageToken);pageToken=data.nextPageToken;
 }
 throw Error('Calendar snapshot exceeds ten pages; no preservation claim can be made.');
}
export async function snapshotCalendar(args,clients){
 const calendarId=validateCalendarRequest(args);
 if(clients?.rtcPolicy?.mode!=='test'||!clients.connection||!clients.actingAs)
  throw Error('outside_scope: Calendar acceptance snapshot requires an authenticated TEST connection.');
 const {data:entry}=await clients.calendar.calendarList.get({calendarId});
 if(entry?.id!==calendarId||entry.accessRole!=='owner'||entry.primary===true||calendarId===clients.actingAs)
  throw Error('Calendar snapshot requires a separately owned non-primary calendar.');
 const acl=await allPages(request=>clients.calendar.acl.list(request),calendarId);
 const events=await allPages(request=>clients.calendar.events.list({...request,showDeleted:false,singleEvents:false}),calendarId);
 const active=events.filter(event=>event.status!=='cancelled');
 const metadata=Object.fromEntries(['id','summary','description','location','timeZone','accessRole','primary',
  'summaryOverride','colorId','backgroundColor','foregroundColor','hidden','selected','defaultReminders','notificationSettings']
  .filter(key=>entry[key]!==undefined).map(key=>[key,entry[key]]));
 return {calendarId,owned:true,primary:false,complete:true,eventCount:active.length,
  metadataDigest:digest(metadata),aclDigest:digest(acl),eventsDigest:digest(active)};
}
export const tools=[{name:'calendar_dev_snapshot',description:'Fingerprint an owned non-primary TEST calendar, sharing and active events without returning event contents. Refuses incomplete pagination.',
 inputSchema:{type:'object',properties:{calendarId:{type:'string'}},required:['calendarId']}}];
export const handlers={calendar_dev_snapshot:async(args,clients)=>ok(await snapshotCalendar(args,clients))};
