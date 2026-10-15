import {describe,it,expect} from 'vitest';
import baseline from '../../src/data/policy-baseline.json' with {type:'json'};
import {evaluateBaseline,validateBaseline,handlers} from '../../src/tools/policy-audit.js';

const row=(type,field,value,name='policies/'+type.replace(/[^a-zA-Z0-9]/g,'-')+'-'+field)=>({name,type:'ADMIN',policyQuery:{orgUnit:'orgUnits/root'},setting:{type,value:{[field]:value}}});
describe('P7-2 expanded policy baseline and incomplete-audit correctness',()=>{
 it('uses 21 published, editable, unique reference rules across seven supported areas',()=>{
  expect(validateBaseline()).toHaveLength(37);
  expect(new Set(baseline.map(x=>x.type+'#'+x.field)).size).toBe(baseline.length);
  for(const area of ['gmail','drive_and_docs','calendar','chat','meet','devices','security','api_controls','groups_for_business','workspace_marketplace'])expect(baseline.some(r=>r.area===area)).toBe(true);
  expect(baseline.every(x=>x.consoleQuery.length>0)).toBe(true);
 });
 it('refuses invalid and duplicate rule configuration instead of silently reporting green',()=>{
  const example=baseline[0];
  for(const bad of [
   [example,example],
   [{...example,area:'../../config'}],
   [{...example,field:'constructor.prototype'}],
   [{...example,expected:{arbitrary:1}}],
   [{...example,comparator:'eval'}],
   [{...example,comparator:'atLeast'}]
  ])expect(()=>validateBaseline(bad)).toThrow();
 });
 it('keeps known violations visible even when pagination or other policy values are incomplete',()=>{
  const type='settings/gmail.external_recipient_warning';
  const finding=evaluateBaseline([row(type,'enabled',false)],{chosen:'gmail',complete:false}).find(r=>r.policySetting===type);
  expect(finding.status).toBe('needs_attention');
  expect(finding.reason).toMatch(/observed explicit policies differ/);
  const mixed=evaluateBaseline([row(type,'enabled',true),row(type,'enabled',false,'policies/other')],{chosen:'gmail'});
  expect(mixed.find(r=>r.policySetting===type).status).toBe('needs_attention');
  const missing=evaluateBaseline([row(type,'unknown',false)],{chosen:'gmail'});
  expect(missing.find(r=>r.policySetting===type).status).toBe('not_readable');
 });
 it('supports a documented minimum password length rather than exact equality',()=>{
  const type='settings/security.password',field='minimumLength';
  const check=n=>evaluateBaseline([row(type,field,n)],{chosen:'security'}).find(r=>r.field===field);
  expect(check(16).status).toBe('ok');
  expect(check(12).status).toBe('ok');
  expect(check(10).status).toBe('needs_attention');
  expect(check('12').status).toBe('needs_attention');
  expect(check(16).comparator).toBe('atLeast');
 });
 it('returns useful support/coverage without guessing missing configuration',async()=>{
  const clients={cloudidentity:{policies:{list:async()=>({data:{policies:[row('settings/meet.safety_external_participants','enable_external_label',false)]}})}},crossDomain:true};
  const result=JSON.parse((await handlers.identity_policy_audit({domain:'rentals.example',area:'meet'},clients)).content[0].text);
  expect(result.complete).toBe(true);
  expect(result.areasWithRules).toContain('meet');
  expect(result.baselineRules).toBe(37);
  expect(result.summary.needsAttention).toBe(1);
  expect(result.results[1].status).toBe('not_readable');
 });
});

describe('P7-2 owner audit of Google-documented organization access and sharing controls',()=>{
 it('includes typed known Google Policy API fields for third-party apps, groups and Marketplace',()=>{
  for(const [type,field,expected] of [
   ['settings/api_controls.unconfigured_third_party_apps','access_level','BLOCK_ALL'],
   ['settings/groups_for_business.groups_sharing','ownersCanAllowExternalMembers',false],
   ['settings/workspace_marketplace.apps_access_options','access_level','ALLOW_LISTED_APPS'],
   ['settings/calendar.primary_calendar_max_allowed_external_sharing','max_allowed_external_sharing','EXTERNAL_FREE_BUSY_ONLY'],
   ['settings/chat.chat_file_sharing','external_file_sharing','NO_FILES']
  ]) {
   const rule=baseline.find(r=>r.type===type&&r.field===field);
   expect(rule.expected).toBe(expected);
   const matching=evaluateBaseline([row(type,field,expected)],{chosen:rule.area}).find(r=>r.field===field&&r.policySetting===type);
   expect(matching.status).toBe('ok');
   expect(matching.area).toBe(rule.area);
  }
 });
 it('reports known policy deviations by area without calling unknown policies green',async()=>{
  const policies=[
   row('settings/api_controls.unconfigured_third_party_apps','access_level','ALLOW_SIGN_IN_ONLY'),
   row('settings/groups_for_business.groups_sharing','ownersCanAllowExternalMembers',true),
   row('settings/workspace_marketplace.apps_access_options','access_level','ALLOW_ALL')
  ];
  const clients={cloudidentity:{policies:{list:async()=>({data:{policies}})}},crossDomain:true};
  const result=JSON.parse((await handlers.identity_policy_audit({domain:'example.com'},clients)).content[0].text);
  expect(result.baselineRules).toBe(37);
  expect(result.areasWithRules).toHaveLength(10);
  for(const area of ['api_controls','groups_for_business','workspace_marketplace']){
   const item=result.coverageByArea.find(r=>r.area===area);
   expect(item.needsAttention).toBe(1);
   expect(item.checks).toBeGreaterThan(0);
   expect(item.notReadable).toBe(item.checks-1);
  }
  expect(result.summary.needsAttention).toBe(3);
  expect(result.summary.notReadable).toBe(34);
  expect(result.customerWide).toBe(true);
 });
 it('never runs customer-wide policy reads on a domain-restricted connection without owner cross-domain opt-in',async()=>{
  let calls=0;
  const clients={allowedDomains:['example.com'],cloudidentity:{policies:{list:async()=>{calls++;return {data:{policies:[]}}}}}};
  await expect(handlers.identity_policy_audit({domain:'example.com'},clients)).rejects.toThrow(/crossDomain: true/);
  expect(calls).toBe(0);
 });
});
