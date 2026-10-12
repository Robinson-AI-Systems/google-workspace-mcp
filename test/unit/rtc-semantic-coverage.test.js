import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {isWrite,RTC_META,allowedTool} from '../../src/rtc/catalog.js';
import {READ_ONLY_TOOL_NAMES,mutationCoverageErrors} from '../../src/rtc/read-only-semantics.js';
import {isGuardedWrite} from '../../src/tools/write.js';
const checks={isWrite,isGuardedWrite,RTC_META};
describe('exhaustive semantic mutation classification',()=>{
 it('covers every assembled handler, including the real 11 P5-1 omissions',()=>{
   expect(READ_ONLY_TOOL_NAMES.size).toBe(157);
   expect(mutationCoverageErrors(registry,checks)).toEqual([]);
   for(const name of ['gmail_untrash_message','gmail_untrash_thread','sheets_duplicate_sheet','sheets_sort_range','sheets_merge_cells','sheets_unmerge_cells','sheets_protect_range','domain_confirm_verification']){
     expect(isWrite(name),name).toBe(true);
     expect(isGuardedWrite(registry.handlers[name]),name).toBe(true);
   }
 });
 it('an unknown read-sounding operation is a write, denied to read-only',()=>{
   for(const name of ['gmail_get_and_send','sheets_resolve_mutation','drive_list_then_delete','gmail_untrash_new','domain_confirm_new']){
     expect(isWrite(name),name).toBe(true);
     expect(allowedTool(name,{profile:'read_only'}),name).toBe(false);
   }
 });
 it('detects unguarded mutation with misleading dryRun schema',()=>{
   const ghost={name:'gmail_get_and_send',inputSchema:{properties:{dryRun:{type:'boolean'}}}};
   const fake={tools:[...registry.tools,ghost],handlers:{...registry.handlers,gmail_get_and_send:async()=>({})}};
   expect(mutationCoverageErrors(fake,checks)).toContain('No guarded-write provenance: gmail_get_and_send');
 });
 it('rejects forged public Symbol provenance on a fake mutating handler',()=>{
   const forged=async()=>({});
   forged[Symbol.for('robinson.workspace.guarded-write.v1')]=true;
   expect(isGuardedWrite(forged)).toBe(false);
   const name='gmail_get_and_send';
   const fake={tools:[...registry.tools,{name,inputSchema:{properties:{dryRun:{type:'boolean'}}}}],
     handlers:{...registry.handlers,[name]:forged}};
   expect(mutationCoverageErrors(fake,checks)).toContain('No guarded-write provenance: '+name);
 });
 it('detects unknown read handler and missing registered reads instead of silently treating them as safe',()=>{
   const fake={tools:registry.tools.filter(t=>t.name!=='gmail_get_message'),handlers:registry.handlers};
   expect(mutationCoverageErrors(fake,checks)).toContain('Stale reviewed read declaration: gmail_get_message');
   const unexpected={tools:[...registry.tools,{name:'workspace_resolve_status',inputSchema:{properties:{}}}],handlers:{...registry.handlers,workspace_resolve_status:async()=>({})}};
   expect(mutationCoverageErrors(unexpected,checks)).toContain('No guarded-write provenance: workspace_resolve_status');
 });
 it('refuses a guarded handler incorrectly recorded as read-only',()=>{
   const legit=registry.handlers.gmail_untrash_message;
   const fake={tools:registry.tools,handlers:{...registry.handlers,gmail_get_message:legit}};
   expect(mutationCoverageErrors(fake,checks)).toContain('Read declaration conflicts with guarded mutation: gmail_get_message');
 });
});
