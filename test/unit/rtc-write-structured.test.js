import {describe,it,expect,vi} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {OUTPUT_SCHEMAS,WRITE_WORKFLOWS,attachStructuredResult} from '../../src/rtc/structured.js';
import {applyResultRules} from '../../src/rtc/results.js';
import {defineWrite,isGuardedWrite} from '../../src/tools/write.js';
import {allowedTool} from '../../src/rtc/catalog.js';
import {ok} from '../../src/tools/util.js';
import {makeFakeClients} from '../helpers/fake-google.js';
vi.mock('../../src/db.js',()=>({recordChange:async()=>1,storeRtcResult:vi.fn(),getRtcResult:vi.fn()}));
describe('P8-1 typed workflow lifecycle',()=>{
 it('every workflow exposes a machine-readable contract without losing mutation provenance',()=>{
  for(const tool of registry.tools.filter(t=>t.name.startsWith('workflow_'))){
   expect(tool.outputSchema,tool.name).toBeDefined();
   if(WRITE_WORKFLOWS.has(tool.name)){
    expect(isGuardedWrite(registry.handlers[tool.name]),tool.name).toBe(true);
    expect(allowedTool(tool.name,{profile:'read_only'})).toBe(false);
   }
  }
 });
 it.each([
  {done:false,dryRun:true,summary:'Preview',logged:true},
  {done:false,needsConfirmation:true,summary:'Ask first'},
  {done:false,refused:'Missing setup'},
  {done:true,summary:'Changed',confirmed:true,logged:true,after:{id:'exact'}},
  {done:true,summary:'Unverified',confirmed:false,logged:true},
  {done:true,summary:'No independent readback',confirmed:null,logged:true},
  {done:true,summary:'Audit failed',confirmed:false,logged:false,auditFailure:true}
 ])('types honest lifecycle state %j',value=>{
  for(const name of WRITE_WORKFLOWS)expect(attachStructuredResult(name,ok(value)).structuredContent).toEqual(value);
 });
 it.each([{done:true,summary:'false success',confirmed:true,logged:false},
  {done:true,summary:'false audit',confirmed:true,logged:true,auditFailure:true},
  {done:'true'}, {done:false,summary:'Nothing',dryRun:false}])('rejects impossible or malformed state %j',value=>{
  expect(attachStructuredResult('workflow_onboard_employee',ok(value)).isError).toBe(true);
 });
 it('validates previously structured outputs instead of bypassing the advertised contract',()=>{
  expect(attachStructuredResult('workflow_onboard_employee',{...ok({}),structuredContent:{done:true}}).isError).toBe(true);
 });
 it('preserves guarded write previews, confirmation and readbacks through the typed registry wrapper',async()=>{
  const apply=vi.fn(async()=>{});
  const built=defineWrite({name:'workflow_onboard_employee',description:'test',destructive:true,
   inputSchema:{type:'object',properties:{}},plan:()=>({summary:'Set exact object',target:'id'}),apply,
   readAfter:async()=>({id:'id'}),verify:()=>true});
  const r=applyResultRules({tools:[built.tool],handlers:{workflow_onboard_employee:built.handler}});
  const c={actingAs:'fake@example.test',connection:'fake'};
  expect((await r.handlers.workflow_onboard_employee({dryRun:true},c)).structuredContent.dryRun).toBe(true);
  expect((await r.handlers.workflow_onboard_employee({},c)).structuredContent.needsConfirmation).toBe(true);
  expect(apply).not.toHaveBeenCalled();
  expect((await r.handlers.workflow_onboard_employee({confirm:true},c)).structuredContent).toMatchObject({done:true,confirmed:true,logged:true});
  expect(apply).toHaveBeenCalledTimes(1);
 });
 it('keeps an actual assembled onboarding preview typed without applying a provider mutation',async()=>{
  const {clients}=makeFakeClients();clients.connection='fake';
  const r=await registry.handlers.workflow_onboard_employee({primaryEmail:'new@example.test',firstName:'Test',lastName:'Person',dryRun:true},clients);
  expect(r.structuredContent).toMatchObject({done:false,dryRun:true});
 });
 it('types the remaining read workflow, including exact verification booleans',()=>{
  const value={domain:'example.test',status:'WARN',verified:{root:{name:'example.test',verified:true},www:{name:'www.example.test',verified:false}},searchConsole:'Steps',businessProfile:'Manual',note:'Account only'};
  expect(attachStructuredResult('workflow_search_presence_check',ok(value)).structuredContent).toEqual(value);
  expect(attachStructuredResult('workflow_search_presence_check',ok({...value,verified:{root:{verified:'yes'}}})).isError).toBe(true);
  expect(OUTPUT_SCHEMAS.workflow_search_presence_check).toBeDefined();
 });
});
