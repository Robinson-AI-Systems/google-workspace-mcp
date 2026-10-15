// Independent pinned upstream RTC 1 wire runner. Reference success proves
// integration of the contract tests, not that this live Workspace server passed.
const {startFakeServer}=await import('../.rtc-hub/packages/conformance/fake-server/server.js');
const {runConformance}=await import('../.rtc-hub/packages/conformance/src/run.js');
const fixture=await startFakeServer();
try{
 const result=await runConformance({url:fixture.url,passes:fixture.passes,oauth:fixture.oauth});
 const applicable=result.checks.filter(c=>!c.skipped);
 for(const check of applicable){
  console.log('[RTC reference] '+(check.ok?'PASS ':'FAIL ')+check.name+': '+check.message);
 }
 for(const check of result.checks.filter(c=>c.skipped)){
  console.log('[RTC reference] NOT VERIFIED '+check.name+': '+check.message);
 }
 if(applicable.length<10||applicable.some(c=>!c.ok))process.exitCode=1;
 console.log('[RTC evidence] Reference runner and server-specific gateway/DB tests execute in CI; actual deployed Workspace D-4 is NOT certified.');
}finally{await fixture.close();}

// This is the service acceptance layer: do not substitute the reference fake.
const {runWorkspaceConformance}=await import('./rtc-workspace-conformance.mjs');
try{
 if(!process.env.TEST_DATABASE_URL)throw Error('Missing disposable localhost TEST_DATABASE_URL; actual Workspace conformance is NOT verified.');
 const report=await runWorkspaceConformance({databaseUrl:process.env.TEST_DATABASE_URL,runConformance});
 for(const check of report.checks)console.log('[RTC Workspace] '+(check.ok&&!check.skipped?'PASS ':'FAIL ')+check.name+': '+check.message);
 for(const item of report.lifecycles)console.log('[RTC Workspace fixture] '+(item.ok?'PASS ':'FAIL ')+item.scenario+' recovery/readback/cleanup');
 if(!report.ok)process.exitCode=1;
 console.log('[RTC evidence] Actual local Workspace HTTP/OAuth + fake Google + two processes/shared real Postgres. Deployed Google/Hub D-4 remains separate.');
}catch(error){console.error('[RTC Workspace] FAIL '+String(error.message).slice(0,200));process.exitCode=1;}
