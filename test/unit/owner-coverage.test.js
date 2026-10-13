import {describe,it,expect} from 'vitest';
import {buildAdminOverview} from '../../src/tools/admin-overview.js';
import {planSummary} from '../../src/tools/ops.js';
import {ok} from '../../src/tools/util.js';
const c={actingAs:'ops@example.test',rtcPolicy:{profile:'full'}};
const names=['2-Step Verification','Super admins','2-Step enforcement','Third-party app access','Automatic forwarding of mail','Groups open to outsiders'];
const checks=names.map(check=>({check,status:'PASS',found:'Observed',fix:null}));
function sources(override={}){
 return {
  workspace_whoami:{matches:true,gmailReports:c.actingAs},
  admin_get_customer_info:{id:'C123',customerDomain:'example.test'},
  admin_list_domains:[{domainName:'example.test',verified:true}],
  workflow_health_report:{scope:'example.test',summary:{pass:checks.length,warn:0,fail:0,info:0},checks},
  workflow_email_health:{domain:'example.test',summary:{pass:1,warn:0,fail:0,info:0},checks:[{check:'DNS',status:'PASS',found:'Observed'}]},
  workflow_security_snapshot:{totalUsers:2,usersWithout2StepVerification:[],superAdmins:['a','b'],recentAlerts:[],complete:true,alertsReadable:true,coverage:{alertCenterComplete:true}},
  workspace_plan_summary:{totalLicensesAssigned:2,plans:[{assigned:2}],truncated:false},...override
 };
}
const run=(over={},clients=c,opts={})=>{const values=sources(over);return buildAdminOverview(clients,async name=>ok(values[name]),opts);};
describe('complete owner-side evidence sections',()=>{
 it('covers every overview category with actual positive evidence',async()=>{
  const r=await run();
  for(const name of ['organization','domains','users_admins','two_step_enforcement','third_party_app_access','forwarding','groups_external','verification_dns','licenses_plan','recent_security_alerts'])expect(r.items[name].status,name).toBe('ok');
 });
 it('retains serious findings and distinguishes unobserved forwarding and enforcement',async()=>{
  const selected=checks.map(x=>x.check==='Third-party app access'?{...x,status:'FAIL',found:'Observed risky grant'}:
   x.check==='Automatic forwarding of mail'?{...x,status:'INFO',found:'Not checked: delegation unavailable'}:x);
  const health={scope:'example.test',summary:{pass:4,warn:0,fail:1,info:1},checks:selected};
  const r=await run({workflow_health_report:health,admin_list_domains:[{domainName:'example.test',verified:false}]});
  expect(r.items.third_party_app_access.status).toBe('needs_attention');
  expect(r.items.forwarding.status).toBe('not_readable');expect(r.items.domains.status).toBe('needs_attention');
 });
 it('never promotes passing user checks from an incomplete Directory scan',async()=>{
  const r=await run({workflow_health_report:{scope:'example.test',summary:{pass:6,warn:1,fail:0,info:0},checks:[...checks,{check:'Directory coverage',status:'WARN',found:'More users remain'}]}});
  expect(r.items.two_step_enforcement.status).toBe('not_readable');expect(r.items.users_admins.status).toBe('not_readable');
 });
 it('refuses missing checks, partial licensing, incomplete alerts and malformed organization',async()=>{
  const r=await run({workflow_health_report:{checks:[]},workspace_plan_summary:{totalLicensesAssigned:2,plans:[{assigned:2}],truncated:true},
   workflow_security_snapshot:{totalUsers:2,usersWithout2StepVerification:[],superAdmins:['a','b'],recentAlerts:[],complete:true,alertsReadable:false},admin_get_customer_info:{}});
  expect(r.items.organization.status).toBe('not_readable');expect(r.items.two_step_enforcement.status).toBe('not_readable');
  expect(r.items.licenses_plan.status).toBe('not_readable');expect(r.items.recent_security_alerts.status).toBe('not_readable');
 });
 it('requires customer-wide intent for organization and domains, and respects areas',async()=>{
  const called=[],values=sources();
  const clients={...c,allowedDomains:['example.test']};
  await buildAdminOverview(clients,async name=>{called.push(name);return ok(values[name]);});
  expect(called).not.toContain('admin_get_customer_info');expect(called).not.toContain('admin_list_domains');
  const r=await run({},clients,{crossDomain:true});expect(r.items.organization.status).toBe('ok');
  const restricted=await run({}, {...c,rtcPolicy:{profile:'read_only',areas:['workspace']}},{crossDomain:true});
  expect(restricted.items.organization.status).toBe('not_readable');expect(restricted.items.two_step_enforcement.status).toBe('not_readable');
 });
 it('stops license pagination cycles without re-counting the repeated page and retains partial evidence',async()=>{
  let calls=0;
  const clients={licensing:{licenseAssignments:{listForProduct:async()=>{calls++;return {data:{items:[{skuId:'1010020027'}],nextPageToken:'repeat'}};}}}};
  const r=await planSummary(clients,{customerId:'C123'});
  expect(calls).toBe(2);expect(r).toMatchObject({truncated:true,coverage:{complete:false,pagesRead:2,limitReason:'pagination_cycle'}});
  expect(r.plans[0].assigned).toBe(2);
 });
});
