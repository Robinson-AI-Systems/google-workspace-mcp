// P8-7: tagged scratch fixtures. No external shares or outgoing messages.
import crypto from 'node:crypto';
import { defineWrite } from './write.js';
import { ok } from './util.js';
import { allowedTool } from '../rtc/catalog.js';
import {createGmailFixtures,gmailReadback,inspectGmailCleanup,trashGmailFixtures,confirmGmailCleaned} from './dev-gmail.js';
import { validateCalendarRequest, requireTestCalendar, createCalendarFixture, calendarReadback,inspectCalendarCleanup,deleteRecordedCalendarFixture,confirmCalendarGone } from './dev-calendar.js';
import { startDevRun, reserveDevStep, recordDevObject, markDevStepRecorded, getDevRun, listDevRuns, markDevObjectCleaned } from '../db.js';

const FOLDER='application/vnd.google-apps.folder';
const DOC='application/vnd.google-apps.document';
const SHEET='application/vnd.google-apps.spreadsheet';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function requireDevMode(clients) {
 // Trusted connection settings, never caller-provided tool args, set mode.
 if(clients?.rtcPolicy?.mode!=='test')
   throw Error('outside_scope: RTC fixture mutations require a trusted non-production TEST connection.');
}
function requireDriveArea(clients) {
 const policy=clients?.rtcPolicy||{};
 if(!allowedTool('drive_get_file',policy)||!allowedTool('drive_create_folder',policy))
   throw Error('outside_scope: This connection cannot create or inspect Drive fixtures.');
}
function owner(clients) {
  if(!EMAIL.test(clients?.actingAs||'')||!clients?.connection)throw Error('Fixture changes need an authenticated connection and acting mailbox.');
  requireDevMode(clients);
  return {actingAs:clients.actingAs.toLowerCase(),connection:clients.connection};
}
export function validateFixtureRequest(args={}) {
  if(!['files','calendar','gmail'].includes(args.scenario))throw Error('Choose files, calendar or gmail fixture scenario.');
 if(args.scenario==='calendar')validateCalendarRequest(args);
 if(args.scenario==='gmail'&&(args.folder!==undefined||args.calendarId!==undefined||args.startAt!==undefined))throw Error('Gmail only targets the signed-in mailbox.');
  if(args.folder!==undefined&&(!/^[a-zA-Z0-9_-]{8,180}$/.test(args.folder)))throw Error('folder must be an existing Drive folder ID.');
  if(args.runId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.runId))
    throw Error('runId must be a UUID assigned to this same account and connection.');
  return {scenario:args.scenario,folder:args.folder||null,calendarId:args.calendarId||null,runId:args.runId||null};
}
async function checkParent(clients,folder) {
  if(!folder)return;
  const response=await clients.drive.files.get({fileId:folder,fields:'id,mimeType,trashed,owners(emailAddress)',supportsAllDrives:false});
  const data=response?.data;
  if(data?.mimeType!==FOLDER||data.trashed||!data.owners?.some(x=>String(x.emailAddress).toLowerCase()===clients.actingAs.toLowerCase()))
    throw Error('Fixture parent must be an owned, accessible, untrashed My Drive folder.');
}

