import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { GUARDS_ADMIN } = await import('../../src/tools/guards-admin.js');
const { GUARDS } = await import('../../src/tools/guards.js');

const body = (r) => JSON.parse(r.content[0].text);
const READ_ONLY = /\.(get|list|search)[A-Za-z]*$/;
const mutations = (calls) => calls.filter((c) => !READ_ONLY.test(c.path));
const run = (name, args, clients) => registry.handlers[name](args, clients);
const toolNamed = (n) => registry.tools.find((t) => t.name === n);
const notFound = () => googleError(404, 'notFound', 'Resource Not Found');

// Arguments that look like a real call for every tool in this part of the table.
const CALLS = {
  admin_create_user: { primaryEmail: 'new@example.test', firstName: 'Nia', lastName: 'Lee' },
  admin_unsuspend_user: { userKey: 'sam@example.test' },
  admin_move_user_orgunit: { userKey: 'sam@example.test', orgUnitPath: '/Staff' },
  admin_undelete_user: { userId: '12345' },
  admin_set_2sv_enforcement: { userKey: 'sam@example.test', enforce: true },
  admin_set_user_photo: { userKey: 'sam@example.test', base64Data: 'cG5n' },
  admin_create_group: { email: 'team@example.test', name: 'Team' },
  admin_update_group: { groupKey: 'team@example.test', name: 'Crew' },
  admin_add_group_member: { groupKey: 'team@example.test', memberEmail: 'sam@example.test' },
  admin_update_group_member_role: { groupKey: 'team@example.test', memberEmail: 'sam@example.test', role: 'MANAGER' },
  admin_add_group_alias: { groupKey: 'team@example.test', alias: 'crew@example.test' },
  admin_update_group_settings: { groupEmail: 'team@example.test', whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST' },
  admin_create_orgunit: { name: 'Staff' },
  admin_update_orgunit: { orgUnitPath: '/Staff', name: 'Crew' },
  admin_add_domain: { domainName: 'new.example.test' },
  admin_add_domain_alias: { domainAliasName: 'alias.example.test', parentDomainName: 'example.test' },
  admin_create_role: { roleName: 'Helpdesk', privileges: [{ privilegeName: 'USERS_RETRIEVE', serviceId: '00haapch16h1ysv' }] },
  admin_update_role: { roleId: '7', roleName: 'Helpdesk 2' },
  admin_create_role_assignment: { roleId: '7', assignedToUserKey: '12345' },
  admin_update_chrome_device: { deviceId: 'dev1', updates: { annotatedUser: 'sam' } },
  admin_move_chrome_devices_to_orgunit: { deviceIds: ['dev1', 'dev2'], orgUnitPath: '/Kiosks' },
  admin_create_building: { buildingId: 'b1', buildingName: 'HQ' },
  admin_update_building: { buildingId: 'b1', updates: { buildingName: 'HQ 2' } },
  admin_create_feature: { name: 'Projector' },
  admin_create_calendar_resource: { resourceId: 'r1', resourceName: 'Room 1' },
  admin_update_calendar_resource: { resourceId: 'r1', updates: { resourceName: 'Room 2' } },
  admin_create_schema: { schemaName: 'HR', fields: [{ fieldName: 'badge', fieldType: 'STRING' }] },
  admin_update_schema: { schemaKey: 'HR', fields: [{ fieldName: 'badge', fieldType: 'STRING' }] },
  admin_update_customer_info: { updates: { language: 'en' } },
  licensing_assign_license: { skuId: '1010020020', userId: 'sam@example.test' },
  licensing_update_assignment: { skuId: '1010020020', userId: 'sam@example.test', newSkuId: '1010020025' },
  chrome_set_policy: { orgUnitPath: 'id:abc', policySchema: 'chrome.users.BrowserSignin', policyValue: { browserSignin: 'DISABLE' } },
  vault_create_matter: { name: 'Case 1' },
  vault_create_hold: { matterId: 'm1', name: 'Hold 1', corpus: 'MAIL', accountEmails: ['sam@example.test'] },
  workflow_onboard_employee: { primaryEmail: 'new@example.test', firstName: 'Nia', lastName: 'Lee' },
  workflow_add_domain_and_start_verification: { domainName: 'new.example.test' },
  workspace_set_default_account: { email: 'ops@example.test' },
  workspace_set_allowed_domains: { email: 'ops@example.test', domains: ['example.test', 'other.test'] },
  workspace_revoke_connection: { tokenPrefix: 'CCCCCCCC' }
};
const DESTRUCTIVE = ['admin_create_user', 'admin_unsuspend_user', 'admin_undelete_user', 'admin_set_2sv_enforcement', 'admin_add_domain', 'admin_add_domain_alias', 'admin_create_role', 'admin_update_role', 'admin_create_role_assignment', 'admin_move_chrome_devices_to_orgunit', 'admin_update_customer_info', 'licensing_assign_license', 'licensing_update_assignment', 'chrome_set_policy', 'vault_create_hold', 'workflow_onboard_employee', 'workflow_add_domain_and_start_verification', 'workspace_set_allowed_domains', 'workspace_revoke_connection'];
const PLAIN = Object.keys(CALLS).filter((n) => !DESTRUCTIVE.includes(n));

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' });
  await holder.db.saveGoogleTokensFor('two@example.test', { access_token: 'b' });
  await holder.db.createOAuthClient({ clientId: 'c1', clientSecret: 's', redirectUris: ['https://example.test/cb'], clientName: 'Claude' });
  await holder.db.createAccessToken({ accessToken: 'CCCCCCCC-one-secret-tail', refreshToken: 'rt1', clientId: 'c1', googleAccount: 'ops@example.test' });
});

