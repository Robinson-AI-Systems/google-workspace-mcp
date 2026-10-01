import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null, gmail: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
vi.mock('googleapis', () => ({ google: { gmail: () => holder.gmail } }));
vi.mock('../../src/auth/service-account.js', () => ({
  isDelegationConfigured: () => true,
  buildDelegatedAuth: () => ({}),
  describeServiceAccount: () => ({})
}));
const { handlers } = await import('../../src/tools/mailbox-branding.js');

beforeEach(() => { holder.db = createFakeDb(); });

describe('workflow_brand_mailbox (delegation on)', () => {
  it('creates a missing alias, reads the result back, and logs before and after without the signature text', async () => {
    const fake = makeFakeClients({ actingAs: 'ops@example.test' });
    holder.gmail = fake.clients.gmail;
    fake.when('gmail.users.settings.sendAs.list').resolvesOnce({ data: { sendAs: [{ sendAsEmail: 'sam@example.test', displayName: 'Sam', isPrimary: true, isDefault: true }] } });
    fake.when('gmail.users.settings.sendAs.list').resolvesOnce({ data: { sendAs: [
      { sendAsEmail: 'sam@example.test', displayName: 'Sam R', signature: '<b>SECRET SIGNATURE</b>', isPrimary: true, isDefault: true },
      { sendAsEmail: 'hello@example.test', displayName: 'Hello', signature: '<b>SECRET SIGNATURE</b>' }
    ] } });
    const result = JSON.parse((await handlers.workflow_brand_mailbox(
      { userEmail: 'sam@example.test', displayName: 'Sam R', signatureHtml: '<b>SECRET SIGNATURE</b>', aliases: [{ email: 'hello@example.test', displayName: 'Hello' }] },
      Object.assign(fake.clients, { connection: 'c1/ab12cd34' })
    )).content[0].text);

    const created = fake.calls.filter((c) => c.path === 'gmail.users.settings.sendAs.create');
    expect(created).toHaveLength(1);
    expect(created[0].args[0].requestBody.sendAsEmail).toBe('hello@example.test');
    expect(result.done).toBe(true);
    expect(result.aliases.map((a) => a.email)).toEqual(['hello@example.test']);

    const [row] = await holder.db.listRecentChanges();
    expect(row).toMatchObject({ tool: 'workflow_brand_mailbox', target: 'sam@example.test', acting_as: 'ops@example.test', connection: 'c1/ab12cd34' });
    expect(row.before).toHaveLength(1);
    expect(row.after).toHaveLength(2);
    expect(row.after[0]).toMatchObject({ displayName: 'Sam R', hasSignature: true });
    expect(JSON.stringify(row)).not.toContain('SECRET SIGNATURE');
  });

  it('records a partial change when a later step fails, then still raises the error', async () => {
    const fake = makeFakeClients({ actingAs: 'ops@example.test' });
    holder.gmail = fake.clients.gmail;
    fake.when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: [{ sendAsEmail: 'sam@example.test', isPrimary: true }] } });
    fake.when('gmail.users.settings.sendAs.create').rejects(Object.assign(new Error('Alias not on this user'), { response: { data: { error: { message: 'Alias not on this user' } } } }));
    await expect(handlers.workflow_brand_mailbox(
      { userEmail: 'sam@example.test', displayName: 'Sam', aliases: [{ email: 'hello@example.test' }] }, fake.clients)).rejects.toThrow(/Alias not on this user/);
    expect(fake.calls.some((c) => c.path === 'gmail.users.settings.sendAs.patch')).toBe(true); // the primary change did happen
    const [row] = await holder.db.listRecentChanges();
    expect(row.summary).toMatch(/stopped part-way and may be partly applied \(Alias not on this user\)/);
    expect(row.before).toHaveLength(1);
  });
});
