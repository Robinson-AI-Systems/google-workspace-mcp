import {describe,it,expect} from 'vitest';
import {planConsoleReadbacks,executeConsoleReadbacks,CONSOLE_LIVE_READBACK_IDS,
 validateConsoleExpectations,tools} from '../../src/tools/admin-console-verify.js';
import {CONSOLE_VERIFICATION} from '../../src/data/console-map.js';
import {ok} from '../../src/tools/util.js';
const account='owner@example.test',clients={actingAs:account,rtcPolicy:{profile:'read_only'}};
const cases={
 'drive-sharing':{scanned:3,filesWithExternalOrPublicSharing:[]},
 'reports':[{customerId:'my_customer',date:'2026-10-12'}],
 'license-assign-ui':[{userId:account,skuId:'Google-Apps-For-Business'}],
 'api-controls':{configured:true,scopesToAuthorize:['https://www.googleapis.com/auth/gmail.settings.basic']}
};
const readyInput={ids:Object.keys(cases),crossDomain:true,
 reportDate:'2026-10-12',skuId:'Google-Apps-For-Business'};
describe('P8-8 all 24 reviewed console provider readbacks',()=>{
 it('has a one-to-one mapping for every original reviewed provider tool',()=>{
  expect(CONSOLE_LIVE_READBACK_IDS).toHaveLength(Object.keys(CONSOLE_VERIFICATION).length);
  for(const id of Object.keys(CONSOLE_VERIFICATION))expect(CONSOLE_LIVE_READBACK_IDS).toContain(id);
  expect(planConsoleReadbacks(readyInput,clients).map(x=>x.status)).toEqual(Array(4).fill('eligible'));
 });
 it('uses partial statuses for bounded Drive sharing and customer reports/license/delegation',async()=>{
  const seen=[];
  const out=await executeConsoleReadbacks(readyInput,clients,async(tool,args)=>{
   seen.push({tool,args});
   const id=Object.keys(cases).find(x=>CONSOLE_VERIFICATION[x].tool===tool);
   return ok(cases[id]);
  });
  expect(out.complete).toBe(true);
  expect(out.summary).toMatchObject({total:4,observedPartial:4,notReadable:0});
  expect(out.entries.every(x=>x.status==='observed_partial')).toBe(true);
  expect(seen).toEqual([
   {tool:'workflow_audit_external_sharing',args:{maxFilesToScan:20}},
   {tool:'reports_usage_customer',args:{date:'2026-10-12'}},
   {tool:'licensing_list_assignments',args:{skuId:'Google-Apps-For-Business'}},
   {tool:'workspace_delegation_status',args:{}}
  ]);
  expect(JSON.stringify(out)).not.toContain('For-Business');
  expect(JSON.stringify(out)).not.toContain('gmail.settings.basic');
 });
 it('requires exact report date, SKU and customer intent',()=>{
  const p=planConsoleReadbacks({ids:['reports','license-assign-ui','api-controls']},clients);
  expect(p.map(x=>x.status)).toEqual(['needs_target','needs_target','outside_scope']);
  const blocked=planConsoleReadbacks({...readyInput,crossDomain:false},clients);
  expect(blocked.map(x=>x.status)).toEqual(['eligible','outside_scope','outside_scope','outside_scope']);
  const denied=planConsoleReadbacks(readyInput,{
   ...clients,rtcPolicy:{profile:'read_only',areas:['mail']}
  });
  expect(denied.every(x=>x.status==='outside_scope')).toBe(true);
 });
 it('rejects malformed inputs prior to making any provider request',async()=>{
  for(const invalid of [
   {...readyInput,reportDate:'yesterday'},
   {...readyInput,reportDate:'2026/10/12'},
   {...readyInput,skuId:'https://example.test/'},
   {...readyInput,skuId:'x'},
   {...readyInput,skuId:''}
  ]){
   expect(()=>planConsoleReadbacks(invalid,clients)).toThrow();
   const seen=[];
   await expect(executeConsoleReadbacks(invalid,clients,async()=>seen.push('read'))).rejects.toThrow();
   expect(seen).toHaveLength(0);
  }
 });
 it('does not pretend malformed lists or empty objects are proof',async()=>{
  for(const [id,invalid] of [
   ['drive-sharing',{scanned:3,filesWithExternalOrPublicSharing:[{}]}],
   ['reports',[{bad:'not a usage report'}]],
   ['license-assign-ui',[{skuId:'sku-without-user'}]],
   ['api-controls',{configured:'yes',scopesToAuthorize:[]}]
  ]){
   const r=await executeConsoleReadbacks({...readyInput,ids:[id]},clients,async()=>ok(invalid));
   expect(r.entries[0].status,id).toBe('not_readable');
   expect(r.complete).toBe(false);
  }
 });
});
describe('P8-8 exact owner-selected mailbox expectations',()=>{
 it('requires bounded distinct selected boolean expectations',()=>{
  expect([...validateConsoleExpectations({ids:['gmail-imap-pop'],
   expectations:[{id:'gmail-imap-pop',expected:false}]})]).toEqual([['gmail-imap-pop',false]]);
  for(const bad of [
   {ids:['gmail-imap-pop'],expectations:[{id:'gmail-imap-pop',expected:'false'}]},
   {ids:['gmail-imap-pop'],expectations:[{id:'out-of-office',expected:false}]},
   {ids:['domains'],expectations:[{id:'domains',expected:true}]},
   {ids:['gmail-imap-pop'],expectations:[{id:'gmail-imap-pop',expected:true,force:true}]},
   {ids:['gmail-imap-pop'],expectations:[{id:'gmail-imap-pop',expected:true},{id:'gmail-imap-pop',expected:false}]}
  ])expect(()=>validateConsoleExpectations(bad)).toThrow();
 });
 it('recognizes two verified per-mailbox values without claiming a global policy',async()=>{
  const args={ids:['gmail-imap-pop','out-of-office'],
   expectations:[{id:'gmail-imap-pop',expected:true},{id:'out-of-office',expected:false}]};
  const r=await executeConsoleReadbacks(args,clients,async(tool)=>ok(
   tool==='gmail_get_imap_settings'?{enabled:true}:{enableAutoReply:false}
  ));
  expect(r.complete).toBe(true);
  expect(r.summary).toMatchObject({matchesExpected:2,needsAttention:0,notReadable:0});
  expect(r.entries.every(x=>x.status==='matches_expected')).toBe(true);
 });
 it('flags a mismatch with a verified provider value but no modification',async()=>{
  const r=await executeConsoleReadbacks({
   ids:['email-forwarding'],expectations:[{id:'email-forwarding',expected:false}]
  },clients,async()=>ok({enabled:true}));
  expect(r.entries[0]).toMatchObject({status:'needs_attention',expected:false});
  expect(r.summary).toMatchObject({needsAttention:1,observed:0});
  expect(r.complete).toBe(true);
  expect(r.entries[0]).not.toHaveProperty('value');
 });
 it('never claims malformed provider identity matched a configured expectation',async()=>{
  const r=await executeConsoleReadbacks({
   ids:['2sv'],subjectEmail:account,expectations:[{id:'2sv',expected:false}]
  },clients,async()=>ok({primaryEmail:'other@example.test',
   isEnrolledIn2Sv:false,isEnforcedIn2Sv:false}));
  expect(r.entries[0].status).toBe('not_readable');
  expect(r.summary.matchesExpected).toBe(0);
 });
 it('publishes the bounded expectation schema',()=>{
  const schema=tools.find(t=>t.name==='workspace_admin_console_verify').inputSchema;
  expect(schema.properties.expectations.maxItems).toBe(10);
  expect(schema.properties.expectations.items.required).toEqual(['id','expected']);
 });
});
