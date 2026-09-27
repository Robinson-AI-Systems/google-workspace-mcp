import { ok } from './util.js';

export const tools = [
  { name: 'licensing_list_assignments', description: 'List all license assignments for a Google Workspace SKU (e.g. see who has a Business Plus license)', inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' } }, required: ['skuId'] } },
  { name: 'licensing_get_assignment', description: "Get one user's license assignment for a SKU", inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, userId: { type: 'string' } }, required: ['skuId', 'userId'] } },
  { name: 'licensing_assign_license', description: 'Assign a Workspace license SKU to a user', inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, userId: { type: 'string' } }, required: ['skuId', 'userId'] } },
  { name: 'licensing_update_assignment', description: "Change which SKU a user is licensed under (upgrade/downgrade)", inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, userId: { type: 'string' }, newSkuId: { type: 'string' } }, required: ['skuId', 'userId', 'newSkuId'] } },
  { name: 'licensing_remove_license', description: 'Remove a license assignment from a user', inputSchema: { type: 'object', properties: { productId: { type: 'string', default: 'Google-Apps' }, skuId: { type: 'string' }, userId: { type: 'string' } }, required: ['skuId', 'userId'] } }
];

export const handlers = {
  licensing_list_assignments: async (args, { licensing }) => {
    const res = await licensing.licenseAssignments.listForProductAndSku({ productId: args.productId || 'Google-Apps', skuId: args.skuId, customerId: 'my_customer' });
    return ok(res.data.items || []);
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
  licensing_remove_license: async (args, { licensing }) => {
    await licensing.licenseAssignments.delete({ productId: args.productId || 'Google-Apps', skuId: args.skuId, userId: args.userId });
    return ok({ removed: args.userId, skuId: args.skuId });
  }
};
