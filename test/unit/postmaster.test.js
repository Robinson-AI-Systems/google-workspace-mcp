import {describe,it,expect,vi} from 'vitest';
import {handlers,summarizePostmasterDays} from '../../src/tools/postmaster.js';
import {registry} from '../../src/tools/index.js';
import {isWrite,allowedTool,rtcArea} from '../../src/rtc/catalog.js';
import {ALL_SCOPES} from '../../src/auth/scopes.js';

const fake=()=>({postmaster:{domains:{list:vi.fn(async()=>({data:{domains:[{name:'domains/allowed.example'},{name:'domains/other.example'}],nextPageToken:'p'}})),trafficStats:{list:vi.fn(async()=>({data:{trafficStats:[{name:'domains/allowed.example/trafficStats/20261010',spammyFeedbackRatio:0.01}],nextPageToken:'next'}}))}}},actingAs:'owner@allowed.example',allowedDomains:['allowed.example']});
describe('P7-4 approved Postmaster read-only v1 integration',()=>{
 it('registers isolated reads under mail, preserving existing delegated scopes',()=>{
   for(const name of ['postmaster_list_domains','postmaster_list_traffic_stats']){expect(registry.handlers[name]).toBeTypeOf('function');expect(isWrite(name)).toBe(false);expect(rtcArea(name)).toBe('mail');expect(allowedTool(name,{profile:'read_only',areas:['mail']})).toBe(true);expect(allowedTool(name,{profile:'read_only',areas:['admin']})).toBe(false);}
   expect(ALL_SCOPES).toContain('https://www.googleapis.com/auth/postmaster.readonly');
 });
 it('lists only domains within an existing business boundary, preserving pagination',async()=>{
   const clients=fake();const result=JSON.parse((await registry.handlers.postmaster_list_domains({},clients)).content[0].text);
   expect(result.domains).toEqual([{name:'domains/allowed.example'}]);expect(result.count).toBe(1);expect(result.nextPageToken).toBe('p');expect(result.scopeFiltered).toBe(true);
 });
 it('requests precise daily stats without changing provider state',async()=>{
   const clients=fake();const out=JSON.parse((await registry.handlers.postmaster_list_traffic_stats({domain:'allowed.example',startDate:'2026-10-01',endDate:'2026-10-10',pageSize:5},clients)).content[0].text);
   expect(out.stats).toHaveLength(1);expect(out.nextPageToken).toBe('next');
   expect(clients.postmaster.domains.trafficStats.list).toHaveBeenCalledWith({parent:'domains/allowed.example',pageSize:5,'startDate.year':2026,'startDate.month':10,'startDate.day':1,'endDate.year':2026,'endDate.month':10,'endDate.day':10});
 });
 it('denies foreign domains before any provider call unless explicitly authorized',async()=>{
   const clients=fake();const out=await registry.handlers.postmaster_list_traffic_stats({domain:'other.example',startDate:'2026-10-01',endDate:'2026-10-10'},clients);
   expect(out.content[0].text).toMatch(/outside what this connection/);expect(clients.postmaster.domains.trafficStats.list).not.toHaveBeenCalled();
 });
 it('rejects invalid dates, domains, ranges, and pagination locally',async()=>{
   const clients=fake();for(const args of [
    {domain:'../evil',startDate:'2026-10-01',endDate:'2026-10-10'},
    {domain:'allowed.example',startDate:'2026-02-30',endDate:'2026-03-01'},
    {domain:'allowed.example',startDate:'2026-10-10',endDate:'2026-10-01'},
    {domain:'allowed.example',startDate:'2026-01-01',endDate:'2026-10-01'},
    {domain:'allowed.example',startDate:'2026-10-01',endDate:'2026-10-10',pageSize:201}
   ]) await expect(handlers.postmaster_list_traffic_stats(args,clients)).rejects.toThrow();
   expect(clients.postmaster.domains.trafficStats.list).not.toHaveBeenCalled();
 });
 it('explains unverified or inaccessible Postmaster domain without treating as success',async()=>{
   const clients=fake();clients.postmaster.domains.trafficStats.list.mockRejectedValue(Object.assign(new Error('forbidden'),{code:403}));
   await expect(handlers.postmaster_list_traffic_stats({domain:'allowed.example',startDate:'2026-10-01',endDate:'2026-10-10'},clients)).rejects.toThrow(/Verify this domain/);
 });
});


