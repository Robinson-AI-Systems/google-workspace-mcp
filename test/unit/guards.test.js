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
const fromSchema = (tool) => Object.fromEntries(Object.entries(tool.inputSchema.properties || {}).filter(([k]) => k !== 'confirm' && k !== 'dryRun').map(([k, p]) => [k, ({ string: `${k}-x`, number: 1, integer: 1, boolean: true, array: ['x'], object: {} })[p.type] ?? 'x']));
const ARGS = { userKey: 'sam@example.test', groupKey: 'team@example.test', alias: 'a@example.test', email: 'ops@example.test', fileId: 'f1', eventId: 'e1', calendarId: 'primary', id: 'id1', documentId: 'd1', spreadsheetId: 's1', sheetId: 1, presentationId: 'p1', pageObjectId: 'o1', objectId: 'o1', startIndex: 1, endIndex: 5, orgUnitPath: '/Old', domainName: 'example.test', domainAliasName: 'alias.example.test', roleId: '1', ids: ['m1'], messageId: 'm1' };

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' });
});

describe('the safety table', () => {
  it('has an entry for every tool whose name says it deletes, so a new delete tool cannot ship unguarded', () => {
    // This server's own revoke tool already asks for confirm: true itself (see accounts.js).
    const OWN_CONFIRM = new Set(['workspace_revoke_connection']);
    const dangerous = registry.tools.map((t) => t.name).filter((n) => /_(delete|remove|clear|unshare|revoke|empty)(_|$)|transfer_ownership|start_transfer/.test(n));
    expect(dangerous.length).toBeGreaterThan(40);
    expect(dangerous.filter((n) => !GUARDS[n] && !OWN_CONFIRM.has(n))).toEqual([]);
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
      const out = body(await registry.handlers[name]({ ...fromSchema(toolNamed(name)), dryRun: true }, clients));
      expect(out).toMatchObject({ done: false, dryRun: true });
      expect(mutations(calls), 'mutating calls').toEqual([]);
    });
    if (spec.destructive) {
      it(`${name}: without confirm it asks first and changes nothing`, async () => {
        const { clients, calls } = makeFakeClients();
        const out = body(await registry.handlers[name]({ ...fromSchema(toolNamed(name)) }, clients));
        expect(out).toMatchObject({ done: false, needsConfirmation: true });
        expect(mutations(calls), 'mutating calls').toEqual([]);
        expect(await holder.db.listRecentChanges()).toEqual([]);
      });
    }
  }
});

describe('risky uses of general-purpose tools need confirm too', () => {
  const unconfirmed = async (name, args) => {
    const { clients, calls } = makeFakeClients();
    const out = body(await registry.handlers[name](args, clients));
    return { out, calls };
  };
  it('admin_update_user cannot suspend, reset a password, archive or make an admin without confirm', async () => {
    for (const updates of [{ suspended: true }, { password: 'x1y2z3' }, { archived: true }, { isAdmin: true }, { name: { givenName: 'Q' }, suspended: true }]) {
      const { out, calls } = await unconfirmed('admin_update_user', { userKey: 'sam@example.test', updates });
      expect(out, JSON.stringify(updates)).toMatchObject({ done: false, needsConfirmation: true });
      expect(mutations(calls)).toEqual([]);
    }
  });
  it('admin_update_user with ordinary fields still just works, and a requested change Google does not show is flagged', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', recoveryEmail: 'old@example.test' } });
    const out = body(await registry.handlers.admin_update_user({ userKey: 'sam@example.test', updates: { recoveryEmail: 'new@example.test' } }, clients));
    expect(out).toMatchObject({ done: true, confirmed: false });
    expect(out.warning).toMatch(/does not show/);
  });
  it('a public or domain-wide share, and a filter that forwards, need confirm; ordinary ones do not', async () => {
    expect((await unconfirmed('drive_share_file', { fileId: 'f', type: 'anyone', role: 'reader' })).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('gmail_create_filter', { from: 'a@b.test', forward: 'x@y.test' })).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('drive_share_file', { fileId: 'f', type: 'user', emailAddress: 'a@b.test', role: 'reader' })).out.done).toBe(true);
  });
  it('bulk editors need confirm only when the requests delete something', async () => {
    const del = { documentId: 'd', requests: [{ deleteContentRange: { range: { startIndex: 1, endIndex: 4 } } }] };
    const ins = { documentId: 'd', requests: [{ insertText: { text: 'x', location: { index: 1 } } }] };
    expect((await unconfirmed('docs_batch_update', del)).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('docs_batch_update', ins)).out.done).toBe(true);
    expect((await unconfirmed('sheets_batch_update', { spreadsheetId: 's', requests: [{ deleteSheet: { sheetId: 1 } }] })).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('slides_batch_update', { presentationId: 'p', requests: [{ deleteObject: { objectId: 'o' } }] })).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('forms_batch_update', { formId: 'f', requests: [{ deleteItem: { location: { index: 0 } } }] })).out.needsConfirmation).toBe(true);
  });
  it('a dry run of a risky update says it would need confirm', async () => {
    const { out } = await unconfirmed('admin_update_user', { userKey: 'sam@example.test', updates: { suspended: true }, dryRun: true });
    expect(out.note).toMatch(/confirm: true/);
  });
});

