import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { BUSINESSES } = await import('../../src/businesses.js');
const body = (r) => JSON.parse(r.content[0].text);
beforeEach(() => { holder.db = createFakeDb(); });

const CAL = BUSINESSES['appliance-rentals'].calendarId;
const FOLDER = BUSINESSES['appliance-rentals'].driveFolderId;
const EMAIL = 'sam@robinsonappliancerentals.com';
const writes = (calls) => calls.filter((c) => !/\.(get|list)$/.test(c.path));

// A small stand-in for Google that remembers what was created, so a second run can see the first.
function setup({ existing = false } = {}) {
  const f = makeFakeClients({ actingAs: 'ops@robinsonappliancerentals.com' });
  const state = { user: existing ? { primaryEmail: EMAIL, orgUnitPath: '/', isEnforcedIn2Sv: true } : null, aliases: [], acl: [], perms: [] };
  f.when('admin.users.get').resolves(() => { if (!state.user) throw googleError(404, 'notFound', 'Resource Not Found: userKey'); return { data: state.user }; });
  f.when('admin.users.insert').resolves((a) => { state.user = { primaryEmail: a.requestBody.primaryEmail, orgUnitPath: a.requestBody.orgUnitPath }; return { data: state.user }; });
  f.when('admin.users.update').resolves((a) => { Object.assign(state.user, a.requestBody); return { data: state.user }; });
  f.when('admin.users.aliases.list').resolves(() => ({ data: { aliases: state.aliases.map((alias) => ({ alias })) } }));
  f.when('admin.users.aliases.insert').resolves((a) => { state.aliases.push(a.requestBody.alias); return { data: {} }; });
  f.when('calendar.acl.list').resolves(() => ({ data: { items: state.acl } }));
  f.when('calendar.acl.insert').resolves((a) => { state.acl.push({ id: `user:${a.requestBody.scope.value}`, role: a.requestBody.role, scope: a.requestBody.scope }); return { data: {} }; });
  f.when('calendar.acl.patch').resolves((a) => { state.acl.find((r) => r.id === a.ruleId).role = a.requestBody.role; return { data: {} }; });
  f.when('drive.permissions.list').resolves(() => ({ data: { permissions: state.perms } }));
  f.when('drive.permissions.create').resolves((a) => { state.perms.push({ id: `p${state.perms.length}`, type: 'user', role: a.requestBody.role, emailAddress: a.requestBody.emailAddress }); return { data: {} }; });
  f.when('drive.permissions.update').resolves((a) => { state.perms.find((p) => p.id === a.permissionId).role = a.requestBody.role; return { data: {} }; });
  f.when('gmail.users.messages.send').resolves({ data: { id: 'm1' } });
  const brand = vi.fn(async () => ({ content: [{ type: 'text', text: JSON.stringify({ done: true, primary: { email: EMAIL }, aliases: [] }) }] }));
  f.clients.brandMailbox = brand;
  return { ...f, state, brand };
}
const run = (args, f) => registry.handlers.workflow_add_staff_member({ email: EMAIL, firstName: 'Sam', lastName: 'Lee', business: 'appliance-rentals', role: 'driver', ...args }, f.clients);