describe('the admin part of the safety table', () => {
  it('has an entry for each of these tools, destructive exactly where the rules say so', () => {
    for (const name of Object.keys(CALLS)) expect(GUARDS_ADMIN[name], name).toBeTruthy();
    for (const name of DESTRUCTIVE) expect(GUARDS[name].destructive, name).toBe(true);
    for (const name of PLAIN) expect(GUARDS[name].destructive, name).toBe(false);
    for (const name of Object.keys(CALLS)) expect(toolNamed(name).inputSchema.properties.dryRun?.type, name).toBe('boolean');
    for (const name of DESTRUCTIVE) expect(toolNamed(name).inputSchema.properties.confirm?.type, name).toBe('boolean');
  });
});

describe('destructive admin tools without confirm', () => {
  for (const name of DESTRUCTIVE) {
    it(`${name}: asks first, changes nothing at Google or in this server, and logs nothing`, async () => {
      const { clients, calls } = makeFakeClients();
      const out = body(await run(name, CALLS[name], clients));
      expect(out).toMatchObject({ done: false, needsConfirmation: true });
      expect(typeof out.summary).toBe('string');
      expect(mutations(calls), 'mutating calls').toEqual([]);
      expect(await holder.db.listRecentChanges()).toEqual([]);
      expect((await holder.db.listConnections()).every((c) => !c.revoked_at)).toBe(true);
      expect(await holder.db.getAllowedDomains('ops@example.test')).toEqual(['example.test']);
    });
  }
  it('confirm: "yes" (not true) does not count', async () => {
    const { clients, calls } = makeFakeClients();
    expect(body(await run('licensing_assign_license', { ...CALLS.licensing_assign_license, confirm: 'yes' }, clients)).needsConfirmation).toBe(true);
    expect(mutations(calls)).toEqual([]);
  });
});

describe('every tool here, as a dry run', () => {
  for (const name of Object.keys(CALLS)) {
    it(`${name}: previews and changes nothing`, async () => {
      const { clients, calls } = makeFakeClients();
      const out = body(await run(name, { ...CALLS[name], dryRun: true }, clients));
      expect(out).toMatchObject({ done: false, dryRun: true });
      expect(mutations(calls), 'mutating calls').toEqual([]);
      expect((await holder.db.listRecentChanges()).every((r) => r.dry_run)).toBe(true);
      expect((await holder.db.listConnections()).every((c) => !c.revoked_at)).toBe(true);
      expect(await holder.db.getAllowedDomains('ops@example.test')).toEqual(['example.test']);
    });
  }
});

