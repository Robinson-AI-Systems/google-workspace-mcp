// One way for tools to open another person's Gmail through domain-wide delegation. `clients.gmailFor` and
// `clients.delegationReady` exist so tests can supply fakes; in production neither is set.
import { google } from 'googleapis';
import { buildDelegatedAuth, isDelegationConfigured } from '../auth/service-account.js';

export const delegationReady = (clients) => clients?.delegationReady ?? isDelegationConfigured();
export const delegatedGmail = (clients, email) => (clients?.gmailFor ?? ((e) => google.gmail({ version: 'v1', auth: buildDelegatedAuth(e) })))(email);
