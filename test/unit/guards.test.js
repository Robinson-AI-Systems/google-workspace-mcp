import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { GUARDS } = await import('../../src/tools/guards.js');

const body = (r) => JSON.parse(r.content[0].text);
const READ_ONLY = /\.(get|list|search)[A-Za-z]*$/; // reads only
const mutations = (calls) => calls.filter((c) => !READ_ONLY.test(c.path));
const toolNamed = (n) => registry.tools.find((t) => t.name === n);

// Realistic arguments for the names the guard descriptions read.
const ARGS = { userKey: 'sam@example.test', groupKey: 'team@example.test', alias: 'a@example.test', email: 'ops@example.test', fileId: 'f1', eventId: 'e1', calendarId: 'primary', id: 'id1', documentId: 'd1', spreadsheetId: 's1', sheetId: 1, presentationId: 'p1', pageObjectId: 'o1', objectId: 'o1', startIndex: 1, endIndex: 5, orgUnitPath: '/Old', domainName: 'example.test', domainAliasName: 'alias.example.test', roleId: '1', ids: ['m1'], messageId: 'm1' };

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' });
});

describe('the safety table', () => {
  it('has an entry for every tool whose name says it deletes, so a new delete tool cannot ship unguarded', () => {
    const deleting = registry.tools.map((t) => t.name).filter((n) => /_delete/.test(n));
    expect(deleting.filter((n) => !GUARDS[n])).toEqual([]);
  });

  it('covers the other dangerous tools too', () => {
    for (const n of ['admin_suspend_user', 'admin_reset_user_password', 'admin_sign_out_user', 'admin_make_super_admin', 'workflow_offboard_employee', 'gmail_batch_delete', 'drive_empty_trash', 'workspace_remove_account', 'licensing_remove_license', 'gmail_update_forwarding_settings']) {
      expect(GUARDS[n]?.destructive, n).toBe(true);
    }
  });

  it('every guarded tool advertises dryRun, and destructive ones advertise confirm', () => {
    for (const [name, spec] of Object.entries(GUARDS)) {
      const props = toolNamed(name).inputSchema.properties;
      expect(props.dryRun?.type, name).toBe('boolean');
      if (spec.destructive) expect(props.confirm?.type, name).toBe('boolean');
    }
  });

  it('keeps the registry whole: same number of tools and handlers', () => {
    expect(registry.tools.length).toBe(Object.keys(registry.handlers).length);
  });
});

describe('every guarded tool, called without permission', () => {
  for (const [name, spec] of Object.entries(GUARDS)) {
    it(`${name}: a preview changes nothing at Google`, async () => {
      const { clients, calls } = makeFakeClients();
      const out = body(await registry.handlers[name]({ ...ARGS, dryRun: true }, clients));
      expect(out).toMatchObject({ done: false, dryRun: true });
      expect(mutations(calls), 'mutating calls').toEqual([]);
    });
    if (spec.destructive) {
      it(`${name}: without confirm it asks first and changes nothing`, async () => {
        const { clients, calls } = makeFakeClients();
        const out = body(await registry.handlers[name]({ ...ARGS }, clients));
        expect(out).toMatchObject({ done: false, needsConfirmation: true });
        expect(mutations(calls), 'mutating calls').toEqual([]);
        expect(await holder.db.listRecentChanges()).toEqual([]);
      });
    }
  }
});

describe('guarded tools, confirmed', () => {
  it('admin_delete_user deletes, then asks Google again and reports it gone', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('admin.users.get').resolvesOnce({ data: { primaryEmail: 'sam@example.test', suspended: false } });
    when('admin.users.get').rejects(googleError(404, 'notFound', 'Resource Not Found: userKey'));
    // the first (before) read succeeds; the rest (after) report not found
    const out = body(await registry.handlers.admin_delete_user({ userKey: 'sam@example.test', confirm: true }, clients));
    expect(calls.some((c) => c.path === 'admin.users.delete')).toBe(true);
    expect(out).toMatchObject({ done: true, confirmed: true, before: { primaryEmail: 'sam@example.test' }, after: { exists: false } });
    expect((await holder.db.listRecentChanges())[0]).toMatchObject({ tool: 'admin_delete_user', target: 'sam@example.test', dry_run: false });
  });

  it('admin_delete_user says NOT confirmed if Google still has the user afterwards', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test' } });
    const out = body(await registry.handlers.admin_delete_user({ userKey: 'sam@example.test', confirm: true }, clients));
    expect(out.confirmed).toBe(false);
  });

  it('admin_suspend_user returns the state Google reports afterwards', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('admin.users.get').resolvesOnce({ data: { primaryEmail: 'sam@example.test', suspended: false } });
    when('admin.users.get').resolvesOnce({ data: { primaryEmail: 'sam@example.test', suspended: true } });
    const out = body(await registry.handlers.admin_suspend_user({ userKey: 'sam@example.test', confirm: true }, clients));
    expect(calls.some((c) => c.path === 'admin.users.update')).toBe(true);
    expect(out).toMatchObject({ confirmed: true, before: { suspended: false }, after: { suspended: true } });
  });

  it('a tool that sends its arguments straight to Google never leaks dryRun or confirm into the request', async () => {
    const { clients, calls } = makeFakeClients();
    await registry.handlers.gmail_update_forwarding_settings({ enabled: false, confirm: true }, clients);
    const sent = calls.find((c) => /settings\.(updateAutoForwarding|autoForwarding)/i.test(c.path) || /Forwarding/.test(c.path) && !READ_ONLY.test(c.path));
    expect(sent, 'the update call').toBeTruthy();
    expect(JSON.stringify(sent.args)).not.toMatch(/confirm|dryRun/);
  });

  it('a delete tool that did not need guarding before still works and is logged (calendar_delete_event)', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('calendar.events.get').resolvesOnce({ data: { id: 'e1', summary: 'Standup', status: 'confirmed' } });
    when('calendar.events.get').resolves({ data: { id: 'e1', status: 'cancelled' } });
    const out = body(await registry.handlers.calendar_delete_event({ ...ARGS, confirm: true }, clients));
    expect(calls.some((c) => c.path === 'calendar.events.delete')).toBe(true);
    expect(out).toMatchObject({ done: true, confirmed: true });
  });

  it('non-destructive guarded tools run without confirm and are logged', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', name: { givenName: 'Sam' } } });
    const out = body(await registry.handlers.admin_update_user({ userKey: 'sam@example.test', updates: { name: { givenName: 'Sam' } } }, clients));
    expect(calls.some((c) => c.path === 'admin.users.update')).toBe(true);
    expect(out.done).toBe(true);
    expect((await holder.db.listRecentChanges())).toHaveLength(1);
  });

  it('workspace_remove_account forgets the sign-in only when confirmed, and says so afterwards', async () => {
    const { clients } = makeFakeClients();
    await registry.handlers.workspace_remove_account({ email: 'ops@example.test' }, clients);
    expect((await holder.db.listGoogleAccounts()).map((a) => a.email)).toEqual(['ops@example.test']);
    const out = body(await registry.handlers.workspace_remove_account({ email: 'ops@example.test', confirm: true }, clients));
    expect(await holder.db.listGoogleAccounts()).toEqual([]);
    expect(out).toMatchObject({ done: true, confirmed: true, after: { exists: false } });
  });
});
