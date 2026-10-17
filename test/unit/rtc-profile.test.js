import { describe,it,expect } from 'vitest';
import { registry } from '../../src/tools/index.js';
import {allowedTool,listedTools,isWrite,toolMetadata,RTC_AREAS} from '../../src/rtc/catalog.js';
describe('RTC connection policy',()=>{
 it('can explicitly issue every area advertised by the real registry',async()=>{
  const {passOptions}=await import('../../src/rtc/pass-options.js');
  const {CONNECTION_AREAS,connectionPolicyToDb,verifyPolicyCopy}=await import('../../src/oauth/connection-settings.js');
  expect(CONNECTION_AREAS).toEqual(RTC_AREAS);
  for(const t of registry.tools){
   const area=toolMetadata(t).area;
   expect(RTC_AREAS,t.name).toContain(area);
   expect(passOptions({googleAccount:'ops@example.test',areas:[area]}).areas).toEqual([area]);
   const policy={profile:'read_only',listing:'catalog',areas:[area]};
   expect(verifyPolicyCopy(policy,connectionPolicyToDb(policy))).toBe(true);
  }
 });
 it('keeps old explicit grants restricted while new named areas retain read-only and area refusals',async()=>{
  const {normalizeConnectionPolicy}=await import('../../src/oauth/connection-settings.js');
  const old={profile:'read_only',listing:'catalog',areas:['admin','dns']};
  expect(normalizeConnectionPolicy(old)).toMatchObject(old);
  expect(normalizeConnectionPolicy(old)).toMatchObject({mode:null,costPolicy:{mode:'per_action'}});
  for(const [area,read,write] of [['chrome','chrome_resolve_policies','chrome_set_policy'],['domain','domain_list_verified','domain_confirm_verification']]){
   expect(allowedTool(read,old)).toBe(false);
   expect(allowedTool(read,{profile:'read_only',areas:[area]})).toBe(true);
   expect(allowedTool(write,{profile:'read_only',areas:[area]})).toBe(false);
   expect(allowedTool(read,{profile:'full',areas:['mail']})).toBe(false);
  }
 });
 it('refuses every known mutation when read only',()=>{for(const t of registry.tools)if(isWrite(t.name)&&t.name!=='workspace_call')expect(allowedTool(t.name,{profile:'read_only'}),t.name).toBe(false);});
 it('classifies the preexisting unguarded changes conservatively',()=>{for(const n of ['workflow_weekly_digest','gmail_untrash_message','sheets_format_cells','domain_confirm_verification','workspace_set_allowed_domains','unknown_do_something'])expect(isWrite(n)).toBe(true);});
 it('narrows by domain area and profile',()=>{expect(allowedTool('gmail_list_messages',{profile:'read_only',areas:['calendar']})).toBe(false);expect(allowedTool('gmail_list_messages',{profile:'read_only',areas:['mail']})).toBe(true);expect(listedTools(registry.tools,{profile:'read_only'}).every(t=>!isWrite(t.name)||t.name==='workspace_call')).toBe(true);});
 it('publishes billing-sensitive tools with unambiguous warnings and keeps RTC money-out semantics distinct',()=>{
  const risky=['workspace_bulk_operation','licensing_assign_license','licensing_update_assignment'];
  for(const name of risky){
   const description=toolMetadata(registry.tools.find(t=>t.name===name));
   expect(description.billingRisk).toBe(true);
   expect(description.money).toBe(false);
   expect(description.description).toMatch(/BILLING WARNING.*price unknown/);
  }
  expect(toolMetadata(registry.tools.find(t=>t.name==='licensing_remove_license')).billingRisk).toBe(false);
 });
 it('rejects live developer fixture mutation via direct listing, describe and dispatch eligibility',()=>{
  for(const name of ['workspace_dev_create_fixtures','workspace_dev_cleanup']){
   expect(allowedTool(name,{profile:'full',mode:'test',areas:['workspace']})).toBe(true);
   expect(allowedTool(name,{profile:'full',mode:'live',areas:['workspace']})).toBe(false);
  }
 });
 it('exposes consistent read-only hints and bounded descriptions',()=>{for(const t of registry.tools){const m=toolMetadata(t);expect(m.description.length).toBeLessThanOrEqual(160);expect(m.annotations.readOnlyHint).toBe(!isWrite(t.name));}});
});

