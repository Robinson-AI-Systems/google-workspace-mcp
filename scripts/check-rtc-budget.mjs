// Compact discovery must stay small even as new tools are added.
import { registry } from '../src/tools/index.js';
import { listedTools, toolMetadata } from '../src/rtc/catalog.js';
for (const profile of ['read_only','everyday','full']) {
 const tools=listedTools(registry.tools,{profile,listing:'compact'}).map(toolMetadata);
 const estimatedTokens=Math.ceil(Buffer.byteLength(JSON.stringify(tools),'utf8')/4);
 console.log('[rtc-budget] '+profile+': '+tools.length+' tools, ~'+estimatedTokens+' tokens');
 if (estimatedTokens>=5000) {
  console.error('[rtc-budget] compact listing exceeds 5,000-token conservative estimate; reduce schemas or descriptions.');
  process.exitCode=1;
 }
}
