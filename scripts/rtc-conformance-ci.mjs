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
