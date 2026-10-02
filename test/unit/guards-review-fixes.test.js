import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { makeFakeClients } from '../helpers/fake-google.js';
import { findMissing } from '../../scripts/check-writes-lib.mjs';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');

const body = (r) => JSON.parse(r.content[0].text);
const READ_ONLY = /\.(get|list|search)[A-Za-z]*$/;
const changes = (calls) => calls.filter((c) => !READ_ONLY.test(c.path));
const run = async (name, args, setup) => {
  const f = makeFakeClients();
  setup?.(f.when);
  const out = body(await registry.handlers[name](args, f.clients));
  return { out, calls: f.calls };
};
beforeEach(async () => { holder.db = createFakeDb(); await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' }); });

const BLOCK = { spreadsheetId: 's1', sheetId: 7, startRow: 0, endRow: 3, startColumn: 0, endColumn: 2 };
const tab = (extra = {}) => ({ data: { sheets: [{ properties: { sheetId: 7, title: 'Data', gridProperties: {} }, ...extra }] } });

describe('sheet layout tools', () => {
  for (const [name, args] of Object.entries({
    sheets_sort_range: { ...BLOCK, sortColumnIndex: 0 },
    sheets_merge_cells: { ...BLOCK },
    sheets_protect_range: { ...BLOCK, editorEmails: ['a@example.test'] }
  })) {
    it(`${name} does nothing without confirm, and preview changes nothing`, async () => {
      const a = await run(name, args, (w) => w('sheets.spreadsheets.get').resolves(tab()));
      expect(a.out.needsConfirmation).toBe(true);
      expect(changes(a.calls)).toEqual([]);
      const b = await run(name, { ...args, dryRun: true }, (w) => w('sheets.spreadsheets.get').resolves(tab()));
      expect(b.out.dryRun).toBe(true);
      expect(changes(b.calls)).toEqual([]);
    });
  }

  it('sort reports not confirmed when the column is still out of order afterwards', async () => {
    const { out } = await run('sheets_sort_range', { ...BLOCK, sortColumnIndex: 0, confirm: true }, (w) => {
      w('sheets.spreadsheets.get').resolves(tab());
      w('sheets.spreadsheets.values.get').resolves({ data: { values: [['3', 'c'], ['1', 'a'], ['2', 'b']] } });
    });
    expect(out.confirmed).toBe(false);
  });

  it('sort is confirmed when the column reads back in order', async () => {
    const { out } = await run('sheets_sort_range', { ...BLOCK, sortColumnIndex: 0, confirm: true }, (w) => {
      w('sheets.spreadsheets.get').resolves(tab());
      w('sheets.spreadsheets.values.get').resolves({ data: { values: [['1', 'a'], ['2', 'b'], ['3', 'c']] } });
    });
    expect(out.confirmed).toBe(true);
  });

  it('merge is not confirmed when Google shows no merge over the block, and is when it does', async () => {
    const bad = await run('sheets_merge_cells', { ...BLOCK, confirm: true }, (w) => w('sheets.spreadsheets.get').resolves(tab()));
    expect(bad.out.confirmed).toBe(false);
    const good = await run('sheets_merge_cells', { ...BLOCK, confirm: true }, (w) => w('sheets.spreadsheets.get').resolves(tab({ merges: [{ sheetId: 7, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 2 }] })));
    expect(good.out.confirmed).toBe(true);
  });

  it('freeze, format, unmerge and duplicate run without confirm and check the result', async () => {
    const freeze = await run('sheets_freeze_rows', { spreadsheetId: 's1', sheetId: 7, frozenRowCount: 2 }, (w) => w('sheets.spreadsheets.get').resolves({ data: { sheets: [{ properties: { sheetId: 7, title: 'Data', gridProperties: { frozenRowCount: 1 } } }] } }));
    expect(freeze.out.done).toBe(true);
    expect(freeze.out.confirmed).toBe(false);
    const dup = await run('sheets_duplicate_sheet', { spreadsheetId: 's1', sheetId: 7, newSheetName: 'Copy' }, (w) => w('sheets.spreadsheets.get').resolves({ data: { sheets: [{ properties: { sheetId: 7, title: 'Data' } }] } }));
    expect(dup.out.confirmed).toBe(false); // count did not go up
    const unmerge = await run('sheets_unmerge_cells', { ...BLOCK }, (w) => w('sheets.spreadsheets.get').resolves(tab()));
    expect(unmerge.out.confirmed).toBe(true);
  });
});

describe('other tools the review flagged', () => {
  it('a calendar event that invites guests needs confirm, unless guests are not emailed', async () => {
    const args = { summary: 'Delivery', start: '2026-10-05T09:00:00Z', end: '2026-10-05T10:00:00Z', attendees: ['client@example.org'] };
    const a = await run('calendar_create_event', args);
    expect(a.out.needsConfirmation).toBe(true);
    expect(changes(a.calls)).toEqual([]);
    const b = await run('calendar_create_event', { ...args, sendUpdates: 'none' });
    expect(b.out.done).toBe(true);
    const c = await run('calendar_create_event', { ...args, attendees: undefined });
    expect(c.out.done).toBe(true);
  });

  it('sharing a file with edit rights needs confirm; read-only sharing with one person does not', async () => {
    const w = await run('drive_share_file', { fileId: 'f1', type: 'user', role: 'writer', emailAddress: 'x@example.org' });
    expect(w.out.needsConfirmation).toBe(true);
    expect(changes(w.calls)).toEqual([]);
    const r = await run('drive_share_file', { fileId: 'f1', type: 'user', role: 'reader', emailAddress: 'x@example.org' }, (when) => {
      when('drive.permissions.create').resolves({ data: { id: 'p1' } });
      when('drive.permissions.get').resolves({ data: { id: 'p1', type: 'user', role: 'reader', emailAddress: 'x@example.org' } });
    });
    expect(r.out.done).toBe(true);
    expect(r.out.confirmed).toBe(true);
  });

  it('a share that Google does not show as asked is reported as not confirmed', async () => {
    const r = await run('drive_share_file', { fileId: 'f1', type: 'user', role: 'reader', emailAddress: 'x@example.org' }, (when) => {
      when('drive.permissions.create').resolves({ data: { id: 'p1' } });
      when('drive.permissions.get').resolves({ data: { id: 'p1', type: 'user', role: 'reader', emailAddress: 'someone-else@example.org' } });
    });
    expect(r.out.confirmed).toBe(false);
  });

  it('calendar sharing with write access needs confirm', async () => {
    const r = await run('calendar_share_calendar', { calendarId: 'primary', scopeType: 'user', scopeValue: 'x@example.test', role: 'writer' });
    expect(r.out.needsConfirmation).toBe(true);
  });

  it('adding an alias needs confirm and is checked by reading the alias list', async () => {
    const args = { userKey: 'sam@example.test', alias: 'sales@example.test' };
    const a = await run('admin_add_user_alias', args);
    expect(a.out.needsConfirmation).toBe(true);
    expect(changes(a.calls)).toEqual([]);
    const ok = await run('admin_add_user_alias', { ...args, confirm: true }, (w) => w('admin.users.aliases.list').resolves({ data: { aliases: [{ alias: 'sales@example.test' }] } }));
    expect(ok.out.confirmed).toBe(true);
    const bad = await run('admin_add_user_alias', { ...args, confirm: true }, (w) => w('admin.users.aliases.list').resolves({ data: { aliases: [] } }));
    expect(bad.out.confirmed).toBe(false);
  });

  it('restoring mail from the trash is checked against the labels', async () => {
    const bad = await run('gmail_untrash_message', { messageId: 'm1' }, (w) => w('gmail.users.messages.get').resolves({ data: { id: 'm1', labelIds: ['TRASH'] } }));
    expect(bad.out.confirmed).toBe(false);
    const good = await run('gmail_untrash_message', { messageId: 'm1' }, (w) => w('gmail.users.messages.get').resolves({ data: { id: 'm1', labelIds: ['INBOX'] } }));
    expect(good.out.confirmed).toBe(true);
  });

  it('domain verification is checked against the verified list, and stays inside the connection\'s own domains', async () => {
    const f = makeFakeClients();
    f.clients.allowedDomains = ['example.test'];
    const refused = await registry.handlers.domain_confirm_verification({ domainName: 'other.example.org' }, f.clients);
    expect(refused.content[0].text).toMatch(/Refused/);
    expect(f.calls.filter((c) => c.path.includes('webResource.insert'))).toEqual([]);
    const ok = await run('domain_confirm_verification', { domainName: 'example.test' }, (w) => w('siteVerification.webResource.list').resolves({ data: { items: [{ site: { identifier: 'example.test' } }] } }));
    expect(ok.out.confirmed).toBe(true);
  });

  it('deleting mail or chat no longer copies message text into the log', async () => {
    const mail = await run('gmail_delete_message', { messageId: 'm1', confirm: true }, (w) => w('gmail.users.messages.get').resolves({ data: { id: 'm1', snippet: 'SECRET BODY', payload: { headers: [] } } }));
    expect(JSON.stringify(mail.out)).not.toMatch(/SECRET BODY/);
    const chat = await run('chat_delete_message', { messageName: 'spaces/a/messages/b', confirm: true }, (w) => w('chat.spaces.messages.get').resolves({ data: { name: 'x', text: 'SECRET CHAT' } }));
    expect(JSON.stringify(chat.out)).not.toMatch(/SECRET CHAT/);
  });
});

describe('the write-coverage checker', () => {
  it('passes on the real registry', () => {
    expect(() => execFileSync('node', ['scripts/check-writes.mjs'], { stdio: 'pipe' })).not.toThrow();
  });
});

describe('read-back checks that must be able to fail (and not fail wrongly)', () => {
  const sortArgs = { ...BLOCK, sortColumnIndex: 0, confirm: true };
  const sortWith = (values, extra = {}) => run('sheets_sort_range', { ...sortArgs, ...extra }, (w) => { w('sheets.spreadsheets.get').resolves(tab()); w('sheets.spreadsheets.values.get').resolves({ data: { values } }); });

  it('a sort with blanks last, mixed text and numbers in Sheets order, or descending is confirmed', async () => {
    expect((await sortWith([[1], [2], ['']])).out.confirmed).toBe(true);
    expect((await sortWith([[2], [10], ['abc']])).out.confirmed).toBe(true);
    expect((await sortWith([[3], [2], [1]], { ascending: false })).out.confirmed).toBe(true);
    expect((await sortWith([[''], [1], [2]])).out.confirmed).toBe(false); // blanks must be last
    expect((await sortWith([[1], [2]], { sortColumnIndex: 5 })).out.confirmed).toBe(false); // sort column outside the block
  });
  it('the sort read-back asks for raw (unformatted) values', async () => {
    const f = makeFakeClients();
    f.when('sheets.spreadsheets.get').resolves(tab());
    f.when('sheets.spreadsheets.values.get').resolves({ data: { values: [[1]] } });
    await registry.handlers.sheets_sort_range({ ...sortArgs }, f.clients);
    expect(f.calls.filter((c) => c.path === 'sheets.spreadsheets.values.get').every((c) => c.args[0].valueRenderOption === 'UNFORMATTED_VALUE')).toBe(true);
  });

  const fmt = (got) => run('sheets_format_cells', { ...BLOCK, format: { backgroundColor: { red: 1, green: 0, blue: 0 }, textFormat: { bold: true } } }, (w) => w('sheets.spreadsheets.get').resolves({ data: { sheets: [{ properties: { sheetId: 7, title: 'Data' }, data: [{ rowData: [{ values: [{ userEnteredFormat: got }] }] }] }] } }));
  it('formatting is confirmed when it reads back (Google omits zero colour channels) and not when it differs', async () => {
    expect((await fmt({ backgroundColor: { red: 1 }, textFormat: { bold: true } })).out.confirmed).toBe(true);
    expect((await fmt({ backgroundColor: { red: 0.5 }, textFormat: { bold: true } })).out.confirmed).toBe(false);
    expect((await fmt({})).out.confirmed).toBe(false);
  });

  it('a merge by columns is confirmed when each column is merged', async () => {
    const merges = [0, 1].map((c) => ({ sheetId: 7, startRowIndex: 0, endRowIndex: 3, startColumnIndex: c, endColumnIndex: c + 1 }));
    const ok = await run('sheets_merge_cells', { ...BLOCK, mergeType: 'MERGE_COLUMNS', confirm: true }, (w) => w('sheets.spreadsheets.get').resolves(tab({ merges })));
    expect(ok.out.confirmed).toBe(true);
    const part = await run('sheets_merge_cells', { ...BLOCK, mergeType: 'MERGE_COLUMNS', confirm: true }, (w) => w('sheets.spreadsheets.get').resolves(tab({ merges: merges.slice(0, 1) })));
    expect(part.out.confirmed).toBe(false);
  });

  it('unmerge is not confirmed while any merge still touches the block', async () => {
    const small = { sheetId: 7, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 };
    expect((await run('sheets_unmerge_cells', BLOCK, (w) => w('sheets.spreadsheets.get').resolves(tab({ merges: [small] })))).out.confirmed).toBe(false);
    expect((await run('sheets_unmerge_cells', BLOCK, (w) => w('sheets.spreadsheets.get').resolves(tab()))).out.confirmed).toBe(true);
  });

  it('protect is confirmed only when a new protection with those bounds appears', async () => {
    const pr = { range: { sheetId: 7, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 2 } };
    const args = { ...BLOCK, editorEmails: ['a@example.test'], confirm: true };
    const added = await run('sheets_protect_range', args, (w) => { const f = w('sheets.spreadsheets.get'); f.resolvesOnce(tab()); f.resolves(tab({ protectedRanges: [pr] })); });
    expect(added.out.confirmed).toBe(true);
    const never = await run('sheets_protect_range', args, (w) => w('sheets.spreadsheets.get').resolves(tab()));
    expect(never.out.confirmed).toBe(false);
    const already = await run('sheets_protect_range', args, (w) => w('sheets.spreadsheets.get').resolves(tab({ protectedRanges: [pr] })));
    expect(already.out.confirmed).toBe(false); // it was there before, so this call did not add it
  });

  it('thread restore, calendar sharing, calendar create and domain verification can report not confirmed', async () => {
    const th = (labels) => (w) => w('gmail.users.threads.get').resolves({ data: { id: 't1', messages: [{ labelIds: labels }] } });
    expect((await run('gmail_untrash_thread', { threadId: 't1' }, th(['TRASH']))).out.confirmed).toBe(false);
    expect((await run('gmail_untrash_thread', { threadId: 't1' }, th(['INBOX']))).out.confirmed).toBe(true);
    const share = (role) => (w) => { w('calendar.acl.insert').resolves({ data: { id: 'r1' } }); w('calendar.acl.get').resolves({ data: { id: 'r1', role, scope: { type: 'user', value: 'x@example.test' } } }); };
    expect((await run('calendar_share_calendar', { calendarId: 'primary', scopeType: 'user', scopeValue: 'x@example.test', role: 'writer', confirm: true }, share('reader'))).out.confirmed).toBe(false);
    expect((await run('calendar_share_calendar', { calendarId: 'primary', scopeType: 'user', scopeValue: 'x@example.test', role: 'writer', confirm: true }, share('writer'))).out.confirmed).toBe(true);
    const ev = (e) => (w) => { w('calendar.events.insert').resolves({ data: { id: 'e1' } }); w('calendar.events.get').resolves({ data: { id: 'e1', ...e } }); };
    const a = { summary: 'Delivery', start: '2026-10-05T09:00:00Z', end: '2026-10-05T10:00:00Z', attendees: ['A@x.org', 'a@x.org'], sendUpdates: 'none' };
    expect((await run('calendar_create_event', a, ev({ summary: 'Other' }))).out.confirmed).toBe(false);
    expect((await run('calendar_create_event', a, ev({ summary: 'Delivery', attendees: [{ email: 'a@x.org' }] }))).out.confirmed).toBe(true); // duplicates collapse to one guest
    expect((await run('domain_confirm_verification', { domainName: 'example.test' }, (w) => w('siteVerification.webResource.list').resolves({ data: { items: [] } }))).out.confirmed).toBe(false);
  });
});

describe('the checker rule fails closed', () => {
  const tool = (name, props = {}) => ({ name, inputSchema: { properties: props } });
  it('flags an unknown-verb tool without dryRun, and accepts reads and wrapped tools', () => {
    expect(findMissing([tool('sheets_shuffle_rows'), tool('gmail_get_message'), tool('reports_login_activity'), tool('drive_zap_file', { dryRun: {} })])).toEqual(['sheets_shuffle_rows']);
  });
});
