import { describe,it,expect } from 'vitest';
import { registry } from '../../src/tools/index.js';
import {allowedTool,listedTools,isWrite,toolMetadata} from '../../src/rtc/catalog.js';
describe('RTC connection policy',()=>{
 it('refuses every known mutation when read only',()=>{for(const t of registry.tools)if(isWrite(t.name)&&t.name!=='workspace_call')expect(allowedTool(t.name,{profile:'read_only'}),t.name).toBe(false);});
 it('classifies the preexisting unguarded changes conservatively',()=>{for(const n of ['gmail_untrash_message','sheets_format_cells','domain_confirm_verification','workspace_set_allowed_domains','unknown_do_something'])expect(isWrite(n)).toBe(true);});
 it('narrows by domain area and profile',()=>{expect(allowedTool('gmail_list_messages',{profile:'read_only',areas:['calendar']})).toBe(false);expect(allowedTool('gmail_list_messages',{profile:'read_only',areas:['mail']})).toBe(true);expect(listedTools(registry.tools,{profile:'read_only'}).every(t=>!isWrite(t.name)||t.name==='workspace_call')).toBe(true);});
 it('exposes consistent read-only hints and bounded descriptions',()=>{for(const t of registry.tools){const m=toolMetadata(t);expect(m.description.length).toBeLessThanOrEqual(160);expect(m.annotations.readOnlyHint).toBe(!isWrite(t.name));}});
});

describe('RTC guarded meta dispatch',()=>{
 it('blocks direct writes through workspace_call on read-only policy',async()=>{
  const {handlers}=await import('../../src/tools/rtc-meta.js');
  const result=await handlers.workspace_call({name:'gmail_send_message',args:{confirm:true}}, {rtcPolicy:{profile:'read_only',listing:'compact'}});
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/outside_scope/);
 });
 it('prevalidates every batch call before doing any work',async()=>{
  const {handlers}=await import('../../src/tools/rtc-meta.js');
  const result=await handlers.workspace_batch({calls:[{name:'gmail_list_messages'},{name:'gmail_send_message',args:{confirm:true}}]}, {rtcPolicy:{profile:'full'}});
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/refused_by_guard/);
 });
 it('provides searchable metadata for a read-only compact connection',async()=>{
  const {handlers}=await import('../../src/tools/rtc-meta.js');
  const result=await handlers.workspace_search_tools({query:'gmail',limit:5},{rtcPolicy:{profile:'read_only',listing:'compact',areas:['mail']}});
  const value=JSON.parse(result.content[0].text);
  expect(value.tools.length).toBeGreaterThan(0);
  expect(value.tools.every(t=>t.writes===false&&t.area==='mail')).toBe(true);
 });
});
