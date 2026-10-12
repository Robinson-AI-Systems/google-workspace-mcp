import {describe,it,expect} from 'vitest';
import {projectFields,shapeReadResult,readStoredResult,INLINE_BYTES} from '../../src/rtc/results.js';
import {ok} from '../../src/tools/util.js';
import {createFakeDb} from '../helpers/fake-db.js';
describe('RTC result handles',()=>{
 it('projects nested fields without prototype pollution',()=>{
   expect(projectFields({user:{name:'A',email:'b'},id:5},'user.name,id')).toEqual({user:{name:'A'},id:5});
   expect(()=>projectFields({a:1},'__proto__.polluted')).toThrow();
 });
 it('preserves large data behind a handle and isolates connections',async()=>{
   const fake=createFakeDb();
   const output=await shapeReadResult(ok({messages:Array.from({length:250},(_,i)=>({id:i,body:'x'.repeat(80)}))}),{},'connection-1',fake.storeRtcResult);
   const info=JSON.parse(output.content[0].text);
   expect(info.handle).toMatch(/^rtc_result_/);
   expect(info.bytes).toBeGreaterThan(INLINE_BYTES);
   expect((await fake.getRtcResult(info.handle,'connection-2'))).toBeNull();
   const page=await readStoredResult({handle:info.handle},'connection-1',fake.getRtcResult);
   expect(JSON.parse(page.content[0].text).next).toBe(2);
   expect((await readStoredResult({handle:info.handle},'connection-2',fake.getRtcResult)).isError).toBe(true);
 });
 it('does not change small legacy MCP responses',async()=>{
   const original=ok({hello:'world'});
   expect(await shapeReadResult(original,{},'connection-1',async()=>{throw Error('must not store')})).toEqual(original);
 });
});
