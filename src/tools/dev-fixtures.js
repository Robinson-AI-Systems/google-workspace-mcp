// P8-7: tagged scratch fixtures. No external shares or outgoing messages.
import crypto from 'node:crypto';
import { defineWrite } from './write.js';
import { ok } from './util.js';
import { allowedTool } from '../rtc/catalog.js';
import { startDevRun, recordDevObject, getDevRun, markDevObjectCleaned } from '../db.js';

const FOLDER='application/vnd.google-apps.folder';
const DOC='application/vnd.google-apps.document';
const SHEET='application/vnd.google-apps.spreadsheet';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function requireDriveArea(clients) {
 const policy=clients?.rtcPolicy||{};
 if(!allowedTool('drive_get_file',policy)||!allowedTool('drive_create_folder',policy))
   throw Error('outside_scope: This connection cannot create or inspect Drive fixtures.');
}
function owner(clients) {
  if(!EMAIL.test(clients?.actingAs||'')||!clients?.connection)throw Error('Fixture changes need an authenticated connection and acting mailbox.');
  requireDriveArea(clients);
  return {actingAs:clients.actingAs.toLowerCase(),connection:clients.connection};
}
export function validateFixtureRequest(args={}) {
  if(args.scenario!=='files')throw Error('Only the files fixture scenario is implemented; choose files.');
  if(args.folder!==undefined&&(!/^[a-zA-Z0-9_-]{8,180}$/.test(args.folder)))throw Error('folder must be an existing Drive folder ID.');
  return {scenario:args.scenario,folder:args.folder||null};
}
async function checkParent(clients,folder) {
  if(!folder)return;
  const response=await clients.drive.files.get({fileId:folder,fields:'id,mimeType,trashed,owners(emailAddress)',supportsAllDrives:false});
  const data=response?.data;
  if(data?.mimeType!==FOLDER||data.trashed||!data.owners?.some(x=>String(x.emailAddress).toLowerCase()===clients.actingAs.toLowerCase()))
    throw Error('Fixture parent must be an owned, accessible, untrashed My Drive folder.');
}
export async function createTaggedDriveFixtures(args,clients) {
  const {scenario,folder}=validateFixtureRequest(args),id=crypto.randomUUID(),identity=owner(clients);
  await checkParent(clients,folder);
  await startDevRun({id,...identity,scenario});
  const objects=[];
  let parent=folder;
  try {
    for(const [kind,name,mimeType] of [
      ['folder','RTC '+id+' sample',FOLDER],
      ['doc','RTC '+id+' example doc',DOC],
      ['sheet','RTC '+id+' example sheet',SHEET]
    ]) {
      const res=await clients.drive.files.create({
        requestBody:{name,mimeType,parents:parent?[parent]:undefined,appProperties:{rtc_run:id}},
        fields:'id,name,mimeType,parents,appProperties,trashed',
        supportsAllDrives:false
      });
      const googleId=res?.data?.id;
      if(typeof googleId!=='string'||!googleId)throw Error('Google did not return a file ID.');
      await recordDevObject({runId:id,...identity,kind,googleId,parentId:parent});
      objects.push({kind,id:googleId,parentId:parent});
      if(kind==='folder')parent=googleId;
    }
  } catch(e) {
    throw Error('Fixture run '+id+' is incomplete; recorded IDs remain for recovery. '+String(e?.message||'Provider error').slice(0,140));
  }
  return {runId:id,objects,scenario,actingAs:identity.actingAs};
}
async function readTagged(_args,clients,details) {
  const identity=owner(clients);
  const run=await getDevRun({runId:details?.runId,...identity});
  if(!run)return {verified:false};
  const objects=[];
  for(const obj of run.objects) {
    try {
      const res=await clients.drive.files.get({fileId:obj.google_id,fields:'id,mimeType,trashed,appProperties,parents',supportsAllDrives:false});
      objects.push({kind:obj.kind,id:obj.google_id,verified:res?.data?.id===obj.google_id&&res.data.trashed!==true&&res.data.appProperties?.rtc_run===run.id});
    } catch {objects.push({kind:obj.kind,id:obj.google_id,verified:false});}
  }
  return {runId:run.id,objects,verified:objects.length===3&&objects.every(x=>x.verified)};
}
const built=defineWrite({
  name:'workspace_dev_create_fixtures',
  description:'Create three tagged example Drive items for a development run, recorded by exact ID. Never shares anything.',
  inputSchema:{type:'object',properties:{
    scenario:{type:'string',enum:['files']},
    folder:{type:'string',description:'Optional existing folder owned by the acting mailbox.'}
  },required:['scenario']},
  plan:async(args,clients)=>{
    validateFixtureRequest(args);owner(clients);await checkParent(clients,args.folder);
    return {summary:'Create a tagged sample folder, Doc and Sheet under the acting mailbox, with each ID recorded for precise cleanup.',target:args.folder||clients.actingAs};
  },
  apply:async(args,clients)=>ok(await createTaggedDriveFixtures(args,clients)),
  readAfter:readTagged,
  verify:(_args,_before,after)=>after?.verified===true
});

const KIND_MIME={folder:FOLDER,doc:DOC,sheet:SHEET};
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
 if(run.scenario!=='files')throw Error('Only Drive file fixture cleanup is implemented.');
 if(!Array.isArray(run.objects)||run.objects.length===0)throw Error('No recorded objects; refusing cleanup.');
 if(run.objects.some(o=>!Object.hasOwn(KIND_MIME,o.kind)))throw Error('Unknown fixture kind; refusing cleanup.');
 return {run,identity};
}
async function inspectCleanup(args,clients) {
 const {run,identity}=await loadRun(args,clients);
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
 const {run,identity,objects}=await inspectCleanup(args,clients);
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
   return {target:checked.run.id,summary:'Trash exactly '+checked.proof.length+' recorded and verified RTC fixture files (no permanent deletion).',
     readBefore:async()=>({runId:checked.run.id,objects:checked.proof})};
 },
 apply:async(args,clients)=>ok(await trashRecordedFixtures(args,clients)),
 readAfter:async(args,clients)=>{
   const {run,identity}=await loadRun(args,clients);
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

export const tools=[built.tool,cleanupBuilt.tool];
export const handlers={[built.tool.name]:built.handler,[cleanupBuilt.tool.name]:cleanupBuilt.handler};
