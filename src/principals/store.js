// Isolated V2 principal store. There is NO global-owner fallback in these methods.
import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {sealV2,openV2} from './crypto.js';
import {OWNER_ID,digest,mint,validUuid,validEmail,requireScope,legacyPilotLoginAllowed,legacyPilotFreshConsentAllowed} from './security.js';
import {normalizeConnectionPolicy} from '../oauth/connection-settings.js';
import {initTenantSchema,makeTenantStore} from './tenant-store.js';
import {loadCustomerDelegation} from './delegation.js';
import {initOwnerMigrationSchema} from './owner-migration.js';
let conn;
const trustedContexts=new WeakSet(); // no caller-minted frozen principal is accepted
const sql=()=>{if(!conn){if(!process.env.DATABASE_URL)throw Error('database_unavailable');conn=neon(process.env.DATABASE_URL);}return conn;};
const validSub=x=>typeof x==='string'&&x.length>=4&&x.length<=255&&/^[\x21-\x7e]+$/.test(x);
const policy=record=>normalizeConnectionPolicy(record,{grant:'refresh_token'});
export async function initPrincipalSchema(q=sql()){
 await q`CREATE TABLE IF NOT EXISTS principals (
   id UUID PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('legacy_owner','user')),
   status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleting','revoked')),
   legacy_pilot_identity_only BOOLEAN NOT NULL DEFAULT false,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await q`ALTER TABLE principals ADD COLUMN IF NOT EXISTS legacy_pilot_identity_only BOOLEAN NOT NULL DEFAULT false`;
 // Preserve the immutable original identity-only classification for audit.
 // Record a separate independently consented V2 grant without migrating owner data.
 await q`ALTER TABLE principals ADD COLUMN IF NOT EXISTS legacy_pilot_fresh_grant BOOLEAN NOT NULL DEFAULT false`;
 await q`INSERT INTO principals(id,kind) VALUES (${OWNER_ID}::uuid,'legacy_owner') ON CONFLICT(id) DO NOTHING`;
 await q`CREATE UNIQUE INDEX IF NOT EXISTS principals_single_owner ON principals(kind) WHERE kind='legacy_owner'`;
 await q`CREATE TABLE IF NOT EXISTS principal_google_identities (
   issuer TEXT NOT NULL,google_sub TEXT NOT NULL,principal_id UUID NOT NULL REFERENCES principals(id),
   verified_email TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   PRIMARY KEY(issuer,google_sub),UNIQUE(principal_id,issuer,google_sub))`;
 await q`CREATE TABLE IF NOT EXISTS principal_google_accounts (
   id UUID PRIMARY KEY,principal_id UUID NOT NULL REFERENCES principals(id),
   issuer TEXT NOT NULL,google_sub TEXT NOT NULL,email TEXT NOT NULL,label TEXT,
   scope_list TEXT[] NOT NULL DEFAULT '{}',grant_ciphertext TEXT,
   token_version INTEGER NOT NULL DEFAULT 0 CHECK(token_version>=0),
   status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   UNIQUE(issuer,google_sub),UNIQUE(id,principal_id))`;
 await q`ALTER TABLE principal_google_accounts ADD COLUMN IF NOT EXISTS refresh_version INTEGER NOT NULL DEFAULT 0`;
 await q`CREATE TABLE IF NOT EXISTS principal_defaults (
   principal_id UUID PRIMARY KEY REFERENCES principals(id),account_id UUID NOT NULL,
   FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
 await q`CREATE TABLE IF NOT EXISTS principal_legacy_accounts (
   email TEXT PRIMARY KEY REFERENCES google_accounts(email) ON DELETE CASCADE,
   principal_id UUID NOT NULL REFERENCES principals(id),
   CHECK(principal_id='00000000-0000-4000-8000-000000000001'::uuid))`;
 // The installation's existing rows belong only to the explicit owner; never
 // derive an owner from whichever public browser happens to arrive first.
 await q`INSERT INTO principal_legacy_accounts(email,principal_id)
   SELECT email,${OWNER_ID}::uuid FROM google_accounts ON CONFLICT(email) DO NOTHING`;
 await q`CREATE TABLE IF NOT EXISTS user_sessions (
   token_hash TEXT PRIMARY KEY,principal_id UUID NOT NULL REFERENCES principals(id),
   csrf_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,revoked_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await q`CREATE INDEX IF NOT EXISTS user_sessions_principal ON user_sessions(principal_id)`;
 await q`CREATE TABLE IF NOT EXISTS user_oauth_transactions (
   state_hash TEXT PRIMARY KEY,purpose TEXT NOT NULL CHECK(purpose IN ('login','link','mcp_authorize')),
   nonce_hash TEXT NOT NULL,browser_hash TEXT NOT NULL,
   principal_id UUID REFERENCES principals(id),provider_verifier_ciphertext TEXT NOT NULL,
   client_id TEXT,redirect_uri TEXT,resource TEXT,code_challenge TEXT,policy JSONB,
   expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await q`CREATE TABLE IF NOT EXISTS principal_oauth_codes (
   code_hash TEXT PRIMARY KEY,principal_id UUID NOT NULL REFERENCES principals(id),
   account_id UUID NOT NULL,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,
   resource TEXT NOT NULL,code_challenge TEXT NOT NULL,profile TEXT NOT NULL,
   listing TEXT NOT NULL,areas TEXT[],cost_policy JSONB NOT NULL,mode TEXT NOT NULL DEFAULT 'live',
   expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,
   FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
 await q`CREATE TABLE IF NOT EXISTS principal_connections (
   id UUID PRIMARY KEY,family UUID NOT NULL,principal_id UUID NOT NULL REFERENCES principals(id),
   account_id UUID NOT NULL,client_id TEXT NOT NULL,resource TEXT NOT NULL,
   profile TEXT NOT NULL,listing TEXT NOT NULL,areas TEXT[],cost_policy JSONB NOT NULL,
   mode TEXT NOT NULL CHECK(mode='live'),access_hash TEXT NOT NULL UNIQUE,
   refresh_hash TEXT NOT NULL UNIQUE,version INTEGER NOT NULL DEFAULT 1,
   expires_at TIMESTAMPTZ NOT NULL,revoked_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
 await q`CREATE INDEX IF NOT EXISTS principal_connections_principal ON principal_connections(principal_id,account_id)`;
 await q`CREATE TABLE IF NOT EXISTS principal_refresh_uses (
   refresh_hash TEXT PRIMARY KEY,family UUID NOT NULL,used_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await q`CREATE TABLE IF NOT EXISTS principal_deletion_requests (
   principal_id UUID PRIMARY KEY REFERENCES principals(id),requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   cancelled_at TIMESTAMPTZ,confirmed_at TIMESTAMPTZ)`;
 await q`CREATE TABLE IF NOT EXISTS principal_delegations (
   id UUID PRIMARY KEY,principal_id UUID NOT NULL REFERENCES principals(id),
   customer_id TEXT NOT NULL,scopes TEXT[] NOT NULL,subject_rule TEXT NOT NULL,
   credential_ciphertext TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT false,
   revoked_at TIMESTAMPTZ,UNIQUE(principal_id,customer_id))`;
 await initTenantSchema(q);
 await initOwnerMigrationSchema(q);
}
export async function legacyOwnerContext(accessToken){
 if(typeof accessToken!=='string'||accessToken.startsWith('p10'))return null;
 const q=sql();
 const rows=await q`SELECT p.id AS principal_id,p.kind AS principal_kind,p.status,
   t.google_account,t.client_id,t.profile,t.listing,t.areas,t.mode,t.cost_policy
   FROM oauth_tokens t JOIN principals p ON p.id=${OWNER_ID}::uuid
   WHERE t.access_token=${accessToken} AND t.expires_at>now() AND t.revoked_at IS NULL`;
 return rows.length===1&&rows[0].status==='active'?Object.freeze({...rows[0],connection_id:digest(accessToken).slice(0,16)}):null;
}
export async function getVerifiedPrincipal(issuer,sub){
 if(!validSub(sub))return null;
 const q=sql();
 const rows=await q`SELECT i.principal_id,p.status FROM principal_google_identities i
   JOIN principals p ON p.id=i.principal_id
   WHERE i.issuer=${issuer} AND i.google_sub=${sub}`;
 return rows.length===1&&rows[0].status==='active'?rows[0].principal_id:null;
}
export async function bindVerifiedIdentity({issuer,sub,verifiedEmail,identityOnlyPilot=false}){
 requireScope(['accounts.google.com','https://accounts.google.com'].includes(issuer)&&validSub(sub)&&validEmail(verifiedEmail),'invalid_identity');
 const q=sql();
 const reserved=await q`SELECT 1 FROM google_accounts WHERE lower(email)=lower(${verifiedEmail}) LIMIT 1`;
 const legacyIdentityOnly=reserved.length>0&&identityOnlyPilot===true&&legacyPilotLoginAllowed(sub);
 const old=await getVerifiedPrincipal(issuer,sub);
 if(old&&reserved.length){
   // A historical owner-connected mailbox may ALSO carry its own explicitly
   // consented V2 grant. Never infer cross-principal authority from email.
   const independent=await q`SELECT 1 FROM principals p
     JOIN principal_google_identities i ON i.principal_id=p.id
     WHERE p.id=${old}::uuid AND p.kind='user' AND p.status='active'
       AND p.legacy_pilot_identity_only=true AND p.legacy_pilot_fresh_grant=true
       AND i.issuer=${issuer} AND i.google_sub=${sub}
       AND lower(i.verified_email)=lower(${verifiedEmail}) LIMIT 1`;
   if(independent.length===1)return old;
 }
 requireScope(reserved.length===0||legacyIdentityOnly,'reserved_identity');
 if(old)return old;
 const id=crypto.randomUUID();
 // Candidate principal and identity are created in ONE statement. If identity
 // was claimed by a racing browser, the candidate is deleted in this statement.
 const rows=await q`WITH candidate AS (
   INSERT INTO principals(id,kind,legacy_pilot_identity_only) VALUES (${id}::uuid,'user',${legacyIdentityOnly}) RETURNING id
 ), enrolled AS (
   INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
   SELECT ${issuer},${sub},id,${verifiedEmail} FROM candidate
   ON CONFLICT(issuer,google_sub) DO NOTHING RETURNING principal_id
 ), rolled_back AS (
   DELETE FROM principals WHERE id=${id}::uuid AND NOT EXISTS(SELECT 1 FROM enrolled) RETURNING id
 ) SELECT principal_id FROM enrolled`;
 return rows.length?rows[0].principal_id:await getVerifiedPrincipal(issuer,sub);
}
export async function getPrincipal(principalId){
 if(!validUuid(principalId))return null;
 const rows=await sql()`SELECT id,kind,status FROM principals WHERE id=${principalId}::uuid`;
 return rows[0]||null;
}
export async function findAccount(principalId,accountId){
 if(!validUuid(principalId)||!validUuid(accountId))return null;
 const q=sql();
 const rows=await q`SELECT a.id,a.principal_id,a.issuer,a.google_sub,a.email,a.label,a.scope_list,a.token_version,a.refresh_version,
   a.grant_ciphertext,a.status FROM principal_google_accounts a JOIN principals p ON p.id=a.principal_id
   WHERE a.id=${accountId}::uuid AND a.principal_id=${principalId}::uuid
   AND a.status='active' AND p.status='active'`;
 return rows[0]||null;
}
export async function listAccounts(principalId){
 requireScope(validUuid(principalId));
 const q=sql();
 return q`SELECT a.id,a.email,a.label,a.scope_list,a.token_version,a.status,
   d.account_id IS NOT NULL AS is_default FROM principal_google_accounts a
   LEFT JOIN principal_defaults d ON d.principal_id=a.principal_id AND d.account_id=a.id
   WHERE a.principal_id=${principalId}::uuid AND a.status='active'
   ORDER BY is_default DESC,a.created_at ASC`;
}
// The legacy tester's new user principal has no owner mailbox authority. This
// immutable persisted principal classification blocks linking *any* Google
// account, even if owner mailboxes are removed or flags change after login.
export async function isLegacyPilotIdentityPrincipal(principalId){
 requireScope(validUuid(principalId),'invalid_identity');
 const rows=await sql()`SELECT 1 FROM principals
   WHERE id=${principalId}::uuid AND kind='user'
   AND legacy_pilot_identity_only=true AND legacy_pilot_fresh_grant=false LIMIT 1`;
 return rows.length>0;
}
// The first fresh scope consent may start only for the EXACT Google-verified
// historical tester, after explicit owner opt-in. No OAuth/owner token access.
export async function canLegacyPilotStartFreshConsent(principalId){
 requireScope(validUuid(principalId),'invalid_identity');
 const rows=await sql()`SELECT i.google_sub FROM principals p
   JOIN principal_google_identities i ON i.principal_id=p.id
   JOIN google_accounts old ON lower(old.email)=lower(i.verified_email)
   WHERE p.id=${principalId}::uuid AND p.kind='user' AND p.status='active'
     AND p.legacy_pilot_identity_only=true
     AND p.legacy_pilot_fresh_grant=false`;
 return rows.length===1&&legacyPilotFreshConsentAllowed(rows[0].google_sub);
}
export async function upsertLinkedAccount({principalId,issuer,sub,verifiedEmail,scopeList,tokens}){
 requireScope(validUuid(principalId)&&validSub(sub)&&validEmail(verifiedEmail)&&
   Array.isArray(scopeList)&&scopeList.every(x=>typeof x==='string')&&tokens?.access_token,'invalid_link');
 const q=sql();
 const prior=await q`SELECT p.legacy_pilot_identity_only AS historical,
   p.legacy_pilot_fresh_grant AS fresh FROM principals p
   WHERE p.id=${principalId}::uuid AND p.kind='user' AND p.status='active'`;
 requireScope(prior.length===1,'invalid_identity');
 const historical=prior[0].historical===true;
 let independentlyEligible=false;
 if(historical){
   const matching=await q`SELECT 1 FROM principal_google_identities i
     JOIN google_accounts old ON lower(old.email)=lower(i.verified_email)
     WHERE i.principal_id=${principalId}::uuid
       AND i.issuer=${issuer} AND i.google_sub=${sub}
       AND lower(i.verified_email)=lower(${verifiedEmail})`;
   independentlyEligible=matching.length===1&&
     (prior[0].fresh===true||legacyPilotFreshConsentAllowed(sub));
   requireScope(independentlyEligible,'legacy_pilot_identity_only');
 }
 const reserved=await q`SELECT 1 FROM google_accounts WHERE lower(email)=lower(${verifiedEmail}) LIMIT 1`;
 requireScope(!reserved.length||independentlyEligible,'reserved_identity');
 const foreign=await q`SELECT id FROM principal_google_accounts
   WHERE issuer=${issuer} AND google_sub=${sub} AND principal_id<>${principalId}::uuid`;
 requireScope(!foreign.length,'identity_owned_elsewhere');
 const identity=await q`SELECT principal_id FROM principal_google_identities
   WHERE issuer=${issuer} AND google_sub=${sub} AND principal_id<>${principalId}::uuid`;
 requireScope(identity.length===0,'identity_owned_elsewhere');
 const id=crypto.randomUUID();
 const sealed=sealV2(tokens,principalId,id,'google-grant');
 const rows=await q`INSERT INTO principal_google_accounts
   (id,principal_id,issuer,google_sub,email,scope_list,grant_ciphertext)
   SELECT ${id}::uuid,p.id,${issuer},${sub},${verifiedEmail},${scopeList},${sealed}
   FROM principals p WHERE p.id=${principalId}::uuid AND p.kind='user' AND p.status='active'
   ON CONFLICT(issuer,google_sub) DO NOTHING RETURNING id`;
 if(rows.length){
   if(historical)await recordLegacyFreshConsent(principalId,rows[0].id);
   return rows[0].id;
 }
 const same=await q`SELECT id FROM principal_google_accounts
   WHERE issuer=${issuer} AND google_sub=${sub}
   AND principal_id=${principalId}::uuid AND status='active'`;
 requireScope(same.length===1,'identity_owned_elsewhere');
 const record=await findAccount(principalId,same[0].id);
 await updateLinkedGrant({principalId,accountId:record.id,version:record.token_version,tokens,scopeList});
 if(historical)await recordLegacyFreshConsent(principalId,record.id);
 return record.id;
}
// A new V2 encrypted grant must exist before changing the effective pilot
// capability. This never changes the historical marker or legacy owner grants.
async function recordLegacyFreshConsent(principalId,accountId){
 const updated=await sql()`UPDATE principals SET legacy_pilot_fresh_grant=true,updated_at=now()
   WHERE id=${principalId}::uuid AND kind='user'
     AND legacy_pilot_identity_only=true
     AND EXISTS(SELECT 1 FROM principal_google_accounts a
       WHERE a.id=${accountId}::uuid AND a.principal_id=${principalId}::uuid
         AND a.grant_ciphertext IS NOT NULL AND a.status='active')
   RETURNING id`;
 requireScope(updated.length===1,'independent_consent_incomplete');
}
export async function updateLinkedGrant({principalId,accountId,version,tokens,scopeList}){
 requireScope(validUuid(principalId)&&validUuid(accountId)&&Number.isSafeInteger(version)&&version>=0&&
   tokens?.access_token&&Array.isArray(scopeList),'invalid_grant');
 const row=await findAccount(principalId,accountId);
 requireScope(row&&row.token_version===version,'version_conflict');
 const old=row.grant_ciphertext?openV2(row.grant_ciphertext,principalId,accountId,'google-grant'):{};
 const newer={...old,...tokens,refresh_token:tokens.refresh_token||old.refresh_token};
 const blob=sealV2(newer,principalId,accountId,'google-grant'),q=sql();
 const changed=await q`UPDATE principal_google_accounts SET
   grant_ciphertext=${blob},scope_list=${scopeList},token_version=token_version+1,updated_at=now()
   WHERE id=${accountId}::uuid AND principal_id=${principalId}::uuid
   AND token_version=${version} AND status='active'
   RETURNING token_version`;
 requireScope(changed.length===1,'version_conflict');
 return changed[0].token_version;
}
export async function persistPrincipalGoogleRefresh(context,tokens){
 requireScope(context&&trustedContexts.has(context)&&context.principalKind==='user',
   'invalid_scoped_context');
 requireScope(tokens?.access_token&&typeof tokens.access_token==='string'&&
   Number.isFinite(tokens.expiry_date)&&tokens.expiry_date>Date.now()&&
   validUuid(context.principalId)&&validUuid(context.accountId)&&
   validUuid(context.connectionId),'invalid_google_refresh');
 const {principalId,accountId,connectionId,accountVersion}=context;
 const row=await findAccount(principalId,accountId);
 requireScope(row&&row.token_version===accountVersion&&row.grant_ciphertext,
   'version_conflict');
 const prior=openV2(row.grant_ciphertext,principalId,accountId,'google-grant');
 requireScope(prior.refresh_token,'missing_google_refresh_grant');
 const updated={...prior,...tokens,
   refresh_token:tokens.refresh_token||prior.refresh_token};
 const ciphertext=sealV2(updated,principalId,accountId,'google-grant'),q=sql();
 const result=await q`UPDATE principal_google_accounts SET
   grant_ciphertext=${ciphertext},refresh_version=refresh_version+1,updated_at=now()
   WHERE id=${accountId}::uuid AND principal_id=${principalId}::uuid
   AND token_version=${accountVersion} AND refresh_version=${row.refresh_version}
   AND status='active' AND EXISTS(
     SELECT 1 FROM principal_connections c JOIN principals p ON p.id=c.principal_id
     WHERE c.id=${connectionId}::uuid AND c.principal_id=${principalId}::uuid
       AND c.account_id=${accountId}::uuid AND c.revoked_at IS NULL
       AND c.expires_at>now() AND p.status='active')
   RETURNING refresh_version`;
 return result.length===1;
}
export async function getLinkedGrant(principalId,accountId){
 const row=await findAccount(principalId,accountId);
 if(!row?.grant_ciphertext)return null;
 return openV2(row.grant_ciphertext,principalId,accountId,'google-grant');
}
export async function setPrincipalDefault(principalId,accountId){
 requireScope(validUuid(principalId)&&validUuid(accountId),'invalid_account');
 const q=sql();
 const rows=await q`INSERT INTO principal_defaults(principal_id,account_id)
   SELECT principal_id,id FROM principal_google_accounts WHERE principal_id=${principalId}::uuid
   AND id=${accountId}::uuid AND status='active'
   ON CONFLICT(principal_id) DO UPDATE SET account_id=excluded.account_id
   RETURNING account_id`;
 requireScope(rows.length===1,'outside_scope');
 return rows[0].account_id;
}
export async function createSession(principalId){
 requireScope(validUuid(principalId));
 const secret=mint('p10s_'),csrf=mint('p10x_'),q=sql();
 const rows=await q`INSERT INTO user_sessions(token_hash,principal_id,csrf_hash,expires_at)
   SELECT ${digest(secret)},id,${digest(csrf)},now()+interval '24 hours'
   FROM principals WHERE id=${principalId}::uuid AND status='active' AND kind='user'
   RETURNING principal_id`;
 requireScope(rows.length===1,'principal_inactive');
 return {secret,csrf};
}
export async function readSession(secret){
 if(typeof secret!=='string'||!/^p10s_[A-Za-z0-9_-]{43}$/.test(secret))return null;
 const q=sql();
 const rows=await q`SELECT s.principal_id,s.csrf_hash,p.kind,p.status
   FROM user_sessions s JOIN principals p ON p.id=s.principal_id
   WHERE s.token_hash=${digest(secret)} AND s.expires_at>now()
   AND s.revoked_at IS NULL AND p.status='active' AND p.kind='user'`;
 return rows[0]||null;
}
export async function revokeSession(secret){
 if(typeof secret!=='string'||!secret.startsWith('p10s_'))return 0;
 const rows=await sql()`UPDATE user_sessions SET revoked_at=now()
   WHERE token_hash=${digest(secret)} AND revoked_at IS NULL RETURNING token_hash`;
 return rows.length;
}
export async function createTransaction({state,nonce,browser,verifier,purpose,principalId=null,
 clientId=null,redirectUri=null,resource=null,codeChallenge=null,policy:options=null}){
 requireScope(['login','link','mcp_authorize'].includes(purpose)&&state&&nonce&&browser&&verifier,'invalid_transaction');
 const blob=sealV2({verifier},principalId||OWNER_ID,digest(state),'provider-transaction'),q=sql();
 const rows=await q`INSERT INTO user_oauth_transactions
   (state_hash,purpose,nonce_hash,browser_hash,principal_id,provider_verifier_ciphertext,
   client_id,redirect_uri,resource,code_challenge,policy,expires_at)
   VALUES(${digest(state)},${purpose},${digest(nonce)},${digest(browser)},${principalId}::uuid,
   ${blob},${clientId},${redirectUri},${resource},${codeChallenge},
   ${options?JSON.stringify(options):null}::jsonb,now()+interval '10 minutes')
   RETURNING state_hash`;
 return rows.length===1;
}
export async function consumeTransaction({state,browser,purpose,principalId=null}){
 if(typeof state!=='string'||typeof browser!=='string'||!state||!browser)return null;
 const q=sql(),hash=digest(state);
 const rows=await q`UPDATE user_oauth_transactions SET consumed_at=now()
   WHERE state_hash=${hash} AND browser_hash=${digest(browser)}
   AND purpose=${purpose} AND consumed_at IS NULL AND expires_at>now()
   AND (${principalId}::uuid IS NULL OR principal_id=${principalId}::uuid)
   RETURNING *`;
 if(rows.length!==1)return null;
 return {...rows[0],...openV2(rows[0].provider_verifier_ciphertext,
   rows[0].principal_id||OWNER_ID,hash,'provider-transaction')};
}

export async function issuePrincipalCode({principalId,accountId,clientId,redirectUri,resource,
 codeChallenge,profile='read_only',listing='compact',areas=null,costPolicy={mode:'per_action'}}){
 requireScope(validUuid(principalId)&&validUuid(accountId)&&clientId&&redirectUri&&resource&&
  /^[A-Za-z0-9_-]{43}$/.test(codeChallenge),'invalid_grant');
 const settings=policy({profile,listing,areas,mode:'live',cost_policy:costPolicy});
 const code=mint('p10c_'),q=sql();
 const rows=await q`INSERT INTO principal_oauth_codes
  (code_hash,principal_id,account_id,client_id,redirect_uri,resource,code_challenge,
   profile,listing,areas,cost_policy,expires_at)
  SELECT ${digest(code)},a.principal_id,a.id,${clientId},${redirectUri},${resource},
    ${codeChallenge},${settings.profile},${settings.listing},${settings.areas},
    ${JSON.stringify(settings.cost_policy)}::jsonb,now()+interval '10 minutes'
  FROM principal_google_accounts a JOIN principals p ON p.id=a.principal_id
  WHERE a.id=${accountId}::uuid AND a.principal_id=${principalId}::uuid
    AND a.status='active' AND p.status='active'
  RETURNING code_hash`;
 requireScope(rows.length===1,'outside_scope');
 return code;
}
export async function consumePrincipalCode({code,clientId,redirectUri,resource,verifier}){
 if(typeof code!=='string'||!/^p10c_[A-Za-z0-9_-]{43}$/.test(code)||
    typeof verifier!=='string'||verifier.length<43||verifier.length>128)return null;
 const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
 const q=sql();
 const rows=await q`UPDATE principal_oauth_codes SET consumed_at=now()
   WHERE code_hash=${digest(code)} AND client_id=${clientId} AND redirect_uri=${redirectUri}
     AND resource=${resource} AND code_challenge=${challenge} AND consumed_at IS NULL
     AND expires_at>now() AND EXISTS(
       SELECT 1 FROM principals p JOIN principal_google_accounts a
        ON a.principal_id=p.id WHERE p.id=principal_oauth_codes.principal_id
        AND a.id=principal_oauth_codes.account_id AND p.status='active' AND a.status='active')
   RETURNING *`;
 return rows[0]||null;
}
export async function issuePrincipalConnection(record){
 requireScope(validUuid(record?.principal_id)&&validUuid(record?.account_id),'invalid_grant');
 const settings=policy(record),id=crypto.randomUUID(),family=crypto.randomUUID();
 const accessToken=mint('p10a_'),refreshToken=mint('p10r_'),q=sql();
 const rows=await q`INSERT INTO principal_connections
  (id,family,principal_id,account_id,client_id,resource,profile,listing,areas,cost_policy,mode,
   access_hash,refresh_hash,expires_at)
  SELECT ${id}::uuid,${family}::uuid,a.principal_id,a.id,${record.client_id},${record.resource},
   ${settings.profile},${settings.listing},${settings.areas},
   ${JSON.stringify(settings.cost_policy)}::jsonb,'live',
   ${digest(accessToken)},${digest(refreshToken)},now()+interval '30 days'
  FROM principal_google_accounts a JOIN principals p ON p.id=a.principal_id
  WHERE a.id=${record.account_id}::uuid AND a.principal_id=${record.principal_id}::uuid
  AND a.status='active' AND p.status='active' RETURNING id`;
 requireScope(rows.length===1,'invalid_grant');
 return {accessToken,refreshToken,connectionId:id};
}
export async function readPrincipalAccess(token){
 if(typeof token!=='string'||!/^p10a_[A-Za-z0-9_-]{43}$/.test(token))return null;
 const q=sql();
 const rows=await q`SELECT c.id AS connection_id,c.principal_id,c.account_id,c.resource,
   c.client_id,c.profile,c.listing,c.areas,c.mode,c.cost_policy,
   a.email AS account_email,a.token_version AS account_version,p.kind AS principal_kind,
   p.status AS principal_status
   FROM principal_connections c JOIN principals p ON p.id=c.principal_id
   JOIN principal_google_accounts a ON a.id=c.account_id AND a.principal_id=c.principal_id
   WHERE c.access_hash=${digest(token)} AND c.expires_at>now()
   AND c.revoked_at IS NULL AND p.status='active' AND a.status='active'`;
 if(rows.length!==1)return null;
 const row=rows[0],settings=policy(row);
 const context=Object.freeze({principalId:row.principal_id,principalKind:row.principal_kind,
   accountId:row.account_id,connectionId:row.connection_id,mode:settings.mode,
   profile:settings.profile,listing:settings.listing,areas:settings.areas,
   resource:row.resource,clientId:row.client_id,
   accountVersion:row.account_version,actingAs:row.account_email,
   costPolicy:Object.freeze({...settings.cost_policy})});
 trustedContexts.add(context);
 return context;
}
export async function rotatePrincipalRefresh(token,{clientId,resource}={}){
 if(typeof token!=='string'||!/^p10r_[A-Za-z0-9_-]{43}$/.test(token)||
   typeof clientId!=='string'||typeof resource!=='string')return null;
 const prior=digest(token),accessToken=mint('p10a_'),refreshToken=mint('p10r_'),q=sql();
 const rows=await q`WITH old AS (
   SELECT c.id,c.family,c.refresh_hash FROM principal_connections c
   JOIN principals p ON p.id=c.principal_id
   JOIN principal_google_accounts a ON a.id=c.account_id AND a.principal_id=c.principal_id
   WHERE c.refresh_hash=${prior} AND c.client_id=${clientId} AND c.resource=${resource}
    AND c.revoked_at IS NULL AND c.expires_at>now() AND p.status='active'
    AND a.status='active' FOR UPDATE OF c
 ), new_token AS (
   UPDATE principal_connections c SET access_hash=${digest(accessToken)},
     refresh_hash=${digest(refreshToken)},version=version+1
   FROM old WHERE c.id=old.id RETURNING c.id,c.family
 ), spent AS (
   INSERT INTO principal_refresh_uses(refresh_hash,family)
   SELECT old.refresh_hash,old.family FROM old JOIN new_token ON new_token.id=old.id
   RETURNING refresh_hash
 ) SELECT new_token.id FROM new_token JOIN spent ON true`;
 if(rows.length===1)return {accessToken,refreshToken};
 // A consumed refresh token replay revokes the entire family, even if a
 // competing request just rotated it successfully on a different instance.
 await q`UPDATE principal_connections SET revoked_at=now() WHERE family IN
   (SELECT family FROM principal_refresh_uses WHERE refresh_hash=${prior})
   AND client_id=${clientId} AND resource=${resource}`;
 return null;
}
export async function listConnections(principalId){
 requireScope(validUuid(principalId));
 const q=sql();
 return q`SELECT id,account_id,client_id,resource,profile,listing,areas,
   mode,version,created_at,expires_at,revoked_at FROM principal_connections
   WHERE principal_id=${principalId}::uuid ORDER BY created_at DESC`;
}
export async function revokeConnection(principalId,connectionId){
 requireScope(validUuid(principalId)&&validUuid(connectionId));
 const q=sql();
 const rows=await q`UPDATE principal_connections SET revoked_at=now()
   WHERE id=${connectionId}::uuid AND principal_id=${principalId}::uuid
   AND revoked_at IS NULL RETURNING id`;
 return rows.length;
}
export async function disconnectAccount(principalId,accountId){
 requireScope(validUuid(principalId)&&validUuid(accountId));
 const q=sql();
 const rows=await q`UPDATE principal_google_accounts SET status='revoked',updated_at=now()
   WHERE id=${accountId}::uuid AND principal_id=${principalId}::uuid
   AND status='active' RETURNING id`;
 if(!rows.length)return 0;
 await q`UPDATE principal_connections SET revoked_at=now()
   WHERE principal_id=${principalId}::uuid AND account_id=${accountId}::uuid
   AND revoked_at IS NULL`;
 await q`DELETE FROM principal_defaults WHERE principal_id=${principalId}::uuid
   AND account_id=${accountId}::uuid`;
 return rows.length;
}
export async function deletionPreview(principalId){
 requireScope(validUuid(principalId));
 const q=sql();
 const rows=await q`SELECT
  (SELECT count(*)::int FROM principal_google_accounts WHERE principal_id=${principalId}::uuid) AS accounts,
  (SELECT count(*)::int FROM principal_connections WHERE principal_id=${principalId}::uuid
    AND revoked_at IS NULL) AS agent_connections,
  (SELECT count(*)::int FROM user_sessions WHERE principal_id=${principalId}::uuid
    AND revoked_at IS NULL) AS sessions`;
 return {...rows[0],previewOnly:true,deleted:false,
  next:'Account deletion needs separate irreversible confirmation and retention disclosure before launch.'};
}

export async function trustedCustomerDelegation(context){
 requireScope(context&&trustedContexts.has(context)&&Object.isFrozen(context)&&
  context.principalKind==='user','invalid_scoped_context');
 return loadCustomerDelegation(context);
}
export function scopedStore(context){
 // Inject this wrapper into future P10-4 public clients, never call global DB
 // helpers with a caller-provided tenant. No public tool dispatch exists yet.
 requireScope(context&&trustedContexts.has(context)&&Object.isFrozen(context)&&context.principalKind==='user'&&
   validUuid(context.principalId),'invalid_scoped_context');
 const principal=context.principalId;
 return Object.freeze({
   ...makeTenantStore(context),
   listAccounts:()=>listAccounts(principal),
   getAccount:id=>findAccount(principal,id),
   getGrant:id=>getLinkedGrant(principal,id),
   setDefault:id=>setPrincipalDefault(principal,id),
   listConnections:()=>listConnections(principal),
   revokeConnection:id=>revokeConnection(principal,id),
   disconnectAccount:id=>disconnectAccount(principal,id),
   deletionPreview:()=>deletionPreview(principal)
 });
}
export async function requestDeletion(principalId){
 requireScope(validUuid(principalId));
 const q=sql();
 const rows=await q`INSERT INTO principal_deletion_requests(principal_id)
   SELECT id FROM principals WHERE id=${principalId}::uuid AND kind='user' AND status='active'
   ON CONFLICT(principal_id) DO UPDATE SET requested_at=now(),cancelled_at=NULL
   WHERE principal_deletion_requests.confirmed_at IS NULL
   RETURNING requested_at`;
 requireScope(rows.length===1,'invalid_deletion_request');
 return {pending:true,irreversible:false,requestedAt:rows[0].requested_at};
}
export async function cancelDeletion(principalId){
 requireScope(validUuid(principalId));
 const q=sql();
 const rows=await q`UPDATE principal_deletion_requests SET cancelled_at=now()
   WHERE principal_id=${principalId}::uuid AND cancelled_at IS NULL
    AND confirmed_at IS NULL RETURNING requested_at`;
 return {cancelled:rows.length===1,deleted:false};
}
