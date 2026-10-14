import { providerReadFixture } from '../helpers/smoke-provider-fixtures.js';
import { describe,it,expect,vi } from 'vitest';
import { SAFE_READ_PROBES,readAuthorizedCatalog,runCatalogReadOnlySmoke,main } from '../../scripts/smoke-readonly-catalog.mjs';

const token='rtc_pass_'+'Z'.repeat(43);
const revision='d'.repeat(40);
const account='scratch@example.test';
const origin='https://mcp.example.test';

function fake({catalog,revisionFound=revision,failedTool='',missingProbe='',wrongMailbox=false,cycle=false}={}){
 const tools=catalog||[
  ...SAFE_READ_PROBES.map(p=>({name:p.name,area:p.area,writes:false,annotations:{readOnlyHint:true}})),
  {name:'workspace_admin_get_user',area:'admin',writes:false,annotations:{readOnlyHint:true}},
  {name:'workspace_call',area:'workspace',writes:true,annotations:{readOnlyHint:false}}
 ];
 const calls=[];
 const fetcher=async(url,options={})=>{
  const u=new URL(url);const body=options.body?JSON.parse(options.body):null;
  calls.push({path:u.pathname,method:options.method,tool:u.searchParams.get('q'),body});
  const ret=(status,result)=>({status,json:async()=>result});
  if(u.pathname==='/api/contract')return ret(200,{rtc:1,deployment:{sourceRevision:revisionFound}});
  if(u.pathname==='/api/whoami')return ret(200,{ok:true,result:{account,profile:'read_only',mode:'test',allow_writes:false,areas:null}});
  if(u.pathname==='/api/tools'){
   const query=u.searchParams.get('q');
   if(query)return ret(200,{ok:true,result:{tools:query===missingProbe?[]:tools.filter(t=>t.name===query)}});
   const page=Number(u.searchParams.get('page')||'1');
   const rows=tools.slice((page-1)*100,page*100);
   return ret(200,{ok:true,result:{tools:rows,next:cycle&&page===1?'1':page*100<tools.length?String(page+1):null}});
  }
  if(u.pathname.startsWith('/api/tools/')){
   const name=decodeURIComponent(u.pathname.slice('/api/tools/'.length));
   if(name===failedTool)return ret(403,{ok:false,error:{code:'provider_denied'}});
   if(name==='workspace_whoami')return ret(200,{ok:true,result:{
    actingAs:wrongMailbox?'other@example.test':account,
    gmailReports:wrongMailbox?'other@example.test':account,matches:!wrongMailbox
   }});
   return ret(200,{ok:true,result:providerReadFixture(name,account)});
  }
  throw Error('unexpected_path');
 };
 return {fetcher,calls,tools};
}
const options=(f)=>({origin,token,expectedAccount:account,expectedRevision:revision,fetcher:f.fetcher});

