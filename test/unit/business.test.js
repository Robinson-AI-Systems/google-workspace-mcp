import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const body = (r) => JSON.parse(r.content[0].text);
beforeEach(() => { holder.db = createFakeDb(); });

const D = 'evergreen.test';
const OWNER = `ops@${D}`;
const writes = (calls) => calls.filter((c) => !/\.(get|list)$/.test(c.path));

// A small stand-in for Google that remembers what was created, so a second run can see the first.
function setup({ domain = 'new', actingAs = 'admin@robinsonaisystems.com' } = {}) {
  const f = makeFakeClients({ actingAs });
  const s = { domain: domain === 'new' ? null : { domainName: D, verified: domain === 'verified' }, ou: null, user: null, aliases: [], calendars: [], acl: [], folders: [], perms: [], labels: [], filters: [] };
  const nf = (m) => googleError(404, 'notFound', m);
  f.when('admin.domains.get').resolves(() => { if (!s.domain) throw nf('Domain not found'); return { data: s.domain }; });
  f.when('admin.domains.insert').resolves((a) => { s.domain = { domainName: a.requestBody.domainName, verified: false }; return { data: s.domain }; });
  f.when('siteVerification.webResource.getToken').resolves({ data: { token: 'google-site-verification=abc123' } });
  f.when('admin.orgunits.get').resolves(() => { if (!s.ou) throw nf('Org unit not found'); return { data: s.ou }; });
  f.when('admin.orgunits.insert').resolves((a) => { s.ou = { name: a.requestBody.name, orgUnitPath: `/${a.requestBody.name}` }; return { data: s.ou }; });
  f.when('admin.users.get').resolves(() => { if (!s.user) throw nf('User not found'); return { data: s.user }; });
  f.when('admin.users.insert').resolves((a) => { s.user = { primaryEmail: a.requestBody.primaryEmail, orgUnitPath: a.requestBody.orgUnitPath }; return { data: s.user }; });
  f.when('admin.users.update').resolves((a) => { Object.assign(s.user, a.requestBody); return { data: s.user }; });
  f.when('admin.users.aliases.list').resolves(() => ({ data: { aliases: s.aliases.map((alias) => ({ alias })) } }));
  f.when('admin.users.aliases.insert').resolves((a) => { s.aliases.push(a.requestBody.alias); return { data: {} }; });
  f.when('calendar.calendarList.list').resolves(() => ({ data: { items: s.calendars } }));
  f.when('calendar.calendars.insert').resolves((a) => { const c = { id: 'cal1', summary: a.requestBody.summary, timeZone: a.requestBody.timeZone }; s.calendars.push(c); return { data: c }; });
  f.when('calendar.acl.list').resolves(() => ({ data: { items: s.acl } }));
  f.when('calendar.acl.insert').resolves((a) => { s.acl.push({ id: `user:${a.requestBody.scope.value}`, role: a.requestBody.role, scope: a.requestBody.scope }); return { data: {} }; });
  f.when('drive.files.list').resolves((a) => { const name = /name = '((?:[^'\\]|\\.)*)'/.exec(a.q)[1].replace(/\\'/g, "'"); const parent = /'([^']+)' in parents/.exec(a.q)[1]; return { data: { files: s.folders.filter((x) => x.name === name && x.parent === parent) } }; });
  f.when('drive.files.create').resolves((a) => { const x = { id: `f${s.folders.length + 1}`, name: a.requestBody.name, parent: a.requestBody.parents[0] }; s.folders.push(x); return { data: x }; });
  f.when('drive.permissions.list').resolves(() => ({ data: { permissions: s.perms } }));
  f.when('drive.permissions.create').resolves((a) => { s.perms.push({ id: `p${s.perms.length}`, type: 'user', role: a.requestBody.role, emailAddress: a.requestBody.emailAddress }); return { data: {} }; });
  f.when('gmail.users.labels.list').resolves(() => ({ data: { labels: [...s.labels] } }));
  f.when('gmail.users.labels.create').resolves((a) => { const l = { id: `L${s.labels.length + 1}`, name: a.requestBody.name }; s.labels.push(l); return { data: l }; });
  f.when('gmail.users.settings.filters.list').resolves(() => ({ data: { filter: [...s.filters] } }));
  f.when('gmail.users.settings.filters.create').resolves((a) => { const x = { id: `F${s.filters.length + 1}`, ...a.requestBody }; s.filters.push(x); return { data: x }; });
  const brand = vi.fn(async () => ({ content: [{ type: 'text', text: JSON.stringify({ done: true, primary: { email: OWNER }, aliases: [] }) }] }));
  f.clients.brandMailbox = brand;
  const lookups = [];
  f.clients.dnsResolver = { resolveMx: async (n) => { lookups.push(n); return []; }, resolveTxt: async (n) => { lookups.push(n); return []; }, resolveCname: async () => [] };
  f.clients.crossDomain = true;
  return { ...f, s, brand, lookups };
}
const ARGS = { businessName: 'Evergreen Hauling', domain: D, ownerEmail: OWNER, roleAliases: ['support', 'billing', 'no-reply'], timeZone: 'America/Denver' };
const run = (extra, f) => registry.handlers.workflow_set_up_business({ ...ARGS, ...extra }, f.clients);
const stepsOf = (out) => Object.fromEntries(out.details.steps.map((x) => [x.step, x]));

