// P8-7: recover using the caller's immutable ledger, never guessed provider IDs.
import { getDevRun } from '../db.js';
import { ok } from './util.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS={files:['folder','doc','sheet'],calendar:['event'],gmail:['label','message1','message2']};
export function fixtureIdentity(clients){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clients?.actingAs||'')||!clients?.connection)
  throw Error('Fixture access needs an authenticated connection and acting mailbox.');
 if(clients?.rtcPolicy?.mode!=='test')throw Error('outside_scope: Fixture access requires a trusted non-production TEST connection.');
 return {actingAs:clients.actingAs.toLowerCase(),connection:clients.connection};
}
export function fixtureIntent(args){
 if(!Object.hasOwn(KINDS,args.scenario))throw Error('Unknown fixture scenario.');
 return {version:1,scenario:args.scenario,...(args.scenario==='files'?{folder:args.folder||null}:{}),
  ...(args.scenario==='calendar'?{calendarId:args.calendarId,startAt:args.startAt?new Date(args.startAt).toISOString():null}:{})};
}
export function describeFixtureRun(run){
 const kinds=KINDS[run?.scenario];
 if(!kinds||!UUID.test(run?.id)||!Array.isArray(run.objects)||!Array.isArray(run.steps))
  throw Error('Fixture ledger is malformed; provider changes are refused.');
 const objects=new Map(),steps=new Map(),ids=new Set();
 for(const row of run.objects){
  if(!kinds.includes(row.kind)||objects.has(row.kind)||typeof row.google_id!=='string'||!row.google_id||ids.has(row.google_id))
   throw Error('Fixture ledger has conflicting object identities.');
  objects.set(row.kind,row);ids.add(row.google_id);
 }
 for(const row of run.steps){
  if(!kinds.includes(row.kind)||steps.has(row.kind)||!['pending','recorded'].includes(row.state)||
     row.state==='recorded'&&(!objects.has(row.kind)||objects.get(row.kind).google_id!==row.google_id)||
     row.state==='pending'&&row.google_id)
   throw Error('Fixture reservations and recorded object identities disagree.');
  steps.set(row.kind,row);
 }
 const legacy=run.request_spec==null;
 const slots=kinds.map(kind=>{
  const step=steps.get(kind),object=objects.get(kind);
  if(object&&!step&&!legacy)throw Error('Fixture object has no durable reservation.');
  const expectedParent=run.scenario==='files'?(kind==='folder'?run.root_folder:objects.get('folder')?.google_id):
   run.scenario==='calendar'?run.calendar_id:kind==='label'?null:objects.get('label')?.google_id;
  if(object&&object.parent_id!==(expectedParent||null))throw Error('Fixture ledger parent relationship disagrees.');
  return {kind,state:object?.cleaned_at?'cleaned':step?.state||'not_reserved',
   ...(object?{id:object.google_id,parentId:object.parent_id}:{}),
   providerVerified:false};
 });
 const clean=slots.filter(s=>s.state==='cleaned').length;
 const unresolved=slots.some(s=>!['recorded','cleaned'].includes(s.state));
 const state=legacy?'legacy_needs_review':clean===kinds.length?'cleaned':clean?'partially_cleaned':unresolved?'needs_reconciliation':'recorded';
 return {runId:run.id,scenario:run.scenario,state,request:run.request_spec||null,slots,
  providerVerified:false,recovery:{
   mayReplayCreation:!legacy&&!clean,
   action:legacy?'Obtain an exact-ID owner-reviewed recovery plan; do not recreate.':clean===kinds.length?
    'Already cleaned in the ledger; verify provider state if needed, never recreate this run.':clean?
    'Preview cleanup with this SAME runId; inspect exact IDs and confirm only remaining owned objects.':
    'Retry creation with this SAME runId and original request; pending slots reconcile by provider tags without blind creation.',
   note:'Ledger state is not a current Google readback. Cleanup always rechecks exact provider ownership, tags and containment.'
  }};
}
export const tool={name:'workspace_dev_get_run',
 description:'Inspect this TEST connection’s exact fixture run, immutable request, reservations and cleanup state for safe recovery. Ledger evidence is not provider verification.',
 inputSchema:{type:'object',properties:{runId:{type:'string',pattern:UUID.source}},required:['runId']}};
export async function inspectFixtureRun(args,clients){
 const identity=fixtureIdentity(clients);
 if(!UUID.test(args?.runId))throw Error('invalid_args: runId must be a UUID.');
 const run=await getDevRun({runId:args.runId,...identity});
 if(!run)throw Error('not_found: No fixture run is accessible to this connection.');
 return ok(describeFixtureRun(run));
}
