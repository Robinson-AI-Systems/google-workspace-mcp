// One way for tools to open another person's Gmail through domain-wide delegation. `clients.gmailFor` and
// `clients.delegationReady` exist so tests can supply fakes; in production neither is set.
import { google } from 'googleapis';
import { buildDelegatedAuth, isDelegationConfigured } from '../auth/service-account.js';

export const delegationReady = (clients) => clients?.delegationReady ?? isDelegationConfigured();
export const delegatedGmail = (clients, email) => (clients?.gmailFor ?? ((e) => google.gmail({ version: 'v1', auth: buildDelegatedAuth(e) })))(email);

/** May this connection open that mailbox? Only within its own domains, unless the call said crossDomain: true. */
export const mailboxAllowed = (clients, email) => clients?.crossDomain === true || !Array.isArray(clients?.allowedDomains) || clients.allowedDomains.includes(String(email).split('@')[1]);
