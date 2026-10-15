import {describe,it,expect} from 'vitest';
import {READ_ONLY_TOOL_NAMES} from '../../src/rtc/read-only-semantics.js';
import {SAFE_READ_PROBES} from '../../scripts/smoke-readonly-catalog.mjs';
import {FIXTURE_TOOL_NAMES} from '../../scripts/smoke-readonly-fixtures.mjs';
import {EXTRA_READ_CASES,parseReviewedReadCases,validateReviewedCase,verifyAdditionalRead} from '../../scripts/smoke-readonly-cases.mjs';
import {planCatalogReads,coverageResults} from '../../scripts/smoke-readonly-plan.mjs';
import {verifiedProviderReadResult} from '../../scripts/smoke-provider-shapes.mjs';

const account='scratch@example.test';
const schema=(props={},required=[])=>({type:'object',properties:props,required});
const tool=(name,area,inputSchema)=>({name,area,writes:false,
 annotations:{readOnlyHint:true},inputSchema});
describe('P0-2 reviewed catalog-wide read cases',()=>{
 it('exhaustively covers original audited read inventory without trusting name prefixes',()=>{
  const safe=new Set(SAFE_READ_PROBES.map(x=>x.name));
  const fixtures=new Set(FIXTURE_TOOL_NAMES);
  const additional=Object.keys(EXTRA_READ_CASES);
  expect(additional).toHaveLength(123);
  expect(new Set(additional).size).toBe(additional.length);
  for(const name of READ_ONLY_TOOL_NAMES){
   const rtc='workspace_'+name;
   expect(safe.has(rtc)||fixtures.has(rtc)||Object.hasOwn(EXTRA_READ_CASES,rtc),
    name).toBe(true);
  }
  for(const name of additional){
   expect(READ_ONLY_TOOL_NAMES.has(name.slice(10))).toBe(true);
   expect(safe.has(name)||fixtures.has(name)).toBe(false);
  }
  expect(Object.hasOwn(EXTRA_READ_CASES,'workspace_admin_delete_user')).toBe(false);
 });
 it('refuses unreviewed names, duplicate cases, unknown keys, broad scans and mutations',()=>{
  const one={name:'workspace_admin_list_users',args:{maxResults:1}};
  expect(parseReviewedReadCases(JSON.stringify([one]))).toEqual([one]);
  for(const entries of [
   [{name:'workspace_admin_delete_user',args:{}}],
   [one,one],
   [{name:one.name,args:{maxResults:100}}],
   [{name:'workspace_admin_get_user',args:{userKey:'all'}}],
   [{name:'workspace_admin_get_user',args:{userKey:'*'}}]
  ]){
   if(entries[0].name===one.name&&entries.length===1){
    expect(validateReviewedCase(entries[0],
     tool(one.name,'admin',schema({maxResults:{type:'integer',minimum:1,maximum:100}})))).toBe(false);
   }else if(entries[0].name==='workspace_admin_get_user'&&entries.length===1){
    expect(validateReviewedCase(entries[0],tool(entries[0].name,'admin',
     schema({userKey:{type:'string'}},['userKey'])))).toBe(false);
   }else expect(()=>parseReviewedReadCases(entries)).toThrow();
  }
  expect(()=>parseReviewedReadCases('{}')).toThrow();
  expect(()=>parseReviewedReadCases(Array(124).fill(one))).toThrow();
 });
 it('uses deployed input schema and refuses extra args, missing IDs, drift and unsafe nested data',()=>{
  const t=tool('workspace_admin_get_user','admin',
   schema({userKey:{type:'string'}},['userKey']));
  const good={name:t.name,args:{userKey:account}};
  expect(validateReviewedCase(good,t)).toBe(true);
  expect(validateReviewedCase({name:t.name,args:{}},t)).toBe(false);
  expect(validateReviewedCase({name:t.name,args:{userKey:account,confirm:true}},t)).toBe(false);
  expect(validateReviewedCase({name:t.name,args:{userKey:'a\\nb'}},t)).toBe(false);
  expect(validateReviewedCase(good,{...t,writes:true})).toBe(false);
  expect(validateReviewedCase(good,{...t,inputSchema:schema({other:{type:'string'}})})).toBe(false);
 });
 it('does not treat arbitrary HTTP 200 data or foreign identifiers as Google evidence',()=>{
  const name='workspace_admin_get_user';
  expect(verifyAdditionalRead(name,{id:'id1',primaryEmail:account},account,{userKey:account})).toBe(true);
  expect(verifyAdditionalRead(name,{id:'id1',primaryEmail:'foreign@example.test'},account,{userKey:account})).toBe(false);
  for(const data of [null,undefined,{ok:true},{result:{}},{error:'denied'},
   {message:'success'},{data:{}},'OK']){
   expect(verifiedProviderReadResult(name,data,account,{userKey:account})).toBe(false);
  }
  expect(verifyAdditionalRead('workspace_admin_list_users',{users:[{primaryEmail:account}]},account)).toBe(true);
  expect(verifyAdditionalRead('workspace_admin_list_users',{users:[{}]},account)).toBe(false);
  expect(verifyAdditionalRead('workspace_admin_list_users',{},account)).toBe(false);
  expect(verifyAdditionalRead('workspace_chat_list_spaces',[],account)).toBe(true);
  expect(verifyAdditionalRead('workspace_chat_list_spaces',[{}],account)).toBe(false);
  expect(verifyAdditionalRead('workspace_reports_activity',{application:'login',activities:[]},account)).toBe(true);
  expect(verifyAdditionalRead('workspace_docs_get_text','Hello from an owned test doc',account)).toBe(true);
  expect(verifyAdditionalRead('workspace_admin_delete_user',{id:'x'},account)).toBe(false);
 });
 it('requires explicit owner cases rather than silently running admin or report reads',()=>{
  const name='workspace_admin_get_user';
  const t=tool(name,'admin',schema({userKey:{type:'string'}},['userKey']));
  const missing=planCatalogReads({catalog:[t],safeProbes:SAFE_READ_PROBES,account});
  expect(missing.find(x=>x.name===name)).toMatchObject({kind:'NEEDS_CASE'});
  expect(missing.find(x=>x.name===name).probe).toBeUndefined();
  const [entry]=planCatalogReads({catalog:[t],safeProbes:SAFE_READ_PROBES,
   reviewedCases:parseReviewedReadCases([{name,args:{userKey:account}}]),account})
   .filter(x=>x.name===name);
  expect(entry).toMatchObject({kind:'CASE',area:'admin'});
  const absent=coverageResults([entry]);
  expect(absent.coverageComplete).toBe(false);
  expect(absent.tools[0]).toMatchObject({status:'FAIL',reason:'scheduled_probe_not_executed'});
  expect(coverageResults([entry],[{tool:name,status:'PASS'}]).coverageComplete).toBe(true);
 });
});
