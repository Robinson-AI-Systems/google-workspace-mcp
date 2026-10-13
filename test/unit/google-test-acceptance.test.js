import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runGoogleAcceptance,writePrivateCheckpoint} from '../../scripts/google-test-acceptance.mjs';

const account='ops@robinsonappliancerentals.com';
const origin='https://google.example.test',revision='a'.repeat(40);
const writePass='rtc_pass_'+'W'.repeat(43),readPass='rtc_pass_'+'R'.repeat(43);
const calendarId='owned-test-calendar@group.calendar.google.com';
const names={files:['fixture-folder','fixture-doc','fixture-sheet'],calendar:['fixture-event'],gmail:['Label_fixture','fixture-msg1','fixture-msg2']};
const passInfo=new Map([
 [writePass,{connection:'pass_'+'a'.repeat(20),account,profile:'full',mode:'test',allow_writes:true,areas:['workspace','files','calendar','mail']}],
 [readPass,{connection:'pass_'+'b'.repeat(20),account,profile:'read_only',mode:'test',allow_writes:false,areas:['mail']}]
]);
const good=result=>({ok:true,result});
const response=(status,value)=>({status,json:async()=>value});
function harness({actualRevision=revision,createFailure=null,cleanupFailure=null,existing={},calendarFailure=false,calendarChanged=false}={}){
 const created=new Map(Object.entries(existing)),revoked=new Set(),calls=[];
 const fetchImpl=async(url,options={})=>{
  const path=new URL(url).pathname,method=options.method||'GET';
  const token=options.headers?.authorization?.slice('Bearer '.length);
  const args=options.body?JSON.parse(options.body):{};
  calls.push({path,method,scenario:args.scenario,runId:args.runId,dryRun:args.dryRun,tokenKind:token===writePass?'write':token===readPass?'read':'none'});
  if(path==='/api/contract')return response(200,{rtc:1,devTools:true,deployment:{sourceRevision:actualRevision}});
  if(path==='/api/whoami'){
   if(revoked.has(token))return response(401,{ok:false,error:{code:'pass_revoked'}});
   return response(200,good(passInfo.get(token)));
  }
  if(token!==writePass&&token!==readPass)return response(401,{ok:false,error:{code:'permission'}});
  const tool=decodeURIComponent(path.split('/').at(-1));
  if(token===readPass)return response(403,{ok:false,error:{code:tool==='workspace_calendar_list_calendars'?'outside_scope':'refused_by_guard'}});
  if(tool==='workspace_whoami')return response(200,good({matches:true,gmailReports:account}));
  if(tool==='workspace_calendar_dev_snapshot'){
   if(calendarFailure)return response(400,{ok:false});
   const changed=calendarChanged&&created.size>0;
   return response(200,good({calendarId,owned:true,primary:false,complete:true,eventCount:0,
    metadataDigest:'a'.repeat(64),aclDigest:'b'.repeat(64),eventsDigest:(changed?'d':'c').repeat(64)}));
  }
  if(tool==='workspace_dev_create_fixtures'){
   if(args.dryRun)return response(200,good({done:false,dryRun:true}));
   if(!created.has(args.runId))created.set(args.runId,{scenario:args.scenario,objects:names[args.scenario].map(id=>({id}))});
   if(args.scenario===createFailure)return response(503,{ok:false,error:{code:'provider_unknown'}});
   return response(200,good({done:true,confirmed:true,logged:true,details:{runId:args.runId,actingAs:account,objects:created.get(args.runId).objects}}));
  }
  if(tool==='workspace_dev_cleanup'){
   const run=created.get(args.runId);
   if(!run)return response(404,{ok:false,error:{code:'not_found'}});
   if(args.dryRun)return response(200,good({done:false,dryRun:true,before:{objects:run.objects}}));
   if(run.scenario===cleanupFailure)return response(503,{ok:false,error:{code:'unverified_cleanup'}});
   return response(200,good({done:true,confirmed:true,logged:true,details:{fullyCleaned:true},after:{allTrashed:true}}));
  }
  if(tool==='workspace_revoke_connection'){
   if(!args.confirm||!Array.from(passInfo.values()).some(x=>x.connection===args.tokenPrefix))throw Error('Wrong revocation target');
   for(const [t,x] of passInfo)if(x.connection===args.tokenPrefix)revoked.add(t);
   return response(200,good({done:true,confirmed:true,logged:true}));
  }
  throw Error('Unexpected RTC route '+path);
 };
 return {fetchImpl,calls,created,revoked};
}
const run=(fake,extra={})=>runGoogleAcceptance({origin,account,expectedRevision:revision,writePass,readPass,calendarId,
 fetchImpl:fake.fetchImpl,checkpoint:async()=>{},...extra});

