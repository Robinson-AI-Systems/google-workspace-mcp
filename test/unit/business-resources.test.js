import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';
import { BUSINESSES, STANDARD_FOLDERS } from '../../src/businesses.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const body = (r) => JSON.parse(r.content[0].text);
beforeEach(() => { holder.db = createFakeDb(); });

const RENTALS = BUSINESSES['appliance-rentals'];
const writes = (calls) => calls.filter((c) => !/\.(get|list)$/.test(c.path));

function setup({ calendars = [RENTALS.calendarId], folders = [RENTALS.driveFolderId] } = {}) {
  const f = makeFakeClients({ actingAs: 'ops@robinsonappliancerentals.com' });
  const s = { calendars: calendars.map((id) => ({ id, summary: RENTALS.calendarName, timeZone: 'America/Denver', accessRole: 'owner' })), folders: folders.map((id) => ({ id, name: RENTALS.driveFolderName, parent: 'root' })) };
  f.when('calendar.calendars.get').resolves((a) => { const c = s.calendars.find((x) => x.id === a.calendarId); if (!c) throw googleError(404, 'notFound', 'Not Found'); return { data: c }; });
  f.when('calendar.calendarList.list').resolves(() => ({ data: { items: s.calendars } }));
  f.when('calendar.calendars.insert').resolves((a) => { const c = { id: `cal-${s.calendars.length + 1}`, summary: a.requestBody.summary, timeZone: a.requestBody.timeZone, accessRole: 'owner' }; s.calendars.push(c); return { data: c }; });
  f.when('drive.files.get').resolves((a) => { const x = s.folders.find((y) => y.id === a.fileId); if (!x) throw googleError(404, 'notFound', 'File not found'); return { data: { id: x.id, name: x.name, trashed: false } }; });
  f.when('drive.files.list').resolves((a) => { const name = /name = '((?:[^'\\]|\\.)*)'/.exec(a.q)[1]; const parent = /'([^']+)' in parents/.exec(a.q)[1]; return { data: { files: s.folders.filter((x) => x.name === name && x.parent === parent) } }; });
  f.when('drive.files.create').resolves((a) => { const x = { id: `fold-${s.folders.length + 1}`, name: a.requestBody.name, parent: a.requestBody.parents[0] }; s.folders.push(x); return { data: x }; });
  return { ...f, s };
}
const cal = (f, extra = {}) => registry.handlers.workspace_business_calendar({ business: 'appliance-rentals', ...extra }, f.clients);
const fold = (f, extra = {}) => registry.handlers.workspace_business_folders({ business: 'appliance-rentals', ...extra }, f.clients);

describe('workspace_business_calendar', () => {
  it('returns the existing "Deliveries & Service" calendar without creating anything, and remembers its ID', async () => {
    const f = setup();
    const out = body(await cal(f));
    expect(out.details).toMatchObject({ calendarId: RENTALS.calendarId, source: 'config', created: false, timeZone: 'America/Denver' });
    expect(out.confirmed).toBe(true);
    expect(writes(f.calls).some((c) => c.path === 'calendar.calendars.insert')).toBe(false);
    expect((await holder.db.listBusinessResources('appliance-rentals', 'calendar'))[0]).toMatchObject({ key: 'Deliveries & Service', google_id: RENTALS.calendarId });
  });
  it('running it twice returns the identical ID and creates nothing', async () => {
    const f = setup({ calendars: [] });
    const first = body(await cal(f));
    const second = body(await cal(f));
    expect(first.details).toMatchObject({ created: true, source: 'created' });
    expect(second.details).toMatchObject({ created: false, calendarId: first.details.calendarId });
    expect(f.calls.filter((c) => c.path === 'calendar.calendars.insert')).toHaveLength(1);
    expect(f.calls.find((c) => c.path === 'calendar.calendars.insert').args[0].requestBody).toEqual({ summary: 'Deliveries & Service', timeZone: 'America/Denver' });
  });
  it('finds a same-named calendar the account owns, and ignores one it only reads', async () => {
    const f = setup({ calendars: [] });
    f.s.calendars.push({ id: 'theirs', summary: 'Deliveries & Service', accessRole: 'reader' }, { id: 'mine', summary: 'Deliveries & Service', accessRole: 'owner', timeZone: 'America/Denver' });
    expect(body(await cal(f)).details).toMatchObject({ calendarId: 'mine', source: 'found' });
  });
  it('a remembered ID that has been deleted is not trusted: the calendar is found or made again and the table corrected', async () => {
    const f = setup({ calendars: [] });
    await holder.db.saveBusinessResource({ business: 'appliance-rentals', kind: 'calendar', key: 'Deliveries & Service', googleId: 'gone' });
    const out = body(await cal(f));
    expect(out.details.created).toBe(true);
    expect((await holder.db.listBusinessResources('appliance-rentals', 'calendar'))[0].google_id).toBe(out.details.calendarId);
  });
  it('a preview changes nothing, including the table', async () => {
    const f = setup({ calendars: [] });
    const out = body(await cal(f, { dryRun: true }));
    expect(out).toMatchObject({ done: false, dryRun: true });
    expect(writes(f.calls)).toEqual([]);
    expect(await holder.db.listBusinessResources('appliance-rentals')).toEqual([]);
  });
  it('refuses a connection limited to another business, and a business with no calendar defined', async () => {
    const f = setup();
    f.clients.allowedDomains = ['robinsonaisystems.com'];
    await expect(cal(f)).rejects.toThrow(/not allowed to manage/);
    const g = setup();
    await expect(registry.handlers.workspace_business_calendar({ business: 'ai-systems' }, g.clients)).rejects.toThrow(/no business calendar defined/);
    expect(writes(g.calls)).toEqual([]);
  });
});

describe('workspace_business_folders', () => {
  it('returns the main folder and all nine standard folders, creating only what is missing', async () => {
    const f = setup();
    f.s.folders.push({ id: 'existing-customers', name: '02 Customers', parent: RENTALS.driveFolderId });
    const out = body(await fold(f));
    expect(out.details.rootFolderId).toBe(RENTALS.driveFolderId);
    expect(out.details.rootCreated).toBe(false);
    expect(Object.keys(out.details.folders)).toEqual(STANDARD_FOLDERS);
    expect(out.details.folders['02 Customers']).toBe('existing-customers');
    expect(out.details.created).toHaveLength(8);
    expect(out.confirmed).toBe(true);
    expect((await holder.db.listBusinessResources('appliance-rentals', 'folder')).map((r) => r.key).sort()).toEqual(['(root)', ...STANDARD_FOLDERS].sort());
  });
  it('running it twice returns identical IDs and creates nothing the second time', async () => {
    const f = setup();
    const first = body(await fold(f));
    const before = f.calls.filter((c) => c.path === 'drive.files.create').length;
    const second = body(await fold(f));
    expect(second.details.folders).toEqual(first.details.folders);
    expect(second.details.created).toEqual([]);
    expect(f.calls.filter((c) => c.path === 'drive.files.create')).toHaveLength(before);
  });
  it('creates the main folder when it does not exist', async () => {
    const f = setup({ folders: [] });
    const out = body(await fold(f));
    expect(out.details.rootCreated).toBe(true);
    expect(f.s.folders.find((x) => x.name === 'Robinson Appliance Rentals').parent).toBe('root');
  });
  it('a preview changes nothing', async () => {
    const f = setup();
    body(await fold(f, { dryRun: true }));
    expect(writes(f.calls)).toEqual([]);
    expect(await holder.db.listBusinessResources('appliance-rentals')).toEqual([]);
  });
});