describe('RTC guarded meta dispatch',()=>{
 it('blocks direct writes through workspace_call on read-only policy',async()=>{
  const {handlers}=await import('../../src/tools/rtc-meta.js');
  const result=await handlers.workspace_call({name:'gmail_send_email',args:{confirm:true}}, {rtcPolicy:{profile:'read_only',listing:'compact'}});
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/outside_scope/);
 });
 it('prevalidates every batch call before doing any work',async()=>{
  const {handlers}=await import('../../src/tools/rtc-meta.js');
  const result=await handlers.workspace_batch({calls:[{name:'gmail_list_messages'},{name:'gmail_send_email',args:{confirm:true}}]}, {rtcPolicy:{profile:'full'}});
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


describe('RTC complete, permission-limited tool discovery',()=>{
 const parse=output=>JSON.parse(output.content[0].text);
 it('returns all accessible matches across bounded pages, without dropped or duplicate tools',async()=>{
  const {handlers}=await import('../../src/tools/rtc-meta.js');
  const clients={rtcPolicy:{profile:'full'}};
  const seen=[],offsets=[];let offset=0,total;
  for(let page=0;page<50;page++){
   const data=parse(await handlers.workspace_search_tools({limit:23,offset},clients));
   total??=data.totalMatched;
   expect(data.totalMatched).toBe(total);
   expect(data.offset).toBe(offset);
   expect(data.count).toBe(data.tools.length);
   expect(data.count).toBeLessThanOrEqual(23);
   seen.push(...data.tools.map(t=>t.name));offsets.push(offset);
   if(data.nextOffset===null)break;
   expect(data.nextOffset).toBeGreaterThan(offset);
   offset=data.nextOffset;
  }
  expect(seen.length).toBe(total);
  expect(new Set(seen).size).toBe(total);
  expect(offsets.length).toBeGreaterThan(1);
  expect(new Set(seen)).toEqual(new Set(listedTools(registry.tools,{profile:'full'},'catalog').map(t=>t.name)));
 });
 it('filters by connection permissions before counting and paging, including empty and out-of-range pages',async()=>{
  const {handlers}=await import('../../src/tools/rtc-meta.js');
  const clients={rtcPolicy:{profile:'read_only',areas:['mail']}};
  const first=parse(await handlers.workspace_search_tools({query:'gmail',limit:2},clients));
  const all=listedTools(registry.tools,clients.rtcPolicy,'catalog').map(toolMetadata).filter(t=>(t.name+' '+t.description).toLowerCase().includes('gmail'));
  expect(first.totalMatched).toBe(all.length);
  expect(first.tools.every(t=>t.area==='mail'&&t.writes===false)).toBe(true);
  expect(first.count).toBe(Math.min(2,all.length));
  const beyond=parse(await handlers.workspace_search_tools({limit:2,offset:99999,query:'gmail'},clients));
  expect(beyond).toMatchObject({tools:[],count:0,totalMatched:all.length,nextOffset:null});
  const unknown=parse(await handlers.workspace_search_tools({query:'unreachable-never-matches',limit:2},clients));
  expect(unknown).toMatchObject({tools:[],count:0,totalMatched:0,nextOffset:null});
 });
 it('rejects invalid pagination and query arguments rather than silently clipping or leaking catalog metadata',async()=>{
  const {handlers}=await import('../../src/tools/rtc-meta.js');
  for(const args of [{limit:0},{limit:31},{limit:1.2},{limit:'2'},{offset:-1},{offset:1.5},{offset:'3'},{offset:Number.MAX_SAFE_INTEGER+1},{query:0},{area:2},{audience:'other'}]){
   await expect(handlers.workspace_search_tools(args,{rtcPolicy:{profile:'read_only'}})).rejects.toThrow(/invalid_args/);
  }
 });
});
