// Tools about the server's own Google accounts: which one this connection is
// acting as, which others exist, and (for the person who owns the server)
// housekeeping like renaming or removing one. Nothing here talks to Google
// except workspace_whoami, which confirms the identity with Gmail itself.
import { ok } from './util.js';
import { listGoogleAccounts, setDefaultGoogleAccount, removeGoogleAccount } from '../db.js';

export const tools = [
  {
    name: 'workspace_whoami',
    description: 'Which Google account is this connection acting as? Call this before any Gmail/Drive/Calendar change to be sure you are in the intended business mailbox. Confirms with Gmail, so it also proves the sign-in still works.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'workspace_list_accounts',
    description: 'List every Google account this server holds a sign-in for (email, label, which is the default). Tokens are never returned.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'workspace_set_default_account',
    description: 'Make one connected Google account the default, i.e. the one used by older Claude connections that never picked an account. Does not change what THIS connection acts as.',
    inputSchema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] }
  },
  {
    name: 'workspace_remove_account',
    description: "Forget a connected Google account's sign-in. Any Claude connection bound to it stops working until that account is connected again. Cannot be undone from here.",
    inputSchema: { type: 'object', properties: { email: { type: 'string' }, confirm: { type: 'boolean', description: 'Must be true.' } }, required: ['email', 'confirm'] }
  }
];

export const handlers = {
  async workspace_whoami(_args, clients) {
    const profile = await clients.gmail.users.getProfile({ userId: 'me' });
    const accounts = await listGoogleAccounts();
    const me = accounts.find((a) => a.email === clients.actingAs);
    return ok({
      actingAs: clients.actingAs,
      gmailReports: profile.data.emailAddress,
      matches: profile.data.emailAddress?.toLowerCase() === clients.actingAs,
      label: me?.label || null,
      isDefaultAccount: !!me?.is_default,
      messagesTotal: profile.data.messagesTotal
    });
  },
  async workspace_list_accounts() {
    return ok(await listGoogleAccounts());
  },
  async workspace_set_default_account(args) {
    await setDefaultGoogleAccount(args.email);
    return ok(await listGoogleAccounts());
  },
  async workspace_remove_account(args) {
    if (args.confirm !== true) return ok('Nothing removed: pass confirm: true to proceed.');
    await removeGoogleAccount(args.email);
    return ok(await listGoogleAccounts());
  }
};
