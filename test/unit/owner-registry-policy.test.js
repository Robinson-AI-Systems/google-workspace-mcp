import {describe,it,expect,vi,beforeEach} from 'vitest';
const stored=vi.hoisted(()=>new Map());
vi.mock('../../src/db.js',async importOriginal=>({
 ...await importOriginal(),
 storeRtcResult:vi.fn(async row=>stored.set(row.handle,row)),
}));
import {registry} from '../../src/tools/index.js';
import {callReadForComposition,INLINE_BYTES} from '../../src/rtc/results.js';

const policy={name:'policies/blocked-apps',type:'ADMIN',policyQuery:{orgUnit:'orgUnits/0'},
 setting:{type:'settings/gmail.external_recipient_warning',value:{enabled:false}}};
const makeClients=()=>({actingAs:'ops@rentals.example',allowedDomains:['rentals.example'],
 connection:'fixture-owner',rtcPolicy:{profile:'read_only',areas:['workspace','identity']},
 cloudidentity:{policies:{list:vi.fn(async()=>({data:{policies:[policy]}}))}}});
const json=out=>JSON.parse(out.content[0].text);
beforeEach(()=>stored.clear());

describe('real-registry owner overview consumes full guarded policy evidence',()=>{
 it('keeps large evidence internal and budgets the final external overview',async()=>{
  const c=makeClients();
  const direct=json(await registry.handlers.identity_policy_audit({domain:'rentals.example',crossDomain:true},c));
  expect(direct.bytes).toBeGreaterThan(INLINE_BYTES);
  expect(direct.handle).toMatch(/^rtc_result_/);
  stored.clear();
  const out=await registry.handlers.workspace_admin_overview({crossDomain:true,detail:'full'},c);
  expect(out.isError).not.toBe(true);
  const handle=json(out).handle;
  const row=stored.get(handle);
  expect(row.connection).toBe('fixture-owner');
  expect(stored.size).toBe(1); // no intermediate child handles/storage
  const report=row.payload.data;
  expect(report.items.policies.status).toBe('needs_attention');
  expect(report.items.policies.data.results).toHaveLength(report.items.policies.data.baselineRules);
  expect(report.items.policies.data.results.length).toBeGreaterThan(30);
  expect(report.items.groups_sharing_policy.checks.length).toBeGreaterThan(0);
  expect(report.items.marketplace_apps_policy.checks.length).toBeGreaterThan(0);
  expect(c.crossDomain).toBeUndefined();
 });
 it('needs no child result store when evaluating a large in-process read',async()=>{
  const c=makeClients();delete c.connection;
  const data=json(await callReadForComposition(registry,'identity_policy_audit',
   {domain:'rentals.example',crossDomain:true},c));
  expect(Buffer.byteLength(JSON.stringify(data))).toBeGreaterThan(INLINE_BYTES);
  expect(data.results).toHaveLength(data.baselineRules);
  expect(stored.size).toBe(0);
 });
 it('retains domain, profile and customer-wide consent denials without provider reads',async()=>{
  const c=makeClients();
  const denied=await callReadForComposition(registry,'identity_policy_audit',{domain:'foreign.example'},c);
  expect(denied.content[0].text).toMatch(/Refused/);
  const noConsent=await callReadForComposition(registry,'identity_policy_audit',{domain:'rentals.example'},c);
  expect(noConsent.isError).toBe(true);
  c.rtcPolicy.areas=['workspace'];
  expect((await callReadForComposition(registry,'identity_policy_audit',
   {domain:'rentals.example',crossDomain:true},c)).isError).toBe(true);
  expect(c.cloudidentity.policies.list).not.toHaveBeenCalled();
 });
 it('cannot use the internal read route for writes, brokers or arbitrary handlers',async()=>{
  const c=makeClients(),fake=vi.fn();
  for(const name of ['gmail_send','workspace_call','workspace_get_result','invented_read'])
   expect((await callReadForComposition(registry,name,{},c)).isError).toBe(true);
  expect((await callReadForComposition({handlers:{identity_policy_audit:fake}},
   'identity_policy_audit',{}, {...c,rtcPolicy:{profile:'full'}})).isError).toBe(true);
  expect(fake).not.toHaveBeenCalled();
 });
});
