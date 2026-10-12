import {describe,it,expect,vi} from 'vitest';
import {handlers} from '../../src/tools/postmaster.js';
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
