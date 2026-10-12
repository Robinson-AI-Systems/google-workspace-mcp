import {describe,it,expect} from 'vitest';
import {makeFakeClients} from '../helpers/fake-google.js';
import {scoreApps,scoreForwarding,scoreGroups,scoreSharing,scoreLicences,healthReport} from '../../src/tools/health-report.js';
import {attachStructuredResult} from '../../src/rtc/structured.js';
import {ok} from '../../src/tools/util.js';

const NOW=Date.parse('2026-10-12T00:00:00Z');
const active=(email,admin=false)=>({
 primaryEmail:email,isAdmin:admin,isEnrolledIn2Sv:true,isEnforcedIn2Sv:true,
 recoveryEmail:'recovery@example.test',lastLoginTime:'2026-10-11T00:00:00Z',
 creationTime:'2026-01-01T00:00:00Z',orgUnitPath:'/Staff'
});
const find=(report,start)=>report.checks.find(x=>x.check.startsWith(start));
function fake(){
 const f=makeFakeClients({actingAs:'ops@example.test'});
 f.when('admin.users.list').resolves({data:{users:[active('a@example.test',true),active('b@example.test',true)]}});
 f.when('admin.tokens.list').resolves({data:{items:[]}});
 f.when('admin.groups.list').resolves({data:{groups:[]}});
 f.when('admin.customers.get').resolves({data:{id:'C123'}});
 f.when('licensing.licenseAssignments.listForProduct').resolves({data:{items:[]}});
 f.when('drive.files.list').resolves({data:{files:[]}});
 return f;
}
const opts={now:NOW,delegationReady:false};

describe('evidence completeness for security and license health reports',()=>{
 it('fails to green when a subset of application access cannot be inspected',()=>{
  expect(scoreApps({},2).status).toBe('WARN');
  expect(scoreApps({},0,1).status).toBe('WARN');
  expect(scoreApps({a:[{displayText:'Risk',scopes:['https://mail.google.com/']}]},2,1).status).toBe('FAIL');
  expect(scoreApps({a:[]},0,0).status).toBe('PASS');
 });
 it('refuses an all-clear when mailboxes or group settings remain unchecked',()=>{
  const own=new Set(['example.test']);
  expect(scoreForwarding({},own,2).status).toBe('WARN');
  expect(scoreForwarding({},own,0,1).status).toBe('WARN');
  expect(scoreForwarding({a:{enabled:true,emailAddress:'outside.test@example.net'}},own,2,1).status).toBe('FAIL');
  expect(scoreGroups({},9).status).toBe('WARN');
  expect(scoreGroups({a:{whoCanPostMessage:'ANYONE_CAN_POST'}},9).status).toBe('WARN');
  expect(scoreGroups({a:{whoCanPostMessage:'ALL_IN_DOMAIN_CAN_POST'}},0).status).toBe('PASS');
 });
 it('never treats unread license assignments or truncated Drive as fully safe',()=>{
  const users=[active('a@example.test')];
  expect(scoreLicences(users,['a@example.test'],NOW,{partial:true}).status).toBe('WARN');
  expect(scoreLicences(users,['a@example.test'],NOW).status).toBe('PASS');
  expect(scoreSharing([],{complete:false}).status).toBe('WARN');
  expect(scoreSharing([],{complete:true}).status).toBe('PASS');
  expect(scoreSharing([{name:'Public file'}],{complete:false}).found).toMatch(/More pages remain unread/);
 });
 it('surfaces Directory paging as an explicit warning check',async()=>{
  const f=fake();
  f.when('admin.users.list').resolves({data:{
   users:[active('a@example.test',true),active('b@example.test',true)],
   nextPageToken:'another-page'
  }});
  const report=await healthReport('all',f.clients,opts);
  expect(find(report,'Directory coverage').status).toBe('WARN');
  expect(find(report,'Directory coverage').found).toMatch(/additional directory records/);
  expect(report.summary.warn).toBeGreaterThan(0);
  expect(attachStructuredResult('workflow_health_report',ok(report)).structuredContent).toEqual(report);
 });
 it('surfaces unobserved Drive pages without creating false sharing reassurance',async()=>{
  const f=fake();
  f.when('drive.files.list').resolves({data:{files:[],nextPageToken:'another-page'}});
  const report=await healthReport('all',f.clients,opts);
  expect(find(report,'Drive files').status).toBe('WARN');
  expect(find(report,'Drive files').found).toMatch(/more visible files remain unread/);
  expect(f.calls.find(c=>c.path==='drive.files.list').args[0].fields).toMatch(/nextPageToken/);
 });
 it('marks license page caps incomplete without hiding confirmed risk',async()=>{
  const f=fake();
  f.when('licensing.licenseAssignments.listForProduct').resolves({data:{items:[{userId:'a@example.test'}],nextPageToken:'still-more'}});
  const report=await healthReport('all',f.clients,opts);
  expect(find(report,'Paid licences').status).toBe('WARN');
  expect(find(report,'Paid licences').found).toMatch(/pages remain unread/);
 });
});
