// P10 tenant delegation is customer owned. Only an authenticated browser
// session can submit a key; no secret enters query strings, tool args or logs.
// The installation owner's GOOGLE_SERVICE_ACCOUNT_JSON is never read here.
import {neon} from '@neondatabase/serverless';
import {google} from 'googleapis';
import {sealV2,openV2} from './crypto.js';
import {validUuid,validEmail,requireScope} from './security.js';
import {findAccount,getLinkedGrant,updateLinkedGrant} from './store.js';
import {SCOPE_GROUPS} from '../auth/scopes.js';
import {GMAIL_SETTINGS_SCOPES,CALENDAR_SCOPE,DRIVE_FILE_SCOPE,ALERT_CENTER_SCOPE} from '../auth/service-account.js';
import {publicGoogleClient} from './google.js';

let connection;
const sql=()=>{
 if(!connection){if(!process.env.DATABASE_URL)throw Error('database_unavailable');
   connection=neon(process.env.DATABASE_URL);}
 return connection;
};
const VERIFY_SCOPE='https://www.googleapis.com/auth/admin.directory.user.readonly';
const SERVICE_SCOPES=new Set([...Object.values(SCOPE_GROUPS).flat(),
 ...GMAIL_SETTINGS_SCOPES,CALENDAR_SCOPE,DRIVE_FILE_SCOPE,ALERT_CENTER_SCOPE,VERIFY_SCOPE]);
const customerPattern=/^C[a-zA-Z0-9]{5,40}$/;
function normalizedScopes(scopes){
 requireScope(Array.isArray(scopes)&&scopes.length>=1&&scopes.length<=40,'invalid_delegation_scope');
 const sorted=[...new Set(scopes)];
 requireScope(sorted.length===scopes.length&&sorted.every(s=>typeof s==='string'&&SERVICE_SCOPES.has(s)),
   'invalid_delegation_scope');
 return sorted.sort();
}
function validateKey(raw){
 requireScope(typeof raw==='string'&&raw.length>0&&raw.length<=20000,'invalid_service_credential');
 let value;
 try{value=JSON.parse(raw);}catch{throw Error('invalid_service_credential');}
 requireScope(value&&value.type==='service_account'&&validEmail(value.client_email)&&
   typeof value.private_key==='string'&&value.private_key.includes('BEGIN PRIVATE KEY')&&
   typeof value.client_id==='string'&&/^\d{8,30}$/.test(value.client_id)&&
   typeof value.project_id==='string'&&value.project_id.length>=4,'invalid_service_credential');
 // Only private signing fields and verified basic identity can be persisted.
 return Object.freeze({client_email:value.client_email,private_key:value.private_key,
   client_id:value.client_id,project_id:value.project_id});
}
function delegatedAuth(key,subject,scopes){
 return new google.auth.JWT({email:key.client_email,key:key.private_key,subject,scopes});
}
async function verifiedAdmin({principalId,accountId}){
 const account=await findAccount(principalId,accountId);
 requireScope(account&&account.status==='active'&&validEmail(account.email),'outside_scope');
 requireScope(account.scope_list.includes(VERIFY_SCOPE),'admin_verification_scope_required');
 const saved=await getLinkedGrant(principalId,accountId);
 requireScope(saved?.access_token||saved?.refresh_token,'admin_google_grant_missing');
 const auth=publicGoogleClient();
 auth.setCredentials(saved);
 const dir=google.admin({version:'directory_v1',auth});
 const response=await dir.users.get({userKey:account.email,projection:'basic'});
 const person=response?.data;
 requireScope(person?.primaryEmail?.toLowerCase()===account.email.toLowerCase()&&
   person.isAdmin===true&&customerPattern.test(String(person.customerId||'')),
   'verified_customer_admin_required');
 // Refresh is version-CAS persisted before authorizing irreversible credentials.
 if(auth.credentials?.access_token!==saved.access_token ||
   auth.credentials?.expiry_date!==saved.expiry_date){
   await updateLinkedGrant({principalId,accountId,version:account.token_version,
     tokens:auth.credentials,scopeList:account.scope_list});
 }
 return {customerId:person.customerId,subject:account.email.toLowerCase()};
}
export async function configureCustomerDelegation({principalId,accountId,credentialJson,scopes}){
 requireScope(validUuid(principalId)&&validUuid(accountId),'outside_scope');
 const selected=normalizedScopes(scopes),key=validateKey(credentialJson);
 // This verification derives customer/subject from a real signed-in OAuth
 // Admin SDK read, NEVER from the supplied key, domain suffix, hd or form.
 const verified=await verifiedAdmin({principalId,accountId});
 // The verified customer's own administrator must authorize this robot in
 // Google's Admin Console. A real delegated token request proves the grant.
 const jwt=delegatedAuth(key,verified.subject,selected);
 await jwt.authorize();
 const encrypted=sealV2(key,principalId,accountId,'delegation:'+verified.customerId);
 const id=cryptoId(),q=sql();
 const rows=await q`INSERT INTO principal_delegations
    (id,principal_id,account_id,customer_id,scopes,subject_rule,credential_ciphertext,enabled,revoked_at)
    SELECT ${id}::uuid,a.principal_id,a.id,${verified.customerId},
      ${selected},${verified.subject},${encrypted},true,NULL
    FROM principal_google_accounts a JOIN principals p ON p.id=a.principal_id
    WHERE a.id=${accountId}::uuid AND a.principal_id=${principalId}::uuid
      AND a.status='active' AND p.kind='user' AND p.status='active'
    ON CONFLICT(principal_id,customer_id) DO UPDATE SET
      account_id=excluded.account_id,scopes=excluded.scopes,
      subject_rule=excluded.subject_rule,credential_ciphertext=excluded.credential_ciphertext,
      enabled=true,revoked_at=NULL
    RETURNING id`;
 requireScope(rows.length===1,'outside_scope');
 return {configured:true,customerId:verified.customerId,serviceAccount:key.client_email,
   subject:verified.subject,scopes:selected,secretStoredEncrypted:true,
   googleDelegationVerified:true};
}
function cryptoId(){
 // Dynamic import is unnecessary; node built-in is never a key source.
 return globalCryptoUUID();
}
import {randomUUID as globalCryptoUUID} from 'node:crypto';

