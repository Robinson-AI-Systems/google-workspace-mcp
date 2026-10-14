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
// Dummy values for fields whose value is checked: a field with a list of allowed values gets the first one; these get a value of the right shape.
const SAMPLE_VALUES = { customReplyTo: 'reply@example.test' };
const fromSchema = (tool) => Object.fromEntries(Object.entries(tool.inputSchema.properties || {}).filter(([k]) => k !== 'confirm' && k !== 'dryRun').map(([k, p]) => [k, p.enum?.[0] ?? SAMPLE_VALUES[k] ?? ({ string: `${k}-x`, number: 1, integer: 1, boolean: true, array: ['x'], object: {} })[p.type] ?? 'x']));
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
    // Tools built directly with defineWrite (dryRun + confirm in their schema) carry the safety layer themselves.
    const built = (n) => { const p = registry.tools.find((t) => t.name === n).inputSchema.properties || {}; return !!(p.dryRun && p.confirm); };
    expect(dangerous.filter((n) => !GUARDS[n] && !OWN_CONFIRM.has(n) && !built(n))).toEqual([]);
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
    for (const updates of [{ suspended: true }, { password: 'x1y2z3' }, { archived: true }, { isAdmin: true }, { name: { givenName: 'Q' }, suspended: true }, { primaryEmail: 'new@example.test' }, { recoveryEmail: 'x@y.test' }, { recoveryPhone: '+15550100' }, { orgUnitPath: '/Other' }, { someFutureField: 1 }]) {
      const { out, calls } = await unconfirmed('admin_update_user', { userKey: 'sam@example.test', updates });
      expect(out, JSON.stringify(updates)).toMatchObject({ done: false, needsConfirmation: true });
      expect(mutations(calls)).toEqual([]);
    }
  });
  it('admin_update_user with ordinary profile fields still just works, and a requested change Google does not show is flagged', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@example.test', gender: { type: 'other' } } });
    const out = body(await registry.handlers.admin_update_user({ userKey: 'sam@example.test', updates: { gender: { type: 'female' } } }, clients));
    expect(out.done).toBe(true); // no confirm needed
    const flagged = body(await registry.handlers.admin_update_user({ userKey: 'sam@example.test', confirm: true, updates: { recoveryEmail: 'new@example.test' } }, clients));
    expect(flagged).toMatchObject({ done: true, confirmed: false });
    expect(flagged.warning).toMatch(/does not show/);
  });
  it('a request that turns something OFF is confirmed even though Google leaves the field out when it is false', async () => {
    const { clients, when } = makeFakeClients();
    when('gmail.users.settings.getAutoForwarding').resolves({ data: {} });
    expect(body(await registry.handlers.gmail_update_forwarding_settings({ enabled: false, confirm: true }, clients)).confirmed).toBe(true);
    when('admin.users.get').resolves({ data: { primaryEmail: 'k@example.test' } });
    expect(body(await registry.handlers.admin_make_super_admin({ userKey: 'k@example.test', isAdmin: false, confirm: true }, clients)).confirmed).toBe(true);
  });
  it('a check that itself cannot run is never reported as success', async () => {
    const { defineWrite } = await import('../../src/tools/write.js');
    const { handler } = defineWrite({ name: 't', description: 'd', inputSchema: { type: 'object', properties: {} }, plan: () => ({ summary: 's' }), apply: async () => ({ content: [{ type: 'text', text: '{}' }] }), readAfter: async () => ({}), verify: () => { throw new Error('bug'); } });
    expect(body(await handler({}, makeFakeClients().clients)).confirmed).toBe(false);
  });
  it('sharing a calendar publicly or domain-wide, and a filter that trashes or skips the inbox, need confirm', async () => {
    expect((await unconfirmed('calendar_share_calendar', { calendarId: 'c', scopeType: 'default', role: 'reader' })).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('calendar_share_calendar', { calendarId: 'c', scopeType: 'domain', role: 'reader' })).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('calendar_share_calendar', { calendarId: 'c', scopeType: 'user', scopeValue: 'a@b.test', role: 'reader' })).out.done).toBe(true);
    expect((await unconfirmed('gmail_create_filter', { from: 'a@b.test', addLabelIds: ['TRASH'] })).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('gmail_create_filter', { from: 'a@b.test', removeLabelIds: ['INBOX'] })).out.needsConfirmation).toBe(true);
    expect((await unconfirmed('gmail_create_filter', { from: 'a@b.test', addLabelIds: ['Label_1'] })).out.done).toBe(true);
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