describe('owner-approved real-mailbox acceptance runner',()=>{
 it('rejects other accounts and duplicate run IDs before any API calls',async()=>{
  const h=harness();
  await expect(run(h,{account:'production@another-business.test'})).rejects.toThrow('invalid_protected_configuration');
  const same='b2601abf-18ad-414f-9b77-bc294a2bca19';
  await expect(run(h,{runIds:{files:same,calendar:same}})).rejects.toThrow('duplicate_run_ids');
  expect(h.calls).toHaveLength(0);
 });
 it('refuses a deployed source revision mismatch before any provider operation',async()=>{
  const h=harness({actualRevision:'b'.repeat(40)});
  const report=await run(h);
  expect(report).toMatchObject({status:'failed',failedPhase:'deployed_revision',sandbox:'NOT_DEDICATED_TEST'});
  expect(h.calls.filter(x=>x.path.startsWith('/api/tools/'))).toHaveLength(0);
 });
 it('preflights denials, replays exact IDs, cleans all runs and proves both revocations',async()=>{
  const h=harness(),snapshots=[];
  const report=await run(h,{checkpoint:async r=>snapshots.push(r)});
  expect(report.status).toBe('passed');
  expect(report.denials).toEqual({readOnly:true,area:true});
  expect(report.runs).toHaveLength(3);
  expect(report.runs.every(x=>x.status==='cleaned'&&x.replayVerified)).toBe(true);
  expect(report.revocationVerified).toBe(true);
  expect(h.revoked.has(writePass)&&h.revoked.has(readPass)).toBe(true);
  expect(h.calls.filter(x=>x.path.endsWith('workspace_dev_create_fixtures')&&!x.dryRun)).toHaveLength(6);
  expect(h.calls.filter(x=>x.path.endsWith('workspace_dev_cleanup')&&!x.dryRun)).toHaveLength(3);
  expect(snapshots.some(x=>x.runs.some(y=>y.status==='creation_pending'))).toBe(true);
  expect(JSON.stringify(report)).not.toContain('rtc_pass_');
  expect(report.independentDeploymentEvidence).toBe('unverified_by_this_runner');
 });
 it('never reports success after an uncertain creation, even when guarded cleanup succeeds',async()=>{
  const h=harness({createFailure:'calendar'});
  const report=await run(h);
  expect(report).toMatchObject({status:'failed',failedPhase:'fixture_calendar'});
  expect(report.runs[0].status).toBe('cleaned');
  expect(report.runs[1].status).toBe('cleaned');
  expect(report.runs[2].status).toBe('planned');
  expect(h.revoked.size).toBe(0);
 });
 it('refuses invalid calendar ownership before any scenario creates provider objects',async()=>{
  const h=harness({calendarFailure:true});
  expect(await run(h)).toMatchObject({status:'failed',failedPhase:'calendar_preservation_baseline'});
  expect(h.created.size).toBe(0);
  expect(h.calls.some(x=>x.path.endsWith('workspace_dev_cleanup'))).toBe(false);
 });
 it('does not certify preservation or revoke recovery access when unrelated calendar state changed',async()=>{
  const h=harness({calendarChanged:true});
  const report=await run(h);
  expect(report).toMatchObject({status:'failed',failedPhase:'calendar_preservation_readback'});
  expect(report.runs.every(x=>x.status==='cleaned')).toBe(true);
  expect(report.calendarPreservationVerified).not.toBe(true);
  expect(h.revoked.size).toBe(0);
 });
 it('preserves incomplete cleanup as reconciliation and keeps recovery access',async()=>{
  const h=harness({cleanupFailure:'files'});
  const report=await run(h);
  expect(report.status).toBe('failed');
  expect(report.runs[0].status).toBe('needs_reconciliation');
  expect(h.revoked.size).toBe(0);
 });
 it('recovers exact existing IDs with the original write pass after read pass expires',async()=>{
  const uuid='b2601abf-18ad-414f-9b77-bc294a2bca19';
  const h=harness({existing:{[uuid]:{scenario:'files',objects:names.files.map(id=>({id}))}}});
  const report=await run(h,{cleanupOnly:true,readPass:undefined,calendarId:undefined,runIds:{files:uuid}});
  expect(report).toMatchObject({status:'passed',revocationVerified:true});
  expect(report.runs).toHaveLength(1);
  expect(h.calls.some(x=>x.tokenKind==='read')).toBe(false);
  expect(h.calls.some(x=>x.path.endsWith('workspace_dev_create_fixtures'))).toBe(false);
  expect(h.revoked.has(writePass)).toBe(true);
 });
});

describe('crash-safe private recovery record',()=>{
 it('atomically replaces private checkpoints and refuses recording a bearer',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'google-acceptance-')),filename=join(dir,'report.json');
  try{
   await writePrivateCheckpoint(filename,{version:1,runs:[{runId:'one'}]});
   await writePrivateCheckpoint(filename,{version:1,runs:[{runId:'one',ids:['exact-id']}]});
   expect(JSON.parse(await readFile(filename,'utf8')).runs[0].ids).toEqual(['exact-id']);
   expect((await stat(filename)).mode&0o777).toBe(0o600);
   await expect(writePrivateCheckpoint(filename,{token:writePass})).rejects.toThrow('secret_in_report');
   expect(JSON.parse(await readFile(filename,'utf8')).runs[0].ids).toEqual(['exact-id']);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