export async function listCustomerDelegations(principalId){
 requireScope(validUuid(principalId),'outside_scope');
 const rows=await sql()`SELECT d.id,d.account_id,d.customer_id,d.scopes,
   d.subject_rule,d.enabled,d.revoked_at
   FROM principal_delegations d JOIN principal_google_accounts a
   ON a.id=d.account_id AND a.principal_id=d.principal_id
   WHERE d.principal_id=${principalId}::uuid ORDER BY d.customer_id`;
 return rows.map(r=>({...r,configured:r.enabled&&!r.revoked_at,credentialPresent:true}));
}
export async function revokeCustomerDelegation(principalId,accountId,customerId){
 requireScope(validUuid(principalId)&&validUuid(accountId)&&
   customerPattern.test(String(customerId||'')),'outside_scope');
 const rows=await sql()`UPDATE principal_delegations SET enabled=false,
    revoked_at=now() WHERE principal_id=${principalId}::uuid
    AND account_id=${accountId}::uuid AND customer_id=${customerId}
    AND enabled=true AND revoked_at IS NULL RETURNING id`;
 return {revoked:rows.length===1,providerRevocationClaimed:false};
}
export async function loadCustomerDelegation(context){
 const {principalId,accountId}=context||{};
 requireScope(validUuid(principalId)&&validUuid(accountId),'invalid_scoped_context');
 const rows=await sql()`SELECT d.customer_id,d.scopes,d.subject_rule,d.credential_ciphertext
   FROM principal_delegations d JOIN principal_google_accounts a
   ON a.id=d.account_id AND a.principal_id=d.principal_id
   JOIN principals p ON p.id=d.principal_id
   WHERE d.principal_id=${principalId}::uuid AND d.account_id=${accountId}::uuid
   AND d.enabled=true AND d.revoked_at IS NULL AND p.kind='user' AND p.status='active'
   AND a.status='active'`;
 requireScope(rows.length<=1,'ambiguous_customer_delegation');
 if(!rows.length)return null;
 const r=rows[0],key=openV2(r.credential_ciphertext,principalId,accountId,'delegation:'+r.customer_id);
 return {customerId:r.customer_id,subject:r.subject_rule,scopes:r.scopes,key};
}
export function scopedDelegationClients(delegation){
 // Only called with DB-read encrypted per-customer key. No global environment
 // fallback; absent scope, subject or credential fails before a provider call.
 if(!delegation)return Object.freeze({configured:false,
   forGmail:()=>{throw Error('customer_delegation_not_configured');},
   forServices:()=>{throw Error('customer_delegation_not_configured');},
   forAlert:()=>{throw Error('customer_delegation_not_configured');}});
 const {customerId,subject,scopes,key}=delegation;
 const authFor=(target,required)=>{
   const email=String(target||'').trim().toLowerCase();
   requireScope(validEmail(email)&&email===subject,'customer_subject_not_verified');
   requireScope(required.length>0&&required.every(s=>scopes.includes(s)),'customer_delegation_scope_missing');
   requireScope(customerPattern.test(customerId),'customer_not_verified');
   return delegatedAuth(key,email,required);
 };
 return Object.freeze({
   configured:true,customerId,scopes:Object.freeze([...scopes]),
   forGmail:email=>google.gmail({version:'v1',auth:authFor(email,GMAIL_SETTINGS_SCOPES)}),
   forServices:(email,requested)=>{
     const auth=authFor(email,requested),out={};
     if(requested.includes(CALENDAR_SCOPE))out.calendar=google.calendar({version:'v3',auth});
     if(requested.includes(DRIVE_FILE_SCOPE))out.drive=google.drive({version:'v3',auth});
     return out;
   },
   forAlert:email=>google.alertcenter({version:'v1beta1',auth:authFor(email,[ALERT_CENTER_SCOPE])})
 });
}
