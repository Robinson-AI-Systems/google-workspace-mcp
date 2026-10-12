import {describe,it,expect,vi} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {OUTPUT_SCHEMAS,attachStructuredResult} from '../../src/rtc/structured.js';
import {ok} from '../../src/tools/util.js';
import {makeFakeClients} from '../helpers/fake-google.js';

const names=['reports_activity','postmaster_list_domains','postmaster_list_traffic_stats','identity_list_policies','identity_policy_audit'];
const report={application:'calendar',activities:[{id:'abc'}],nextPageToken:'next'};
const domainList={domains:[{name:'domains/rentals.example'}],count:1,scopeFiltered:true,nextPageToken:'next'};
const traffic={domain:'rentals.example',stats:[{spammyFeedbackRatio:0.01}],nextPageToken:'next'};
const policyList={policies:[{name:'policies/test'}],scopeNote:'Customer-wide; not effective per-domain.',nextPageToken:null};
const audit={domain:'rentals.example',customerWide:true,complete:false,policiesRead:5,baselineRules:21,areasWithRules:['gmail'],scopeNote:'Customer-wide.',results:[{setting:'warn',policySetting:'settings/gmail.external_recipient_warning',field:'enabled',status:'needs_attention',observations:[{name:'policies/test',value:false}]}],summary:{needsAttention:1,notReadable:0,matchingExplicitPolicies:0}};
describe('P8-1 typed read API results',()=>{
 it('advertises five concrete schema contracts only for registered reads',()=>{
  for(const n of names){
   expect(registry.tools.find(t=>t.name===n)?.outputSchema).toEqual(OUTPUT_SCHEMAS[n]);
   expect(OUTPUT_SCHEMAS[n].anyOf).toHaveLength(2);
   expect(OUTPUT_SCHEMAS[n].anyOf[0].required.length).toBeGreaterThan(0);
  }
  expect(registry.tools.find(t=>t.name==='gmail_send_email').outputSchema).toBeUndefined();
 });
 it('attaches schema-verified structured content without a second copied payload',()=>{
  for(const [name,value] of Object.entries({reports_activity:report,postmaster_list_domains:domainList,postmaster_list_traffic_stats:traffic,identity_list_policies:policyList,identity_policy_audit:audit})){
   const result=attachStructuredResult(name,ok(value));
   expect(result.structuredContent,name).toEqual(value);
   expect(result.content[0].text).toBe(ok(value).content[0].text);
  }
 });
 it('fails closed on malformed success and preserves errors rather than faking readiness',()=>{
  for(const n of names){
   expect(attachStructuredResult(n,ok({status:'ready'})).isError,n).toBe(true);
   const providerFailure={...ok('no permission'),isError:true};
   expect(attachStructuredResult(n,providerFailure)).toBe(providerFailure);
  }
  const guarded=attachStructuredResult('identity_policy_audit',ok('Refused: outside what this connection may manage. Nothing was read.'));
  expect(guarded.isError).toBe(true);expect(guarded.structuredContent).toBeUndefined();
  expect(guarded.content[0].text).toMatch(/outside what this connection/);
  const falseReady=attachStructuredResult('identity_policy_audit',ok({...audit,results:[{...audit.results[0],status:'certified'}]}));
  expect(falseReady.isError).toBe(true);
 });
 it('uses only connection-owned expiring handles for oversized structured results',()=>{
  for(const name of names){
   const handle={handle:'rtc_result_'+'x'.repeat(32),bytes:64000,count:50,summary:'Stored for this connection'};
   expect(attachStructuredResult(name,ok(handle)).structuredContent).toEqual(handle);
   expect(attachStructuredResult(name,ok({...handle,handle:'foreign'})).isError).toBe(true);
  }
 });
 it('preserves explicitly projected fields without falsely requiring the full typed schema',async()=>{
  const {clients}=makeFakeClients();clients.connection='c1';
  const output=await registry.handlers.workflow_security_snapshot({fields:'totalUsers'},clients);
  expect(output.isError).not.toBe(true);
  expect(output.structuredContent).toBeUndefined();
  expect(JSON.parse(output.content[0].text)).toEqual({totalUsers:0});
 });
 it('returns actual typed runtime data for Reports and Postmaster fake reads',async()=>{
  const clients={adminReports:{activities:{list:vi.fn(async()=>({data:{items:[{id:'x'}],nextPageToken:'n'}}))}},postmaster:{domains:{list:vi.fn(async()=>({data:{domains:[{name:'domains/rentals.example'}]}})),trafficStats:{list:vi.fn(async()=>({data:{trafficStats:[{name:'stat'}]}}))}}},actingAs:'ops@rentals.example',allowedDomains:['rentals.example'],connection:'c1'};
  const reports=await registry.handlers.reports_activity({application:'calendar'},clients);
  expect(reports.structuredContent.activities).toHaveLength(1);
  const domains=await registry.handlers.postmaster_list_domains({},clients);
  expect(domains.structuredContent.domains).toHaveLength(1);expect(domains.structuredContent.count).toBe(1);
  const stats=await registry.handlers.postmaster_list_traffic_stats({domain:'rentals.example',startDate:'2026-10-01',endDate:'2026-10-10'},clients);
  expect(stats.structuredContent.domain).toBe('rentals.example');
 });
});