const KIND_MIME={folder:FOLDER,doc:DOC,sheet:SHEET};
const SLOT_ORDER=['folder','doc','sheet'];
const SLOT_NAME={folder:'sample folder',doc:'example doc',sheet:'example sheet'};
async function taggedCandidates(runId,kind,clients){
 const q="trashed = false and appProperties has { key='rtc_run' and value='"+runId+"' } and appProperties has { key='rtc_kind' and value='"+kind+"' }";
 const r=await clients.drive.files.list({q,fields:'nextPageToken,files(id,mimeType,trashed,parents,owners(emailAddress),appProperties)',
  pageSize:100,spaces:'drive',supportsAllDrives:false});
 if(r?.data?.nextPageToken)throw Error('Tag search was paginated; outcome remains uncertain.');
 return (r?.data?.files||[]).filter(f=>f.appProperties?.rtc_run===runId&&f.appProperties?.rtc_kind===kind);
}
function verifyOwnedTag(file,runId,kind,identity,parent){
 if(!file||typeof file.id!=='string'||file.mimeType!==KIND_MIME[kind]||file.trashed===true||
    file.appProperties?.rtc_run!==runId||file.appProperties?.rtc_kind!==kind||
    !file.owners?.some(o=>String(o.emailAddress).toLowerCase()===identity.actingAs)||
    (parent&&!file.parents?.includes(parent)))
   throw Error('Tagged fixture failed ID, owner, type, parent or run verification.');
 return file.id;
}
async function reconcileStep({id,kind,parent,identity,clients}){
 const matches=await taggedCandidates(id,kind,clients);
 if(matches.length!==1)throw Error('Fixture run '+id+' has a pending '+kind+' step with '+matches.length+' exact tag matches. No retry creation attempted; resolve by provider ID.');
 const found=matches[0];verifyOwnedTag(found,id,kind,identity,parent);
 await recordDevObject({runId:id,...identity,kind,googleId:found.id,parentId:parent});
 await markDevStepRecorded({runId:id,...identity,kind,googleId:found.id});
 return found.id;
}
export async function createTaggedDriveFixtures(args,clients){
 const request=validateFixtureRequest(args),id=request.runId||crypto.randomUUID(),identity=owner(clients);
 requireDriveArea(clients);
 await checkParent(clients,request.folder);
 await startDevRun({id,...identity,scenario:request.scenario,folder:request.folder});
 const prior=await getDevRun({runId:id,...identity});
 if(prior?.objects.length>0&&prior?.steps.length===0)
   throw Error('Legacy fixture run '+id+' has object IDs but no creation reservations. Refusing duplicate creation; recover by exact provider IDs in a separately reviewed reconciliation.');

 const objects=[];
 let parent=request.folder;
 try{
  for(const kind of SLOT_ORDER){
   const step=await reserveDevStep({runId:id,...identity,kind});
   let googleId;
   if(step.state==='recorded'){
    const run=await getDevRun({runId:id,...identity});
    const row=run?.objects.find(o=>o.kind===kind&&o.google_id===step.google_id);
    if(!row)throw Error('Recorded step has no matching object ledger row.');
    const found=(await clients.drive.files.get({fileId:step.google_id,
      fields:'id,mimeType,trashed,parents,owners(emailAddress),appProperties',supportsAllDrives:false})).data;
    verifyOwnedTag(found,id,kind,identity,parent);
    googleId=step.google_id;
   }else if(!step.created){
    // Crash or overlapping retry: only exact tagged discovery is safe.
    googleId=await reconcileStep({id,kind,parent,identity,clients});
   }else{
    // The durable reservation is committed BEFORE the external create. Once
    // this call starts, all retries are reconciliation-only, even on timeout.
    const res=await clients.drive.files.create({
      requestBody:{name:'RTC '+id+' '+SLOT_NAME[kind],mimeType:KIND_MIME[kind],
       parents:parent?[parent]:undefined,appProperties:{rtc_run:id,rtc_kind:kind}},
      fields:'id,name,mimeType,parents,owners(emailAddress),appProperties,trashed',
      supportsAllDrives:false
    });
    googleId=res?.data?.id;
    if(typeof googleId!=='string'||!googleId)throw Error('Provider result omitted exact Google object ID.');
    await recordDevObject({runId:id,...identity,kind,googleId,parentId:parent});
    await markDevStepRecorded({runId:id,...identity,kind,googleId});
   }
   objects.push({kind,id:googleId,parentId:parent});
   if(kind==='folder')parent=googleId;
  }
 }catch(e){
  throw Error('Fixture run '+id+' is incomplete or uncertain. Never retry as a new run to recover. '+String(e?.message||'Provider error').slice(0,170));
 }
 return {runId:id,objects,scenario:request.scenario,actingAs:identity.actingAs};
}

