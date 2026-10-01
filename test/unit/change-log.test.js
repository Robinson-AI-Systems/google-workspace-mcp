import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { redact, recordChange } = await import('../../src/changelog.js');
const { handlers: admin } = await import('../../src/tools/admin-directory.js');
const { handlers: accounts } = await import('../../src/tools/accounts.js');
const { registry } = await import('../../src/tools/index.js');

const body = (r) => JSON.parse(r.content[0].text);
const withUser = (when, user) => when('admin.users.get').resolves({ data: user });

beforeEach(() => { holder.db = createFakeDb(); });

describe('redact', () => {
  it('replaces anything named like a secret, at any depth, and long text with its length', () => {
    const out = redact({ ok: 'fine', access_token: 'x', nested: { refresh_token: 'y', Password: 'z', list: [{ client_secret: 'q', keep: 1 }] }, photoData: 'AAAA', big: 'a'.repeat(5000) });
    expect(out.ok).toBe('fine');
    expect(out.access_token).toBe('[redacted]');
    expect(out.nested.refresh_token).toBe('[redacted]');
    expect(out.nested.Password).toBe('[redacted]');
    expect(out.nested.list[0]).toEqual({ client_secret: '[redacted]', keep: 1 });
    expect(out.photoData).toBe('[redacted]');
    expect(out.big).toBe('[5000 characters not stored]');
  });
});

describe('recordChange', () => {
  it('stores who acted, which connection asked, and never a credential', async () => {
    const { clients } = makeFakeClients({ actingAs: 'ops@example.test' });
    clients.connection = 'client123456/ab12cd34';
    const result = await recordChange(clients, { tool: 't', target: 'x', summary: 's', before: { api_key: 'SECRET-VALUE' }, after: { v: 1 } });
    expect(result.logged).toBe(true);
    const [row] = await holder.db.listRecentChanges();
    expect(row).toMatchObject({ acting_as: 'ops@example.test', connection: 'client123456/ab12cd34', tool: 't', after: { v: 1 } });
    expect(JSON.stringify(row)).not.toContain('SECRET-VALUE');
  });
  it('never throws when the log cannot be written, and says so', async () => {
    holder.db.recordChange = async () => { throw new Error('db down'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(recordChange({}, { tool: 't' })).resolves.toEqual({ logged: false });
    warn.mockRestore();
  });
});

describe('admin tools that now log', () => {
  it('admin_move_user_orgunit logs before and after', async () => {
    const { clients, when } = makeFakeClients({ actingAs: 'ops@example.test' });
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', orgUnitPath: '/' } });
    when('admin.users.update').resolves({ data: { primaryEmail: 'sam@example.test', orgUnitPath: '/Staff' } });
    await admin.admin_move_user_orgunit({ userKey: 'sam@example.test', orgUnitPath: '/Staff' }, clients);
    const [row] = await holder.db.listRecentChanges();
    expect(row).toMatchObject({ tool: 'admin_move_user_orgunit', target: 'sam@example.test', before: { orgUnitPath: '/' }, after: { orgUnitPath: '/Staff' }, acting_as: 'ops@example.test' });
  });

  it('admin_make_super_admin: one log row, the answer is what Google holds, and a change Google did not apply is flagged', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolvesOnce({ data: { primaryEmail: 'kim@example.test', isAdmin: false } });
    when('admin.users.get').resolvesOnce({ data: { primaryEmail: 'kim@example.test', isAdmin: false } }); // Google did not apply it
    const result = body(await registry.handlers.admin_make_super_admin({ userKey: 'kim@example.test', isAdmin: true, confirm: true }, clients));
    expect(result).toMatchObject({ done: true, confirmed: false, before: { isAdmin: false }, after: { isAdmin: false } });
    expect(result.warning).toMatch(/does not show/);
    const rows = await holder.db.listRecentChanges();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tool: 'admin_make_super_admin', before: { isAdmin: false }, after: { isAdmin: false } });
    expect(rows[0].summary).toMatch(/does not show the requested result/);
  });

  it('admin_set_2sv_enforcement logs before and after', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'kim@example.test', isEnforcedIn2Sv: false } });
    when('admin.users.update').resolves({ data: { primaryEmail: 'kim@example.test', isEnforcedIn2Sv: true } });
    await admin.admin_set_2sv_enforcement({ userKey: 'kim@example.test', enforce: true }, clients);
    expect((await holder.db.listRecentChanges())[0]).toMatchObject({ tool: 'admin_set_2sv_enforcement', before: { isEnforcedIn2Sv: false }, after: { isEnforcedIn2Sv: true } });
  });

  it('admin_set_user_photo logs sizes but never the picture, and copes with no earlier photo', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.photos.get').rejects(googleError(404, 'notFound', 'Photo not found'));
    when('admin.users.photos.update').resolves({ data: { mimeType: 'image/png', width: 96, height: 96, photoData: 'PICTURE-BYTES' } });
    await admin.admin_set_user_photo({ userKey: 'kim@example.test', base64Data: Buffer.from('png').toString('base64') }, clients);
    const [row] = await holder.db.listRecentChanges();
    expect(row.before).toBeNull();
    expect(row.after).toEqual({ mimeType: 'image/png', width: 96, height: 96 });
    expect(JSON.stringify(row)).not.toContain('PICTURE-BYTES');
  });

  it('a failed change writes nothing to the log', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', orgUnitPath: '/' } });
    when('admin.users.update').rejects(googleError(400, 'invalid', 'Invalid Ou Id'));
    await expect(admin.admin_move_user_orgunit({ userKey: 'sam@example.test', orgUnitPath: '/Nope' }, clients)).rejects.toThrow();
    expect(await holder.db.listRecentChanges()).toEqual([]);
  });
});

