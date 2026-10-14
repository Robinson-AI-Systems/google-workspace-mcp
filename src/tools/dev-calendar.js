// P8-7: single non-production event on a separately owned TEST calendar.
// No invitees, notification email, delegated users or primary calendar writes.
import crypto from 'node:crypto';
import { startDevRun,reserveDevStep,recordDevObject,markDevStepRecorded,getDevRun,markDevObjectCleaned } from '../db.js';
import { isNotFound } from './write.js';
const ISO=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;
function validCalendarStart(value){
 const match=ISO.exec(value);if(!match)return false;
 const [,year,month,day,hour,minute,second,timezone,sign,offsetHour,offsetMinute]=match;
 if(Number(hour)>23||Number(minute)>59||Number(second)>59)return false;
 const zone=sign==='-'?-1:1;
 const offset=timezone==='Z'?0:zone*(Number(offsetHour)*60+Number(offsetMinute));
 if(timezone!=='Z'&&(Number(offsetHour)>14||Number(offsetMinute)>59||
   (Number(offsetHour)===14&&Number(offsetMinute)!==0)))return false;
 const timestamp=Date.parse(value);
 if(!Number.isFinite(timestamp))return false;
 const local=new Date(timestamp+offset*60000);
 return local.toISOString().slice(0,10)===year+'-'+month+'-'+day;
}
export function validateCalendarRequest(args={}){
 if(typeof args.calendarId!=='string'||!args.calendarId.trim()||args.calendarId==='primary'||args.calendarId.length>256)
   throw Error('Choose an existing separate test calendar ID, not primary.');
 if(args.folder!==undefined)throw Error('Calendar fixtures cannot target Drive folders.');
 if(args.startAt!==undefined&&(!ISO.test(args.startAt)||!Number.isFinite(Date.parse(args.startAt))||!validCalendarStart(args.startAt)))
   throw Error('startAt must be a valid ISO time with a timezone offset.');
 return args.calendarId;
}
export async function requireTestCalendar(clients,calendarId,identity){
 const result=await clients.calendar.calendarList.get({calendarId});
 if(result?.data?.id!==calendarId||result.data.accessRole!=='owner'||
    result.data.primary===true||calendarId==='primary'||calendarId===identity.actingAs)
   throw Error('Fixture calendar must be separately owned by the acting mailbox.');
}
export function exactCalendarEvent(event,id,identity,expectedEventId=null){
 if(!event||typeof event.id!=='string'||!event.id||
   (expectedEventId!==null&&event.id!==expectedEventId)||
   event.status==='cancelled'||
   event.extendedProperties?.private?.rtc_run!==id||
   event.extendedProperties?.private?.rtc_kind!=='event'||
   String(event.creator?.email||'').toLowerCase()!==identity.actingAs)
   throw Error('Calendar event tag, creator or run ID could not be verified.');
 return event.id;
}
async function findEventByRun(clients,calendarId,id,identity){
 const res=await clients.calendar.events.list({calendarId,
   privateExtendedProperty:['rtc_run='+id,'rtc_kind=event'],
   showDeleted:false,maxResults:100,
   fields:'nextPageToken,items(id,status,creator,extendedProperties,summary)'});
 if(res?.data?.nextPageToken)throw Error('Calendar tag search is incomplete; cannot reconcile.');
 const found=(res?.data?.items||[]).filter(x=>x.extendedProperties?.private?.rtc_run===id&&x.extendedProperties?.private?.rtc_kind==='event');
 if(found.length!==1)throw Error('Calendar run '+id+' has '+found.length+' tagged event matches; no duplicate will be created.');
 exactCalendarEvent(found[0],id,identity);
 return found[0].id;
}
export async function createCalendarFixture(args,clients,identity){
 const calendarId=validateCalendarRequest(args),id=args.runId||crypto.randomUUID();
 await requireTestCalendar(clients,calendarId,identity);
 await startDevRun({id,...identity,scenario:'calendar',calendarId});
 const run=await getDevRun({runId:id,...identity});
 if(run?.objects.length&&run.steps.length===0)throw Error('Legacy calendar run has no durable reservations; no automatic retry.');
 const step=await reserveDevStep({runId:id,...identity,kind:'event'});
 let eventId;
 try{
  if(step.state==='recorded'){
    const row=run.objects.find(x=>x.kind==='event'&&x.google_id===step.google_id&&x.parent_id===calendarId);
    if(!row)throw Error('Recorded calendar event has no matching ledger row.');
    exactCalendarEvent((await clients.calendar.events.get({calendarId,eventId:step.google_id})).data,id,identity,step.google_id);
    eventId=step.google_id;
  }else if(!step.created){
    eventId=await findEventByRun(clients,calendarId,id,identity);
    await recordDevObject({runId:id,...identity,kind:'event',googleId:eventId,parentId:calendarId});
    await markDevStepRecorded({runId:id,...identity,kind:'event',googleId:eventId});
  }else{
    const starts=args.startAt?new Date(args.startAt):new Date(Date.now()+86400000);
    const ends=new Date(starts.getTime()+30*60000);
    if(starts.getTime()<=Date.now()||!Number.isFinite(ends.getTime()))throw Error('Fixture event must start in the future.');
    const response=await clients.calendar.events.insert({calendarId,sendUpdates:'none',
      requestBody:{summary:'RTC '+id+' sample event',
        description:'Non-production application integration fixture',
        start:{dateTime:starts.toISOString()},end:{dateTime:ends.toISOString()},
        attendees:[],reminders:{useDefault:false},
        extendedProperties:{private:{rtc_run:id,rtc_kind:'event'}}}});
    eventId=response?.data?.id;
    if(!eventId)throw Error('Google returned no calendar event ID.');
    await recordDevObject({runId:id,...identity,kind:'event',googleId:eventId,parentId:calendarId});
    await markDevStepRecorded({runId:id,...identity,kind:'event',googleId:eventId});
  }
 }catch(e){throw Error('Calendar fixture run '+id+' is uncertain; retry SAME runId for tag reconciliation, never a new create: '+String(e?.message||e).slice(0,140));}
 return {runId:id,scenario:'calendar',calendarId,objects:[{kind:'event',id:eventId,parentId:calendarId}],actingAs:identity.actingAs};
}
export async function calendarReadback(clients,identity,runId){
 const run=await getDevRun({runId,...identity});
 if(!run||run.scenario!=='calendar'||run.steps?.length!==1||run.steps[0].state!=='recorded'||run.objects.length!==1)return {verified:false};
 const obj=run.objects[0];
 await requireTestCalendar(clients,run.calendar_id,identity);
 try{
  if(obj.kind!=='event'||obj.parent_id!==run.calendar_id||
     run.steps[0].kind!=='event'||run.steps[0].google_id!==obj.google_id)
   throw Error('Calendar provider ID and recorded reservation must match.');
  const response=await clients.calendar.events.get({calendarId:run.calendar_id,eventId:obj.google_id});
  exactCalendarEvent(response.data,runId,identity,obj.google_id);
  return {runId,verified:true,objects:[{kind:'event',id:obj.google_id,verified:true}]};
 }catch{return {runId,verified:false};}
}
export async function inspectCalendarCleanup(run,clients,identity){
 if(run.scenario!=='calendar'||!run.calendar_id||run.steps.length!==1||run.steps[0].state!=='recorded'||run.objects.length!==1)
   throw Error('Calendar fixture ledger is incomplete or uncertain.');
 await requireTestCalendar(clients,run.calendar_id,identity);
 const o=run.objects[0];
 if(o.kind!=='event'||o.parent_id!==run.calendar_id||o.google_id!==run.steps[0].google_id)
   throw Error('Calendar fixture ledger does not match reservation.');
 let alreadyDeleted=false;
 try{
  const result=await clients.calendar.events.get({calendarId:run.calendar_id,eventId:o.google_id});
  // A successful GET is only evidence about its requested ledger object if
  // Google also returned the exact ID. A foreign/corrupt tombstone must
  // never authorize deletion, mark the ledger clean or trigger a new delete.
  if(result.data?.id!==o.google_id)throw Error('Calendar provider returned a different event ID from the durable fixture ledger.');
  if(result.data.status==='cancelled')alreadyDeleted=true;
  else exactCalendarEvent(result.data,run.id,identity,o.google_id);
 }catch(e){if(isNotFound(e))alreadyDeleted=true;else throw e;}
 // When Calendar already deleted the exact ledger ID during a previous attempt,
 // don't try another delete or invent a different event ID.
 return {run,identity,proof:[{kind:'event',id:o.google_id,calendarId:run.calendar_id,cleaned:!!o.cleaned_at,alreadyDeleted}]};
}
export async function deleteRecordedCalendarFixture(run,clients,identity){
 const proof=await inspectCalendarCleanup(run,clients,identity);
 const obj=run.objects[0];
 if(!proof.proof[0].alreadyDeleted)
   await clients.calendar.events.delete({calendarId:run.calendar_id,eventId:obj.google_id,sendUpdates:'none'});
 let gone=proof.proof[0].alreadyDeleted;
 if(!gone)try{
  const r=await clients.calendar.events.get({calendarId:run.calendar_id,eventId:obj.google_id});
  gone=r.data?.id===obj.google_id&&r.data?.status==='cancelled';
 }catch(e){if(isNotFound(e))gone=true;else throw e;}
 if(!gone)return {runId:run.id,fullyCleaned:false,completed:[],failures:[{id:obj.google_id,reason:'Delete was not verified by Calendar.'}]};
 await markDevObjectCleaned({runId:run.id,...identity,kind:'event',googleId:obj.google_id});
 return {runId:run.id,fullyCleaned:true,completed:[{kind:'event',id:obj.google_id,deleted:true}],failures:[]};
}
export async function confirmCalendarGone(run,clients,identity){
 const obj=run.objects[0];
 let gone=false;
 try{const r=await clients.calendar.events.get({calendarId:run.calendar_id,eventId:obj.google_id});gone=r.data?.id===obj.google_id&&r.data?.status==='cancelled';}
 catch(e){if(isNotFound(e))gone=true;}
 const fresh=await getDevRun({runId:run.id,...identity});
 return {runId:run.id,allTrashed:gone&&!!fresh?.objects[0]?.cleaned_at,deleted:gone};
}
