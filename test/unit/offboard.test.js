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

function setup({ delegated = true, aliases = [{ sendAsEmail: 'sam@x.test', isPrimary: true }, { sendAsEmail: 'support@x.test' }, { sendAsEmail: 'billing@x.test' }], vacationOn = true } = {}) {
  const f = makeFakeClients({ actingAs: 'ops@x.test' });
  const g = makeFakeClients();
  f.when('admin.users.get').resolvesOnce({ data: { primaryEmail: 'sam@x.test', suspended: false } });
  f.when('admin.users.get').resolves({ data: { primaryEmail: 'sam@x.test', suspended: true } });
  g.when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: aliases } });
  g.when('gmail.users.settings.getVacation').resolves({ data: { enableAutoReply: vacationOn } });
  const seq = [];
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
    expect(f.opened).toEqual([]);
    expect(f.calls.filter((c) => !/\.(get|list)$/.test(c.path))).toEqual([]);
  });
  it('without confirm it asks first', async () => {
    const f = setup();
    expect(body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test' }, f.clients)).needsConfirmation).toBe(true);
    expect(f.opened).toEqual([]);
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
  });
  it('looks up the address when given a user ID', async () => {
    const f = setup();
    await registry.handlers.workflow_offboard_employee({ userKey: '1234567890', confirm: true }, f.clients);
    expect(f.opened).toContain('sam@x.test');
  });
  it('can skip the alias removal', async () => {
    const f = setup();
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test', removeSendAsAliases: false, confirm: true }, f.clients));
    expect(out.details.steps.some((s) => s.step === 'remove_send_as_aliases')).toBe(false);
    expect(f.g.calls.some((c) => c.path.endsWith('sendAs.delete'))).toBe(false);
  });
  it('without delegation the mailbox steps are skipped with a reason, and the rest still happens', async () => {
    const f = setup({ delegated: false });
    const out = body(await registry.handlers.workflow_offboard_employee({ userKey: 'sam@x.test', confirm: true }, f.clients));
    const steps = Object.fromEntries(out.details.steps.map((s) => [s.step, s]));
    expect(steps.set_out_of_office.status).toBe('skipped');
    expect(steps.remove_send_as_aliases.status).toBe('skipped');
    expect(steps.suspend.status).toBe('ok');
    expect(out.confirmed).toBe(true);
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