describe('P7-4 owner-readable Postmaster range digest',()=>{
 const data=(output)=>JSON.parse(output.content[0].text);
 const daily=(date,fields={})=>({name:'domains/allowed.example/trafficStats/'+date,...fields});
 it('collects multiple provider pages and distinguishes observed worst ratios from traffic-weighted averages',async()=>{
  const clients=fake();
  clients.postmaster.domains.trafficStats.list.mockImplementation(async({pageToken})=>({data:pageToken?{
   trafficStats:[daily('20261011',{domainReputation:'LOW',userReportedSpamRatio:0.004,spfSuccessRatio:0.82,deliveryErrors:[{errorType:'RATE_LIMIT_EXCEEDED'}]})] }:{
   trafficStats:[daily('20261010',{domainReputation:'HIGH',userReportedSpamRatio:0.001,spfSuccessRatio:0.95})],nextPageToken:'second'}}));
  const result=data(await handlers.postmaster_list_traffic_stats({domain:'allowed.example',startDate:'2026-10-10',endDate:'2026-10-11',withSummary:true},clients));
  expect(clients.postmaster.domains.trafficStats.list).toHaveBeenCalledTimes(2);
  expect(clients.postmaster.domains.trafficStats.list.mock.calls[1][0].pageToken).toBe('second');
  expect(result.stats).toHaveLength(2);
  expect(result).not.toHaveProperty('nextPageToken');
  expect(result.summary).toMatchObject({complete:true,observedDays:2,worstDomainReputation:'LOW',maxObservedUserReportedSpamRatio:0.004,minObservedSpfSuccessRatio:0.82,assessment:'needs_attention',deliveryErrorDays:{RATE_LIMIT_EXCEEDED:1}});
 });
 it('provides resumable partial summaries without claiming all days were read',async()=>{
  const clients=fake();
  clients.postmaster.domains.trafficStats.list.mockImplementation(async({pageToken})=>({data:{trafficStats:[daily(pageToken?'20261011':'20261010',{domainReputation:'HIGH'})],nextPageToken:pageToken?'third':'second'}}));
  const partial=data(await handlers.postmaster_list_traffic_stats({domain:'allowed.example',startDate:'2026-10-10',endDate:'2026-10-12',withSummary:true,maxPages:2},clients));
  expect(partial).toMatchObject({nextPageToken:'third',summary:{complete:false,observedDays:2,assessment:'not_readable'}});
  expect(partial.summary.coverage).toMatch(/unread provider pages/);
  expect(clients.postmaster.domains.trafficStats.list).toHaveBeenCalledTimes(2);
 });
 it('labels missing metrics and absent Postmaster days as unknown, not zero or healthy',()=>{
  expect(summarizePostmasterDays([])).toMatchObject({observedDays:0,assessment:'not_readable',maxObservedUserReportedSpamRatio:null});
  const s=summarizePostmasterDays([daily('20261010',{domainReputation:'HIGH'})]);
  expect(s.maxObservedUserReportedSpamRatio).toBeNull();
  expect(s.note).toMatch(/missing fields\/days are unknown/);
 });
 it('rejects malformed provider pages, duplicate days, cycles, invalid modes and excessive reads',async()=>{
  const clients=fake();
  for(const args of [{withSummary:'yes'},{maxPages:3},{withSummary:true,maxPages:11},{withSummary:true,maxPages:0}]){
   await expect(handlers.postmaster_list_traffic_stats({domain:'allowed.example',startDate:'2026-10-10',endDate:'2026-10-11',...args},clients)).rejects.toThrow();
  }
  expect(clients.postmaster.domains.trafficStats.list).not.toHaveBeenCalled();
  clients.postmaster.domains.trafficStats.list.mockResolvedValue({data:{trafficStats:[daily('20261010')],nextPageToken:'repeat'}});
  await expect(handlers.postmaster_list_traffic_stats({domain:'allowed.example',startDate:'2026-10-10',endDate:'2026-10-11',withSummary:true},clients)).rejects.toThrow(/repeated/);
  expect(()=>summarizePostmasterDays([daily('20261010'),daily('20261010')])).toThrow(/Duplicate/);
  expect(()=>summarizePostmasterDays([daily('20261010',{userReportedSpamRatio:999})])).toThrow(/Invalid/);
 });
});
