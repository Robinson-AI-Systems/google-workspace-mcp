import { describe,it,expect } from 'vitest';
import { registry } from '../../src/tools/index.js';
import {allowedTool,listedTools,isWrite,toolMetadata} from '../../src/rtc/catalog.js';
describe('RTC connection policy',()=>{
 it('refuses every known mutation when read only',()=>{for(const t of registry.tools)if(isWrite(t.name))expect(allowedTool(t.name,{profile:'read_only'}),t.name).toBe(false);});
 it('classifies the preexisting unguarded changes conservatively',()=>{for(const n of ['gmail_untrash_message','sheets_format_cells','domain_confirm_verification','workspace_set_allowed_domains','unknown_do_something'])expect(isWrite(n)).toBe(true);});
 it('narrows by domain area and profile',()=>{expect(allowedTool('gmail_list_messages',{profile:'read_only',areas:['calendar']})).toBe(false);expect(allowedTool('gmail_list_messages',{profile:'read_only',areas:['mail']})).toBe(true);expect(listedTools(registry.tools,{profile:'read_only'}).every(t=>!isWrite(t.name)||t.name==='workspace_call')).toBe(true);});
 it('exposes consistent read-only hints and bounded descriptions',()=>{for(const t of registry.tools){const m=toolMetadata(t);expect(m.description.length).toBeLessThanOrEqual(160);expect(m.annotations.readOnlyHint).toBe(!isWrite(t.name));}});
});
