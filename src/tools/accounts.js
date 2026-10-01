// Tools about the server's own Google accounts: which one this connection is
// acting as, which others exist, and (for the person who owns the server)
// housekeeping like renaming or removing one. Nothing here talks to Google
// except workspace_whoami, which confirms the identity with Gmail itself.
import { ok } from './util.js';
import { listGoogleAccounts, setDefaultGoogleAccount, removeGoogleAccount, listConnections, revokeConnection, listRecentChanges } from '../db.js';

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
  },
  {
    name: 'workspace_recent_changes',
    description: 'What has been changed in Workspace through this server? Newest first: when, which Google account it acted as, which Claude connection asked, which tool, what it touched, and what it was before and after. Only changes made through this server are listed (not edits made in Google directly). Defaults to the last 7 days.',
    inputSchema: { type: 'object', properties: { since: { type: 'string', description: 'A date/time (e.g. 2026-09-28) or a number of days like "3d". Default 7d.' }, tool: { type: 'string', description: 'Only this tool, e.g. admin_move_user_orgunit' }, actingAs: { type: 'string', description: 'Only changes made as this Google account' }, includeDryRuns: { type: 'boolean', description: 'Also list previews (dryRun) that changed nothing. Default false.' }, limit: { type: 'number', default: 50 } } }
  },
  {
    name: 'workspace_list_connections',
    description: 'Which Claude connections can use this server, which Google account each one acts as, when each was created, when it expires and when it was last used. Tokens are never shown: token_prefix (first 8 characters) is what you use to revoke one, and connection_id is the short label that appears in the change log for that connection.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'workspace_revoke_connection',
    description: 'Switch one Claude connection off for good: it stops working immediately and cannot renew itself (the person must connect again). Use workspace_list_connections to get the token prefix. Pass confirm: true. This cannot be undone.',
    inputSchema: { type: 'object', properties: { tokenPrefix: { type: 'string', description: 'First characters of the token, at least 8, from workspace_list_connections' }, confirm: { type: 'boolean', description: 'Must be true.' } }, required: ['tokenPrefix', 'confirm'] }
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
  },
  async workspace_recent_changes(args) {
    const days = /^(\d+)d$/i.exec(String(args.since || '').trim());
    let since;
    if (days) since = new Date(Date.now() - Number(days[1]) * 86400000).toISOString();
    else if (args.since) {
      const t = new Date(args.since);
      if (Number.isNaN(t.getTime())) return ok(`I could not read "${args.since}" as a date. Use a date like 2026-09-28 or a number of days like 3d.`);
      since = t.toISOString();
    } else since = new Date(Date.now() - 7 * 86400000).toISOString();
    const rows = await listRecentChanges({ since, tool: args.tool, actingAs: args.actingAs, limit: args.limit, includeDryRuns: args.includeDryRuns === true });
    return ok(rows.length ? rows : { changes: [], note: `Nothing recorded since ${since}. Only changes made through this server are listed.` });
  },
  async workspace_list_connections() {
    return ok(await listConnections());
  },
  async workspace_revoke_connection(args) {
    if (args.confirm !== true) return ok('Nothing revoked: pass confirm: true to proceed.');
    const result = await revokeConnection(args.tokenPrefix);
    if (result.reason === 'too_short') return ok('Nothing revoked: give at least the first 8 characters of the token (see workspace_list_connections).');
    if (result.reason === 'not_found') return ok('Nothing revoked: no connection starts with that. Check workspace_list_connections.');
    if (result.reason === 'ambiguous') return ok('Nothing revoked: more than one connection starts with that. Give more characters of the token.');
    return ok({ revoked: result.revoked, note: 'That connection can no longer be used or renewed. It was told nothing; the person must connect again.', connections: await listConnections() });
  }
};
