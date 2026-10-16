import { describe, expect, it } from 'vitest';
import { handlers, tools } from '../../src/tools/extra-admin-apis.js';

const result = response => JSON.parse(response.content[0].text);

describe('Chrome Policy read completeness and contract', () => {
  it('requires an explicit leaf policy or namespace filter, never Google-invalid bare wildcard', async () => {
    let calls = 0;
    const clients = { chromepolicy: { customers: { policies: {
      resolve: async () => { calls++; return { data: { resolvedPolicies: [] } }; }
    } } } };
    const run = policySchemaFilter => handlers.chrome_resolve_policies({
      orgUnitPath: 'id:verified', ...(policySchemaFilter === undefined ? {} : { policySchemaFilter })
    }, clients);
    for (const bad of [undefined, '', '*', 'chrome.*', 'chrome.users.*.extra', 'other.users.*', null]) {
      await expect(run(bad)).rejects.toThrow(/policySchemaFilter/);
    }
    expect(calls).toBe(0);
    const schema = tools.find(tool => tool.name === 'chrome_resolve_policies').inputSchema;
    expect(schema.required).toContain('policySchemaFilter');
  });

  it('reads every Chrome resolve page using a verified OU id and an unchanged filter', async () => {
    const requests = [];
    const clients = { chromepolicy: { customers: { policies: {
      resolve: async request => {
        requests.push(request);
        return { data: requests.length === 1
          ? { resolvedPolicies: [{ targetKey: 'one' }], nextPageToken: 'next' }
          : { resolvedPolicies: [{ targetKey: 'two' }] } };
      }
    } } } };
    expect(result(await handlers.chrome_resolve_policies({
      orgUnitPath: 'id:verified', policySchemaFilter: 'chrome.users.*'
    }, clients))).toEqual([{ targetKey: 'one' }, { targetKey: 'two' }]);
    expect(requests).toHaveLength(2);
    expect(requests[0].requestBody).toEqual({
      policySchemaFilter: 'chrome.users.*',
      policyTargetKey: { targetResource: 'orgunits/verified' },
      pageSize: 100
    });
    expect(requests[1].requestBody).toEqual({
      ...requests[0].requestBody, pageToken: 'next'
    });
    expect(requests.every(item => item.customer === 'customers/my_customer')).toBe(true);
  });

  it('reads all schema pages, forwarding the optional filter without changing it', async () => {
    const requests = [];
    const clients = { chromepolicy: { customers: { policySchemas: {
      list: async request => {
        requests.push(request);
        return { data: requests.length === 1
          ? { policySchemas: [{ name: 'first' }], nextPageToken: 'next' }
          : { policySchemas: [{ name: 'second' }] } };
      }
    } } } };
    expect(result(await handlers.chrome_list_policy_schemas({ filter: 'chrome.users' }, clients)))
      .toEqual([{ name: 'first' }, { name: 'second' }]);
    expect(requests).toEqual([
      { parent: 'customers/my_customer', filter: 'chrome.users', pageSize: 100 },
      { parent: 'customers/my_customer', filter: 'chrome.users', pageSize: 100, pageToken: 'next' }
    ]);
  });

  it('rejects malformed, repeated and over-budget pages instead of claiming partial success', async () => {
    const schemaClient = payload => ({ chromepolicy: { customers: { policySchemas: {
      list: async () => payload
    } } } });
    for (const data of [null, [], { policySchemas: {} }, { policySchemas: [null] },
      { policySchemas: [], nextPageToken: 123 }]) {
      await expect(handlers.chrome_list_policy_schemas({}, schemaClient({ data })))
        .rejects.toThrow(/invalid/);
    }
    let repeated = 0;
    const repeatClient = { chromepolicy: { customers: { policySchemas: {
      list: async () => { repeated++; return { data: { policySchemas: [], nextPageToken: 'same' } }; }
    } } } };
    await expect(handlers.chrome_list_policy_schemas({}, repeatClient)).rejects.toThrow(/repeated/);
    expect(repeated).toBe(2);
    let pages = 0;
    const overLimit = { chromepolicy: { customers: { policySchemas: {
      list: async () => ({ data: { policySchemas: [{ name: 'row' }], nextPageToken: 'page-' + (++pages) } })
    } } } };
    await expect(handlers.chrome_list_policy_schemas({}, overLimit)).rejects.toThrow(/exceeded ten pages/);
    expect(pages).toBe(10);
  });

  it('preserves genuine Google permission errors without returning empty data', async () => {
    const forbidden = Object.assign(new Error('permission denied'), { code: 403 });
    const clients = { chromepolicy: { customers: { policySchemas: {
      list: async () => { throw forbidden; }
    } } } };
    await expect(handlers.chrome_list_policy_schemas({}, clients)).rejects.toBe(forbidden);
  });
});
