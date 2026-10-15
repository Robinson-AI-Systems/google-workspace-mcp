import {describe,it,expect} from 'vitest';
import {discoverConsoleReadbacks,planConsoleReadbacks,CONSOLE_LIVE_READBACK_IDS}
 from '../../src/tools/admin-console-verify.js';
import {CONSOLE_MAP} from '../../src/data/console-map.js';
import {CONSOLE_REVIEW_CATEGORIES} from '../../src/data/console-review.js';

const clients={actingAs:'ops@example.test',rtcPolicy:{profile:'read_only',areas:['workspace','mail','files']}};
describe('P8-8 complete owner Admin-console readback discovery',()=>{
 it('reports every one of the actual 50 mapped topics without contacting Google',()=>{
  const found=[];
  for(let page=1;page<=5;page++){
   const result=discoverConsoleReadbacks({page,pageSize:10},clients);
   expect(result.mode).toBe('read_only_discovery');
   expect(result.totalMapped).toBe(CONSOLE_MAP.length);
   expect(result.totalMatched).toBe(CONSOLE_MAP.length);
   found.push(...result.items.map(x=>x.id));
  }
  expect(found).toEqual(CONSOLE_MAP.map(x=>x.id));
  expect(new Set(found).size).toBe(50);
  const first=discoverConsoleReadbacks({},clients);
  expect(Object.values(first.counts).reduce((n,x)=>n+x,0)).toBe(50);
 });
 it('supports category, query and scoped readiness filtering with accurate independent totals',()=>{
  for(const category of CONSOLE_REVIEW_CATEGORIES){
   const result=discoverConsoleReadbacks({category,pageSize:20},clients);
   expect(result.items.every(x=>x.category===category)).toBe(true);
   expect(result.totalMatched).toBe(CONSOLE_MAP.filter(x=>x.id&&
    result.items.some(y=>y.id===x.id)).length);
  }
  const gmail=discoverConsoleReadbacks({query:'forward',pageSize:20},clients);
  expect(gmail.totalMatched).toBeGreaterThan(0);
  expect(gmail.items.every(x=>x.id.includes('forward')||x.title.toLowerCase().includes('forward'))).toBe(true);
  const filtered=discoverConsoleReadbacks({status:'manual_only',pageSize:20},clients);
  expect(filtered.items.every(x=>x.status==='manual_only')).toBe(true);
  expect(filtered.counts.manual_only).toBeGreaterThan(0);
 });
 it('differentiates eligible read-only mailbox checks from unavailable customer-wide grants',()=>{
  const r=discoverConsoleReadbacks({query:'imap',pageSize:20},clients);
  expect(r.items.find(x=>x.id==='gmail-imap-pop').status).toBe('eligible');
  const restricted=planConsoleReadbacks({ids:['domains','admin-roles','gmail-imap-pop']},clients);
  expect(restricted.map(x=>x.status)).toEqual([
   'outside_scope','outside_scope','eligible'
  ]);
  expect(restricted.find(x=>x.id==='gmail-imap-pop').tool).toBe('gmail_get_imap_settings');
  const user=planConsoleReadbacks({ids:['2sv'],subjectEmail:'ops@example.test'},clients);
  expect(user[0].status).toBe('outside_scope');
  const approved=planConsoleReadbacks({ids:['domains'],crossDomain:true},clients);
  expect(approved[0].status).toBe('outside_scope'); // profile is read_only but admin area is excluded
 });
 it('will not confuse finding a console link with proof of applied policy',()=>{
  for(let page=1;page<=3;page++){
   const response=discoverConsoleReadbacks({page,pageSize:20,crossDomain:false},clients);
   expect(response.note).toMatch(/not mean Google granted/i);
   expect(JSON.stringify(response)).not.toMatch(/"status":"observed"/);
   expect(response.items.every(x=>!('data' in x)&&!('providerValue' in x))).toBe(true);
  }
  expect(CONSOLE_LIVE_READBACK_IDS.length).toBeLessThan(CONSOLE_MAP.length);
 });
 it('requires bounds and never follows caller-defined arbitrary filters to read tools',()=>{
  for(const args of [
   {category:'system'}, {page:0},{page:1001},{pageSize:21},
   {query:'x'.repeat(121)},{status:'write'},{crossDomain:'yes'},
   {domain:'http://evil.test'}
  ]) expect(()=>discoverConsoleReadbacks(args,clients)).toThrow();
 });
});
