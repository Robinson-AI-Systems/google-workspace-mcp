// One way for tools to open another person's Gmail through domain-wide delegation. `clients.gmailFor` and
// `clients.delegationReady` exist so tests can supply fakes; in production neither is set.
import { google } from 'googleapis';
import { buildDelegatedAuth, delegatedClients, isDelegationConfigured } from '../auth/service-account.js';

export const delegationReady = (clients) => {
  if(clients?.store)return clients.delegationReady===true; // never inherit owner's environment
  return clients?.delegationReady ?? isDelegationConfigured();
};
export const delegatedGmail = (clients, email) => {
  if(clients?.store){
    if(typeof clients.gmailFor!=='function')throw Error('customer_delegation_not_configured');
    return clients.gmailFor(email);
  }
  return (clients?.gmailFor ?? ((e) => google.gmail({ version: 'v1', auth: buildDelegatedAuth(e) })))(email);
};

/** May this connection open that mailbox? Only within its own domains, unless the call said crossDomain: true. */
export const mailboxAllowed = (clients, email) => clients?.crossDomain === true || !Array.isArray(clients?.allowedDomains) || clients.allowedDomains.includes(String(email).split('@')[1]);

/** Calendar/Drive clients for one mailbox with only the scopes asked for. `clients.delegatedClientsFor` lets tests supply fakes. */
export const delegatedServices = (clients, email, scopes) => {
  if(clients?.store){
    if(typeof clients.delegatedClientsFor!=='function')throw Error('customer_delegation_not_configured');
    return clients.delegatedClientsFor(email, scopes);
  }
  return (clients?.delegatedClientsFor ?? delegatedClients)(email, scopes);
};
