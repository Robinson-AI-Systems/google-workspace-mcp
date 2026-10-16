import { ok, googleList } from './util.js';
import { chromeTarget } from './chrome-target.js';

// These cover ground the "official" 192-tool Google Workspace MCP skips entirely:
// Chrome policy push, Cloud Identity security/groups, domain verification,
// Vault legal holds/exports, and bulk data transfer for offboarding.

export const tools = [
  // ---------- Chrome Policy API ----------
  { name: 'chrome_resolve_policies', description: "See what Chrome/ChromeOS policies currently apply to an org unit (what the admin console's Chrome management page would show you)", inputSchema: { type: 'object', properties: { orgUnitPath: { type: 'string' }, policySchemaFilter: { type: 'string', description: "Required Chrome namespace or leaf policy, e.g. 'chrome.users.*'; '*' alone is rejected by Google" } }, required: ['orgUnitPath', 'policySchemaFilter'] } },
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
  { name: 'datatransfer_list_transfers', description: 'List one bounded page of data transfer requests (bulk Drive/Calendar ownership transfers)', inputSchema: { type: 'object', properties: { maxResults: { type: 'integer', minimum: 1, maximum: 100, default: 100 } } } },
  { name: 'datatransfer_start_transfer', description: "Transfer all of a departing user's Drive/Calendar data to another user in bulk", inputSchema: { type: 'object', properties: { fromUserId: { type: 'string' }, toUserId: { type: 'string' }, applications: { type: 'array', items: { type: 'string', enum: ['Drive and Docs', 'Calendar'] } } }, required: ['fromUserId', 'toUserId', 'applications'] } },
  { name: 'datatransfer_get_transfer_status', description: 'Check the status of a bulk data transfer', inputSchema: { type: 'object', properties: { transferId: { type: 'string' } }, required: ['transferId'] } }
];

// Chrome API responses are paginated. Never label the first page a complete
// catalog read, or silently accept a repeated cursor / malformed page.
async function chromeReadAllPages(read, collection, label) {
  const rows = [], seen = new Set();
  let pageToken;
  for (let page = 0; page < 10; page++) {
    const data = (await read(pageToken))?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        (data[collection] !== undefined && !Array.isArray(data[collection])) ||
        (data.nextPageToken !== undefined && typeof data.nextPageToken !== 'string'))
      throw Error('Google Chrome ' + label + ' returned an invalid page.');
    const batch = data[collection] || [];
    if (batch.length > 100 || batch.some(row => !row || typeof row !== 'object' || Array.isArray(row)))
      throw Error('Google Chrome ' + label + ' returned an invalid row.');
    rows.push(...batch);
    const next = data.nextPageToken;
    if (!next) return rows;
    if (seen.has(next)) throw Error('Google Chrome ' + label + ' repeated a page cursor.');
    seen.add(next);
    pageToken = next;
  }
  throw Error('Google Chrome ' + label + ' exceeded ten pages; the read is incomplete.');
}

export const handlers = {
  chrome_resolve_policies: async (args, clients) => {
    const filter = args.policySchemaFilter;
    // Google permits wildcards only at the leaf of a specific namespace.
    // The former default '*' is not a supported resolve filter.
    if (typeof filter !== 'string' || filter.length > 512 ||
        !/^chrome\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*\.(?:[A-Za-z0-9_]+|\*)$/.test(filter))
      throw Error("invalid_args: policySchemaFilter must name a Chrome policy or leaf namespace such as 'chrome.users.*'.");
    const {chromepolicy} = clients;
    const targetResource = await chromeTarget(args.orgUnitPath, clients);
    return ok(await chromeReadAllPages(pageToken => chromepolicy.customers.policies.resolve({
      customer: 'customers/my_customer',
      requestBody: {
        policySchemaFilter: filter, policyTargetKey: { targetResource },
        pageSize: 100, ...(pageToken ? { pageToken } : {})
      }
    }), 'resolvedPolicies', 'policy resolve'));
  },
  chrome_set_policy: async (args, clients) => {
    const {chromepolicy} = clients;
    const value = args.policyValue;
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).some(k => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)))
      throw Error('invalid_args: policyValue must contain named policy fields');
    const targetResource = await chromeTarget(args.orgUnitPath, clients);
    const res = await chromepolicy.customers.policies.orgunits.batchModify({
      customer: 'customers/my_customer',
      requestBody: { requests: [{ policyTargetKey: { targetResource }, policyValue: { policySchema: args.policySchema, value: args.policyValue }, updateMask:Object.keys(value).join(',') }] }
    });
    return ok({...res.data, targetResource});
  },
  chrome_list_policy_schemas: async (args, { chromepolicy }) =>
    ok(await chromeReadAllPages(pageToken => chromepolicy.customers.policySchemas.list({
      parent: 'customers/my_customer', filter: args.filter,
      pageSize: 100, ...(pageToken ? { pageToken } : {})
    }), 'policySchemas', 'policy schemas')),

  identity_get_security_settings: async (args, { admin }) => {
    const res = await admin.users.get({ userKey: args.userKey, fields: 'primaryEmail,isEnrolledIn2Sv,isEnforcedIn2Sv,isMailboxSetup,changePasswordAtNextLogin,ipWhitelisted' });
    return ok(res.data);
  },
  identity_list_group_transitive_membership: async (args, { cloudidentity }) => {
    const lookup = await cloudidentity.groups.lookup({ 'groupKey.id': args.groupEmail });
    const parent = lookup.data?.name;
    if (typeof parent !== 'string' || !/^groups\/[A-Za-z0-9_-]+$/.test(parent))
      throw Error('Google did not return the exact group resource name.');
    const rows = [], seen = new Set();
    let pageToken;
    for (let page = 0; page < 10; page++) {
      const res = await cloudidentity.groups.memberships.searchTransitiveMemberships({parent,pageSize:200,...(pageToken?{pageToken}:{})});
      const pageData = googleList(res.data, 'memberships', ['nextPageToken']);
      rows.push(...pageData.memberships);
      pageToken = pageData.nextPageToken;
      if (!pageToken) return ok(rows);
      if (seen.has(pageToken)) throw Error('Google repeated a transitive membership cursor.');
      seen.add(pageToken);
    }
    throw Error('Transitive membership page limit reached; the complete membership was not read.');
  },
  identity_check_membership: async (args, { cloudidentity }) => {
    const lookup = await cloudidentity.groups.lookup({ 'groupKey.id': args.groupEmail });
    const res = await cloudidentity.groups.memberships.checkTransitiveMembership({ parent: lookup.data.name, query: `member_key_id=='${args.userEmail}'` });
    // This protobuf bool may be omitted when false (observed native {}).
    // Normalize only this exact successful response schema, never an error,
    // unrelated object, null or a non-boolean into a membership decision.
    const value=res.data;
    if(!value||typeof value!=='object'||Array.isArray(value)||
       (res.status!==undefined&&res.status!==200)||
       Object.keys(value).some(k=>k!=='hasMembership')||
       (Object.hasOwn(value,'hasMembership')&&typeof value.hasMembership!=='boolean'))
      throw Error('Google returned an unverifiable membership response.');
    return ok({hasMembership:value.hasMembership??false});
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

  datatransfer_list_transfers: async (args, { datatransfer }) => {
    const maxResults = args.maxResults === undefined ? 100 : args.maxResults;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100)
      throw Error('invalid_args: maxResults must be from 1 through 100');
    const res = await datatransfer.transfers.list({ customerId: 'my_customer', maxResults });
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
