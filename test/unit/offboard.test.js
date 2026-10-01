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

const seq = [];
function setup({ delegated = true, aliases = [{ sendAsEmail: 'sam@x.test', isPrimary: true }, { sendAsEmail: 'support@x.test' }, { sendAsEmail: 'billing@x.test' }], vacationOn = true } = {}) {
  const f = makeFakeClients({ actingAs: 'ops@x.test' });
  const g = makeFakeClients();
  f.when('admin.users.get').resolves(() => ({ data: { primaryEmail: 'sam@x.test', suspended: seq.includes('suspend') } }));
  g.when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: aliases } });
  g.when('gmail.users.settings.getVacation').resolves({ data: { enableAutoReply: vacationOn } });
  seq.length = 0;
  f.when('admin.users.update').resolves(() => { seq.push('suspend'); return { data: {} }; });
  g.when('gmail.users.settings.updateVacation').resolves(() => { seq.push('out-of-office'); return { data: {} }; });
  g.when('gmail.users.settings.sendAs.delete').resolves(() => { seq.push('remove-alias'); return { data: {} }; });
  f.clients.delegationReady = delegated;
  const opened = [];
  f.clients.gmailFor = (email) => { opened.push(email); return g.clients.gmail; };
  return { ...f, g, opened, seq };
}

describe('workflow_offboard_employee', () => {
  it('previews without opening the mailbox or changing anything', async () => {
    const f = setup();
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test', dryRun: true }, f.clients));
    expect(out).toMatchObject({ done: false, dryRun: true });
    expect(out.summary).toMatch(/out-of-office reply, REMOVE their "send mail as" addresses/);
    expect(out.before.sendAs.map((x) => x.email)).toEqual(['sam@x.test', 'support@x.test', 'billing@x.test']); // what the mailbox holds now, so the log can restore it
    expect(f.g.calls.filter((c) => !/\.(get|list)$/.test(c.path))).toEqual([]);
    expect(f.calls.filter((c) => !/\.(get|list)$/.test(c.path))).toEqual([]);
  });
  it('without confirm it asks first', async () => {
    const f = setup();
    expect(body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test' }, f.clients)).needsConfirmation).toBe(true);
    expect(f.g.calls.filter((c) => !/\.(get|list)$/.test(c.path))).toEqual([]);
  });
  it('sets the out-of-office reply and removes every send-as alias except the primary, BEFORE suspending', async () => {
    const f = setup();
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test', outOfOfficeMessage: 'Sam has left.', confirm: true }, f.clients));
    const steps = Object.fromEntries(out.details.steps.map((s) => [s.step, s]));
    expect(steps.remove_send_as_aliases).toMatchObject({ status: 'ok', count: 2, removed: ['support@x.test', 'billing@x.test'] });
    expect(steps.set_out_of_office.status).toBe('ok');
    expect(f.g.calls.find((c) => c.path === 'gmail.users.settings.updateVacation').args[0].requestBody).toMatchObject({ enableAutoReply: true, responseBodyPlainText: 'Sam has left.', restrictToDomain: false });
    expect(f.g.calls.filter((c) => c.path === 'gmail.users.settings.sendAs.delete').map((c) => c.args[0].sendAsEmail)).toEqual(['support@x.test', 'billing@x.test']);
    expect(f.opened).toContain('sam@x.test');
    expect(f.seq).toEqual(['out-of-office', 'remove-alias', 'remove-alias', 'suspend']);
    expect(out.confirmed).toBe(true);
    expect(out.after).toMatchObject({ outOfOffice: 'ok', sendAsRemoved: ['support@x.test', 'billing@x.test'], suspended: true }); // the audit trail can restore them
    expect((await holder.db.listRecentChanges())[0].after.sendAsRemoved).toEqual(['support@x.test', 'billing@x.test']);
  });
  it('always opens the PRIMARY address, even when given a user ID or an alias', async () => {
    for (const key of ['1234567890', 'sammy@x.test']) {
      const f = setup();
      await registry.handlers.workflow_offboard_employee({ userKey: key, confirm: true }, f.clients);
      expect(f.opened.length, key).toBeGreaterThanOrEqual(2);
      expect(new Set(f.opened), key).toEqual(new Set(['sam@x.test']));
      expect(f.calls.find((c) => c.path === 'admin.users.get').args[0].userKey).toBe(key);
    }
  });
  it('does not open a mailbox outside the connection\'s domains unless crossDomain is true', async () => {
    const f = setup();
    f.clients.allowedDomains = ['other.test'];
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: '1234567890', confirm: true }, f.clients));
    expect(out.details.steps.find((s) => s.step === 'remove_send_as_aliases')).toMatchObject({ status: 'skipped' });
    expect(out.details.steps.find((s) => s.step === 'remove_send_as_aliases').note).toMatch(/outside the domains/);
    expect(f.opened).toEqual([]);
    const g = setup();
    g.clients.allowedDomains = ['other.test'];
    await registry.handlers.workflow_offboard_employee({ userKey: '1234567890', confirm: true, crossDomain: true }, g.clients);
    expect(g.opened.length).toBeGreaterThan(0);
  });
  it('can skip the alias removal, and is still confirmed when everything else worked', async () => {
    const f = setup();
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test', removeSendAsAliases: false, confirm: true }, f.clients));
    expect(out.details.steps.some((s) => s.step === 'remove_send_as_aliases')).toBe(false);
    expect(out.confirmed).toBe(true);
    expect(f.g.calls.some((c) => c.path.endsWith('sendAs.delete'))).toBe(false);
  });
  it('without delegation the mailbox steps are skipped with a reason, the rest still happens, and it is NOT called confirmed', async () => {
    const f = setup({ delegated: false });
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test', confirm: true }, f.clients));
    const steps = Object.fromEntries(out.details.steps.map((s) => [s.step, s]));
    expect(steps.set_out_of_office.status).toBe('skipped');
    expect(steps.remove_send_as_aliases.status).toBe('skipped');
    expect(steps.suspend.status).toBe('ok');
    expect(out.confirmed).toBe(false);
    expect(f.opened).toEqual([]);
  });
  it('a mailbox step that fails is reported as failed, the account is still suspended, and the result is NOT confirmed', async () => {
    const f = setup();
    f.g.when('gmail.users.settings.sendAs.list').rejects(googleError(403, 'forbidden', 'delegation denied'));
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test', confirm: true }, f.clients));
    expect(out.details.steps.find((s) => s.step === 'remove_send_as_aliases')).toMatchObject({ status: 'failed', error: 'delegation denied' });
    expect(out.details.steps.find((s) => s.step === 'suspend').status).toBe('ok');
    expect(out.confirmed).toBe(false);
  });
  it('an auto-reply Google does not show as on is a failure, not a pass', async () => {
    const f = setup({ vacationOn: false });
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test', confirm: true }, f.clients));
    expect(out.details.steps.find((s) => s.step === 'set_out_of_office').status).toBe('failed');
    expect(out.confirmed).toBe(false);
  });
});