async function readTagged(args,clients,details) {
  const identity=owner(clients);
  if(args?.scenario==='calendar')return calendarReadback(clients,identity,details?.runId);
  if(args?.scenario==='gmail')return gmailReadback(clients,identity,details?.runId);
  requireDriveArea(clients);
  const run=await getDevRun({runId:details?.runId,...identity});
  if(!run)return {verified:false};
  const objects=[];
  for(const obj of run.objects) {
    try {
      const res=await clients.drive.files.get({fileId:obj.google_id,fields:'id,mimeType,trashed,appProperties,parents',supportsAllDrives:false});
      objects.push({kind:obj.kind,id:obj.google_id,verified:res?.data?.id===obj.google_id&&res.data.trashed!==true&&res.data.appProperties?.rtc_run===run.id});
    } catch {objects.push({kind:obj.kind,id:obj.google_id,verified:false});}
  }
  return {runId:run.id,objects,verified:objects.length===3&&objects.every(x=>x.verified)&&
    run.steps?.length===3&&run.steps.every(s=>s.state==='recorded')};
}
const built=defineWrite({
  name:'workspace_dev_create_fixtures',
  description:'Create three tagged example Drive items for a development run, recorded by exact ID. Never shares anything.',
  inputSchema:{type:'object',properties:{
    scenario:{type:'string',enum:['files','calendar','gmail']},
    folder:{type:'string',description:'Optional existing folder owned by the acting mailbox.'},
    runId:{type:'string',description:'Stable UUID: reuse exactly this ID after an uncertain provider result; NEVER create a new run for recovery.'},
    calendarId:{type:'string',description:'For calendar scenario: a separately owned TEST calendar, never primary.'},
    startAt:{type:'string',description:'Optional future ISO event start time, with timezone.'}
  },required:['scenario']},
  plan:async(args,clients)=>{
    validateFixtureRequest(args);owner(clients);
    if(args.scenario==='gmail'){
      const need=['gmail_list_labels','gmail_create_label','gmail_get_label','gmail_list_messages','gmail_get_message','gmail_trash_message','gmail_delete_label'];
      if(need.some(name=>!allowedTool(name,clients.rtcPolicy)))throw Error('Gmail area is not authorized for all fixture operations.');
      return {summary:'Insert two self-addressed mailbox-local messages (never send) under a unique RTC label; recover by exact ID only. Run ID '+(args.runId||'will be generated'),target:clients.actingAs};
    }
    if(args.scenario==='calendar'){
      if(!allowedTool('calendar_get_event',clients.rtcPolicy)||!allowedTool('calendar_create_event',clients.rtcPolicy))throw Error('Calendar area not permitted.');
      await requireTestCalendar(clients,args.calendarId,owner(clients));
      return {summary:'Create one tagged non-production event on an owned TEST calendar without invitees; run ID '+(args.runId||'will be generated'),target:args.calendarId};
    }
    requireDriveArea(clients);await checkParent(clients,args.folder);
    return {summary:'Create or reconcile exactly one set of tagged test files without duplicating uncertain provider writes; runId '+(args.runId||'will be generated')+'. Create a tagged sample folder, Doc and Sheet under the acting mailbox, with each ID recorded for precise cleanup.',target:args.folder||clients.actingAs};
  },
  apply:async(args,clients)=>ok(args.scenario==='calendar'?await createCalendarFixture(args,clients,owner(clients)):args.scenario==='gmail'?await createGmailFixtures(args,clients,owner(clients)):await createTaggedDriveFixtures(args,clients)),
  readAfter:readTagged,
  verify:(_args,_before,after)=>after?.verified===true
});

