// Actual local Workspace modules + fake Google, with shared disposable Postgres.
// Never connect this runner to a provider account or a non-local database.
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
const account='rtc-fixture@example.test';
async function startProcess(env){
 const child=fork(fileURLToPath(new URL('../test/conformance/server.mjs',import.meta.url)),[],{
  env,stdio:['ignore','ignore','ignore','ipc']});
 const waiting=new Map();let next=0;
 const ready=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(Error('Workspace fixture startup timed out'));},15000);
  child.once('exit',()=>{clearTimeout(timer);reject(Error('Workspace fixture failed to start'));});
  child.on('message',message=>{
   if(message.ready){clearTimeout(timer);resolve(message.url);return;}
   const task=waiting.get(message.id);if(!task)return;
   waiting.delete(message.id);clearTimeout(task.timer);
   if(message.error)task.reject(Error(message.error));else task.resolve(message.result);
  });
 });
 const rpc=(command,args={})=>new Promise((resolve,reject)=>{
  const id=++next,timer=setTimeout(()=>{waiting.delete(id);reject(Error('Fixture control timed out'));},15000);
  waiting.set(id,{resolve,reject,timer});child.send({id,command,...args});
 });
 return {url:ready,rpc,close:async()=>{
  try{await rpc('close');}finally{
   child.kill();for(const task of waiting.values()){clearTimeout(task.timer);task.reject(Error('Fixture stopped'));}waiting.clear();
  }
 }};
}
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function call(origin,token,name,args){
 const r=await fetch(origin+'/api/tools/'+name,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
 const body=await r.json();return {status:r.status,body,result:body.result};
}
async function lifecycle(server,passes){
 const results=[];
 for(const scenario of ['files','calendar','gmail']){
  try {
  const runId=crypto.randomUUID();
  const args={scenario,runId,...(scenario==='calendar'?{calendarId:'fixture-calendar',startAt:new Date(Date.now()+86400000).toISOString()}: {})};
  const read=()=>call(server.url,passes.full,'workspace_dev_get_run',{runId});
  const preview=await call(server.url,passes.full,'workspace_dev_create_fixtures',{...args,dryRun:true});
  assert(preview.result?.dryRun===true,'Fixture preview failed');
  assert((await read()).status===404,'Preview created a durable run');
  const denied=await call(server.url,passes.readOnly,'workspace_dev_create_fixtures',args);
  assert(denied.status===403,'Read-only fixture write was allowed');
  const fault={files:'drive.create',calendar:'calendar.insert',gmail:'gmail.labels.create'}[scenario];
  const before=await server.rpc('counts');
  await server.rpc('fault',{name:fault});
  const failed=await call(server.url,passes.full,'workspace_dev_create_fixtures',args);
  assert(failed.status>=400,'Lost provider response was claimed successful');
  const pending=await read();
  assert(pending.result?.state==='needs_reconciliation'&&pending.result.request?.scenario===scenario,'Pending original run is not inspectable');
  const created=await call(server.url,passes.full,'workspace_dev_create_fixtures',args);
  assert(created.result?.confirmed===true&&Number.isSafeInteger(created.result.logged?.id),'Fixture reconciliation/readback/audit did not confirm');
  const recorded=await read();
  assert(recorded.result?.state==='recorded'&&recorded.result.slots.every(s=>s.state==='recorded'),'Exact reserved IDs were not reconciled');
  const foreign=await call(server.url,passes.readOnly,'workspace_dev_get_run',{runId});
  assert(foreign.status===404,'Fixture ledger leaked to another connection');
  const replay=await call(server.url,passes.full,'workspace_dev_create_fixtures',args);
  assert(replay.result?.confirmed===true,'Recorded fixture replay failed');
  if(scenario==='calendar'){
   const changed=await call(server.url,passes.full,'workspace_dev_create_fixtures',{...args,startAt:new Date(Date.now()+172800000).toISOString()});
   assert(changed.status>=400,'Changed immutable Calendar request was accepted');
  }
  const counts=await server.rpc('counts');
  const expected={files:3,calendar:1,gmail:1}[scenario];
  assert((counts[fault]||0)-(before[fault]||0)===expected,'A lost-response/replay created duplicate provider objects');
  const cleanupPreview=await call(server.url,passes.full,'workspace_dev_cleanup',{runId,dryRun:true});
  assert(cleanupPreview.result?.dryRun===true,'Exact cleanup preview failed');
  const fence=await call(server.url,passes.full,'workspace_dev_cleanup',{runId});
  assert(fence.result?.needsConfirmation===true,'Cleanup bypassed owner confirmation');
  const cleaned=await call(server.url,passes.full,'workspace_dev_cleanup',{runId,confirm:true});
  assert(cleaned.result?.confirmed===true&&cleaned.result.details?.fullyCleaned===true,'Exact fixture cleanup failed');
  const final=await read();
  assert(final.result?.state==='cleaned'&&final.result.recovery.mayReplayCreation===false,'Cleaned run was not terminal in recovery state');
  const forbiddenReplay=await call(server.url,passes.full,'workspace_dev_create_fixtures',args);
  assert(forbiddenReplay.result?.confirmed!==true,'A cleaned run was recreated');
  results.push({scenario,ok:true});
  }catch(error){results.push({scenario,ok:false,message:String(error.message).slice(0,200)});}
 }
 return results;
}
export async function runWorkspaceConformance({databaseUrl,runConformance}){
 const target=new URL(databaseUrl);
 if(!['postgres:','postgresql:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname))
  throw Error('Workspace conformance requires disposable localhost PostgreSQL');
 const db=new pg.Client({connectionString:databaseUrl});await db.connect();
 const schema='rtc_conformance_'+crypto.randomBytes(8).toString('hex');
 const servers=[];
 try{
  await db.query('CREATE SCHEMA '+schema);
  const env={PATH:process.env.PATH,DATABASE_URL:databaseUrl,TEST_DATABASE_URL:databaseUrl,
   RTC_CONFORMANCE_SCHEMA:schema,RTC_LOCAL_CONFORMANCE:'1',RTC_TEST_ACCOUNT_EMAILS:account};
  servers.push(await startProcess(env));servers.push(await startProcess(env));
  const seeded=await servers[0].rpc('seed');
  const oauth={inspect:async token=>servers[0].rpc('inspect',{token:token||seeded.access}),refresh:async()=>{
   const r=await fetch(servers[0].url+'/api/oauth/token',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({grant_type:'refresh_token',refresh_token:seeded.refresh,client_id:'local-conformance'}),signal:AbortSignal.timeout(10000)});
   const value=await r.json();assert(r.status===200&&value.access_token,'Actual OAuth refresh failed');return value.access_token;
  }};
  const report=await runConformance({url:servers[0].url,passes:seeded.passes,oauth,
   instances:{urls:servers.map(s=>s.url),pass:seeded.limited,limit:120},
   fixtures:{read:{name:'workspace_gmail_get_label',args:{labelId:'Label_state'}},
    largeRead:{name:'workspace_gmail_list_labels',args:{}},write:{name:'workspace_gmail_update_label',args:{labelId:'Label_state'}},
    guarded:{name:'workspace_gmail_delete_label',args:{labelId:'Label_state'}},field:'name',valueArgument:'name'}});
  const lifecycles=await lifecycle(servers[0],seeded.passes);
  return {...report,lifecycles,ok:report.ok&&lifecycles.every(x=>x.ok),evidence:'actual_local_workspace_fake_google_shared_postgres'};
 }finally{
  await Promise.allSettled(servers.map(s=>s.close()));
  try{await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await db.end();}
 }
}
