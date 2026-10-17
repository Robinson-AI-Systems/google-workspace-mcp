// P7-5 scoped, confirmed undo with conflict checks. Never overwrite a newer edit.
import {isDeepStrictEqual} from 'node:util';
import {getOwnedChange} from '../db.js';
import {defineWrite} from './write.js';
import {allowedTool} from '../rtc/catalog.js';
import {outsideDomains} from './domain-guard.js';
import {UNDO_ADAPTERS} from './undo-adapters.js';

export async function prepareUndo(args,clients,lookup=getOwnedChange){
 if(!Number.isSafeInteger(args.changeId)||args.changeId<1)throw Error('Give a positive change-log entry ID.');
 if(!clients?.actingAs||!clients?.connection)throw Error('Undo requires an authenticated account and connection.');
 const entry=await (clients?.store?.getOwnedChange ?? lookup)(args.changeId,clients.actingAs,clients.connection);
 if(!entry||String(entry.acting_as).toLowerCase()!==clients.actingAs.toLowerCase()||entry.connection!==clients.connection)
   throw Error('Change not found for this account and connection.');
 if(entry.dry_run)throw Error('A preview made no change and cannot be undone.');
 if(/could not confirm|does not show|unreadable/i.test(entry.summary||''))throw Error('Reconcile this unverified change before undoing it.');
 const repeated=entry.tool==='workspace_undo_change';
 const kind=repeated?entry.before?.kind:Object.keys(UNDO_ADAPTERS).find(k=>UNDO_ADAPTERS[k].tools.includes(entry.tool));
 const adapter=UNDO_ADAPTERS[kind];
 if(!adapter)throw Error('This change cannot be safely undone from its saved log. Sent mail, permanent deletes, sign-outs and incomplete snapshots are not reversible.');
 const policy=clients.rtcPolicy||{};
 if(policy.profile==='read_only'||!allowedTool('workspace_undo_change',policy)||!adapter.tools.every(n=>allowedTool(n,policy)))
   throw Error('outside_scope: This connection cannot undo that kind of change.');
 const target=repeated?entry.before.target:adapter.target(entry);
 if(!adapter.validateTarget(target)||repeated&&(entry.after?.kind!==kind||entry.after?.target!==target))throw Error('Undo has no unambiguous saved target.');
 if(adapter.domains&&Array.isArray(clients.allowedDomains)&&outsideDomains(adapter.domains(target),clients.allowedDomains).length)
   throw Error('outside_scope: Undo target is outside the allowed business domains. Switch to the business connection; undo does not widen domains.');
 const before=adapter.state(repeated?entry.before.state:entry.before),after=adapter.state(repeated?entry.after.state:entry.after);
 if((before.id!==undefined&&before.id!==target)||(after.id!==undefined&&after.id!==target))throw Error('Saved provider IDs do not match the undo target.');
 if(adapter.validateTransition&&!adapter.validateTransition(before,after,target))throw Error('Saved change does not describe a single reversible operation.');
 const current=adapter.state(await adapter.read(clients,target));
 if(!isDeepStrictEqual(current,after))throw Error('The item has changed since this entry. Nothing was changed; review the current state instead of overwriting newer edits.');
 return {kind,target,before,after,adapter,current};
}
const prepared=new WeakMap();
const undo=defineWrite({
 name:'workspace_undo_change',destructive:true,
 description:'Restore a reversible change from this account and connection’s log. Refuses newer edits, incomplete snapshots and irreversible changes.',
 inputSchema:{type:'object',properties:{changeId:{type:'integer',minimum:1}},required:['changeId']},
 plan:async(args,c)=>{
  const p=await prepareUndo(args,c);prepared.set(args,p);
  return {target:p.target,summary:'Undo change '+args.changeId+' ('+p.kind+')',readBefore:async()=>({kind:p.kind,target:p.target,state:p.current})};
 },
 apply:async(args,c)=>{
  const p=await prepareUndo(args,c),old=prepared.get(args);
  if(!old||!isDeepStrictEqual(old.before,p.before)||!isDeepStrictEqual(old.after,p.after))throw Error('Saved change changed while undo was being prepared.');
  await p.adapter.write(c,p.target,p.before);
 },
 readAfter:async(args,c)=>{
  const p=prepared.get(args);
  return {kind:p.kind,target:p.target,state:p.adapter.state(await p.adapter.read(c,p.target))};
 },
 verify:(args,_before,after)=>isDeepStrictEqual(after?.state,prepared.get(args)?.before)
});
export const tools=[undo.tool];
export const handlers={workspace_undo_change:undo.handler};
