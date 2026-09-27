import { ok } from './util.js';

// These cover ground the "official" 192-tool Google Workspace MCP skips entirely:
// Chrome policy push, Cloud Identity security/groups, domain verification,
// Vault legal holds/exports, and bulk data transfer for offboarding.

export const tools = [
  // ---------- Chrome Policy API ----------
  { name: 'chrome_resolve_policies', description: "See what Chrome/ChromeOS policies currently apply to an org unit (what the admin console's Chrome management page would show you)", inputSchema: { type: 'object', properties: { orgUnitPath: { type: 'string' }, policySchemaFilter: { type: 'string', description: "e.g. 'chrome.users.*' for all user policies" } }, required: ['orgUnitPath'] } },
  { name: 'chrome_set_policy', description: 'Push a Chrome/ChromeOS policy to an org unit (e.g. force safe browsing, block extensions, set homepage) without touching the admin console', inputSchema: { type: 'object', properties: { orgUnitPath: { type: 'string' }, policySchema: { type: 'string', description: "e.g. 'chrome.users.BrowserSignin'" }, policyValue: { type: 'object' } }, required: ['orgUnitPath', 'policySchema', 'policyValue'] } },
  { name: 'chrome_list_policy_schemas', description: 'List every Chrome policy that can be set (the full menu)', inputSchema: { type: 'object', properties: { filter: { type: 'string' } } } },

  // ---------- Cloud Identity API (security + group hierarchy beyond Directory API) ----------
  { name: 'identity_get_security_settings', description: "Get a user's Cloud Identity security posture (2SV enrollment/enforcement details)", inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'identity_list_group_transitive_membership', description: 'List everyone in a group INCLUDING members inherited through nested sub-groups (Directory API only shows direct members)', inputSchema: { type: 'object', properties: { groupEmail: { type: 'string' } }, required: ['groupEmail'] } },
  { name: 'identity_check_membership', description: 'Check whether a specific user is (directly or transitively) a member of a group', inputSchema: { type: 'object', properties: { groupEmail: { type: 'string' }, userEmail: { type: 'string' } }, required: ['groupEmail', 'userEmail'] } },

  // ---------- Site Verification (needed to actually finish adding a domain) ----------
  { name: 'domain_get_verification_token', description: 'Get the DNS TXT record or HTML meta tag needed to verify ownership of a new domain', inputSchema: { type: 'object', properties: { domainName: { type: 'string' }, verificationMethod: { type: 'string', enum: ['DNS_TXT', 'META'], default: 'DNS_TXT' } }, required: ['domainName'] } },
  { name: 'domain_confirm_verification', description: 'Ask Google to check the DNS record/meta tag and finish verifying a domain', inputSchema: { type: 'object', properties: { domainName: { type: 'string' }, verificationMethod: { type: 'string', enum: ['DNS_TXT', 'META'], default: 'DNS_TXT' } }, required: ['domainName'] } },
  { name: 'domain_list_verified', description: 'List all domains this account has verified ownership of', inputSchema: { type: 'object', properties: {} } },

  // ---------- Vault (legal hold / eDiscovery / compliance) ----------
  { name: 'vault_list_matters', description: 'List Vault legal matters', inputSchema: { type: 'object', properties: {} } },
  { name: 'vault_create_matter', description: 'Create a new Vault legal matter (a case/investigation container)', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
  { name: 'vault_create_hold', description: "Put a legal hold on a user's Gmail/Drive/Chat so nothing can be deleted, even by them", inputSchema: { type: 'object', properties: { matterId: { type: 'string' }, name: { type: 'string' }, corpus: { type: 'string', enum: ['MAIL', 'DRIVE', 'GROUPS', 'HANGOUTS_CHAT'] }, accountEmails: { type: 'array', items: { type: 'string' } } }, required: ['matterId', 'name', 'corpus', 'accountEmails'] } },
  { name: 'vault_list_holds', description: 'List legal holds in a matter', inputSchema: { type: 'object', properties: { matterId: { type: 'string' } }, required: ['matterId'] } },
  { name: 'vault_remove_hold', description: 'Remove a legal hold', inputSchema: { type: 'object', properties: { matterId: { type: 'string' }, holdId: { type: 'string' } }, required: ['matterId', 'holdId'] } },

  // ---------- Data Transfer (bulk ownership transfer for offboarding) ----------
  { name: 'datatransfer_list_transfers', description: 'List data transfer requests (bulk Drive/Calendar ownership transfers)', inputSchema: { type: 'object', properties: {} } },
  { name: 'datatransfer_start_transfer', description: "Transfer all of a departing user's Drive/Calendar data to another user in bulk", inputSchema: { type: 'object', properties: { fromUserId: { type: 'string' }, toUserId: { type: 'string' }, applications: { type: 'array', items: { type: 'string', enum: ['Drive and Docs', 'Calendar'] } } }, required: ['fromUserId', 'toUserId', 'applications'] } },
  { name: 'datatransfer_get_transfer_status', description: 'Check the status of a bulk data transfer', inputSchema: { type: 'object', properties: { transferId: { type: 'string' } }, required: ['transferId'] } }
];

export const handlers = {
  chrome_resolve_policies: async (args, { chromepolicy }) => {
    const res = await chromepolicy.customers.policies.resolve({
      customer: 'customers/my_customer',
      requestBody: { policySchemaFilter: args.policySchemaFilter || '*', policyTargetKey: { targetResource: `orgunits/${args.orgUnitPath}` } }
    });
    return ok(res.data.resolvedPolicies || []);
  },
  chrome_set_policy: async (args, { chromepolicy }) => {
    const res = await chromepolicy.customers.policies.orgunits.batchModify({
      customer: 'customers/my_customer',
      requestBody: { requests: [{ policyTargetKey: { targetResource: `orgunits/${args.orgUnitPath}` }, policyValue: { policySchema: args.policySchema, value: args.policyValue } }] }
    });
    return ok(res.data);
  },
  chrome_list_policy_schemas: async (args, { chromepolicy }) => {
    const res = await chromepolicy.customers.policySchemas.list({ customer: 'customers/my_customer', filter: args.filter });
    return ok(res.data.policySchemas || []);
  },

  identity_get_security_settings: async (args, { admin }) => {
    const res = await admin.users.get({ userKey: args.userKey, fields: 'isEnrolledIn2Sv,isEnforcedIn2Sv,isMailboxSetup,changePasswordAtNextLogin,ipWhitelisted' });
    return ok(res.data);
  },
  identity_list_group_transitive_membership: async (args, { cloudidentity }) => {
    const lookup = await cloudidentity.groups.lookup({ 'groupKey.id': args.groupEmail });
    const res = await cloudidentity.groups.memberships.list({ parent: lookup.data.name });
    return ok(res.data.memberships || []);
  },
  identity_check_membership: async (args, { cloudidentity }) => {
    const lookup = await cloudidentity.groups.lookup({ 'groupKey.id': args.groupEmail });
    const res = await cloudidentity.groups.memberships.checkTransitiveMembership({ parent: lookup.data.name, query: `member_key_id=='${args.userEmail}'` });
    return ok(res.data);
  },

  domain_get_verification_token: async (args, { siteVerification }) => {
    const res = await siteVerification.webResource.getToken({ requestBody: { site: { type: 'INET_DOMAIN', identifier: args.domainName }, verificationMethod: args.verificationMethod === 'META' ? 'META' : 'DNS_TXT' } });
    return ok(res.data);
  },
  domain_confirm_verification: async (args, { siteVerification }) => {
    const res = await siteVerification.webResource.insert({ verificationMethod: args.verificationMethod === 'META' ? 'META' : 'DNS_TXT', requestBody: { site: { type: 'INET_DOMAIN', identifier: args.domainName } } });
    return ok(res.data);
  },
  domain_list_verified: async (_args, { siteVerification }) => {
    const res = await siteVerification.webResource.list({});
    return ok(res.data.items || []);
  },

  vault_list_matters: async (_args, { vault }) => {
    const res = await vault.matters.list({});
    return ok(res.data.matters || []);
  },
  vault_create_matter: async (args, { vault }) => {
    const res = await vault.matters.create({ requestBody: { name: args.name, description: args.description } });
    return ok(res.data);
  },
  vault_create_hold: async (args, { vault }) => {
    const res = await vault.matters.holds.create({ matterId: args.matterId, requestBody: { name: args.name, corpus: args.corpus, accounts: args.accountEmails.map(email => ({ email })) } });
    return ok(res.data);
  },
  vault_list_holds: async (args, { vault }) => {
    const res = await vault.matters.holds.list({ matterId: args.matterId });
    return ok(res.data.holds || []);
  },
  vault_remove_hold: async (args, { vault }) => {
    await vault.matters.holds.delete({ matterId: args.matterId, holdId: args.holdId });
    return ok({ deleted: args.holdId });
  },

  datatransfer_list_transfers: async (_args, { datatransfer }) => {
    const res = await datatransfer.transfers.list({ customerId: 'my_customer' });
    return ok(res.data.dataTransfers || []);
  },
  datatransfer_start_transfer: async (args, { datatransfer }) => {
    const appsList = await datatransfer.applications.list({ customerId: 'my_customer' });
    const apps = (appsList.data.applications || []).filter(a => args.applications.includes(a.name));
    const res = await datatransfer.transfers.insert({
      requestBody: {
        oldOwnerUserId: args.fromUserId,
        newOwnerUserId: args.toUserId,
        applicationDataTransfers: apps.map(a => ({ applicationId: a.id }))
      }
    });
    return ok(res.data);
  },
  datatransfer_get_transfer_status: async (args, { datatransfer }) => {
    const res = await datatransfer.transfers.get({ dataTransferId: args.transferId });
    return ok(res.data);
  }
};
