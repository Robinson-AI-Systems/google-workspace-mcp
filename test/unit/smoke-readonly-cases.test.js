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
 it('requires a separate customer-wide owner approval beyond opt-in manifest',()=>{
  const name='workspace_admin_list_users',inputSchema=schema({maxResults:{type:'integer',minimum:1,maximum:100}});
  const probe={name,args:{maxResults:1}};
  expect(validateReviewedCase(probe,tool(name,'admin',inputSchema))).toBe(false);
  expect(validateReviewedCase(probe,tool(name,'admin',inputSchema),{customerWideApproved:true})).toBe(true);
  const blocked=planCatalogReads({catalog:[tool(name,'admin',inputSchema)],
   safeProbes:SAFE_READ_PROBES,reviewedCases:[probe],account});
  expect(blocked.find(e=>e.name===name)).toMatchObject({kind:'NEEDS_APPROVAL',reason:'customer_wide_owner_approval_required'});
  expect(coverageResults(blocked).coverageComplete).toBe(false);
  const scheduled=planCatalogReads({catalog:[tool(name,'admin',inputSchema)],
   safeProbes:SAFE_READ_PROBES,reviewedCases:[probe],customerWideApproved:true,account});
  expect(scheduled.find(e=>e.name===name).kind).toBe('CASE');
 });
 it('rejects false Google success for actual handler-specific source contracts',()=>{
  const testCases=[
    ['workspace_admin_list_users',{users:[{}]},{}],
    ['workspace_reports_activity',{application:'drive',activities:[]},{application:'calendar'}],
    ['workspace_postmaster_list_domains',{domains:[],count:1},{}],
    ['workspace_calendar_verify_calendar_deletion',{exists:false,verification:'done'},{}],
    ['workspace_sheets_get_values',{range:'Sheet2!A1',values:[]},{range:'Sheet1!A1'}],
    ['workspace_gmail_get_attachment',{size:-1,base64Data:'abc'},{}],
    ['workspace_slides_get_thumbnail',{contentUrl:'javascript:alert(1)'},{}]
  ];
  for(const [name,payload,args] of testCases)
   expect(verifyAdditionalRead(name,payload,account,args),name).toBe(false);
  expect(verifyAdditionalRead('workspace_reports_activity',
    {application:'calendar',activities:[]},account,{application:'calendar'})).toBe(true);
  expect(verifyAdditionalRead('workspace_postmaster_list_domains',
    {domains:[],count:0},account,{})).toBe(true);
  expect(verifyAdditionalRead('workspace_calendar_verify_calendar_deletion',
    {exists:false,verification:'calendar_not_found',listed:false,metadataReadable:false},account,{})).toBe(true);
 });
 it('exhaustively covers original audited read inventory without trusting name prefixes',()=>{
  const safe=new Set(SAFE_READ_PROBES.map(x=>x.name));
  const fixtures=new Set(FIXTURE_TOOL_NAMES);
  const additional=Object.keys(EXTRA_READ_CASES);
  expect(additional).toHaveLength(123);
  expect(new Set(additional).size).toBe(additional.length);
  for(const name of READ_ONLY_TOOL_NAMES){
   const rtc=name.startsWith('workspace_')?name:'workspace_'+name;
   expect(safe.has(rtc)||fixtures.has(rtc)||Object.hasOwn(EXTRA_READ_CASES,rtc),
    name).toBe(true);
  }
  for(const name of additional){
   expect(READ_ONLY_TOOL_NAMES.has(name)||READ_ONLY_TOOL_NAMES.has(name.slice(10))).toBe(true);
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
  expect(validateReviewedCase({name:t.name,args:{userKey:'a'+String.fromCharCode(10)+'b'}},t)).toBe(false);
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
  expect(verifyAdditionalRead('workspace_admin_get_available_privileges',[{privilegeName:'test'}],account)).toBe(true);
  expect(verifyAdditionalRead('workspace_admin_list_user_aliases',['alias@example.test'],account)).toBe(true);
  expect(verifyAdditionalRead('workspace_admin_get_alert',{alertId:'alert-1'},account,{alertId:'alert-1'})).toBe(true);
  expect(verifyAdditionalRead('workspace_admin_get_alert',{alertId:'other-alert'},account,{alertId:'alert-1'})).toBe(false);
  expect(verifyAdditionalRead('workspace_slides_get_thumbnail',{contentUrl:'https://example.test/image'},account,{pageObjectId:'x'})).toBe(true);
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