describe('workflow_set_up_business', () => {
  it('a preview against a fictional domain returns the complete plan and calls no write', async () => {
    const f = setup();
    const out = body(await run({ dryRun: true }, f));
    expect(out).toMatchObject({ done: false, dryRun: true });
    expect(out.summary).toMatch(/Evergreen Hauling on evergreen.test.*STOP until it is verified.*\/Evergreen Hauling.*ops@evergreen.test.*support@evergreen.test, billing@evergreen.test, no-reply@evergreen.test.*America\/Denver.*9 standard subfolders/s);
    expect(out.before.domain).toEqual({ exists: false, verified: false });
    expect(writes(f.calls)).toEqual([]);
  });

  it('without confirm it asks first, and a new domain needs crossDomain on a limited connection', async () => {
    const f = setup();
    expect(body(await run({}, f)).needsConfirmation).toBe(true);
    expect(writes(f.calls)).toEqual([]);
    const limited = setup();
    delete limited.clients.crossDomain;
    limited.clients.allowedDomains = ['robinsonaisystems.com'];
    expect(JSON.stringify((await run({ confirm: true }, limited)).content[0].text)).toMatch(/Refused/);
    expect(limited.calls).toEqual([]);
  });

  it('refuses a bad time zone, an owner on another domain, and a role address on another domain', async () => {
    const f = setup();
    expect(body(await run({ timeZone: 'Mars/Base' }, f)).refused).toMatch(/time zone/);
    expect(body(await run({ ownerEmail: 'ops@other.test' }, f)).refused).toMatch(/not a evergreen.test address/);
    expect(body(await run({ roleAliases: ['x@other.test'] }, f)).refused).toMatch(/not on evergreen.test/);
    expect(f.calls).toEqual([]);
  });

  it('a domain that is not on the Workspace is added, its DNS record is given, and everything else waits', async () => {
    const f = setup();
    const out = body(await run({ confirm: true }, f));
    const by = stepsOf(out);
    expect(by.domain).toMatchObject({ status: 'ok', verified: false, dnsTxtRecordToAdd: 'google-site-verification=abc123' });
    expect(['org_unit', 'owner_account', 'role_addresses', 'calendar', 'drive_folders'].map((k) => by[k].status)).toEqual(Array(5).fill('skipped'));
    expect(out.details.stoppedEarly).toMatch(/not verified yet/);
    expect(f.calls.some((c) => c.path === 'admin.users.insert' || c.path === 'calendar.calendars.insert' || c.path === 'drive.files.create')).toBe(false);
    expect(out.confirmed).toBe(true); // stopping at the DNS step is the expected result
  });

  it('a domain that is added but not yet verified still stops, and does not add it twice', async () => {
    const f = setup({ domain: 'unverified' });
    const out = body(await run({ confirm: true }, f));
    expect(stepsOf(out).domain).toMatchObject({ status: 'unchanged', verified: false });
    expect(f.calls.some((c) => c.path === 'admin.domains.insert')).toBe(false);
    expect(out.details.stoppedEarly).toBeTruthy();
  });

  it('on a verified domain it builds everything, shows the owner password once, and never logs it', async () => {
    const f = setup({ domain: 'verified' });
    const out = body(await run({ confirm: true, brand: { displayName: 'Evergreen Hauling', signatureHtml: '<b>Evergreen</b>', avatarBase64Url: 'AAAA' } }, f));
    const by = stepsOf(out);
    expect(f.s.ou).toMatchObject({ orgUnitPath: '/Evergreen Hauling' });
    expect(f.s.user).toMatchObject({ primaryEmail: OWNER, orgUnitPath: '/Evergreen Hauling' });
    expect(f.s.aliases).toEqual(['support@evergreen.test', 'billing@evergreen.test', 'no-reply@evergreen.test']);
    expect(f.s.calendars).toEqual([expect.objectContaining({ summary: 'Evergreen Hauling Calendar', timeZone: 'America/Denver' })]);
    expect(f.s.acl).toEqual([expect.objectContaining({ role: 'owner', scope: { type: 'user', value: OWNER } })]);
    const root = f.s.folders.find((x) => x.name === 'Evergreen Hauling');
    expect(f.s.folders.filter((x) => x.parent === root.id).map((x) => x.name)).toEqual(['01 Brand Kit', '02 Customers', '03 Agreements (signed)', '04 Invoices & Statements', '05 Receipts & Expenses', '06 Inventory & Appliance Photos', '07 Legal & Insurance', '08 Marketing', '09 Taxes & Accounting Exports']);
    expect(f.s.folders.map((x) => x.name)).toContain('03 Agreements (signed)');
    expect(f.s.perms).toEqual([expect.objectContaining({ role: 'writer', emailAddress: OWNER })]);
    expect(f.brand.mock.calls[0][0]).toMatchObject({ userEmail: OWNER, displayName: 'Evergreen Hauling', avatarBase64: 'AAAA', aliases: [{ email: 'support@evergreen.test' }, { email: 'billing@evergreen.test' }, { email: 'no-reply@evergreen.test' }] });
    expect(by.labels_and_filters.status).toBe('skipped'); // acting as the admin, not as the owner
    expect(by.labels_and_filters.note).toMatch(/Connect as the owner/);
    expect(by.email_health.status).toBe('ok');
    expect(f.lookups).toContain(D);
    const pw = f.calls.find((c) => c.path === 'admin.users.insert').args[0].requestBody.password;
    expect(out.details.ownerTemporaryPassword).toBe(pw);
    expect(JSON.stringify(await holder.db.listRecentChanges())).not.toContain(pw);
    expect(out.confirmed).toBe(true);
  });

  it('running it twice changes nothing the second time', async () => {
    const f = setup({ domain: 'verified' });
    await run({ confirm: true, brand: { displayName: 'E' } }, f);
    const before = f.calls.length;
    const second = body(await run({ confirm: true }, f));
    expect(writes(f.calls.slice(before))).toEqual([]);
    expect(second.details.ownerTemporaryPassword).toBeUndefined();
    const by = stepsOf(second);
    for (const k of ['domain', 'org_unit', 'owner_account', 'role_addresses', 'calendar', 'drive_folders']) expect(by[k].status, k).toBe('unchanged');
    expect(second.confirmed).toBe(true);
  });

  it('moves an existing owner into the new organizational unit instead of creating a second account', async () => {
    const f = setup({ domain: 'verified' });
    f.s.user = { primaryEmail: OWNER, orgUnitPath: '/' };
    const out = body(await run({ confirm: true }, f));
    expect(f.calls.some((c) => c.path === 'admin.users.insert')).toBe(false);
    expect(stepsOf(out).owner_account).toMatchObject({ status: 'ok', moved: true, from: '/', to: '/Evergreen Hauling' });
    expect(out.details.ownerTemporaryPassword).toBeUndefined();
  });

  it('when the connection IS the owner, it creates the labels and filters (not for no-reply) and does not share with itself', async () => {
    const f = setup({ domain: 'verified', actingAs: OWNER });
    const out = body(await run({ confirm: true }, f));
    expect(f.s.labels.map((l) => l.name)).toEqual(['Support', 'Billing']);
    expect(f.s.filters.map((x) => x.criteria.to)).toEqual(['support@evergreen.test', 'billing@evergreen.test']);
    expect(f.s.acl).toEqual([]); // its own calendar
    expect(f.s.perms).toEqual([]);
    expect(stepsOf(out).labels_and_filters.status).toBe('ok');
    const again = body(await run({ confirm: true }, f));
    expect(stepsOf(again).labels_and_filters.status).toBe('unchanged');
    expect(f.s.labels).toHaveLength(2);
  });

  it('a failing step is reported and later steps still run', async () => {
    const f = setup({ domain: 'verified' });
    f.when('calendar.calendars.insert').rejects(googleError(403, 'forbidden', 'Calendar API has not been used in project'));
    const out = body(await run({ confirm: true }, f));
    const by = stepsOf(out);
    expect(by.calendar.status).toBe('failed');
    expect(by.drive_folders.status).toBe('ok');
    expect(out.details.warning).toMatch(/calendar/);
    expect(out.confirmed).toBe(false); // the calendar is missing afterwards
  });

  it('if the domain step itself fails, nothing else is built and it is not confirmed', async () => {
    const f = setup();
    f.when('admin.domains.insert').rejects(googleError(403, 'forbidden', 'Not authorized to add domains'));
    const out = body(await run({ confirm: true }, f));
    const by = stepsOf(out);
    expect(by.domain.status).toBe('failed');
    for (const step of ['org_unit', 'owner_account', 'calendar', 'drive_folders']) if (by[step]) expect(by[step].status, step).toBe('skipped');
    expect(f.s.ou).toBeNull();
    expect(f.s.folders).toEqual([]);
    expect(out.confirmed).toBe(false);
  });

  it('a failed step later on means the result is not confirmed', async () => {
    const f = setup({ domain: 'verified', actingAs: OWNER });
    f.brand.mockImplementation(async () => ({ content: [{ type: 'text', text: JSON.stringify({ done: false, reason: 'no delegation' }) }] }));
    const out = body(await run({ confirm: true, brand: { displayName: 'Evergreen', signatureHtml: '<b>E</b>' } }, f));
    expect(stepsOf(out).brand_mailbox.status).toBe('failed');
    expect(out.confirmed).toBe(false);
  });

  it('a calendar with the same name that someone else owns is not mistaken for ours', async () => {
    const f = setup({ domain: 'verified', actingAs: OWNER });
    f.s.calendars.push({ id: 'theirs', summary: 'Evergreen Hauling Calendar', accessRole: 'reader' });
    const out = body(await run({ confirm: true }, f));
    expect(stepsOf(out).calendar.created).toBe(true);
  });
});
