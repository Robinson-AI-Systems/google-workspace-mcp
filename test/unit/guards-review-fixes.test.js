import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { makeFakeClients } from '../helpers/fake-google.js';
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
