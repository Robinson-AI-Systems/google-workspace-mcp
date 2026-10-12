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
  expect(clients.cloudidentity.policies.list).toHaveBeenCalledWith({filter:'customer == "customers/my_customer"',pageSize:17});
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
