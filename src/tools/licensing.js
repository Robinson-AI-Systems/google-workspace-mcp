import { ok } from './util.js';

export const tools = [
  { name: 'licensing_list_assignments', description: 'List license assignments for a Workspace SKU. Default retains the legacy single-page array; includePageInfo:true or pageToken returns items and nextPageToken. Customer-wide read requires crossDomain:true for domain-limited connections.', inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, maxResults:{type:'integer',minimum:1,maximum:1000}, pageToken:{type:'string'}, includePageInfo:{type:'boolean'} }, required: ['skuId'] } },
  { name: 'licensing_list_product_assignments', description: 'List all SKUs and assigned users for an entire Google Workspace product with nextPageToken pagination. Customer-wide read requires explicit crossDomain:true for restricted connections.', inputSchema:{type:'object',properties:{productId:{type:'string',default:'Google-Apps'},maxResults:{type:'integer',minimum:1,maximum:1000},pageToken:{type:'string'}}} },
  { name: 'licensing_get_assignment', description: "Get one user's license assignment for a SKU", inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, userId: { type: 'string' } }, required: ['skuId', 'userId'] } },
  { name: 'licensing_assign_license', description: 'Assign a Workspace license SKU to a user', inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, userId: { type: 'string' } }, required: ['skuId', 'userId'] } },
  { name: 'licensing_update_assignment', description: "Change which SKU a user is licensed under (upgrade/downgrade)", inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, userId: { type: 'string' }, newSkuId: { type: 'string' } }, required: ['skuId', 'userId', 'newSkuId'] } },
  { name: 'licensing_replace_assignment', description: 'Replace a user license SKU via Google Enterprise License Manager PUT (distinct from PATCH). May alter billable seats; requires explicit confirmation and readback.', inputSchema:{type:'object',properties:{productId:{type:'string',default:'Google-Apps'},skuId:{type:'string'},userId:{type:'string'},newSkuId:{type:'string'}},required:['skuId','userId','newSkuId']} },
  { name: 'licensing_remove_license', description: 'Remove a license assignment from a user', inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, userId: { type: 'string' } }, required: ['skuId', 'userId'] } }
];

const customerIds = new Map(); // acting account -> its real customer ID (it never changes)

/** The real customer ID (C0xxxxxxx) for the account this call acts as; "my_customer" only if Google will not say. */
export async function customerIdFor(clients) {
  const key = clients?.actingAs || '';
  if (customerIds.has(key)) return customerIds.get(key);
  try {
    const id = (await clients.admin.customers.get({ customerKey: 'my_customer' })).data?.id;
    if (id) { customerIds.set(key, id); return id; }
  } catch { /* fall through: the licence call itself will report a real problem */ }
  return 'my_customer';
}
export const forgetCustomerIds = () => customerIds.clear(); // for tests

export const handlers = {
  licensing_list_assignments: async (args, clients) => {
    const request={ productId: args.productId || 'Google-Apps', skuId:args.skuId, customerId:await customerIdFor(clients),
      ...(args.maxResults!==undefined?{maxResults:args.maxResults}:{}),
      ...(args.pageToken?{pageToken:args.pageToken}:{}) };
    const res=await clients.licensing.licenseAssignments.listForProductAndSku(request);
    const {googleList}=await import('./util.js');
    const result=googleList(res.data,'items',['nextPageToken','kind','etag']);
    return ok(args.includePageInfo===true||args.pageToken||args.maxResults!==undefined
      ?{items:result.items,nextPageToken:result.nextPageToken||null,complete:!result.nextPageToken}
      :result.items);
  },
  licensing_list_product_assignments: async(args,clients)=>{
    const request={productId:args.productId||'Google-Apps',customerId:await customerIdFor(clients),
      ...(args.maxResults!==undefined?{maxResults:args.maxResults}:{}),
      ...(args.pageToken?{pageToken:args.pageToken}:{})};
    const res=await clients.licensing.licenseAssignments.listForProduct(request);
    const {googleList}=await import('./util.js');
    const result=googleList(res.data,'items',['nextPageToken','kind','etag']);
    return ok({items:result.items,nextPageToken:result.nextPageToken||null,complete:!result.nextPageToken});
  },
  licensing_get_assignment: async (args, { licensing }) => {
    const res = await licensing.licenseAssignments.get({ productId: args.productId || 'Google-Apps', skuId: args.skuId, userId: args.userId });
    return ok(res.data);
  },
  licensing_assign_license: async (args, { licensing }) => {
    const res = await licensing.licenseAssignments.insert({ productId: args.productId || 'Google-Apps', skuId: args.skuId, requestBody: { userId: args.userId } });
    return ok(res.data);
  },
  licensing_update_assignment: async (args, { licensing }) => {
    const res = await licensing.licenseAssignments.patch({ productId: args.productId || 'Google-Apps', skuId: args.skuId, userId: args.userId, requestBody: { skuId: args.newSkuId } });
    return ok(res.data);
  },
  licensing_replace_assignment: async (args, { licensing }) => {
    const res=await licensing.licenseAssignments.update({productId:args.productId||'Google-Apps',
      skuId:args.skuId,userId:args.userId,requestBody:{skuId:args.newSkuId}});
    return ok(res.data);
  },
  licensing_remove_license: async (args, { licensing }) => {
    await licensing.licenseAssignments.delete({ productId: args.productId || 'Google-Apps', skuId: args.skuId, userId: args.userId });
    return ok({ removed: args.userId, skuId: args.skuId });
  }
};
