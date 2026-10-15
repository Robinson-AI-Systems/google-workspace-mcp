import {describe,it,expect,vi} from 'vitest';
import {handlers,evaluateBaseline} from '../../src/tools/policy-audit.js';
import {registry} from '../../src/tools/index.js';
import {isWrite,allowedTool} from '../../src/rtc/catalog.js';
import {ALL_SCOPES} from '../../src/auth/scopes.js';
const mk=(policies=[])=>({cloudidentity:{policies:{list:vi.fn(async()=>({data:{policies}}))}},allowedDomains:['rentals.example'],actingAs:'ops@rentals.example'});
const row=(type,field,value,name='policies/example')=>({name,type:'ADMIN',policyQuery:{orgUnit:'orgUnits/0'},setting:{type,value:{[field]:value}}});
describe('P7-2 evidence-based Cloud Identity policy checks',()=>{
 it('registers two real read-only tools with only approved OAuth scope',()=>{
  for(const n of ['identity_list_policies','identity_policy_audit']){expect(registry.handlers[n]).toBeTypeOf('function');expect(isWrite(n)).toBe(false);expect(allowedTool(n,{profile:'read_only',areas:['identity']})).toBe(true);}
  expect(ALL_SCOPES).toContain('https://www.googleapis.com/auth/cloud-identity.policies.readonly');
 });
 it('lists explicit customer policy entries, preserving provider pagination and scope warning',async()=>{
  const clients=mk([row('settings/gmail.external_recipient_warning','enabled',true)]);
  const result=JSON.parse((await registry.handlers.identity_list_policies({domain:'rentals.example',area:'gmail',pageSize:17,crossDomain:true},clients)).content[0].text);
  expect(result.policies).toHaveLength(1);expect(result.scopeNote).toMatch(/customer-wide/);
  expect(clients.cloudidentity.policies.list).toHaveBeenCalledWith({filter:expect.stringContaining("setting.type.matches('^settings/gmail"),pageSize:17});
 });
 it('identifies exact mismatches but never claims missing/inherited policies are compliant',()=>{
  const type='settings/gmail.external_recipient_warning';
  const correct=evaluateBaseline([row(type,'enabled',true)],{chosen:'gmail'});
  expect(correct.find(x=>x.policySetting===type).status).toBe('ok');
  const changed=evaluateBaseline([row(type,'enabled',false)],{chosen:'gmail'});
  expect(changed.find(x=>x.policySetting===type).status).toBe('needs_attention');
  expect(changed.find(x=>x.policySetting===type).console.url).toMatch(/^https:\/\//);
  expect(evaluateBaseline([],{chosen:'gmail'}).every(x=>x.status==='not_readable')).toBe(true);
  expect(evaluateBaseline([row(type,'enabled',true)],{complete:false,chosen:'gmail'}).every(x=>x.status==='not_readable')).toBe(true);
 });
 it('refuses foreign domain, unapproved customer-wide read, malformed area/size and no Google call',async()=>{
  const clients=mk();
  const refused=await registry.handlers.identity_policy_audit({domain:'other.example'},clients);
  await expect(handlers.identity_policy_audit({domain:'rentals.example'},clients)).rejects.toThrow(/crossDomain/);
  expect(refused.content[0].text).toMatch(/outside what this connection/);
  for(const args of [{domain:'rentals.example',area:'inject;'} ,{domain:'rentals.example',pageSize:101}]) await expect(handlers.identity_list_policies(args,{...clients,crossDomain:true})).rejects.toThrow();
  expect(clients.cloudidentity.policies.list).not.toHaveBeenCalled();
 });
 it('paginates audits and rejects malformed provider entries rather than passing them',async()=>{
  const clients=mk();clients.cloudidentity.policies.list.mockImplementation(async({pageToken})=>({data:pageToken?{policies:[row('settings/gmail.external_recipient_warning','enabled',false)]}:{policies:[],nextPageToken:'second'}}));
  const result=JSON.parse((await handlers.identity_policy_audit({domain:'rentals.example',area:'gmail'},{...clients,crossDomain:true})).content[0].text);
  expect(result.complete).toBe(true);expect(result.summary.needsAttention).toBeGreaterThan(0);expect(clients.cloudidentity.policies.list).toHaveBeenCalledTimes(2);
  clients.cloudidentity.policies.list.mockResolvedValueOnce({data:{policies:[{name:'x'}]}});
  await expect(handlers.identity_policy_audit({domain:'rentals.example'},{...clients,crossDomain:true})).rejects.toThrow(/incomplete/);
 });
});


describe('P7-2 explicit OU policy override observations',()=>{
 const json=out=>JSON.parse(out.content[0].text);
 const setting='settings/gmail.external_recipient_warning';
 const policy=(orgUnit,enabled,name)=>({name,policyQuery:{orgUnit},setting:{type:setting,value:{enabled}},type:'ADMIN'});
 it('shows only exact OU overrides and explicitly refuses to claim reduced/effective settings',async()=>{
  const clients=mk([policy('orgUnits/one',false,'policies/one'),policy('orgUnits/two',true,'policies/two'),
   {name:'policies/complex',policyQuery:{query:'entity.org_units.exists(...)'},setting:{type:setting,value:{enabled:true}}}]);
  const listed=json(await handlers.identity_list_policies({domain:'rentals.example',orgUnit:'orgUnits/one'},{...clients,crossDomain:true}));
  expect(listed.policies.map(p=>p.name)).toEqual(['policies/one']);
  expect(listed).toMatchObject({orgUnit:'orgUnits/one',scopeMode:'exact_explicit_org_unit_overrides',effective:false});
  expect(listed.scopeNote).toMatch(/complex CEL policies/);
  const audited=json(await handlers.identity_policy_audit({domain:'rentals.example',orgUnit:'orgUnits/one',area:'gmail'},{...clients,crossDomain:true}));
  expect(audited.effective).toBe(false);
  const finding=audited.results.find(r=>r.policySetting===setting);
  expect(finding.status).toBe('needs_attention');
  expect(finding.observations.map(o=>o.name)).toEqual(['policies/one']);
  const absent=json(await handlers.identity_policy_audit({domain:'rentals.example',orgUnit:'orgUnits/absent',area:'gmail'},{...clients,crossDomain:true}));
  expect(absent.results.every(r=>r.status==='not_readable')).toBe(true);
 });
 it('preserves opaque provider pagination even when the requested OU is absent from a page',async()=>{
  const clients=mk();
  clients.cloudidentity.policies.list.mockResolvedValue({data:{policies:[policy('orgUnits/two',true,'policies/two')],nextPageToken:'next'}});
  const page=json(await handlers.identity_list_policies({domain:'rentals.example',orgUnit:'orgUnits/one',pageToken:'original'},{...clients,crossDomain:true}));
  expect(page.policies).toEqual([]);
  expect(page.nextPageToken).toBe('next');
  expect(clients.cloudidentity.policies.list).toHaveBeenCalledWith({filter:'customer == "customers/my_customer"',pageSize:100,pageToken:'original'});
 });
 it('rejects invalid OU identifiers and prevents unauthorized customer-wide reads',async()=>{
  const clients=mk();
  for(const orgUnit of ['', 'sales', '../orgUnits/test', 'orgUnits/x;DROP', 'orgUnits/', 123]){
   await expect(handlers.identity_list_policies({domain:'rentals.example',orgUnit},{...clients,crossDomain:true})).rejects.toThrow(/orgUnit/);
  }
  await expect(handlers.identity_list_policies({domain:'rentals.example',orgUnit:'orgUnits/one'},clients)).rejects.toThrow(/crossDomain/);
  expect(clients.cloudidentity.policies.list).not.toHaveBeenCalled();
 });
});
