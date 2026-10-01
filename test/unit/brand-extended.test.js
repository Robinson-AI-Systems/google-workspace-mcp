import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null, gmail: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
vi.mock('googleapis', () => ({ google: { gmail: () => holder.gmail } }));
vi.mock('../../src/auth/service-account.js', () => ({ isDelegationConfigured: () => true, buildDelegatedAuth: () => ({}), describeServiceAccount: () => ({}) }));
const { handlers, ensureLabels } = await import('../../src/tools/mailbox-branding.js');

const body = (r) => JSON.parse(r.content[0].text);
beforeEach(() => { holder.db = createFakeDb(); });

const setup = (actingAs = 'ops@x.test') => {
  const f = makeFakeClients({ actingAs });
  holder.gmail = f.clients.gmail;
  f.when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: [{ sendAsEmail: 'ops@x.test', isPrimary: true, isDefault: true, displayName: 'Ops' }] } });
  return f;
};

describe('workflow_brand_mailbox: dry run', () => {
  it('says what would change, makes no changing call, and logs a preview', async () => {
    const f = setup();
    const out = body(await handlers.workflow_brand_mailbox({ userEmail: 'ops@x.test', displayName: 'New', aliases: [{ email: 'help@x.test' }], avatarBase64: 'QUJD', labels: [{ name: 'Leads' }], vacation: { enableAutoReply: true }, dryRun: true }, f.clients));
    expect(out).toMatchObject({ done: false, dryRun: true, aliasesToCreate: ['help@x.test'] });
    expect(out.wouldChange).toEqual(['display name', '1 alias(es)', 'profile photo', '1 label(s)', 'auto-reply']);
    expect(f.calls.filter((c) => !/\.(get|list)$/.test(c.path))).toEqual([]);
    expect((await holder.db.listRecentChanges())[0]).toMatchObject({ dry_run: true });
  });
  it('warns that labels would be skipped when the connection is a different mailbox', async () => {
    const f = setup('boss@x.test');
    expect(body(await handlers.workflow_brand_mailbox({ userEmail: 'ops@x.test', labels: [{ name: 'Leads' }], dryRun: true }, f.clients)).labelsNote).toMatch(/skipped/);
  });
});

