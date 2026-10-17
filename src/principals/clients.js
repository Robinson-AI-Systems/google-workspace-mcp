// A public connection MUST use the principal/account from a real minted
// V2 bearer context. This module never imports the installation owner's
// stored Google token/default account or service-account key.
import {publicGoogleClient} from './google.js';
import {scopedStore,trustedCustomerDelegation} from './store.js';
import {scopedDelegationClients} from './delegation.js';
import {buildApiClients} from '../auth/google-auth-hosted.js';
import {domainOfEmail} from '../domains.js';
import {requireScope} from './security.js';

export async function buildPrincipalApiClients(context){
 const store=scopedStore(context); // checks private server minting WeakSet
 const account=await store.getAccount(context.accountId);
 requireScope(account&&account.id===context.accountId&&
  account.token_version===context.accountVersion,'outside_scope');
 const tokens=await store.getGrant(context.accountId);
 requireScope(tokens&&(tokens.access_token||tokens.refresh_token),'google_account_not_linked');
 const auth=publicGoogleClient(); // separate PUBLIC_* app only
 auth.setCredentials(tokens);
 auth.actingAs=account.email;
 const tenantCredential=await trustedCustomerDelegation(context);
 const delegation=scopedDelegationClients(tenantCredential);
 const clients=buildApiClients(auth,{tenantDelegation:delegation});
 clients.tenantDelegationInfo=Object.freeze(tenantCredential?
  {customerId:tenantCredential.customerId,
   serviceAccountEmail:tenantCredential.key.client_email,
   clientId:tenantCredential.key.client_id,
   scopes:Object.freeze([...tenantCredential.scopes]),
   verifiedSubjects:Object.freeze([...tenantCredential.verifiedSubjects])}:
  {configured:false,scopes:Object.freeze([]),verifiedSubjects:Object.freeze([])});
 clients.store=store;
 clients.principal=context.principalId;
 clients.accountId=context.accountId;
 clients.connection=context.connectionId;
 clients.credentialVersion=context.accountVersion;
 clients.rtcPolicy=Object.freeze({principalKind:'user',profile:context.profile,listing:context.listing,
  areas:context.areas,mode:context.mode,cost_policy:context.costPolicy});
 // A domain-bound UI guard is not proof of Google Workspace administration;
 // privilege requires the customer's independently verified OAuth/DWD grant.
 const domain=domainOfEmail(account.email);
 clients.allowedDomains=domain?[domain]:[];
 clients.crossDomain=false;
 return clients;
}