const cleanOrder={sheet:0,doc:1,folder:2};
function assertFixtureIdentity(run,obj,data,identity) {
 if(!data||data.id!==obj.google_id||data.mimeType!==KIND_MIME[obj.kind]||
   data.appProperties?.rtc_run!==run.id||
   !Array.isArray(data.owners)||!data.owners.some(o=>String(o.emailAddress).toLowerCase()===identity.actingAs))
   throw Error('Fixture identity or ownership changed; refused to trash '+obj.kind+' '+obj.google_id+'.');
}
async function loadRun(args,clients) {
 const identity=owner(clients);
 if(typeof args.runId!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,38}$/.test(args.runId))throw Error('Provide a valid recorded fixture run ID.');
 const run=await getDevRun({runId:args.runId,...identity});
 if(!run)throw Error('Fixture run does not exist for this account and connection.');
 if(!['files','calendar','gmail'].includes(run.scenario))throw Error('Unknown fixture scenario; refusing cleanup.');
 if(!Array.isArray(run.objects)||run.objects.length===0)throw Error('No recorded objects; refusing cleanup.');
 if(run.scenario==='files'&&run.objects.some(o=>!Object.hasOwn(KIND_MIME,o.kind)))throw Error('Unknown fixture kind; refusing cleanup.');
 if(!run.steps?.length||run.steps.some(s=>s.state!=='recorded'))
   throw Error('Missing or uncertain fixture reservations; reconcile every provider ID before cleanup.');
 return {run,identity};
}
async function inspectCleanup(args,clients) {
 const {run,identity}=await loadRun(args,clients);
 if(run.scenario==='gmail'){
    const need=['gmail_get_message','gmail_trash_message','gmail_get_label','gmail_delete_label'];
    if(need.some(name=>!allowedTool(name,clients.rtcPolicy)))throw Error('Gmail area is not authorized for cleanup.');
    return inspectGmailCleanup(run,clients,identity);
 }
 if(run.scenario==='calendar'){
    if(!allowedTool('calendar_get_event',clients.rtcPolicy)||!allowedTool('calendar_delete_event',clients.rtcPolicy))throw Error('Calendar area not permitted.');
    return inspectCalendarCleanup(run,clients,identity);
 }
 requireDriveArea(clients);
 const objects=[...run.objects].sort((a,b)=>cleanOrder[a.kind]-cleanOrder[b.kind]);
 const proof=[];
 for(const obj of objects) {
   const res=await clients.drive.files.get({fileId:obj.google_id,
     fields:'id,mimeType,trashed,owners(emailAddress),appProperties',supportsAllDrives:false});
   assertFixtureIdentity(run,obj,res?.data,identity);
   proof.push({kind:obj.kind,id:obj.google_id,trashed:res.data.trashed===true,recordedCleaned:!!obj.cleaned_at});
 }
 return {run,identity,objects,proof};
}
export async function trashRecordedFixtures(args,clients) {
 const inspected=await inspectCleanup(args,clients);
 if(inspected.run.scenario==='calendar')return deleteRecordedCalendarFixture(inspected.run,clients,inspected.identity);
 if(inspected.run.scenario==='gmail')return trashGmailFixtures(inspected.run,clients,inspected.identity);
 const {run,identity,objects}=inspected;
 const completed=[],failures=[];
 for(const obj of objects) {
   try {
     const existing=await clients.drive.files.get({fileId:obj.google_id,
       fields:'id,mimeType,trashed,owners(emailAddress),appProperties',supportsAllDrives:false});
     assertFixtureIdentity(run,obj,existing?.data,identity);
     if(existing.data.trashed!==true) {
       await clients.drive.files.update({fileId:obj.google_id,
         requestBody:{trashed:true},fields:'id,trashed',supportsAllDrives:false});
     }
     const check=await clients.drive.files.get({fileId:obj.google_id,
       fields:'id,mimeType,trashed,owners(emailAddress),appProperties',supportsAllDrives:false});
     assertFixtureIdentity(run,obj,check?.data,identity);
     if(check.data.trashed!==true)throw Error('Google did not confirm trash state.');
     await markDevObjectCleaned({runId:run.id,...identity,kind:obj.kind,googleId:obj.google_id});
     completed.push({kind:obj.kind,id:obj.google_id,trashed:true});
   } catch {
     failures.push({kind:obj.kind,id:obj.google_id,reason:'Identity, provider write, read-back or ledger confirmation failed.'});
     break; // Never proceed to the parent folder if a child was not confirmed.
   }
 }
 return {runId:run.id,completed,failures,fullyCleaned:failures.length===0&&completed.length===objects.length};
}
const cleanupBuilt=defineWrite({
 name:'workspace_dev_cleanup',
 description:'Preview and, with owner confirmation, move only precisely recorded owned RTC test files to Drive trash.',
 destructive:true,
 inputSchema:{type:'object',properties:{runId:{type:'string',description:'Run ID from workspace_dev_create_fixtures.'}},required:['runId']},
 plan:async(args,clients)=>{
   const checked=await inspectCleanup(args,clients);
   return {target:checked.run.id,summary:checked.run.scenario==='calendar'?'Delete the one exactly recorded TEST calendar event after owner/tag verification (no guest notifications).':checked.run.scenario==='gmail'?'Trash exactly two recorded Gmail TEST messages and delete only the recorded RTC label.':'Trash exactly '+checked.proof.length+' recorded and verified RTC fixture files (no permanent deletion).',
     readBefore:async()=>({runId:checked.run.id,objects:checked.proof})};
 },
 apply:async(args,clients)=>ok(await trashRecordedFixtures(args,clients)),
 readAfter:async(args,clients)=>{
   const {run,identity}=await loadRun(args,clients);
   if(run.scenario==='calendar')return confirmCalendarGone(run,clients,identity);
   if(run.scenario==='gmail')return confirmGmailCleaned(run,clients,identity);
   const objects=run.objects;
   const checks=[];
   for(const obj of objects){
     try {
       const response=await clients.drive.files.get({fileId:obj.google_id,
         fields:'id,mimeType,trashed,owners(emailAddress),appProperties',supportsAllDrives:false});
       assertFixtureIdentity(run,obj,response?.data,identity);
       checks.push({id:obj.google_id,trashed:response.data.trashed===true,recordedCleaned:!!obj.cleaned_at});
     } catch {checks.push({id:obj.google_id,trashed:false,recordedCleaned:false});}
   }
   return {runId:run.id,checks,allTrashed:checks.length>0&&checks.every(o=>o.trashed&&o.recordedCleaned)};
 },
 verify:(_args,_before,after,details)=>after?.allTrashed===true&&details?.fullyCleaned===true
});

export const tools=[built.tool,cleanupBuilt.tool,{
  name:'workspace_dev_list_runs',
  description:'List this connection’s fixture run IDs and pending step counts for safe crash recovery; never searches by filename.',
  inputSchema:{type:'object',properties:{}}
}];
export const handlers={[built.tool.name]:built.handler,[cleanupBuilt.tool.name]:cleanupBuilt.handler,
  async workspace_dev_list_runs(_args,clients){
    const identity=owner(clients);
    return ok({runs:await listDevRuns(identity)});
  }
};