describe('workflow_brand_mailbox: profile photo, auto-reply, labels', () => {
  it('sets the photo through the Directory as URL-safe base64 (and strips a data: prefix) and checks Google has one', async () => {
    const f = setup();
    f.when('admin.users.photos.get').resolves({ data: { photoData: 'x', mimeType: 'image/png', width: 96, height: 96 } });
    const out = body(await handlers.workflow_brand_mailbox({ userEmail: 'ops@x.test', avatarBase64: 'data:image/png;base64,ab+/cd==' }, f.clients));
    expect(f.calls.find((c) => c.path === 'admin.users.photos.update').args[0]).toEqual({ userKey: 'ops@x.test', requestBody: { photoData: 'ab-_cd' } });
    expect(out.photo).toMatchObject({ set: true, mimeType: 'image/png' });
    expect(out.done).toBe(true);
    expect(JSON.stringify(await holder.db.listRecentChanges())).not.toContain('ab-_cd');
  });
  it('a photo Google refuses is reported, done is false, nothing throws', async () => {
    const f = setup();
    f.when('admin.users.photos.update').rejects(googleError(400, 'invalid', 'Invalid photo'));
    const out = body(await handlers.workflow_brand_mailbox({ userEmail: 'ops@x.test', avatarBase64: 'QUJD' }, f.clients));
    expect(out.photo).toMatchObject({ set: false, error: 'Invalid photo' });
    expect(out.done).toBe(false);
  });
  it('passes the auto-reply through and reports what Google holds', async () => {
    const f = setup();
    f.when('gmail.users.settings.getVacation').resolves({ data: { enableAutoReply: true, responseSubject: 'Away', responseBodyPlainText: 'secret body text' } });
    const out = body(await handlers.workflow_brand_mailbox({ userEmail: 'ops@x.test', vacation: { enableAutoReply: true, responseSubject: 'Away', responseBodyPlainText: 'secret body text' } }, f.clients));
    expect(f.calls.find((c) => c.path === 'gmail.users.settings.updateVacation').args[0].requestBody.responseSubject).toBe('Away');
    expect(out.vacation).toEqual({ enableAutoReply: true, responseSubject: 'Away', hasBody: true, restrictToContacts: false, restrictToDomain: false });
    expect(JSON.stringify(out)).not.toContain('secret body text');
  });
  it('creates labels and their to:-filters in the mailbox the connection acts as, and confirms by reading back', async () => {
    const f = setup();
    const labels = [];
    const filters = [];
    f.when('gmail.users.labels.list').resolves(() => ({ data: { labels: [...labels] } }));
    f.when('gmail.users.labels.create').resolves(({ requestBody }) => { const l = { id: `L${labels.length + 1}`, name: requestBody.name }; labels.push(l); return { data: l }; });
    f.when('gmail.users.settings.filters.list').resolves(() => ({ data: { filter: [...filters] } }));
    f.when('gmail.users.settings.filters.create').resolves(({ requestBody }) => { const x = { id: `F${filters.length + 1}`, ...requestBody }; filters.push(x); return { data: x }; });
    const out = body(await handlers.workflow_brand_mailbox({ userEmail: 'ops@x.test', labels: [{ name: 'Leads', filterTo: 'Leads@x.test' }, { name: 'Support' }] }, f.clients));
    expect(out.labels).toMatchObject({ done: true, confirmed: true });
    expect(out.labels.labels).toEqual([{ name: 'Leads', created: true, filterTo: 'leads@x.test', filterCreated: true }, { name: 'Support', created: true }]);
    expect(filters[0]).toMatchObject({ criteria: { to: 'leads@x.test' }, action: { addLabelIds: ['L1'] } });
  });
  it('running it twice changes nothing the second time', async () => {
    const labels = [{ id: 'L1', name: 'Leads' }];
    const filters = [{ id: 'F1', criteria: { to: 'leads@x.test' }, action: { addLabelIds: ['L1'] } }];
    const f = makeFakeClients();
    f.when('gmail.users.labels.list').resolves({ data: { labels } });
    f.when('gmail.users.settings.filters.list').resolves({ data: { filter: filters } });
    const out = await ensureLabels(f.clients.gmail, [{ name: 'leads', filterTo: 'LEADS@x.test' }]);
    expect(out.labels).toEqual([{ name: 'Leads', created: false, filterTo: 'leads@x.test', filterCreated: false }]);
    expect(f.calls.filter((c) => /create$/.test(c.path))).toEqual([]);
  });
  it('refuses to create labels in someone else\'s mailbox (the robot identity is not allowed) and says so, without failing the rest', async () => {
    const f = setup('boss@x.test');
    const out = body(await handlers.workflow_brand_mailbox({ userEmail: 'ops@x.test', displayName: 'New', labels: [{ name: 'Leads' }] }, f.clients));
    expect(out.labels.done).toBe(false);
    expect(out.labels.why).toMatch(/robot identity is not allowed/);
    expect(out.done).toBe(false);
    expect(f.calls.some((c) => c.path === 'gmail.users.labels.create')).toBe(false);
    expect(f.calls.some((c) => c.path === 'gmail.users.settings.sendAs.patch')).toBe(true);
  });
  it('a failing label step is reported instead of losing the earlier changes', async () => {
    const f = setup();
    f.when('gmail.users.labels.list').rejects(googleError(403, 'forbidden', 'insufficient scope'));
    const out = body(await handlers.workflow_brand_mailbox({ userEmail: 'ops@x.test', labels: [{ name: 'Leads' }] }, f.clients));
    expect(out.labels).toMatchObject({ done: false, why: 'insufficient scope' });
  });
});
