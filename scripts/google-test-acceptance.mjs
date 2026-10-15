// Opt-in owner-authorized DIRECT Google fixture acceptance. Never runs in CI
// with real credentials. Secrets only come from protected environment variables.
import crypto from 'node:crypto';
import {open,rename,unlink} from 'node:fs/promises';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRtcOrigin} from './rtc-live-probe.mjs';
const PASS=/^rtc_pass_[A-Za-z0-9_-]{43}$/;
const APPROVED_MAILBOX='ops@robinsonappliancerentals.com'; // Real pre-business mailbox; NOT a dedicated isolated TEST account.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SCENARIOS=['files','calendar','gmail'];
const COUNTS={files:3,calendar:1,gmail:3};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_@.:-]{1,256}$/.test(value)&&!value.includes('rtc_pass_');
const verified=v=>v?.done===true&&v.confirmed===true&&(v.logged===true||Number.isSafeInteger(v.logged?.id)&&v.logged.id>0)&&v.auditFailure!==true;
function objectIds(value){
 if(!Array.isArray(value)||value.some(o=>!id(o.id)))throw Error('invalid_resource_ids');
 const ids=value.map(o=>o.id).sort();
 if(new Set(ids).size!==ids.length)throw Error('duplicate_resource_ids');
 return ids;
}
export async function runGoogleAcceptance({origin,account,expectedRevision,writePass,readPass,calendarId,
 runIds={},cleanupOnly=false,fetchImpl=globalThis.fetch,checkpoint=async()=>{}}){
 origin=validateRtcOrigin(origin);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account||'')||account!==APPROVED_MAILBOX||
  !/^[a-f0-9]{40}$/.test(expectedRevision||'')||!PASS.test(writePass||'')||(!cleanupOnly&&!PASS.test(readPass||''))||
  (readPass&&!PASS.test(readPass))||writePass===readPass||
  (!cleanupOnly&&(!id(calendarId)||calendarId==='primary'||calendarId===account)))throw Error('invalid_protected_configuration');
 if(Object.keys(runIds).some(k=>!SCENARIOS.includes(k))||Object.values(runIds).some(v=>!UUID.test(v)))throw Error('invalid_run_ids');
 if(new Set(Object.values(runIds)).size!==Object.values(runIds).length)throw Error('duplicate_run_ids');
 if(cleanupOnly&&!Object.keys(runIds).length)throw Error('cleanup_requires_recorded_run_ids');
 const report={version:1,origin,account,expectedRevision,startedAt:new Date().toISOString(),
  transport:fetchImpl===globalThis.fetch?'real_https':'injected_test_transport',status:'in_progress',
  scope:'owner_approved_tagged_prebusiness_mailbox_only',hubRelay:'unverified',sandbox:'NOT_DEDICATED_TEST',
  independentDeploymentEvidence:'unverified_by_this_runner',
  runs:SCENARIOS.filter(s=>!cleanupOnly||runIds[s]).map(s=>({scenario:s,runId:runIds[s]||crypto.randomUUID(),status:'planned',ids:[]}))};
 let phase='checkpoint',writeIdentity,readIdentity,preflightReady=false;
 const save=()=>checkpoint(JSON.parse(JSON.stringify(report)));
 async function request(path,token,{method='GET',body}={}){
  const response=await fetchImpl(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),
   headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  let value;try{value=await response.json()}catch{throw Error('invalid_json');}
  return {status:response.status,value};
 }
 async function call(tool,args,token=writePass){
  const r=await request('/api/tools/'+tool,token,{method:'POST',body:args});
  if(r.status!==200||r.value.ok!==true)throw Error('tool_refused_or_failed');
  return r.value.result;
 }
 try{
  await save();phase='deployed_revision';
  const contract=await request('/api/contract');
  if(contract.status!==200||contract.value.rtc!==1||contract.value.devTools!==true||
   contract.value.deployment?.sourceRevision!==expectedRevision)throw Error('wrong_deployed_revision');
  phase='trusted_test_identities';
  for(const [token,write] of (cleanupOnly?[[writePass,true]]:[[writePass,true],[readPass,false]])){
   const r=await request('/api/whoami',token),who=r.value.result;
   if(r.status!==200||r.value.ok!==true||who?.account!==account||who.mode!=='test'||who.allow_writes!==write||
    who.profile!==(write?'full':'read_only')||!/^pass_[a-f0-9]{20}$/.test(who.connection||'')||
    !Array.isArray(who.areas)||(write?!['workspace','files','calendar','mail'].every(a=>who.areas.includes(a)):
      who.areas.length!==1||who.areas[0]!=='mail'))throw Error('invalid_test_identity_or_areas');
   if(write)writeIdentity=who;else readIdentity=who;
  }
  // Confirm actual Google identity, not just a server-owned token claim.
  phase='google_mailbox_identity';
  const identity=await call('workspace_whoami',{});
  if(identity.matches!==true||identity.gmailReports!==account)throw Error('wrong_google_identity');
  if(!cleanupOnly){
  phase='read_only_and_area_denials';
  const denied=await request('/api/tools/workspace_dev_create_fixtures',readPass,{method:'POST',body:{scenario:'files',dryRun:true}});
  const area=await request('/api/tools/workspace_calendar_list_calendars',readPass,{method:'POST',body:{}});
  if(denied.status!==403||denied.value.error?.code!=='refused_by_guard'||area.status!==403||area.value.error?.code!=='outside_scope')throw Error('missing_permission_denial');
  report.denials={readOnly:true,area:true};await save();}
  if(!cleanupOnly){
   phase='calendar_preservation_baseline';
   const baseline=await call('workspace_calendar_dev_snapshot',{calendarId});
   if(baseline?.calendarId!==calendarId||baseline.owned!==true||baseline.primary!==false||baseline.complete!==true||
    !['metadataDigest','aclDigest','eventsDigest'].every(key=>/^[a-f0-9]{64}$/.test(baseline[key]||'')))throw Error('invalid_calendar_baseline');
   report.calendarBaseline=baseline;await save();
   // Validate every scenario (including ownership) before creating any files.
   phase='fixture_prerequisites';
   for(const run of report.runs){
    const preview=await call('workspace_dev_create_fixtures',{scenario:run.scenario,runId:run.runId,
     ...(run.scenario==='calendar'?{calendarId}:{}),dryRun:true});
    if(preview.done!==false||preview.dryRun!==true)throw Error('invalid_preview');
   }
  }
  preflightReady=true;
  if(!cleanupOnly)for(const run of report.runs){
   phase='fixture_'+run.scenario;
   const args={scenario:run.scenario,runId:run.runId,...(run.scenario==='calendar'?{calendarId}:{})};
   const preview=await call('workspace_dev_create_fixtures',{...args,dryRun:true});
   if(preview.done!==false||preview.dryRun!==true)throw Error('invalid_preview');
   // Save the deterministic run ID BEFORE the first provider mutation.
   run.status='creation_pending';await save();
   const created=await call('workspace_dev_create_fixtures',args);
   if(!verified(created)||created.details?.runId!==run.runId||created.details?.actingAs!==account)throw Error('unverified_fixture_creation');
   run.ids=objectIds(created.details.objects);
   if(run.ids.length!==COUNTS[run.scenario])throw Error('incomplete_fixture_ids');
   run.status='created';await save();
   // Replay exact run ID: never retry with a new ID after an uncertain write.
   const replay=await call('workspace_dev_create_fixtures',args);
   if(!verified(replay)||replay.details?.runId!==run.runId||JSON.stringify(objectIds(replay.details.objects))!==JSON.stringify(run.ids))throw Error('unsafe_fixture_replay');
   run.replayVerified=true;await save();
  }
 }catch{
  report.status='failed';report.failedPhase=phase;
 }
 // Attempt authorized cleanup of every initiated run even if a later scenario
 // failed. The server's durable ledger/tag guards are never bypassed.
 for(const run of report.runs.filter(r=>preflightReady&&(cleanupOnly||r.status!=='planned'))){
  try{
   phase='cleanup_'+run.scenario;
   const preview=await call('workspace_dev_cleanup',{runId:run.runId,dryRun:true});
   if(preview.done!==false||preview.dryRun!==true)throw Error('invalid_cleanup_preview');
   const proof=objectIds(preview.before?.objects);
   if(run.ids.length&&JSON.stringify(proof)!==JSON.stringify(run.ids))throw Error('cleanup_id_mismatch');
   if(!run.ids.length)run.ids=proof;
   run.status='cleanup_pending';await save();
   const cleaned=await call('workspace_dev_cleanup',{runId:run.runId,confirm:true});
   if(!verified(cleaned)||cleaned.details?.fullyCleaned!==true||cleaned.after?.allTrashed!==true)throw Error('cleanup_unverified');
   run.status='cleaned';await save();
  }catch{run.status='needs_reconciliation';report.status='failed';report.failedPhase||=phase;}
 }
 const complete=report.runs.every(r=>r.status==='cleaned');
 if(complete&&!cleanupOnly){
  try{
   phase='calendar_preservation_readback';
   const after=await call('workspace_calendar_dev_snapshot',{calendarId});
   if(JSON.stringify(after)!==JSON.stringify(report.calendarBaseline))throw Error('calendar_changed');
   report.calendarPreservationVerified=true;
  }catch{report.status='failed';report.failedPhase||=phase;}
 }
 if(complete&&report.status!=='failed'&&writeIdentity&&(cleanupOnly||readIdentity)){
  try{
   phase='pass_revocation';
   for(const [identity,token] of (cleanupOnly?[[writeIdentity,writePass]]:[[readIdentity,readPass],[writeIdentity,writePass]])){
    const revoked=await call('workspace_revoke_connection',{tokenPrefix:identity.connection,confirm:true});
    if(!verified(revoked))throw Error('revocation_unverified');
    const denied=await request('/api/whoami',token);
    if(denied.status!==401||denied.value.error?.code!=='pass_revoked')throw Error('revoked_pass_not_denied');
   }
   report.revocationVerified=true;report.status='passed';
  }catch{report.status='failed';report.failedPhase=phase;}
 }else if(report.status==='in_progress')report.status='failed';
 report.finishedAt=new Date().toISOString();await save();return report;
}

