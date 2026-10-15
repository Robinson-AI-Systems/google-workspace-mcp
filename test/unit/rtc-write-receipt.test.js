import {describe,expect,it} from 'vitest';
import {rtcWriteReceipt,rtcReceiptSchema} from '../../src/rtc/write-receipt.js';
describe('RTC audit receipt preserves native compatibility without invented IDs',()=>{
 it('exposes the actual row reference only on a successfully logged change',()=>{
  const native={done:true,confirmed:true,logged:true,changeId:41};
  expect(rtcWriteReceipt(native)).toEqual({...native,logged:{id:41}});
  expect(native.logged).toBe(true);
  expect(rtcWriteReceipt({done:false,dryRun:true,logged:true,changeId:42}).logged).toEqual({id:42});
 });
 it('never invents success for malformed or missing references',()=>{
  for(const changeId of [null,undefined,0,-1,'1',{},1.5])expect(rtcWriteReceipt({done:true,confirmed:true,logged:true,changeId})).toMatchObject({confirmed:false,auditFailure:true});
  const failed={done:true,confirmed:false,logged:false};expect(rtcWriteReceipt(failed)).toBe(failed);
 });
 it('documents HTTP receipt shape without mutating the MCP output schema',()=>{
  const schema={properties:{logged:{type:'boolean'}},anyOf:[{properties:{logged:{type:'boolean'}}}]};
  expect(rtcReceiptSchema(schema).properties.logged.oneOf[1].required).toEqual(['id']);
  expect(schema.properties.logged.type).toBe('boolean');
 });
});