describe('"confirmed" means Google shows what was asked for', () => {
  it('admin_move_user_orgunit: confirmed when the user is in the new org unit afterwards', async () => {
    const { clients, calls, when } = makeFakeClients();
    let ou = '/';
    when('admin.users.get').resolves(() => ({ data: { primaryEmail: 'sam@example.test', orgUnitPath: ou } }));
    when('admin.users.update').resolves((req) => { ou = req.requestBody.orgUnitPath; return { data: { orgUnitPath: ou } }; });
    const out = body(await run('admin_move_user_orgunit', CALLS.admin_move_user_orgunit, clients));
    expect(calls.some((c) => c.path === 'admin.users.update')).toBe(true);
    expect(out).toMatchObject({ done: true, confirmed: true, before: { orgUnitPath: '/' }, after: { orgUnitPath: '/Staff' } });
  });
  it('admin_move_user_orgunit: not confirmed when Google still shows the old org unit', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', orgUnitPath: '/' } });
    const out = body(await run('admin_move_user_orgunit', CALLS.admin_move_user_orgunit, clients));
    expect(out).toMatchObject({ done: true, confirmed: false });
    expect(out.warning).toMatch(/does not show/);
  });
  it('admin_update_group: confirmed only when the group now has the new name', async () => {
    const { clients, when } = makeFakeClients();
    let name = 'Team';
    when('admin.groups.get').resolves(() => ({ data: { email: 'team@example.test', name } }));
    when('admin.groups.update').resolves((req) => { name = req.requestBody.name; return { data: {} }; });
    expect(body(await run('admin_update_group', CALLS.admin_update_group, clients))).toMatchObject({ confirmed: true, before: { name: 'Team' }, after: { name: 'Crew' } });
    const stale = makeFakeClients();
    stale.when('admin.groups.get').resolves({ data: { email: 'team@example.test', name: 'Team' } });
    expect(body(await run('admin_update_group', CALLS.admin_update_group, stale.clients))).toMatchObject({ confirmed: false });
  });
  it('admin_unsuspend_user: not confirmed while the user is still suspended', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', suspended: true } });
    expect(body(await run('admin_unsuspend_user', { ...CALLS.admin_unsuspend_user, confirm: true }, clients)).confirmed).toBe(false);
    const fine = makeFakeClients();
    fine.when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test' } }); // Google leaves out a false field
    expect(body(await run('admin_unsuspend_user', { ...CALLS.admin_unsuspend_user, confirm: true }, fine.clients)).confirmed).toBe(true);
  });
  it('admin_set_2sv_enforcement: Google ignoring the field is reported, not hidden', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', isEnforcedIn2Sv: false } });
    const out = body(await run('admin_set_2sv_enforcement', { ...CALLS.admin_set_2sv_enforcement, confirm: true }, clients));
    expect(out.confirmed).toBe(false);
  });
  it('admin_create_user: finds the new user afterwards, and the password is not in what is logged', async () => {
    const { clients, calls, when } = makeFakeClients();
    let created = false;
    when('admin.users.get').resolves(() => { if (!created) throw notFound(); return { data: { primaryEmail: 'new@example.test', name: { givenName: 'Nia', familyName: 'Lee' }, orgUnitPath: '/' } }; });
    when('admin.users.insert').resolves(() => { created = true; return { data: { id: '1', primaryEmail: 'new@example.test' } }; });
    const out = body(await run('admin_create_user', { ...CALLS.admin_create_user, confirm: true }, clients));
    expect(calls.some((c) => c.path === 'admin.users.insert')).toBe(true);
    expect(out).toMatchObject({ done: true, confirmed: true, before: { exists: false } });
    const password = out.details.temporaryPassword;
    expect(password).toBeTruthy();
    expect(out.summary).not.toContain(password);
    expect(JSON.stringify(await holder.db.listRecentChanges())).not.toContain(password);
  });
  it('licensing_assign_license: refused without confirm, then assigned and read back with confirm', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('licensing.licenseAssignments.get').rejects(notFound());
    expect(body(await run('licensing_assign_license', CALLS.licensing_assign_license, clients)).needsConfirmation).toBe(true);
    expect(calls.some((c) => c.path === 'licensing.licenseAssignments.insert')).toBe(false);
    when('licensing.licenseAssignments.get').resolves({ data: { skuId: '1010020020', userId: 'sam@example.test' } });
    const out = body(await run('licensing_assign_license', { ...CALLS.licensing_assign_license, confirm: true }, clients));
    expect(calls.some((c) => c.path === 'licensing.licenseAssignments.insert')).toBe(true);
    expect(out).toMatchObject({ done: true, confirmed: true });
    const other = makeFakeClients();
    other.when('licensing.licenseAssignments.get').resolves({ data: { skuId: 'something-else' } });
    expect(body(await run('licensing_assign_license', { ...CALLS.licensing_assign_license, confirm: true }, other.clients)).confirmed).toBe(false);
  });
  it('licensing_update_assignment: reads the assignment under the new SKU', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('licensing.licenseAssignments.get').resolves((req) => ({ data: { skuId: req.skuId, userId: req.userId } }));
    const out = body(await run('licensing_update_assignment', { ...CALLS.licensing_update_assignment, confirm: true }, clients));
    expect(calls.filter((c) => c.path === 'licensing.licenseAssignments.patch')).toHaveLength(1);
    expect(out).toMatchObject({ confirmed: true, before: { skuId: '1010020020' }, after: { skuId: '1010020025' } });
  });
  it('admin_add_group_member: confirmed when Google lists the member with the role asked for', async () => {
    const f = makeFakeClients();
    let added = false;
    f.when('admin.members.get').resolves(() => { if (!added) throw notFound(); return { data: { email: 'sam@example.test', role: 'MEMBER', status: 'ACTIVE' } }; });
    f.when('admin.members.insert').resolves(() => { added = true; return { data: {} }; });
    const out = body(await run('admin_add_group_member', CALLS.admin_add_group_member, f.clients));
    expect(out).toMatchObject({ done: true, confirmed: true, before: { exists: false }, after: { role: 'MEMBER' } });
    const wrongRole = makeFakeClients();
    wrongRole.when('admin.members.get').resolves({ data: { email: 'sam@example.test', role: 'MEMBER' } });
    expect(body(await run('admin_add_group_member', { ...CALLS.admin_add_group_member, role: 'MANAGER', confirm: true }, wrongRole.clients)).confirmed).toBe(false);
  });
  it('admin_move_chrome_devices_to_orgunit: every device is checked afterwards', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('admin.chromeosdevices.get').resolves({ data: { orgUnitPath: '/Old' } });
    const stuck = body(await run('admin_move_chrome_devices_to_orgunit', { ...CALLS.admin_move_chrome_devices_to_orgunit, confirm: true }, clients));
    expect(calls.some((c) => c.path === 'admin.chromeosdevices.moveDevicesToOu')).toBe(true);
    expect(stuck.confirmed).toBe(false);
    expect(stuck.after.notInTarget).toHaveLength(2);
    const moved = makeFakeClients();
    moved.when('admin.chromeosdevices.get').resolves({ data: { orgUnitPath: '/Kiosks' } });
    expect(body(await run('admin_move_chrome_devices_to_orgunit', { ...CALLS.admin_move_chrome_devices_to_orgunit, confirm: true }, moved.clients)).confirmed).toBe(true);
  });
  it('chrome_set_policy: confirmed only when the resolved policy holds the value', async () => {
    const { clients, when } = makeFakeClients();
    when('chromepolicy.customers.policies.resolve').resolves({ data: { resolvedPolicies: [{ value: { policySchema: 'chrome.users.BrowserSignin', value: { browserSignin: 'DISABLE' } } }] } });
    expect(body(await run('chrome_set_policy', { ...CALLS.chrome_set_policy, confirm: true }, clients)).confirmed).toBe(true);
    const wrong = makeFakeClients();
    wrong.when('chromepolicy.customers.policies.resolve').resolves({ data: { resolvedPolicies: [{ value: { policySchema: 'chrome.users.BrowserSignin', value: { browserSignin: 'ENABLE' } } }] } });
    expect(body(await run('chrome_set_policy', { ...CALLS.chrome_set_policy, confirm: true }, wrong.clients)).confirmed).toBe(false);
    const none = makeFakeClients();
    expect(body(await run('chrome_set_policy', { ...CALLS.chrome_set_policy, confirm: true }, none.clients)).confirmed).toBe(false);
  });
  it('vault_create_hold: not confirmed when an account is missing from the hold', async () => {
    const { clients, when } = makeFakeClients();
    when('vault.matters.holds.create').resolves({ data: { holdId: 'h1' } });
    when('vault.matters.holds.get').resolves({ data: { holdId: 'h1', name: 'Hold 1', corpus: 'MAIL', accounts: [{ email: 'SAM@example.test' }] } });
    expect(body(await run('vault_create_hold', { ...CALLS.vault_create_hold, confirm: true }, clients)).confirmed).toBe(true);
    const f = makeFakeClients();
    f.when('vault.matters.holds.create').resolves({ data: { holdId: 'h1' } });
    f.when('vault.matters.holds.get').resolves({ data: { holdId: 'h1', name: 'Hold 1', corpus: 'MAIL', accounts: [] } });
    expect(body(await run('vault_create_hold', { ...CALLS.vault_create_hold, confirm: true }, f.clients)).confirmed).toBe(false);
  });
  it('admin_create_role_assignment: reads the assignment back by the id Google returned', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('admin.roleAssignments.insert').resolves({ data: { roleAssignmentId: 'ra1' } });
    when('admin.roleAssignments.get').resolves({ data: { roleAssignmentId: 'ra1', roleId: '7', scopeType: 'CUSTOMER' } });
    expect(body(await run('admin_create_role_assignment', { ...CALLS.admin_create_role_assignment, confirm: true }, clients)).confirmed).toBe(true);
    expect(calls.some((c) => c.path === 'admin.roleAssignments.get')).toBe(true);
    const f = makeFakeClients(); // Google never says which assignment was made: nothing can be claimed
    expect(body(await run('admin_create_role_assignment', { ...CALLS.admin_create_role_assignment, confirm: true }, f.clients)).confirmed).toBe(false);
  });
  it('admin_update_customer_info: compares the nested fields that were asked for', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.customers.get').resolves({ data: { language: 'fr' } });
    expect(body(await run('admin_update_customer_info', { updates: { language: 'en' }, confirm: true }, clients)).confirmed).toBe(false);
    when('admin.customers.get').resolves({ data: { language: 'en' } });
    expect(body(await run('admin_update_customer_info', { updates: { language: 'en' }, confirm: true }, clients)).confirmed).toBe(true);
  });
});

