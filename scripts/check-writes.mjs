// Semantic guard proof for the assembled runtime registry, not schema appearance.
// A fake dryRun property is insufficient: handler provenance must originate in
// defineWrite, and every classified mutation must remain routed through that handler.
process.env.DATABASE_URL ||= 'postgres://user:pass@localhost/none';
const {registry}=await import('../src/tools/index.js');
const {isWrite,RTC_META}=await import('../src/rtc/catalog.js');
const {isGuardedWrite}=await import('../src/tools/write.js');
// Explicit semantic exceptions: meta-dispatchers enforce the target handler's
// guard at invocation time. They are tested separately across doors.
const DISPATCHERS=new Set(['workspace_call']);
const errors=[];
let writes=0;
for(const tool of registry.tools){
 const name=tool.name;
 if(!isWrite(name)||DISPATCHERS.has(name))continue;
 writes++;
 if(!isGuardedWrite(registry.handlers[name]))errors.push(name+': assembled handler did not originate from guarded write lifecycle');
 if(tool.inputSchema?.properties?.dryRun?.type!=='boolean')errors.push(name+': missing preview contract');
}
for(const name of DISPATCHERS)if(!RTC_META.has(name)||!registry.handlers[name])errors.push(name+': missing guarded dispatcher');
if(errors.length){console.error('[mutation-check] '+errors.length+' failures:\n'+errors.join('\n'));process.exit(1);}
console.log('[mutation-check] '+writes+' semantically classified mutating handlers are provenance-guarded; '+DISPATCHERS.size+' dispatcher separately enforced.');
