import {describe,it,expect} from 'vitest';
import {makeFakeClients,googleError} from '../helpers/fake-google.js';
import {tools,handlers,forgetCustomerIds} from '../../src/tools/licensing.js';
import {registry} from '../../src/tools/index.js';
import {isWrite} from '../../src/rtc/catalog.js';

const result=r=>JSON.parse(r.content[0].text);
const user='sam@rentals.test';
const customer=()=>{
 const f=makeFakeClients({actingAs:'ops@rentals.test'});
 f.clients.allowedDomains=['rentals.test'];
 f.clients.rtcPolicy={principalKind:'user',profile:'full'};
 f.when('admin.customers.get').resolves({data:{id:'C_Rentals'}});
 return f;
};
describe('Google Enterprise License Manager full v1 method parity',()=>{
 it('maps all seven published methods to independent tool names',()=>{
  expect(tools.map(x=>x.name)).toEqual([
   'licensing_list_assignments','licensing_list_product_assignments',
   'licensing_get_assignment','licensing_assign_license',
   'licensing_update_assignment','licensing_replace_assignment','licensing_remove_license'
  ]);
  const r=registry.tools.find(t=>t.name==='licensing_replace_assignment');
  expect(r.inputSchema.properties.confirm?.type).toBe('boolean');
  expect(r.inputSchema.properties.dryRun?.type).toBe('boolean');
  expect(isWrite(r.name)).toBe(true);
  expect(isWrite('licensing_list_product_assignments')).toBe(false);
 });
 it('customer-restricted users cannot list another domain until explicit read intent',async()=>{
  forgetCustomerIds();
  const {clients,calls}=customer();
  const a=(await registry.handlers.licensing_list_product_assignments({},clients)).content[0].text;
  const b=(await registry.handlers.licensing_list_assignments({skuId:'sku'},clients)).content[0].text;
  expect(a).toMatch(/^Refused:/);
  expect(b).toMatch(/^Refused:/);
  expect(calls).toHaveLength(0);
 });
 it('explicit owner choice passes a genuine customer ID and page cursor to Google, never crossDomain',async()=>{
  forgetCustomerIds();
  const {clients,calls,when}=customer();
  when('licensing.licenseAssignments.listForProduct').resolves({data:{
   items:[{userId:user,skuId:'sku-1'}],nextPageToken:'next-2'}});
  const v=result(await registry.handlers.licensing_list_product_assignments({
   crossDomain:true,productId:'Google-Apps',maxResults:25,pageToken:'first'},clients));
  expect(v).toMatchObject({items:[{userId:user,skuId:'sku-1'}],nextPageToken:'next-2',complete:false});
  expect(calls.find(c=>c.path==='licensing.licenseAssignments.listForProduct').args[0])
   .toEqual({productId:'Google-Apps',customerId:'C_Rentals',maxResults:25,pageToken:'first'});
  expect(JSON.stringify(calls)).not.toContain('crossDomain');
 });
 it('preserves the old SKU array on first-page requests and allows exact cursor paging',async()=>{
  forgetCustomerIds();
  const {clients,when,calls}=customer();
  when('licensing.licenseAssignments.listForProductAndSku').resolves({data:{
   items:[{userId:user,skuId:'sku-2'}],nextPageToken:'continue'}});
  const old=result(await registry.handlers.licensing_list_assignments({skuId:'sku-2',crossDomain:true},clients));
  expect(old).toEqual([{userId:user,skuId:'sku-2'}]);
  const pg=result(await registry.handlers.licensing_list_assignments({skuId:'sku-2',pageToken:'continue',maxResults:3,crossDomain:true},clients));
  expect(pg).toMatchObject({items:[{userId:user,skuId:'sku-2'}],nextPageToken:'continue',complete:false});
  const args=calls.filter(c=>c.path==='licensing.licenseAssignments.listForProductAndSku').at(-1).args[0];
  expect(args).toMatchObject({customerId:'C_Rentals',skuId:'sku-2',maxResults:3,pageToken:'continue'});
 });
 it('Google empty lists are represented as empty lists, not as API or permission failures',async()=>{
  forgetCustomerIds();
  const {clients,when}=customer();
  when('licensing.licenseAssignments.listForProduct').resolves({data:{}});
  const good=result(await registry.handlers.licensing_list_product_assignments({crossDomain:true},clients));
  expect(good).toEqual({items:[],nextPageToken:null,complete:true});
  when('licensing.licenseAssignments.listForProduct').rejects(googleError(403,'forbidden','Access denied'));
  const rejected=await registry.handlers.licensing_list_product_assignments({crossDomain:true},clients);
  expect(rejected.isError).toBe(true);
  expect(rejected._meta['robinson/error-code']).toBe('permission');
  expect(rejected.content[0].text).toMatch(/Access denied/);
 });
 it('PUT is real Google update not PATCH (raw adapter contract, no real Google or billing mutation)',async()=>{
  const {clients,calls,when}=customer();
  when('licensing.licenseAssignments.update').resolves({data:{userId:user,skuId:'premium'}});
  const got=result(await handlers.licensing_replace_assignment({
   productId:'Google-Apps',skuId:'basic',userId:user,newSkuId:'premium'},clients));
  expect(got).toMatchObject({userId:user,skuId:'premium'});
  expect(calls).toEqual([{path:'licensing.licenseAssignments.update',
   args:[{productId:'Google-Apps',skuId:'basic',userId:user,requestBody:{skuId:'premium'}}]}]);
 });
});
