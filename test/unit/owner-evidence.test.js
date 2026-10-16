import {describe,it,expect} from 'vitest';
import {ok} from '../../src/tools/util.js';
import {buildAdminOverview,handlers as overviewHandlers} from '../../src/tools/admin-overview.js';

const account='ops@example.test';
const clients=(extra={})=>({actingAs:account,rtcPolicy:{profile:'full'},...extra});
const identity={actingAs:account,gmailReports:account,matches:true};
const health=(fail=0,warn=0)=>({
 scope:'example.test',
 summary:{pass:1,fail,warn,info:0},
 checks:[{check:'Domain security',status:fail?'FAIL':warn?'WARN':'PASS',found:'checked'}]
});
const security={totalUsers:3,usersWithout2StepVerification:[],superAdmins:['a@example.test','b@example.test'],
 recentAlerts:[],complete:true,alertsReadable:true};
const licenses={plans:[{assigned:2}],totalLicensesAssigned:2};
function fake(responses,invoked=[]){
 return async name=>{
  invoked.push(name);
  const v=responses[name];
  if(v instanceof Error)throw v;
  return typeof v==='string'?ok(v):ok(v??{});
 };
}
const base={
 workspace_whoami:identity,
 workflow_health_report:health(),
 workflow_email_health:health(),
 workflow_security_snapshot:security,
 workspace_plan_summary:licenses
};
describe('owner overview evidence and business isolation',()=>{
 it('classifies structured WARN and FAIL summaries even without warning text',async()=>{
  const r=await buildAdminOverview(clients(),fake({...base,
   workflow_email_health:health(1),workflow_health_report:health(0,1)}));
  expect(r.items.email.status).toBe('needs_attention');
  expect(r.items.health.status).toBe('needs_attention');
  expect(r.items.identity.status).toBe('ok');
  expect(r.items.security.status).toBe('ok');
 });
 it('does not label an identity mismatch as healthy',async()=>{
  const r=await buildAdminOverview(clients(),fake({...base,
   workspace_whoami:{actingAs:account,gmailReports:'other@example.test',matches:false}}));
  expect(r.items.identity.status).toBe('needs_attention');
 });
 it('cannot turn a guard refusal, missing totals or malformed response green',async()=>{
  const r=await buildAdminOverview(clients(),fake({...base,
   workflow_email_health:'Refused: outside this connection; nothing was read.',
   workflow_health_report:{},
   workspace_plan_summary:{plans:[{assigned:4}],totalLicensesAssigned:3}}));
  for(const section of ['email','health','licenses'])
   expect(r.items[section].status,section).toBe('not_readable');
 });
 it('requires explicit cross-domain intent before running customer-wide sources',async()=>{
  const called=[];
  const r=await buildAdminOverview(clients({allowedDomains:['example.test']}),fake(base,called));
  expect(called).not.toContain('workflow_security_snapshot');
  expect(called).not.toContain('workspace_plan_summary');
  expect(called).toContain('workflow_health_report');
  expect(called).toContain('workflow_email_health');
  expect(r.items.security).toMatchObject({status:'not_readable'});
  expect(r.items.licenses).toMatchObject({status:'not_readable'});
  expect(r.items.email.status).toBe('ok');
 });
 it('permits explicitly authorized broad diagnostic intent without changing the account',async()=>{
  const called=[];
  const r=await buildAdminOverview(clients({allowedDomains:['example.test']}),fake(base,called),{crossDomain:true});
  expect(called).toContain('workflow_security_snapshot');
  expect(called).toContain('workspace_plan_summary');
  expect(r.account).toBe(account);
  expect(r.items.security.status).toBe('ok');
 });
 it('marks paginated users and unreadable alerts as not readable, not as zero alerts',async()=>{
  for(const partial of [{...security,complete:false},{...security,alertsReadable:false}]){
   const r=await buildAdminOverview(clients(),fake({...base,workflow_security_snapshot:partial}));
   expect(r.items.security.status).toBe('not_readable');
  }
 });
 it('preserves an observed security warning when another security source is incomplete',async()=>{
  const r=await buildAdminOverview(clients(),fake({...base,
   workflow_security_snapshot:{...security,complete:false,alertsReadable:false,
    usersWithout2StepVerification:['one@example.test']}}));
  expect(r.items.security.status).toBe('needs_attention');
 });
 it('treats an INFO check that explicitly says not checked as incomplete',async()=>{
  const r=await buildAdminOverview(clients(),fake({...base,
   workflow_health_report:{
    scope:'example.test',summary:{pass:1,warn:0,fail:0,info:1},
    checks:[{check:'2SV',status:'PASS',found:'checked'},
     {check:'Forwarding',status:'INFO',found:'Not checked: delegation is unavailable'}]
   }}));
  expect(r.items.health.status).toBe('not_readable');
 });
 it('isolates child exceptions instead of aborting other sections',async()=>{
  const r=await buildAdminOverview(clients(),fake({...base,workflow_email_health:new Error('Provider refused')}));
  expect(r.items.email.status).toBe('not_readable');
  expect(r.items.identity.status).toBe('ok');
 });
});