describe('admin_make_super_admin when the read-back fails', () => {
  it('still records the change, says it is unconfirmed, and does not report an error', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolvesOnce({ data: { primaryEmail: 'kim@example.test', isAdmin: false } });
    when('admin.users.get').rejects(googleError(503, 'backendError', 'Backend Error'));
    const result = body(await registry.handlers.admin_make_super_admin({ userKey: 'kim@example.test', isAdmin: true, confirm: true }, clients));
    expect(result).toMatchObject({ done: true, confirmed: false });
    const [row] = await holder.db.listRecentChanges();
    expect(row.summary).toMatch(/could not confirm/);
  });
});

describe('workspace_recent_changes', () => {
  beforeEach(async () => {
    await holder.db.recordChange({ actingAs: 'a@example.test', tool: 'tool_a', summary: 'one' });
    await holder.db.recordChange({ actingAs: 'b@example.test', tool: 'tool_b', summary: 'two' });
  });
  it('lists changes, filtered by tool or account', async () => {
    expect(body(await accounts.workspace_recent_changes({}))).toHaveLength(2);
    expect(body(await accounts.workspace_recent_changes({ tool: 'tool_b' }))).toHaveLength(1);
    expect(body(await accounts.workspace_recent_changes({ actingAs: 'a@example.test' }))[0].summary).toBe('one');
  });
  it('understands "3d", dates, and rejects nonsense in plain words', async () => {
    expect(body(await accounts.workspace_recent_changes({ since: '3d' }))).toHaveLength(2);
    expect(body(await accounts.workspace_recent_changes({ since: '2999-01-01' })).changes).toEqual([]);
    expect(await accounts.workspace_recent_changes({ since: 'last tuesday-ish' })).toMatchObject({ content: [{ text: expect.stringMatching(/could not read/) }] });
  });
});

describe('connections tools', () => {
  beforeEach(async () => {
    await holder.db.createOAuthClient({ clientId: 'c1', clientSecret: 's', redirectUris: ['https://example.test/cb'], clientName: 'Claude' });
    await holder.db.createAccessToken({ accessToken: 'CCCCCCCC-one-secret', refreshToken: 'rt1', clientId: 'c1', googleAccount: 'a@example.test' });
  });
  it('lists connections without any full token', async () => {
    const text = (await accounts.workspace_list_connections()).content[0].text;
    expect(text).toContain('CCCCCCCC');
    expect(text).not.toContain('one-secret');
    expect(text).not.toContain('rt1');
  });
  it('refuses to revoke without confirm: true, and changes nothing', async () => {
    await accounts.workspace_revoke_connection({ tokenPrefix: 'CCCCCCCC' });
    await accounts.workspace_revoke_connection({ tokenPrefix: 'CCCCCCCC', confirm: 'yes' });
    expect(await holder.db.getAccessToken('CCCCCCCC-one-secret')).not.toBeNull();
  });
  it('revokes when confirmed; explains short, unknown prefixes in plain words', async () => {
    expect((await accounts.workspace_revoke_connection({ tokenPrefix: 'CCC', confirm: true })).content[0].text).toMatch(/at least the first 8/);
    expect((await accounts.workspace_revoke_connection({ tokenPrefix: 'ZZZZZZZZ', confirm: true })).content[0].text).toMatch(/no connection starts with that/);
    expect(await holder.db.getAccessToken('CCCCCCCC-one-secret')).not.toBeNull();
    expect(body(await accounts.workspace_revoke_connection({ tokenPrefix: 'CCCCCCCC', confirm: true })).revoked).toBe(1);
    expect(await holder.db.getAccessToken('CCCCCCCC-one-secret')).toBeNull();
  });
});
