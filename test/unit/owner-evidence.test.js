import {describe,it,expect} from 'vitest';
import {ok} from '../../src/tools/util.js';
import {buildAdminOverview} from '../../src/tools/admin-overview.js';

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