describe('"confirmed" means Google shows what was asked for', () => {
  it('admin_suspend_user: not confirmed when the user is still not suspended afterwards', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', suspended: false } });
    expect(body(await registry.handlers.admin_suspend_user({ userKey: 'sam@example.test', confirm: true }, clients)).confirmed).toBe(false);
  });
  it('drive_empty_trash: not confirmed while files remain in the trash', async () => {
    const { clients, when } = makeFakeClients();
    when('drive.files.list').resolves({ data: { files: [{ id: '1', name: 'a' }] } });
    expect(body(await registry.handlers.drive_empty_trash({ confirm: true }, clients)).confirmed).toBe(false);
  });
  it('drive_empty_trash: confirmed once the trash is empty', async () => {
    const { clients, when } = makeFakeClients();
    when('drive.files.list').resolvesOnce({ data: { files: [{ id: '1', name: 'a' }] } });
    when('drive.files.list').resolves({ data: { files: [] } });
    expect(body(await registry.handlers.drive_empty_trash({ confirm: true }, clients)).confirmed).toBe(true);
  });
  it('vacation and forwarding settings: compared with what was asked', async () => {
    const { clients, when } = makeFakeClients();
    when('gmail.users.settings.getVacation').resolves({ data: { enableAutoReply: false } });
    expect(body(await registry.handlers.gmail_update_vacation_settings({ enableAutoReply: true, confirm: true }, clients)).confirmed).toBe(false);
    when('gmail.users.settings.getAutoForwarding').resolves({ data: { enabled: false } });
    expect(body(await registry.handlers.gmail_update_forwarding_settings({ enabled: false, confirm: true }, clients)).confirmed).toBe(true);
  });
  it('workflow_offboard_employee: not confirmed when a step failed, even though the handler itself did not throw', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', suspended: false } });
    when('admin.users.update').rejects(googleError(403, 'forbidden', 'Not Authorized'));
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@example.test', confirm: true }, clients));
    expect(out.details.steps.some((st) => st.status === 'failed')).toBe(true);
    expect(out.confirmed).toBe(false);
  });
  it('admin_make_super_admin writes exactly one log row', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolvesOnce({ data: { primaryEmail: 'k@example.test', isAdmin: false } });
    when('admin.users.get').resolves({ data: { primaryEmail: 'k@example.test', isAdmin: true } });
    const out = body(await registry.handlers.admin_make_super_admin({ userKey: 'k@example.test', isAdmin: true, confirm: true }, clients));
    expect(out.confirmed).toBe(true);
    expect(await holder.db.listRecentChanges()).toHaveLength(1);
  });
  it('a tool with no read-back claims nothing (confirmed: null)', async () => {
    const { clients } = makeFakeClients();
    expect(body(await registry.handlers.docs_batch_update({ documentId: 'd', requests: [{ insertText: { text: 'x', location: { index: 1 } } }] }, clients)).confirmed).toBeNull();
  });
  it('a record Google keeps but marks deleted counts as gone (alerts, chat messages)', async () => {
    const { clients, when } = makeFakeClients();
    when('alertcenter.alerts.get').resolves({ data: { alertId: 'a', deleted: true } });
    expect(body(await registry.handlers.admin_delete_alert({ alertId: 'a', confirm: true }, clients)).confirmed).toBe(true);
  });
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