// A crash must never truncate the only recorded provider IDs.
// Durable private temp + fsync + atomic rename; caller reserves final path.
export async function writePrivateCheckpoint(path,report){
 const data=JSON.stringify(report,null,2)+'\n';
 if(/rtc_pass_[A-Za-z0-9_-]{43}/.test(data))throw Error('secret_in_report');
 const parent=dirname(path),temp=join(parent,'.'+basename(path)+'.'+crypto.randomUUID()+'.tmp');
 let pending,dir;
 try{
  pending=await open(temp,'wx',0o600);
  await pending.writeFile(data);await pending.sync();await pending.close();pending=null;
  await rename(temp,path);
  dir=await open(parent,'r');await dir.sync();
 }catch(e){await unlink(temp).catch(()=>{});throw e;}
 finally{await pending?.close();await dir?.close();}
}

export async function main(args=process.argv.slice(2),env=process.env){
 if(args.length!==1||!['--owner-authorized-fixtures','--owner-authorized-cleanup'].includes(args[0])){
  console.error('Choose owner-authorized fixtures or exact-run cleanup; secrets belong in protected env.');return 2;
 }
 try{
  if(!env.RTC_ACCEPTANCE_REPORT)throw Error('report_required');
  const reserved=await open(env.RTC_ACCEPTANCE_REPORT,'wx',0o600);await reserved.close();
  const report=await runGoogleAcceptance({origin:env.RTC_ORIGIN,account:env.RTC_TEST_ACCOUNT,
   expectedRevision:env.RTC_EXPECTED_REVISION,writePass:env.RTC_WRITE_PASS,readPass:env.RTC_READ_ONLY_PASS,
   calendarId:env.RTC_TEST_CALENDAR_ID,runIds:JSON.parse(env.RTC_RUN_IDS_JSON||'{}'),
   cleanupOnly:args[0]==='--owner-authorized-cleanup',
   checkpoint:result=>writePrivateCheckpoint(env.RTC_ACCEPTANCE_REPORT,result)});
  console.log(report.status==='passed'?'PASS direct approved-mailbox tagged fixtures, precise cleanup and exercised pass revocation; Hub and independent deployment proof remain unverified.':
   'FAIL approved-mailbox fixture acceptance; inspect the private checkpoint and reconcile exact run IDs.');
  return report.status==='passed'?0:1;
 }catch{console.error('Acceptance did not complete. Inspect any private checkpoint, preserve run IDs, and verify protected configuration; no secret printed.');return 2;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])process.exitCode=await main();
