// All registered operations must be semantically classified and proven safe.
// Unlike a tool-name regex, a new "get" or "resolve" mutation fails closed.
// A dryRun input field without handler provenance is not proof.
process.env.DATABASE_URL ||= 'postgres://user:pass@localhost/none';
const {registry}=await import('../src/tools/index.js');
const {isWrite,RTC_META}=await import('../src/rtc/catalog.js');
const {isGuardedWrite}=await import('../src/tools/write.js');
const {READ_ONLY_TOOL_NAMES,mutationCoverageErrors}=await import('../src/rtc/read-only-semantics.js');
const errors=mutationCoverageErrors(registry,{isWrite,isGuardedWrite,RTC_META});
if(errors.length){console.error('[mutation-check] '+errors.length+' semantic coverage errors:\n'+errors.join('\n'));process.exit(1);}
console.log('[mutation-check] '+READ_ONLY_TOOL_NAMES.size+' audited read handlers; '+(registry.tools.length-READ_ONLY_TOOL_NAMES.size-RTC_META.size)+' provenance-guarded writes; '+RTC_META.size+' independently protected meta dispatchers.');
