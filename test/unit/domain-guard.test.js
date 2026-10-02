import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { domainsTargeted, outsideDomains } = await import('../../src/tools/domain-guard.js');
const { handlers: accounts } = await import('../../src/tools/accounts.js');

const body = (r) => JSON.parse(r.content[0].text);
const text = (r) => r.content[0].text;
const mutations = (calls) => calls.filter((c) => !/\.(get|list|search)[A-Za-z]*$/.test(c.path));
// A connection acting as the rentals mailbox, allowed to manage only rentals.test
const rentals = () => { const f = makeFakeClients({ actingAs: 'ops@rentals.test' }); f.clients.allowedDomains = ['rentals.test']; return f; };

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@rentals.test', { access_token: 'a' });
  await holder.db.saveGoogleTokensFor('ops@ai-systems.test', { access_token: 'b' });
});

describe('what the guard looks at', () => {
  it('finds domains in emails, lists and domain names, and ignores IDs, "me" and "all"', () => {
    expect(domainsTargeted({ userKey: 'Sam@Ai-Systems.test', groupEmails: ['a@x.test', 'b@y.test'], domainName: 'Z.test' }).map((t) => t.domain)).toEqual(['ai-systems.test', 'x.test', 'y.test', 'z.test']);
    expect(domainsTargeted({ userKey: '1234567890', userId: 'me', groupKey: 'all' })).toEqual([]);
  });
  it('compares the whole domain, so a look-alike or a subdomain is outside', () => {
    expect(outsideDomains({ userKey: 'a@rentals.test' }, ['rentals.test'])).toEqual([]);
    expect(outsideDomains({ userKey: 'a@rentals.test.evil.test' }, ['rentals.test'])).toHaveLength(1);
    expect(outsideDomains({ userKey: 'a@sub.rentals.test' }, ['rentals.test'])).toHaveLength(1);
    expect(outsideDomains({ userKey: 'a@RENTALS.test' }, ['Rentals.test'])).toEqual([]);
  });
});

describe('the admin tools, called from the rentals connection', () => {
  it('admin_get_user for someone at another business is refused in plain words, with no call to Google', async () => {
    const { clients, calls } = rentals();
    const out = text(await registry.handlers.admin_get_user({ userKey: 'sam@ai-systems.test' }, clients));
    expect(out).toMatch(/^Refused: sam@ai-systems\.test/);
    expect(out).toMatch(/limited to rentals\.test/);
    expect(out).toMatch(/crossDomain: true/);
    expect(calls).toEqual([]);
  });
  it('works for its own domain', async () => {
    const { clients, calls, when } = rentals();
    when('admin.users.get').resolves({ data: { primaryEmail: 'kim@rentals.test' } });
    expect(JSON.parse(text(await registry.handlers.admin_get_user({ userKey: 'kim@rentals.test' }, clients)))).toMatchObject({ primaryEmail: 'kim@rentals.test' });
    expect(calls.length).toBeGreaterThan(0);
  });
  it('works across businesses with crossDomain: true, and Google never sees that flag', async () => {
    const { clients, calls, when } = rentals();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@ai-systems.test' } });
    await registry.handlers.admin_get_user({ userKey: 'sam@ai-systems.test', crossDomain: true }, clients);
    expect(JSON.stringify(calls)).not.toMatch(/crossDomain/);
    expect(calls.length).toBeGreaterThan(0);
  });
  it('risky changes are refused before anything happens, including previews and unconfirmed calls (nothing leaks)', async () => {
    const { clients, calls } = rentals();
    for (const [name, args] of [['admin_delete_user', { userKey: 'sam@ai-systems.test', confirm: true }], ['admin_suspend_user', { userKey: 'sam@ai-systems.test', dryRun: true }], ['admin_delete_group', { groupKey: 'team@ai-systems.test', confirm: true }], ['admin_delete_domain', { domainName: 'ai-systems.test', confirm: true }], ['admin_add_group_member', { groupKey: 'team@rentals.test', memberEmail: 'sam@ai-systems.test', role: 'MEMBER' }], ['workflow_offboard_employee', { userKey: 'sam@ai-systems.test', confirm: true }], ['licensing_remove_license', { userId: 'sam@ai-systems.test', skuId: 's', confirm: true }]]) {
      expect(text(await registry.handlers[name](args, clients)), name).toMatch(/^Refused/);
    }
    expect(calls).toEqual([]);
    expect(await holder.db.listRecentChanges()).toEqual([]);
  });
  it('a second target outside the list (the group is fine, the member is not) is still caught', async () => {
    const { clients } = rentals();
    expect(text(await registry.handlers.admin_add_group_member({ groupKey: 'team@rentals.test', memberEmail: 'x@elsewhere.test', role: 'MEMBER' }, clients))).toMatch(/^Refused: x@elsewhere\.test/);
  });
  it('every admin-style tool advertises crossDomain and mentions the limit', () => {
    const t = registry.tools.find((x) => x.name === 'admin_get_user');
    expect(t.inputSchema.properties.crossDomain.type).toBe('boolean');
    expect(t.description).toMatch(/crossDomain/);
    expect(registry.tools.find((x) => x.name === 'gmail_search').inputSchema.properties.crossDomain).toBeUndefined();
  });
  it('a connection with no limit set (no limit configured) is unrestricted', async () => {
    const { clients, when } = makeFakeClients({ actingAs: 'ops@rentals.test' });
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@ai-systems.test' } });
    expect(text(await registry.handlers.admin_get_user({ userKey: 'sam@ai-systems.test' }, clients))).not.toMatch(/Refused/);
  });
});

describe('workspace_set_allowed_domains', () => {
  it('changes nothing without confirm, and says what it would do', async () => {
    const out = body(await accounts.workspace_set_allowed_domains({ email: 'ops@rentals.test', domains: ['rentals.test', 'ai-systems.test'] }, rentals().clients));
    expect(out).toMatchObject({ done: false, needsConfirmation: true, allowedNow: ['rentals.test'] });
    expect(await holder.db.getAllowedDomains('ops@rentals.test')).toEqual(['rentals.test']);
  });
  it('with confirm it widens the limit, logs it, and the guard then lets the other domain through', async () => {
    const { clients, when } = rentals();
    const out = body(await accounts.workspace_set_allowed_domains({ email: 'ops@rentals.test', domains: ['rentals.test', 'ai-systems.test'], confirm: true }, clients));
    expect(out).toMatchObject({ done: true, allowedDomains: ['rentals.test', 'ai-systems.test'], logged: true });
    expect((await holder.db.listRecentChanges())[0]).toMatchObject({ tool: 'workspace_set_allowed_domains', before: { allowedDomains: ['rentals.test'] }, after: { allowedDomains: ['rentals.test', 'ai-systems.test'] } });
    clients.allowedDomains = await holder.db.getAllowedDomains('ops@rentals.test'); // what api/mcp.js does on every call
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@ai-systems.test' } });
    expect(text(await registry.handlers.admin_get_user({ userKey: 'sam@ai-systems.test' }, clients))).not.toMatch(/Refused/);
  });
  it('rejects things that are not domains before asking for confirmation', async () => {
    await expect(accounts.workspace_set_allowed_domains({ email: 'ops@rentals.test', domains: ['nope nope'] }, rentals().clients)).rejects.toThrow(/does not look like a domain/);
  });
  it('workspace_list_accounts shows the limit in force', async () => {
    const list = body(await accounts.workspace_list_accounts());
    expect(list.find((a) => a.email === 'ops@rentals.test')).toMatchObject({ allowed_domains: ['rentals.test'], allowed_domains_custom: false });
  });
});
