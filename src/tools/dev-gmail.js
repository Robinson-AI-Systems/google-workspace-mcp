// TEST-only self-mailbox fixtures. Insert directly into Gmail; never send mail.
import crypto from 'node:crypto';
import {startDevRun,reserveDevStep,recordDevObject,markDevStepRecorded,getDevRun,markDevObjectCleaned} from '../db.js';
import {isNotFound} from './write.js';
const kinds=['label','message1','message2'];
const name=id=>'rtc-'+id;
const subj=(id,k)=>'RTC '+id+' '+k+' integration fixture';
const headers=(m,k)=>(m?.payload?.headers||[]).find(x=>String(x.name).toLowerCase()===k.toLowerCase())?.value;
const readMsg=(c,id)=>c.gmail.users.messages.get({userId:'me',id,format:'metadata',metadataHeaders:['Subject','From','To','X-RTC-Run','X-RTC-Kind']}).then(r=>r.data);
const readLabel=(c,id)=>c.gmail.users.labels.get({userId:'me',id}).then(r=>r.data);
function checkMessage(m,run,kind,owner,label,{cleanup=false}={}){
 if(!m||!m.id||headers(m,'Subject')!==subj(run,kind)||headers(m,'X-RTC-Run')!==run||
  headers(m,'X-RTC-Kind')!==kind||String(headers(m,'From')).toLowerCase()!==owner.actingAs||
  String(headers(m,'To')).toLowerCase()!==owner.actingAs||!Array.isArray(m.labelIds)||
  (!cleanup&&!m.labelIds.includes(label)))throw Error('Gmail message ID, run headers, ownership or label mismatch.');
 return m.id;
}
function checkLabel(l,id,expected){
 if(!l||l.id!==expected||l.name!==name(id)||l.type!=='user')throw Error('Gmail run label ID or name mismatch.');
 return l.id;
}
function raw(id,kind,email){
 return Buffer.from(['From: '+email,'To: '+email,'Subject: '+subj(id,kind),
  'X-RTC-Run: '+id,'X-RTC-Kind: '+kind,'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8','','Mailbox-local test message for '+id].join('\r\n'),'utf8').toString('base64url');
}
async function recoverLabel(c,id){
 const all=(await c.gmail.users.labels.list({userId:'me'})).data?.labels||[];
 const matches=all.filter(l=>l.type==='user'&&l.name===name(id));
 if(matches.length!==1)throw Error('Uncertain label has '+matches.length+' exact run matches; cannot recreate.');
 return matches[0].id;
}
async function recoverMessage(c,id,kind,owner,label){
 const page=(await c.gmail.users.messages.list({userId:'me',labelIds:[label],maxResults:100})).data;
 if(page?.nextPageToken)throw Error('Incomplete Gmail label search; refuse replay.');
 const found=[];
 for(const item of page?.messages||[]){
  const m=await readMsg(c,item.id);
  try{checkMessage(m,id,kind,owner,label);found.push(m.id);}catch{}
 }
 if(found.length!==1)throw Error('Uncertain '+kind+' has '+found.length+' exact run matches; cannot recreate.');
 return found[0];
}
export async function createGmailFixtures(args,c,owner){
 if(args.folder!==undefined||args.calendarId!==undefined||args.startAt!==undefined)throw Error('Gmail fixtures cannot target folders or calendars.');
 const id=args.runId||crypto.randomUUID();
 await startDevRun({id,...owner,scenario:'gmail'});
 const run=await getDevRun({runId:id,...owner});
 if(run.objects.length&&!run.steps.length)throw Error('Legacy Gmail run has no durable reservations.');
 let label=null;const objects=[];
 try{
  for(const kind of kinds){
   const step=await reserveDevStep({runId:id,...owner,kind});
   let googleId;
   if(step.state==='recorded'){
    const row=(await getDevRun({runId:id,...owner})).objects.find(x=>x.kind===kind&&x.google_id===step.google_id);
    if(!row||row.parent_id!==(kind==='label'?null:label))throw Error('Recorded Gmail ID has wrong immutable parent.');
    if(kind==='label')checkLabel(await readLabel(c,row.google_id),id,row.google_id);
    else checkMessage(await readMsg(c,row.google_id),id,kind,owner,label);
    googleId=row.google_id;
   }else if(!step.created){
    googleId=kind==='label'?await recoverLabel(c,id):await recoverMessage(c,id,kind,owner,label);
    await recordDevObject({runId:id,...owner,kind,googleId,parentId:kind==='label'?null:label});
    await markDevStepRecorded({runId:id,...owner,kind,googleId});
   }else{
    if(kind==='label'){
     googleId=(await c.gmail.users.labels.create({userId:'me',requestBody:{
      name:name(id),labelListVisibility:'labelHide',messageListVisibility:'hide'
     }})).data?.id;
    }else{
     googleId=(await c.gmail.users.messages.insert({userId:'me',requestBody:{
      raw:raw(id,kind,owner.actingAs),labelIds:[label]
     }})).data?.id;
    }
    if(!googleId)throw Error('Provider did not return the created Gmail ID.');
    await recordDevObject({runId:id,...owner,kind,googleId,parentId:kind==='label'?null:label});
    await markDevStepRecorded({runId:id,...owner,kind,googleId});
   }
   objects.push({kind,id:googleId,parentId:kind==='label'?null:label});
   if(kind==='label')label=googleId;
  }
 }catch(e){throw Error('Gmail run '+id+' is uncertain; retry SAME runId to reconcile: '+String(e.message||e).slice(0,140));}
 return {runId:id,scenario:'gmail',actingAs:owner.actingAs,objects};
}
async function inspect(run,c,owner,cleanup=false){
 if(run?.scenario!=='gmail'||run.steps?.length!==3||run.objects?.length!==3||
    run.steps.some(s=>s.state!=='recorded'||!s.google_id))throw Error('Gmail fixture has unresolved reservations.');
 const by=Object.fromEntries(run.objects.map(o=>[o.kind,o]));
 for(const kind of kinds){
  if(!by[kind]||!run.steps.some(s=>s.kind===kind&&s.google_id===by[kind].google_id))
   throw Error('Gmail object ledger does not match reserved ID.');
 }
 const label=by.label; if(label.parent_id!==null)throw Error('Incorrect Gmail label parent.');
 let labelGone=false;
 try{checkLabel(await readLabel(c,label.google_id),run.id,label.google_id);}
 catch(e){if(!cleanup||!isNotFound(e))throw e;labelGone=true;}
 const messages=[];
 for(const kind of ['message1','message2']){
  const row=by[kind];
  if(row.parent_id!==label.google_id)throw Error('Incorrect Gmail message parent.');
  const m=await readMsg(c,row.google_id);
  checkMessage(m,run.id,kind,owner,label.google_id,{cleanup});
  if(!cleanup&&!m.labelIds.includes(label.google_id))throw Error('Gmail run label was removed from fixture.');
  messages.push({kind,id:row.google_id,trashed:m.labelIds.includes('TRASH'),cleaned:!!row.cleaned_at});
 }
 if(labelGone&&messages.some(m=>!m.trashed))throw Error('Gmail label removed before messages were safely trashed.');
 return {run,identity:owner,messages,label:{id:label.google_id,kind:'label',missing:labelGone,cleaned:!!label.cleaned_at}};
}
export async function gmailReadback(c,owner,id){
 try{
  const run=await getDevRun({runId:id,...owner});
  const x=await inspect(run,c,owner);
  return {runId:id,verified:true,objects:[x.label,...x.messages].map(o=>({kind:o.kind,id:o.id,verified:true}))};
 }catch{return {runId:id,verified:false};}
}
export async function inspectGmailCleanup(run,c,owner){
 const x=await inspect(run,c,owner,true);
 return {...x,proof:[...x.messages,x.label]};
}
export async function trashGmailFixtures(run,c,owner){
 const x=await inspectGmailCleanup(run,c,owner),completed=[],failures=[];
 for(const m of x.messages){
  try{
   if(!m.trashed)await c.gmail.users.messages.trash({userId:'me',id:m.id});
   const data=await readMsg(c,m.id);
   checkMessage(data,run.id,m.kind,owner,x.label.id,{cleanup:true});
   if(!data.labelIds.includes('TRASH'))throw Error('Provider did not confirm trash.');
   await markDevObjectCleaned({runId:run.id,...owner,kind:m.kind,googleId:m.id});
   completed.push({kind:m.kind,id:m.id,trashed:true});
  }catch{failures.push({kind:m.kind,id:m.id,reason:'Gmail trash/ledger read-back not verified.'});break;}
 }
 if(!failures.length){
  try{
   if(!x.label.missing)await c.gmail.users.labels.delete({userId:'me',id:x.label.id});
   let gone=false;
   try{await readLabel(c,x.label.id);}catch(e){if(isNotFound(e))gone=true;else throw e;}
   if(!gone)throw Error('Label still exists.');
   await markDevObjectCleaned({runId:run.id,...owner,kind:'label',googleId:x.label.id});
   completed.push({kind:'label',id:x.label.id,deleted:true});
  }catch{failures.push({kind:'label',id:x.label.id,reason:'Gmail label/ledger read-back not verified.'});}
 }
 return {runId:run.id,completed,failures,fullyCleaned:!failures.length&&completed.length===3};
}
export async function confirmGmailCleaned(run,c,owner){
 const fresh=await getDevRun({runId:run.id,...owner});
 const by=Object.fromEntries((fresh?.objects||[]).map(x=>[x.kind,x]));
 if(kinds.some(k=>!by[k]))return {runId:run.id,allTrashed:false};
 let good=true;
 for(const kind of ['message1','message2']){
  try{
   const m=await readMsg(c,by[kind].google_id);
   checkMessage(m,run.id,kind,owner,by.label.google_id,{cleanup:true});
   good&&=m.labelIds.includes('TRASH')&&!!by[kind].cleaned_at;
  }catch{good=false;}
 }
 let gone=false;
 try{await readLabel(c,by.label.google_id);}catch(e){if(isNotFound(e))gone=true;}
 return {runId:run.id,allTrashed:good&&gone&&!!by.label.cleaned_at,labelGone:gone};
}