describe('risky arguments of otherwise plain tools need confirm', () => {
  const plainRun = async (name, args) => { const f = makeFakeClients(); f.when('admin.members.get').resolves({ data: { email: 'sam@example.test', role: args.role || 'MEMBER' } }); return { out: body(await run(name, args, f.clients)), calls: f.calls }; };
  it('group member: owner or manager roles and outside addresses need confirm; an ordinary member of the same domain does not', async () => {
    for (const extra of [{ role: 'OWNER' }, { role: 'MANAGER' }, { memberEmail: 'stranger@elsewhere.test' }]) {
      const { out, calls } = await plainRun('admin_add_group_member', { ...CALLS.admin_add_group_member, ...extra });
      expect(out, JSON.stringify(extra)).toMatchObject({ done: false, needsConfirmation: true });
      expect(mutations(calls)).toEqual([]);
    }
    expect((await plainRun('admin_add_group_member', CALLS.admin_add_group_member)).out.done).toBe(true);
    expect((await plainRun('admin_add_group_member', { ...CALLS.admin_add_group_member, role: 'MANAGER', confirm: true })).out.done).toBe(true);
  });
  it('group member role change: only owner/manager needs confirm', async () => {
    expect((await plainRun('admin_update_group_member_role', { ...CALLS.admin_update_group_member_role })).out.needsConfirmation).toBe(true);
    expect((await plainRun('admin_update_group_member_role', { ...CALLS.admin_update_group_member_role, role: 'MEMBER' })).out.done).toBe(true);
  });
  it('group settings: opening a group to outsiders or the whole internet needs confirm', async () => {
    const f = () => { const x = makeFakeClients(); x.when('groupssettings.groups.get').resolves({ data: { whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST' } }); return x; };
    for (const extra of [{ allowExternalMembers: true }, { whoCanJoin: 'ANYONE_CAN_JOIN' }, { whoCanPostMessage: 'ANYONE_CAN_POST' }, { whoCanViewGroup: 'ANYONE_CAN_VIEW' }]) {
      const x = f();
      expect(body(await run('admin_update_group_settings', { groupEmail: 'team@example.test', ...extra }, x.clients)), JSON.stringify(extra)).toMatchObject({ needsConfirmation: true });
      expect(mutations(x.calls)).toEqual([]);
    }
    const x = f();
    expect(body(await run('admin_update_group_settings', CALLS.admin_update_group_settings, x.clients))).toMatchObject({ done: true, confirmed: true });
    const y = makeFakeClients();
    y.when('groupssettings.groups.get').resolves({ data: { allowExternalMembers: 'false' } });
    expect(body(await run('admin_update_group_settings', { groupEmail: 'team@example.test', allowExternalMembers: true, confirm: true }, y.clients)).confirmed).toBe(false);
  });
  it('org unit: moving it under another parent needs confirm, renaming does not', async () => {
    const f = () => { const x = makeFakeClients(); x.when('admin.orgunits.get').resolves({ data: { name: 'Crew', orgUnitPath: '/Crew', parentOrgUnitPath: '/' } }); return x; };
    const x = f();
    expect(body(await run('admin_update_orgunit', { orgUnitPath: '/Staff', parentOrgUnitPath: '/Other' }, x.clients)).needsConfirmation).toBe(true);
    expect(mutations(x.calls)).toEqual([]);
    expect(body(await run('admin_update_orgunit', CALLS.admin_update_orgunit, f().clients))).toMatchObject({ done: true, confirmed: true });
  });
  it('Chrome device: changing its org unit needs confirm, a note or user label does not', async () => {
    const x = makeFakeClients();
    expect(body(await run('admin_update_chrome_device', { deviceId: 'd', updates: { orgUnitPath: '/Kiosks' } }, x.clients)).needsConfirmation).toBe(true);
    expect(mutations(x.calls)).toEqual([]);
    const y = makeFakeClients();
    y.when('admin.chromeosdevices.get').resolves({ data: { annotatedUser: 'sam' } });
    expect(body(await run('admin_update_chrome_device', CALLS.admin_update_chrome_device, y.clients))).toMatchObject({ done: true, confirmed: true });
  });
});

describe('workflows', () => {
  it('workflow_onboard_employee: not confirmed when a step failed, even though the handler did not throw', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.insert').resolves({ data: { primaryEmail: 'new@example.test' } });
    when('admin.users.get').resolves({ data: { primaryEmail: 'new@example.test', orgUnitPath: '/' } });
    when('admin.members.insert').rejects(googleError(403, 'forbidden', 'Not Authorized'));
    const out = body(await run('workflow_onboard_employee', { ...CALLS.workflow_onboard_employee, groupEmails: ['team@example.test'], confirm: true }, clients));
    expect(out.details.steps.some((s) => s.status === 'failed')).toBe(true);
    expect(out.confirmed).toBe(false);
    expect(out.summary).not.toContain(out.details.steps[0].temporaryPassword);
  });
  it('workflow_onboard_employee: confirmed when every step worked and the user exists', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.insert').resolves({ data: { primaryEmail: 'new@example.test' } });
    when('admin.users.get').resolves({ data: { primaryEmail: 'new@example.test', orgUnitPath: '/' } });
    expect(body(await run('workflow_onboard_employee', { ...CALLS.workflow_onboard_employee, confirm: true }, clients))).toMatchObject({ done: true, confirmed: true });
  });
  it('workflow_onboard_employee: an error result from the handler is never confirmed', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.insert').rejects(googleError(409, 'duplicate', 'Entity already exists.'));
    when('admin.users.get').resolves({ data: { primaryEmail: 'new@example.test', orgUnitPath: '/' } });
    expect(body(await run('workflow_onboard_employee', { ...CALLS.workflow_onboard_employee, confirm: true }, clients)).confirmed).toBe(false);
  });
  it('workflow_add_domain_and_start_verification: needs the DNS record and the domain to exist afterwards', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.domains.insert').resolves({ data: { domainName: 'new.example.test' } });
    when('admin.domains.get').resolves({ data: { domainName: 'new.example.test', verified: false } });
    when('siteVerification.webResource.getToken').resolves({ data: { token: 'google-site-verification=abc' } });
    expect(body(await run('workflow_add_domain_and_start_verification', { ...CALLS.workflow_add_domain_and_start_verification, confirm: true }, clients))).toMatchObject({ done: true, confirmed: true });
    when('siteVerification.webResource.getToken').rejects(googleError(403, 'forbidden', 'Not Authorized'));
    expect(body(await run('workflow_add_domain_and_start_verification', { ...CALLS.workflow_add_domain_and_start_verification, confirm: true }, clients)).confirmed).toBe(false);
  });
});