describe('P8-8 owner policy review from actual P7-2 evidence',()=>{
 const policyRule=(area,status)=>({area,status,setting:area+' example'});
 const policyData=(over={})=>{
  const results=[
   policyRule('api_controls','ok'),policyRule('groups_for_business','ok'),
   policyRule('workspace_marketplace','ok')];
  return {domain:'example.test',customerWide:true,complete:true,baselineRules:3,results,
   coverageByArea:results.map(x=>({area:x.area,checks:1,matchingExplicitPolicies:1,needsAttention:0,notReadable:0})),
   summary:{matchingExplicitPolicies:3,needsAttention:0,notReadable:0},...over};
 };
 it('surfaces confirmed owner policy findings separately from observed third-party app tokens',async()=>{
  const data=policyData(),results=data.results.map(x=>x.area==='api_controls'?{...x,status:'needs_attention'}:x);
  const custom={...data,results,summary:{matchingExplicitPolicies:2,needsAttention:1,notReadable:0},
   coverageByArea:data.coverageByArea.map(x=>x.area==='api_controls'?{...x,matchingExplicitPolicies:0,needsAttention:1}:x)};
  const got=await buildAdminOverview(clients(),fake({...base,identity_policy_audit:custom}));
  expect(got.items.policies.status).toBe('needs_attention');
  expect(got.items.third_party_app_policy.status).toBe('needs_attention');
  expect(got.items.groups_sharing_policy.status).toBe('not_readable');
  expect(got.items.third_party_app_access.status).toBe('not_readable');
 });
 it('reports a complete reviewed explicit policy baseline without claiming effective user policy',async()=>{
  const got=await buildAdminOverview(clients(),fake({...base,identity_policy_audit:policyData()}));
  expect(got.items.policies.status).toBe('ok');
  expect(got.items.third_party_app_policy.status).toBe('ok');
  expect(got.items.groups_sharing_policy.status).toBe('ok');
  expect(got.items.marketplace_apps_policy.status).toBe('ok');
  expect(got.items.policies.reason).toMatch(/not proven/);
 });
 it('does not mark inherited, incomplete, malformed or partially paginated policy reports green',async()=>{
  for(const data of [
   policyData({complete:false}),
   policyData({summary:{matchingExplicitPolicies:99,needsAttention:0,notReadable:0}}),
   policyData({results:[]}),
   {},
  ]){
   const got=await buildAdminOverview(clients(),fake({...base,identity_policy_audit:data}));
   expect(got.items.policies.status).toBe('not_readable');
   expect(got.items.marketplace_apps_policy.status).toBe('not_readable');
  }
 });
 it('never reaches customer-wide policies without explicit crossDomain intent on a domain-restricted connection',async()=>{
  const called=[],restricted=clients({allowedDomains:['example.test']});
  const got=await buildAdminOverview(restricted,fake({...base,identity_policy_audit:policyData()},called));
  expect(called).not.toContain('identity_policy_audit');
  expect(got.items.policies.status).toBe('not_readable');
  expect(got.items.third_party_app_policy.status).toBe('not_readable');
 });
 it('passes single-call consent only to the permitted policy child without modifying persistent client authorization',async()=>{
  const seen=[];const restricted=clients({allowedDomains:['example.test']});
  const got=await buildAdminOverview(restricted,async(name,args,c)=>{
   if(name==='identity_policy_audit'){seen.push({name,args,authorized:c.crossDomain});return ok(policyData())}
   if(name==='workflow_health_report'){seen.push({name,authorized:c.crossDomain});return ok(health())}
   return ok(base[name]??{});
  },{crossDomain:true});
  expect(seen).toContainEqual({name:'identity_policy_audit',args:{domain:'example.test'},authorized:true});
  expect(seen).toContainEqual({name:'workflow_health_report',authorized:undefined});
  expect(restricted.crossDomain).toBeUndefined();
  expect(got.items.policies.status).toBe('ok');
 });
});


describe('selected owner overview reads',()=>{
 it('carries selection through the exported transport handler',async()=>{
  const r=await overviewHandlers.workspace_admin_overview({crossDomain:true,sections:['policies']},
   clients({rtcPolicy:{profile:'read_only',areas:['mail']}}));
  const data=JSON.parse(r.content[0].text);
  expect(Object.keys(data.items)).toEqual(['policies']);
  expect(data.items.policies).toMatchObject({status:'not_readable',reason:'Outside the permitted areas or connection profile.'});
 });
 it('calls only the authorized policy source and forwards scoped intent',async()=>{
  const called=[];
  const r=await buildAdminOverview(clients({allowedDomains:['example.test']}),async(name,args,c)=>{
   called.push({name,args,crossDomain:c.crossDomain});return ok({});
  },{crossDomain:true,sections:['policies']});
  expect(called).toEqual([{name:'identity_policy_audit',args:{domain:'example.test'},crossDomain:true}]);
  expect(Object.keys(r.items)).toEqual(['policies']);
  expect(r.items.policies.status).toBe('not_readable');
 });
 it('retains the customer-wide guard for selected policy reads',async()=>{
  const called=[];
  const r=await buildAdminOverview(clients({allowedDomains:['example.test']}),fake({},called),{sections:['policies']});
  expect(called).toEqual([]);
  expect(r.items.policies.status).toBe('not_readable');
 });
 it('retains the profile and area guard for selected policy reads',async()=>{
  const called=[];
  const r=await buildAdminOverview(clients({rtcPolicy:{profile:'read_only',areas:['mail']}}),fake({},called),{crossDomain:true,sections:['policies']});
  expect(called).toEqual([]);
  expect(r.items.policies.status).toBe('not_readable');
 });
 it.each([[],['policies','policies'],['unknown'],['constructor'],'policies',[null]].map(sections=>({sections})))('rejects invalid selection $sections before any read',async({sections})=>{
  const called=[];
  await expect(buildAdminOverview(clients(),fake({},called),{crossDomain:true,sections})).rejects.toThrow('Nothing was read');
  expect(called).toEqual([]);
 });
});
