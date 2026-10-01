import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { handlers } = await import('../../src/tools/accounts.js');

const text = (result) => result.content[0].text;

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@robinsonaisystems.test', { access_token: 'a' }, { label: 'AI Systems' });
  await holder.db.saveGoogleTokensFor('ops@rentals.test', { access_token: 'b' }, { label: 'Appliance Rentals' });
});

describe('workspace_whoami', () => {
  it('confirms the connection is acting as the mailbox Gmail itself reports', async () => {
    const { clients, when } = makeFakeClients({ actingAs: 'ops@rentals.test' });
    when('gmail.users.getProfile').resolves({ data: { emailAddress: 'Ops@Rentals.test', messagesTotal: 42 } });
    const out = JSON.parse(text(await handlers.workspace_whoami({}, clients)));
    expect(out).toMatchObject({ actingAs: 'ops@rentals.test', matches: true, label: 'Appliance Rentals', isDefaultAccount: false, messagesTotal: 42 });
  });

  it('flags a mismatch when Gmail reports a different mailbox than the one the server believes it is acting as', async () => {
    const { clients, when } = makeFakeClients({ actingAs: 'ops@rentals.test' });
    when('gmail.users.getProfile').resolves({ data: { emailAddress: 'ops@robinsonaisystems.test' } });
    const out = JSON.parse(text(await handlers.workspace_whoami({}, clients)));
    expect(out.matches).toBe(false);
    expect(out.gmailReports).toBe('ops@robinsonaisystems.test');
  });

  it('marks the default account as the default', async () => {
    const { clients, when } = makeFakeClients({ actingAs: 'ops@robinsonaisystems.test' });
    when('gmail.users.getProfile').resolves({ data: { emailAddress: 'ops@robinsonaisystems.test' } });
    expect(JSON.parse(text(await handlers.workspace_whoami({}, clients))).isDefaultAccount).toBe(true);
  });
});

describe('workspace_list_accounts', () => {
  it('lists accounts with the default first and never includes tokens', async () => {
    const out = JSON.parse(text(await handlers.workspace_list_accounts()));
    expect(out.map((a) => a.email)).toEqual(['ops@robinsonaisystems.test', 'ops@rentals.test']);
    expect(text(await handlers.workspace_list_accounts())).not.toContain('access_token');
  });
});

describe('workspace_remove_account', () => {
  it('refuses to remove anything unless confirm is exactly true', async () => {
    for (const confirm of [false, undefined, 'true', 1]) {
      await handlers.workspace_remove_account({ email: 'ops@rentals.test', confirm });
    }
    expect(await holder.db.getGoogleTokensFor('ops@rentals.test')).not.toBeNull();
  });

  it('removes the account when confirmed', async () => {
    const out = JSON.parse(text(await handlers.workspace_remove_account({ email: 'ops@rentals.test', confirm: true })));
    expect(out.map((a) => a.email)).toEqual(['ops@robinsonaisystems.test']);
  });
});