describe('workflow_add_staff_member', () => {
  it('a preview shows the whole plan and changes nothing', async () => {
    const f = setup();
    const out = body(await run({ dryRun: true, aliases: ['dispatch@robinsonappliancerentals.com'] }, f));
    expect(out).toMatchObject({ done: false, dryRun: true });
    expect(out.summary).toMatch(/create the account sam@.*dispatch@.*Deliveries & Service.*editor.*viewer.*2-Step/s);
    expect(out.before).toMatchObject({ accountExists: false, calendarRole: null, driveRole: null });
    expect(writes(f.calls)).toEqual([]);
  });

  it('refuses an address on the wrong domain, and unknown roles, without touching Google', async () => {
    const f = setup();
    expect(body(await run({ email: 'sam@robinsonaisystems.com' }, f)).refused).toMatch(/not a robinsonappliancerentals.com address/);
    expect(body(await run({ role: 'boss' }, f)).refused).toMatch(/Unknown role/);
    expect(body(await run({ aliases: ['x@elsewhere.test'] }, f)).refused).toMatch(/not robinsonappliancerentals.com/);
    expect(body(await run({ sendWelcome: true }, f)).refused).toMatch(/personalEmail/);
    expect(f.calls).toEqual([]);
  });

  it.each([
    ['driver', 'writer', 'reader'],
    ['technician', 'writer', 'reader'],
    ['office', 'owner', 'writer'],
    ['admin', 'owner', 'writer']
  ])('%s gets calendar %s and Drive folder %s', async (role, cal, drive) => {
    const f = setup();
    const out = body(await run({ role }, f));
    expect(f.state.acl).toEqual([expect.objectContaining({ role: cal })]);
    expect(f.state.perms).toEqual([expect.objectContaining({ role: drive, emailAddress: EMAIL })]);
    expect(f.calls.find((c) => c.path === 'calendar.acl.insert').args[0]).toMatchObject({ calendarId: CAL, sendNotifications: false });
    expect(f.calls.find((c) => c.path === 'drive.permissions.create').args[0]).toMatchObject({ fileId: FOLDER, sendNotificationEmail: false });
    expect(out.confirmed).toBe(true);
  });

  it('creates the account with a one-time password that is shown once and never logged', async () => {
    const f = setup();
    const out = body(await run({ aliases: ['dispatch@robinsonappliancerentals.com'], phone: '555-0100', displayName: 'Sam Lee', signatureHtml: '<b>Sam</b>' }, f));
    const insert = f.calls.find((c) => c.path === 'admin.users.insert').args[0].requestBody;
    expect(insert).toMatchObject({ primaryEmail: EMAIL, changePasswordAtNextLogin: true, orgUnitPath: '/', phones: [{ value: '555-0100', type: 'work' }] });
    expect(insert.password).toMatch(/^[A-Za-z0-9_-]{16}aA1!$/);
    expect(out.details.temporaryPassword).toBe(insert.password);
    expect(f.state.aliases).toEqual(['dispatch@robinsonappliancerentals.com']);
    expect(f.brand).toHaveBeenCalledTimes(1);
    expect(f.brand.mock.calls[0][0]).toMatchObject({ userEmail: EMAIL, displayName: 'Sam Lee', signatureHtml: '<b>Sam</b>', aliases: [{ email: 'dispatch@robinsonappliancerentals.com' }] });
    expect(JSON.stringify(await holder.db.listRecentChanges())).not.toContain(insert.password);
    expect(out.details.steps.find((s) => s.step === 'require_2sv').status).toBe('ok');
  });

  it('running it twice changes nothing the second time', async () => {
    const f = setup();
    await run({ aliases: ['dispatch@robinsonappliancerentals.com'] }, f);
    const before = f.calls.length;
    const second = body(await run({ aliases: ['dispatch@robinsonappliancerentals.com'] }, f));
    expect(writes(f.calls.slice(before))).toEqual([]);
    expect(second.details.temporaryPassword).toBeUndefined();
    expect(second.details.steps.filter((s) => s.status === 'ok')).toEqual([]);
    expect(second.details.steps.find((s) => s.step === 'create_account').note).toMatch(/already exists/);
    expect(second.confirmed).toBe(true);
  });

  it('changes an existing role when the job changed (driver promoted to office)', async () => {
    const f = setup();
    await run({ role: 'driver' }, f);
    const out = body(await run({ role: 'office' }, f));
    expect(f.state.acl[0].role).toBe('owner');
    expect(f.state.perms[0].role).toBe('writer');
    expect(out.details.steps.find((s) => s.step === 'share_calendar')).toMatchObject({ status: 'ok', was: 'writer', role: 'owner' });
  });

  it('a business with no calendar or folder skips those steps and says so', async () => {
    const f = setup();
    const out = body(await run({ business: 'ai-systems', email: 'sam@robinsonaisystems.com' }, f));
    const by = Object.fromEntries(out.details.steps.map((s) => [s.step, s]));
    expect(by.share_calendar.status).toBe('skipped');
    expect(by.share_drive_folder.status).toBe('skipped');
    expect(f.calls.some((c) => c.path.startsWith('calendar.acl') && !/list$/.test(c.path))).toBe(false);
    expect(out.confirmed).toBe(true);
  });

  it('nobody is emailed without confirm, and the login goes only where it was asked to go', async () => {
    const f = setup();
    const ask = body(await run({ emailLoginDetailsTo: 'chris@example.test' }, f));
    expect(ask.needsConfirmation).toBe(true);
    expect(writes(f.calls)).toEqual([]);
    const done = body(await run({ emailLoginDetailsTo: 'chris@example.test', sendWelcome: true, personalEmail: 'sam@personal.test', confirm: true }, f));
    const sent = f.calls.filter((c) => c.path === 'gmail.users.messages.send').map((c) => Buffer.from(c.args[0].requestBody.raw, 'base64url').toString());
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatch(/^To: chris@example.test/);
    expect(sent[1]).toMatch(/^To: sam@personal.test/);
    expect(sent[0]).toContain(done.details.temporaryPassword);
  });

  it('a person without a new password (already existed) is never sent one', async () => {
    const f = setup({ existing: true });
    const out = body(await run({ emailLoginDetailsTo: 'chris@example.test', confirm: true }, f));
    expect(f.calls.some((c) => c.path === 'gmail.users.messages.send')).toBe(false);
    expect(out.details.steps.find((s) => s.step === 'email_login_details').status).toBe('skipped');
  });

  it('a step that fails is reported, the others still run, and it is not called confirmed', async () => {
    const f = setup();
    f.clients.brandMailbox = async () => ({ content: [{ type: 'text', text: JSON.stringify({ done: false, reason: 'Domain-wide delegation is not set up.' }) }] });
    const out = body(await run({ displayName: 'Sam Lee' }, f));
    const by = Object.fromEntries(out.details.steps.map((s) => [s.step, s]));
    expect(by.brand_mailbox.status).toBe('failed');
    expect(by.brand_mailbox.error).toMatch(/delegation is not set up.*few minutes/);
    expect(by.share_calendar.status).toBe('ok');
    expect(out.details.warning).toMatch(/brand_mailbox/);
  });

  it('is refused for a connection limited to another business unless crossDomain is given', async () => {
    const f = setup();
    f.clients.allowedDomains = ['robinsonaisystems.com'];
    expect(JSON.stringify(await run({}, f).then((r) => r.content[0].text))).toMatch(/Refused/);
    expect(f.calls).toEqual([]);
  });
});