describe("this server's own settings", () => {
  it('workspace_set_allowed_domains: needs confirm, then changes the list, reads it back and logs exactly one row', async () => {
    const { clients } = makeFakeClients();
    expect(body(await run('workspace_set_allowed_domains', CALLS.workspace_set_allowed_domains, clients))).toMatchObject({ done: false, needsConfirmation: true });
    expect(await holder.db.getAllowedDomains('ops@example.test')).toEqual(['example.test']);
    const out = body(await run('workspace_set_allowed_domains', { ...CALLS.workspace_set_allowed_domains, confirm: true }, clients));
    expect(out).toMatchObject({ done: true, confirmed: true, before: { allowedDomains: ['example.test'] }, after: { allowedDomains: ['example.test', 'other.test'] } });
    expect(await holder.db.getAllowedDomains('ops@example.test')).toEqual(['example.test', 'other.test']);
    const rows = await holder.db.listRecentChanges();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tool: 'workspace_set_allowed_domains', target: 'ops@example.test' });
  });
  it('workspace_set_allowed_domains: an empty list goes back to the own domain and is confirmed', async () => {
    await holder.db.setAllowedDomains('ops@example.test', ['example.test', 'other.test']);
    const out = body(await run('workspace_set_allowed_domains', { email: 'ops@example.test', domains: [], confirm: true }, makeFakeClients().clients));
    expect(out).toMatchObject({ confirmed: true, after: { allowedDomains: ['example.test'] } });
  });
  it('workspace_set_allowed_domains: something that is not a domain is rejected when it is applied', async () => {
    await expect(run('workspace_set_allowed_domains', { email: 'ops@example.test', domains: ['nope nope'], confirm: true }, makeFakeClients().clients)).rejects.toThrow(/does not look like a domain/);
    expect(await holder.db.getAllowedDomains('ops@example.test')).toEqual(['example.test']);
  });
  it('workspace_revoke_connection: shows only the first 8 characters, revokes on confirm, reads it back, logs once', async () => {
    const { clients } = makeFakeClients();
    const asked = body(await run('workspace_revoke_connection', { tokenPrefix: 'CCCCCCCC-one-secret-tail' }, clients));
    expect(asked).toMatchObject({ needsConfirmation: true });
    expect(JSON.stringify(asked)).not.toContain('one-secret');
    expect((await holder.db.getAccessToken('CCCCCCCC-one-secret-tail'))).not.toBeNull();
    const out = body(await run('workspace_revoke_connection', { tokenPrefix: 'CCCCCCCC-one-secret-tail', confirm: true }, clients));
    expect(out).toMatchObject({ done: true, confirmed: true });
    expect(await holder.db.getAccessToken('CCCCCCCC-one-secret-tail')).toBeNull();
    const rows = await holder.db.listRecentChanges();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('one-secret');
  });
  it('workspace_revoke_connection: a prefix that matches nothing revokes nothing and is not called confirmed', async () => {
    const out = body(await run('workspace_revoke_connection', { tokenPrefix: 'ZZZZZZZZ', confirm: true }, makeFakeClients().clients));
    expect(out.confirmed).toBe(false);
    expect(String(out.details)).toMatch(/no connection starts with that/);
    expect(await holder.db.getAccessToken('CCCCCCCC-one-secret-tail')).not.toBeNull();
  });
  it('workspace_set_default_account: switches the default and reads it back; an unknown account fails and changes nothing', async () => {
    const { clients } = makeFakeClients();
    const out = body(await run('workspace_set_default_account', { email: 'TWO@example.test' }, clients));
    expect(out).toMatchObject({ done: true, confirmed: true, before: { defaultAccount: 'ops@example.test' }, after: { defaultAccount: 'two@example.test' } });
    await expect(run('workspace_set_default_account', { email: 'nobody@example.test' }, clients)).rejects.toThrow(/No connected Google account/);
    expect(await holder.db.getDefaultGoogleAccount()).toBe('two@example.test');
  });
});

describe('the business-domain guard still wraps these tools after the safety table', () => {
  it('refuses an address outside the connection\'s domains before anything is read or changed', async () => {
    const { clients, calls } = makeFakeClients({ actingAs: 'ops@example.test' });
    clients.allowedDomains = ['example.test'];
    const out = await run('licensing_assign_license', { skuId: 's', userId: 'x@elsewhere.test', confirm: true }, clients);
    expect(out.content[0].text).toMatch(/Refused/);
    expect(calls).toEqual([]);
  });
});
