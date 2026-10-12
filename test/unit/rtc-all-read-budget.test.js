import {describe,it,expect,vi} from 'vitest';
const saved=vi.hoisted(()=>[]);
vi.mock('../../src/db.js',()=>({storeRtcResult:async r=>{saved.push(r);},getRtcResult:vi.fn()}));
import {registry} from '../../src/tools/index.js';
import {applyResultRules,INLINE_BYTES} from '../../src/rtc/results.js';
import {isWrite,RTC_META,toolMetadata} from '../../src/rtc/catalog.js';
import {READ_ONLY_TOOL_NAMES} from '../../src/rtc/read-only-semantics.js';
import {ok} from '../../src/tools/util.js';
describe('P8-1 registry-wide shared read contract',()=>{
 it('bounds 100-item provider fakes for every registered read through the actual result wrapper',async()=>{
  saved.length=0;
  const names=registry.tools.filter(t=>!isWrite(t.name)&&!RTC_META.has(t.name)).map(t=>t.name);
  const data={items:Array.from({length:100},(_,i)=>({id:'id-'+i,description:'arbitrary provider data '+'.'.repeat(1000)}))};
  const fixture=applyResultRules({tools:registry.tools.filter(t=>names.includes(t.name)),handlers:Object.fromEntries(names.map(n=>[n,async()=>ok(data)]))});
  for(const name of names){
   const result=await fixture.handlers[name]({}, {connection:'fake-budget-owner'});
   expect(result.isError,name).not.toBe(true);
   expect(Buffer.byteLength(JSON.stringify(result)),name).toBeLessThanOrEqual(INLINE_BYTES);
   const value=JSON.parse(result.content[0].text);
   expect(value.handle,name).toMatch(/^rtc_result_[A-Za-z0-9_-]{32}$/);
   const full=saved.find(s=>s.handle===value.handle);
   expect(full.connection,name).toBe('fake-budget-owner');
   expect(full.payload.data.items,name).toEqual(data.items);
  }
  expect(names.length).toBe(READ_ONLY_TOOL_NAMES.size);
  expect(saved).toHaveLength(names.length);
 });
 it('gives every operation annotations consistent with its audited read/write classification',()=>{
  for(const tool of registry.tools){
   const metadata=toolMetadata(tool);
   expect(metadata.annotations.readOnlyHint,tool.name).toBe(!isWrite(tool.name));
   expect(metadata.annotations.openWorldHint,tool.name).toBe(true);
   if(!isWrite(tool.name))expect(metadata.annotations.destructiveHint,tool.name).toBe(false);
  }
 });
});