describe('P0-2 complete authorized catalog inventory and vetted reads',()=>{
 it('retrieves every permitted page without mutating and labels untested resource-specific tools',async()=>{
  const f=fake();
  const result=await runCatalogReadOnlySmoke(options(f));
  expect(result.ok).toBe(true);
  expect(result.catalogComplete).toBe(true);
  expect(result.coverageComplete).toBe(false);
  expect(result.summary.discovered).toBe(f.tools.length);
  expect(result.tools.find(t=>t.tool==='workspace_admin_get_user')).toMatchObject({
   status:'NOT_PROBED',reason:'requires_fixture_or_separate_approval'
  });
  expect(result.tools.find(t=>t.tool==='workspace_call')).toMatchObject({
   status:'NOT_PROBED',reason:'protected_dispatcher_not_invoked'
  });
  expect(result.tools.find(t=>t.tool==='workspace_gmail_get_profile').status).toBe('PASS');
  const invoked=f.calls.filter(c=>c.method==='POST').map(c=>c.path.slice('/api/tools/'.length));
  expect(invoked.every(t=>SAFE_READ_PROBES.some(p=>p.name===t))).toBe(true);
  expect(invoked).not.toContain('workspace_call');
  // Match the actual handler schemas, not an ignored Google pageSize option.
  for(const name of ['workspace_drive_list_files','workspace_drive_list_recent_files','workspace_drive_list_trash']){
   expect(f.calls.find(c=>c.path==='/api/tools/'+name)?.body).toEqual({maxResults:1,detail:'full'});
  }
  expect(f.calls.find(c=>c.path==='/api/tools/workspace_drive_list_starred')?.body).toEqual({detail:'full'});
  expect(f.calls.every(c=>JSON.stringify(c).includes(token)===false)).toBe(true);
 });
 it('handles more than one complete page and records every result exactly once',async()=>{
  const tools=Array.from({length:201},(_,i)=>({
   name:'workspace_fixture_read_'+String(i).padStart(3,'0'),
   area:'workspace',writes:false,annotations:{readOnlyHint:true}
  }));
  const f=fake({catalog:tools});
  const result=await readAuthorizedCatalog({origin,token,fetcher:f.fetcher});
  expect(result).toHaveLength(201);
  expect(new Set(result.map(x=>x.name)).size).toBe(201);
  expect(f.calls.filter(x=>x.path==='/api/tools')).toHaveLength(3);
 });
 it('fails closed on duplicate names, unsafe writes, cursor loops and malformed pages',async()=>{
  const base={name:'workspace_gmail_get_profile',writes:false,annotations:{readOnlyHint:true}};
  const invalid=[
   [base,base],
   [{...base,writes:true}],
   [{...base,annotations:{readOnlyHint:false}}],
   [{...base,name:'workspace_admin_delete_user',writes:true}]
  ];
  for(const catalog of invalid){
   const f=fake({catalog});
   await expect(readAuthorizedCatalog({origin,token,fetcher:f.fetcher})).rejects.toThrow('unsafe_or_duplicate');
  }
  const looping=fake({catalog:[base],cycle:true});
  await expect(readAuthorizedCatalog({origin,token,fetcher:looping.fetcher})).rejects.toThrow('bad_cursor');
 });
 it('rejects wrong deployed source or real Gmail identity before broad catalog reads',async()=>{
  const mismatch=fake({revisionFound:'e'.repeat(40)});
  await expect(runCatalogReadOnlySmoke(options(mismatch))).rejects.toThrow('revision mismatch');
  expect(mismatch.calls).toHaveLength(1);
  const wrong=fake({wrongMailbox:true});
  const report=await runCatalogReadOnlySmoke(options(wrong));
  expect(report).toMatchObject({ok:false,catalogComplete:false});
  expect(wrong.calls.some(x=>x.path==='/api/tools'&&!x.tool)).toBe(false);
 });
 it('reports one genuine read denial as failed without claiming an entirely green catalog',async()=>{
  const f=fake({failedTool:'workspace_gmail_get_pop_settings'});
  const result=await runCatalogReadOnlySmoke(options(f));
  expect(result.ok).toBe(false);
  expect(result.catalogComplete).toBe(true);
  expect(result.tools.find(t=>t.tool==='workspace_gmail_get_pop_settings')).toMatchObject({
   status:'FAIL',reason:'provider_read_failed'
  });
  expect(result.summary.failed).toBe(1);
 });
 it('treats disagreement between complete catalog and exact-name lookup as a failed probe',async()=>{
  const f=fake({missingProbe:'workspace_gmail_get_pop_settings'});
  const result=await runCatalogReadOnlySmoke(options(f));
  expect(result.ok).toBe(false);
  expect(result.catalogComplete).toBe(true);
  expect(result.tools.find(t=>t.tool==='workspace_gmail_get_pop_settings')).toMatchObject({
   status:'FAIL',reason:'advertised_probe_unavailable'
  });
 });
 it('cannot run real RTC calls by default or without a protected TEST pass',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(await main([],{})).toBe(2);
  expect(await main(['--authorized-catalog'],{RTC_ORIGIN:origin})).toBe(2);
  spy.mockRestore();
 });
});
