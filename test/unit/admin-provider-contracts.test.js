import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createFakeDb} from '../helpers/fake-db.js';
const holder=vi.hoisted(()=>({db:null}));
vi.mock('../../src/db.js',async actual=>{
 const real=await actual();return Object.fromEntries(Object.keys(real).map(name=>[name,(...args)=>holder.db[name](...args)]));
});
const {buildApiClients}=await import('../../src/auth/google-auth-hosted.js');
const {chromeTarget}=await import('../../src/tools/chrome-target.js');
const {registry}=await import('../../src/tools/index.js');
const {handlers}=await import('../../src/tools/extra-admin-apis.js');
const body=r=>JSON.parse(r.content[0].text);
beforeEach(()=>{holder.db=createFakeDb();});
function hosted(respond){
 const calls=[];
 const clients=buildApiClients({actingAs:'ops@example.test',request:async options=>{calls.push(options);return {data:await respond(options)};}});
 Object.assign(clients,{connection:'fake-connection',allowedDomains:['example.test'],rtcPolicy:{profile:'full',areas:['admin']}});
 return {clients,calls};
}
describe('Chrome Policy provider contracts',()=>{
 it('resolves an exact Directory path to its provider ID through the hosted SDK',async()=>{
  const {clients,calls}=hosted(o=>o.method==='GET'?{orgUnitPath:'/Test/Nested',orgUnitId:'id:ou123'}:{resolvedPolicies:[]});
  expect(body(await handlers.chrome_resolve_policies({policySchemaFilter:'chrome.users.*',orgUnitPath:'/Test/Nested'},clients))).toEqual([]);
  expect(calls).toHaveLength(2);
  expect(calls[0].url).toMatch(/customer\/my_customer\/orgunits\/Test\/Nested$/);
  expect(calls[1].data.policyTargetKey).toEqual({targetResource:'orgunits/ou123'});
  expect(calls[1].url).toBe('https://chromepolicy.googleapis.com/v1/customers/my_customer/policies:resolve');
 });
 it('selects the exact root from the parent-inclusive collection instead of a root GET',async()=>{
  const root={orgUnitPath:'/',orgUnitId:'id:root123'};
  const {clients,calls}=hosted(()=>({organizationUnits:[{orgUnitPath:'/Child',orgUnitId:'id:child'},root]}));
  expect(await chromeTarget('/',clients)).toBe('orgunits/root123');
  expect(calls[0].url).toMatch(/orgunits$/);
  expect(calls[0].params.type).toBe('all_including_parent');
  expect(body(await registry.handlers.admin_get_orgunit({orgUnitPath:'/'},clients))).toEqual(root);
  expect(calls).toHaveLength(2);
  for(const result of [{orgUnitPath:'/Other',orgUnitId:'id:abc'},{orgUnitPath:'/Test'},{}]){
   const bad=hosted(()=>result);
   await expect(handlers.chrome_resolve_policies({policySchemaFilter:'chrome.users.*',orgUnitPath:'/Test'},bad.clients)).rejects.toThrow();
   expect(bad.calls).toHaveLength(1);
  }
 });
 it('refuses absent, ambiguous, malformed or incomplete root collections before policy access',async()=>{
  const root={orgUnitPath:'/',orgUnitId:'id:root123'};
  for(const data of [{},{organizationUnits:[]},{organizationUnits:[root,root]},
   {organizationUnits:[{orgUnitPath:'/Child',orgUnitId:'id:child'}]},
   {organizationUnits:[{orgUnitPath:'/'}]}, {organizationUnits:[root],nextPageToken:'unread'}]){
   const {clients,calls}=hosted(()=>data);
   await expect(handlers.chrome_resolve_policies({policySchemaFilter:'chrome.users.BrowserSignin',orgUnitPath:'/'},clients)).rejects.toThrow();
   expect(calls).toHaveLength(1);expect(calls[0].method).toBe('GET');
  }
 });
 it('writes only the named value fields and confirms by resolving the same target',async()=>{
  const value={browserSignin:'DISABLE',otherField:{nested:true}};
  const {clients,calls}=hosted(o=>o.method==='GET'?{orgUnitPath:'/Test',orgUnitId:'id:ou123'}:o.url.endsWith(':resolve')?{resolvedPolicies:[{value:{policySchema:'chrome.users.BrowserSignin',value}}]}:{});
  const args={orgUnitPath:'/Test',policySchema:'chrome.users.BrowserSignin',policyValue:value,confirm:true};
  const result=body(await registry.handlers.chrome_set_policy(args,clients));
  expect(result.done).toBe(true);expect(result.confirmed).toBe(true);expect(result.logged).toBeTruthy();
  const writes=calls.filter(o=>o.url.endsWith(':batchModify'));
  expect(writes).toHaveLength(1);
  expect(writes[0].method).toBe('POST');
  expect(writes[0].data.requests).toEqual([{policyTargetKey:{targetResource:'orgunits/ou123'},policyValue:{policySchema:args.policySchema,value},updateMask:'browserSignin,otherField'}]);
  expect(calls.filter(o=>o.url.endsWith(':resolve'))[0].data.policyTargetKey.targetResource).toBe('orgunits/ou123');
 });
 it('preview, missing confirmation and read-only dispatch cannot modify policy',async()=>{
  for(const flags of [{dryRun:true},{}]){
   const {clients,calls}=hosted(()=>({}));
   const r=body(await registry.handlers.chrome_set_policy({orgUnitPath:'id:ou123',policySchema:'chrome.users.BrowserSignin',policyValue:{browserSignin:'DISABLE'},...flags},clients));
   expect(r.done).toBe(false);expect(calls).toEqual([]);
  }
  const {clients,calls}=hosted(()=>({}));clients.rtcPolicy.profile='read_only';
  const r=await registry.handlers.workspace_call({name:'chrome_set_policy',args:{orgUnitPath:'id:ou123',policySchema:'x',policyValue:{x:true},confirm:true}},clients);
  expect(r.isError).toBe(true);expect(calls).toEqual([]);
 });
 it('rejects ambiguous masks and preserves provider denial without replay',async()=>{
  const denied=Object.assign(new Error('denied'),{code:403});
  const {clients,calls}=hosted(()=>{throw denied;});
  for(const value of [{},{'a,b':true},null,[]])
   await expect(handlers.chrome_set_policy({orgUnitPath:'id:ou123',policyValue:value},clients)).rejects.toThrow(/policyValue/);
  expect(calls).toEqual([]);
  await expect(handlers.chrome_resolve_policies({policySchemaFilter:'chrome.users.*',orgUnitPath:'id:ou123'},clients)).rejects.toBe(denied);
  expect(calls).toHaveLength(1);
 });
});
describe('Cloud Identity membership and security contracts',()=>{
 it('uses the real transitive endpoint, follows cursors and retains indirect relations',async()=>{
  let page=0;
  const direct={member:'users/direct',relationType:'DIRECT'},indirect={member:'users/nested',relationType:'INDIRECT'};
  const {clients,calls}=hosted(o=>o.url.endsWith(':lookup')?{name:'groups/group123'}:++page===1?{memberships:[direct],nextPageToken:'next'}:{memberships:[indirect]});
  expect(body(await handlers.identity_list_group_transitive_membership({groupEmail:'group@example.test'},clients))).toEqual([direct,indirect]);
  expect(calls.map(o=>o.method)).toEqual(['GET','GET','GET']);
  expect(calls[0].params['groupKey.id']).toBe('group@example.test');
  expect(calls[1].url).toBe('https://cloudidentity.googleapis.com/v1/groups/group123/memberships:searchTransitiveMemberships');
  expect(calls[1].params.pageSize).toBe(200);expect(calls[2].params.pageToken).toBe('next');
 });
 it('handles documented omitted empty memberships without accepting malformed bodies',async()=>{
  for(const data of [{},null,{error:{code:403}},{unrelated:[]},{memberships:{}},{nextPageToken:3}]){
   const clients={cloudidentity:{groups:{lookup:async()=>({data:{name:'groups/group123'}}),memberships:{searchTransitiveMemberships:async()=>({data})}}}};
   if(data&&Object.keys(data).length===0)expect(body(await handlers.identity_list_group_transitive_membership({groupEmail:'group@example.test'},clients))).toEqual([]);
   else await expect(handlers.identity_list_group_transitive_membership({groupEmail:'group@example.test'},clients)).rejects.toThrow();
  }
 });
 it('refuses missing group identity, repeated cursors and incomplete capped reads',async()=>{
  const bad=hosted(()=>({}));
  await expect(handlers.identity_list_group_transitive_membership({groupEmail:'group@example.test'},bad.clients)).rejects.toThrow(/group resource/);
  expect(bad.calls).toHaveLength(1);
  for(const repeated of [true,false]){
   let pages=0;
   const {clients,calls}=hosted(o=>o.url.endsWith(':lookup')?{name:'groups/group123'}:{nextPageToken:repeated?'same':`page${++pages}`});
   await expect(handlers.identity_list_group_transitive_membership({groupEmail:'group@example.test'},clients)).rejects.toThrow(repeated?/repeated/:/limit/);
   expect(calls).toHaveLength(repeated?3:11);
  }
 });
 it('preserves edition/scope denials and never substitutes direct membership',async()=>{
  const denied=Object.assign(new Error('premium edition required'),{code:403});
  const {clients,calls}=hosted(o=>{if(o.url.endsWith(':lookup'))return {name:'groups/group123'};throw denied;});
  await expect(handlers.identity_list_group_transitive_membership({groupEmail:'group@example.test'},clients)).rejects.toBe(denied);
  expect(calls).toHaveLength(2);
 });
 it('retains the exact mailbox identity in the security field projection',async()=>{
  const {clients,calls}=hosted(()=>({primaryEmail:'ops@example.test',isEnrolledIn2Sv:true}));
  expect(body(await handlers.identity_get_security_settings({userKey:'ops@example.test'},clients)).primaryEmail).toBe('ops@example.test');
  expect(calls[0].params.fields.split(',')).toContain('primaryEmail');
 });
});