describe('secondary-calendar delete verification against conflicting Google reads', () => {
  const id = 'scratch-123@example.test';
  const run = (clients) => registry.handlers.calendar_delete_calendar({ calendarId: id, confirm: true }, clients).then(body);

  it('confirms cleanup when the exact calendar resource returns 404', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('calendar.calendars.get').resolvesOnce({ data: { id, summary: 'Scratch' } });
    when('calendar.calendars.get').rejects(googleError(404, 'notFound', 'Gone'));
    const result = await run(clients);
    expect(result).toMatchObject({ done: true, confirmed: true, after: { exists: false, verification: 'calendar_not_found' } });
    expect(calls.filter(c => c.path === 'calendar.calendars.delete')).toHaveLength(1);
    expect(calls.some(c => c.path === 'calendar.calendarList.delete')).toBe(false);
  });

  it('does not call a calendar permanently deleted when it is unlisted but metadata lingers', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('calendar.calendars.get').resolves({ data: { id, summary: 'Scratch' } });
    when('calendar.calendarList.get').rejects(googleError(404, 'notFound', 'Not on list'));
    const result = await run(clients);
    expect(result).toMatchObject({
      done: true, confirmed: false,
      after: { exists: null, listed: false, metadataReadable: true, verification: 'not_listed_metadata_readable' }
    });
    expect(result.after.note).toMatch(/not yet been verified/i);
    expect(result.after).not.toHaveProperty('stillThere');
    expect(calls.filter(c => c.path === 'calendar.calendars.delete')).toHaveLength(1);
    expect((await holder.db.listRecentChanges())).toHaveLength(1);
  });

  it('does not confirm when the exact calendar still appears in the account list', async () => {
    const { clients, when } = makeFakeClients();
    when('calendar.calendars.get').resolves({ data: { id, summary: 'Scratch' } });
    when('calendar.calendarList.get').resolves({ data: { id, summary: 'Scratch' } });
    expect(await run(clients)).toMatchObject({
      confirmed: false, after: { exists: true, listed: true, verification: 'still_listed' }
    });
  });

  it('accepts an exact-ID deleted resource marker but not a mismatched one', async () => {
    const { clients, when } = makeFakeClients();
    when('calendar.calendars.get').resolvesOnce({ data: { id, summary: 'Scratch' } });
    when('calendar.calendars.get').resolves({ data: { id, deleted: true } });
    expect(await run(clients)).toMatchObject({ confirmed: true, after: { exists: false, verification: 'calendar_deleted_marker' } });

    const other = makeFakeClients();
    other.when('calendar.calendars.get').resolvesOnce({ data: { id } });
    other.when('calendar.calendars.get').resolves({ data: { id: 'some-other-calendar', deleted: true } });
    other.when('calendar.calendarList.get').rejects(googleError(404, 'notFound', 'Not on list'));
    expect(await run(other.clients)).toMatchObject({ confirmed: false, after: { exists: null, verification: 'inconclusive' } });
  });

  it('leaves verification inconclusive when the list read itself fails', async () => {
    const { clients, when } = makeFakeClients();
    when('calendar.calendars.get').resolves({ data: { id } });
    when('calendar.calendarList.get').rejects(googleError(403, 'forbidden', 'Temporary API refusal'));
    expect(await run(clients)).toMatchObject({
      confirmed: false, after: { exists: null, listed: null, verification: 'inconclusive' }
    });
  });

  it('never deletes a calendar without explicit confirmation', async () => {
    const { clients, calls } = makeFakeClients();
    const result = body(await registry.handlers.calendar_delete_calendar({ calendarId: id }, clients));
    expect(result).toMatchObject({ done: false, needsConfirmation: true });
    expect(calls.some(c => c.path === 'calendar.calendars.delete')).toBe(false);
  });
});

describe('repeatable read-only secondary calendar cleanup verification', () => {
  const id = 'scratch-123@example.test';
  const verify = (clients) => registry.handlers.calendar_verify_calendar_deletion({ calendarId: id }, clients).then(body);

  it('confirms an exact resource 404 without attempting any mutation', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('calendar.calendars.get').rejects(googleError(404, 'notFound', 'No such calendar'));
    expect(await verify(clients)).toMatchObject({ exists: false, verification: 'calendar_not_found' });
    expect(mutations(calls)).toEqual([]);
    expect(await holder.db.listRecentChanges()).toHaveLength(0);
  });

  it('reconciles invisible list entry and still-readable metadata without another delete', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('calendar.calendars.get').resolves({ data: { id, summary: 'Temporary' } });
    when('calendar.calendarList.get').rejects(googleError(404, 'notFound', 'Not listed'));
    expect(await verify(clients)).toMatchObject({
      exists: null, listed: false, metadataReadable: true, verification: 'not_listed_metadata_readable'
    });
    expect(mutations(calls)).toEqual([]);
  });

  it('tells the owner when a calendar is still visible, without treating it as gone', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('calendar.calendars.get').resolves({ data: { id } });
    when('calendar.calendarList.get').resolves({ data: { id } });
    expect(await verify(clients)).toMatchObject({ exists: true, listed: true, verification: 'still_listed' });
    expect(mutations(calls)).toEqual([]);
  });

  it('does not claim success for a wrong-ID tombstone or denied metadata lookup', async () => {
    const first = makeFakeClients();
    first.when('calendar.calendars.get').resolves({ data: { id: 'other', deleted: true } });
    first.when('calendar.calendarList.get').rejects(googleError(404, 'notFound', 'Not listed'));
    expect(await verify(first.clients)).toMatchObject({ exists: null, verification: 'inconclusive' });
    expect(mutations(first.calls)).toEqual([]);

    const second = makeFakeClients();
    second.when('calendar.calendars.get').rejects(googleError(403, 'forbidden', 'Not authorized'));
    const denied = await registry.handlers.calendar_verify_calendar_deletion({ calendarId: id }, second.clients);
    expect(denied.content[0].text).toMatch(/What happened|Not authorized|permission|forbidden/i);
    expect(denied.content[0].text).not.toMatch(/"exists"\s*:\s*false/);
    expect(mutations(second.calls)).toEqual([]);
  });
});
