// P8-7: tagged scratch fixtures. No external shares or outgoing messages.
import crypto from 'node:crypto';
import { defineWrite } from './write.js';
import { ok } from './util.js';
import { startDevRun, recordDevObject, getDevRun } from '../db.js';

const FOLDER='application/vnd.google-apps.folder';
const DOC='application/vnd.google-apps.document';
const SHEET='application/vnd.google-apps.spreadsheet';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function owner(clients) {
  if(!EMAIL.test(clients?.actingAs||'')||!clients?.connection)throw Error('Fixture changes need an authenticated connection and acting mailbox.');
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
export const tools=[built.tool];
export const handlers={[built.tool.name]:built.handler};
