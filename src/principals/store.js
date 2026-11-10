// Isolated V2 principal store. There is NO global-owner fallback in these methods.
import crypto from 'node:crypto';
import {storeSql} from '../db-transport.js';
import {sealV2,openV2} from './crypto.js';
import {OWNER_ID,digest,mint,validUuid,validEmail,requireScope,legacyPilotLoginAllowed,legacyPilotFreshConsentAllowed} from './security.js';
import {normalizeConnectionPolicy,CONNECTION_PROFILES} from '../oauth/connection-settings.js';
import {initTenantSchema,makeTenantStore} from './tenant-store.js';
import {loadCustomerDelegation} from './delegation.js';
import {initOwnerMigrationSchema} from './owner-migration.js';
let conn;
const trustedContexts=new WeakSet(); // no caller-minted frozen principal is accepted
const sql=()=>{if(!conn){if(!process.env.DATABASE_URL)throw Error('database_unavailable');conn=storeSql(process.env.DATABASE_URL);}return conn;};
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
   PRIMARY KEY(issuer,google_sub,principal_id))`;
 // ADOPT-1 (2026-11-09): identity-proven adoption needs the SAME Google
 // identity bound to two profiles at once — the holding profile and the
 // public profile claiming its own mailboxes — so the binding key widens
 // from (issuer,google_sub) to (issuer,google_sub,principal_id): one row
 // per identity PER profile. The one-binding-per-profile rule becomes an
 // explicit unique index, and databases created under the old key are
 // migrated by dropping that primary key (every row it ever held
 // satisfies the widened key, so the drop cannot create duplicates).
 await q`CREATE UNIQUE INDEX IF NOT EXISTS principal_google_identities_one_per_principal
   ON principal_google_identities(principal_id,issuer,google_sub)`;
 await q`ALTER TABLE principal_google_identities DROP CONSTRAINT IF EXISTS principal_google_identities_pkey`;
 await q`CREATE TABLE IF NOT EXISTS principal_google_accounts (
   id UUID PRIMARY KEY,principal_id UUID NOT NULL REFERENCES principals(id),
   issuer TEXT NOT NULL,google_sub TEXT NOT NULL,email TEXT NOT NULL,label TEXT,
   scope_list TEXT[] NOT NULL DEFAULT '{}',grant_ciphertext TEXT,
   token_version INTEGER NOT NULL DEFAULT 0 CHECK(token_version>=0),
   status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   UNIQUE(issuer,google_sub),UNIQUE(id,principal_id))`;
 await q`ALTER TABLE principal_google_accounts ADD COLUMN IF NOT EXISTS refresh_version INTEGER NOT NULL DEFAULT 0`;
 // Ownership of a Google identity is its ACTIVE grant, not any row that
 // ever existed: a revoked grant is history. Replace the blanket unique
 // key with an active-only one so a holder who disconnected an account
 // from one of their profiles can link it under another (owner-approved
 // self-move doctrine, 2026-11-05); at most one ACTIVE grant per Google
 // identity still holds worldwide.
 await q`ALTER TABLE principal_google_accounts DROP CONSTRAINT IF EXISTS principal_google_accounts_issuer_google_sub_key`;
 await q`CREATE UNIQUE INDEX IF NOT EXISTS principal_google_accounts_active_identity
   ON principal_google_accounts(issuer,google_sub) WHERE status='active'`;
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
 await q`CREATE TABLE IF NOT EXISTS principal_link_denials (
   principal_id UUID PRIMARY KEY REFERENCES principals(id),
   phase TEXT NOT NULL,code TEXT NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await q`CREATE TABLE IF NOT EXISTS principal_signin_denials (
   id UUID PRIMARY KEY,
   phase TEXT NOT NULL,code TEXT NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await q`CREATE TABLE IF NOT EXISTS principal_delegations (
   id UUID PRIMARY KEY,principal_id UUID NOT NULL REFERENCES principals(id),
   customer_id TEXT NOT NULL,scopes TEXT[] NOT NULL,subject_rule TEXT NOT NULL,
   credential_ciphertext TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT false,
   revoked_at TIMESTAMPTZ,UNIQUE(principal_id,customer_id))`;
 // D-006 MC-7.0 (2026-11-09): the cookie-free connect step. After Google
 // sign-in the person lands on ONE Approve page; its state is this one-use
 // handle (kept hashed) carried in the address, never a browser cookie.
 await q`CREATE TABLE IF NOT EXISTS principal_connect_handles (
   handle_hash TEXT PRIMARY KEY,principal_id UUID NOT NULL REFERENCES principals(id),
   client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,resource TEXT NOT NULL,
   code_challenge TEXT NOT NULL,client_state TEXT,
   expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await q`CREATE INDEX IF NOT EXISTS principal_connect_handles_expiry ON principal_connect_handles(expires_at)`;
 // CONTROLS-1 (2026-11-09): a person's own switch to pause changes on every
 // app connection at once ("Make all my apps read-only"), GitHub Unleashed's
 // global action. Each connection keeps its own access level underneath.
 await q`CREATE TABLE IF NOT EXISTS principal_settings (
   principal_id UUID PRIMARY KEY REFERENCES principals(id),
   writes_paused BOOLEAN NOT NULL DEFAULT false,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await initTenantSchema(q);
 await initOwnerMigrationSchema(q);
}
export async function legacyOwnerContext(accessToken){
 if(typeof accessToken!=='string'||accessToken.startsWith('p10'))return null;
 const q=sql();
 const rows=await q`SELECT p.id AS principal_id,p.kind AS principal_kind,p.status,
   t.google_account,t.client_id,t.profile,t.listing,t.areas,t.mode,t.cost_policy
   FROM oauth_tokens t JOIN principals p ON p.id=${OWNER_ID}::uuid
   WHERE t.access_token=${accessToken} AND t.expires_at>now() AND t.revoked_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM oauth_refresh_revocations r
     WHERE r.client_id=t.client_id AND t.refresh_token IS NOT NULL
       AND r.refresh_hash=encode(sha256(convert_to(t.refresh_token,'UTF8')),'hex'))`;
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
// The principal an already-bound identity signs in to on its own record: the
// binding itself is the vetting (owner ruling, 2026-11-05 — an account with a
// profile on record must not depend on the pilot tester list). Only a full
// principal counts: the identity-only coexistence principal keeps its
// documented list gates, and an unbound identity gets nothing here.
export async function getBoundFullPrincipal(issuer,sub){
 if(!validSub(sub))return null;
 const q=sql();
 const rows=await q`SELECT i.principal_id FROM principal_google_identities i
   JOIN principals p ON p.id=i.principal_id
   WHERE i.issuer=${issuer} AND i.google_sub=${sub}
     AND p.kind='user' AND p.status='active' AND p.legacy_pilot_identity_only=false`;
 return rows.length===1?rows[0].principal_id:null;
}
// The one identity-only shell that may graduate to a full profile at sign-in
// (the separately approved owner migration the design notes call for): the
// identity is already bound to an ACTIVE user principal carrying the
// identity-only marker, a recorded independent fresh grant exists for that
// principal, and the Google-verified email is BOTH the binding's verified
// email and one of the original legacy mailboxes. All four proofs must hold;
// anything less keeps the shell fenced exactly as designed.
export async function getBoundGraduatingPrincipal(issuer,sub,verifiedEmail){
 if(!validSub(sub)||!validEmail(verifiedEmail))return null;
 const q=sql();
 const rows=await q`SELECT i.principal_id FROM principal_google_identities i
   JOIN principals p ON p.id=i.principal_id
   WHERE i.issuer=${issuer} AND i.google_sub=${sub}
     AND p.kind='user' AND p.status='active' AND p.legacy_pilot_identity_only=true
     AND p.legacy_pilot_fresh_grant=true
     AND lower(i.verified_email)=lower(${verifiedEmail})
     AND EXISTS(SELECT 1 FROM google_accounts a
       WHERE lower(a.email)=lower(${verifiedEmail}))`;
 return rows.length===1?rows[0].principal_id:null;
}
// Coarse shape of whatever IS bound to a Google subject whose sign-in was
// refused, in the fixed denial vocabulary — so the sign-in page can name the
// exact state instead of one generic refusal (2026-11-05). Never returns an
// email, a principal id or any part of the subject.
export async function classifyBoundIdentity(issuer,sub){
 if(!validSub(sub))return null;
 const q=sql();
 const rows=await q`SELECT i.issuer,p.kind,p.status,
     p.legacy_pilot_identity_only,p.legacy_pilot_fresh_grant
   FROM principal_google_identities i JOIN principals p ON p.id=i.principal_id
   WHERE i.google_sub=${sub}`;
 if(rows.length===0){
  const accounts=await q`SELECT 1 FROM principal_google_accounts
    WHERE google_sub=${sub} LIMIT 1`;
  return accounts.length?'account_without_identity_binding':null;
 }
 const same=rows.find(r=>r.issuer===issuer);
 if(!same)return 'bound_issuer_form_mismatch';
 if(same.kind!=='user')return 'bound_not_user_principal';
 if(same.status!=='active')return 'bound_principal_inactive';
 if(same.legacy_pilot_identity_only&&!same.legacy_pilot_fresh_grant)
  return 'bound_shell_no_fresh_grant';
 if(same.legacy_pilot_identity_only&&same.legacy_pilot_fresh_grant)
  return 'bound_shell_email_mismatch';
 return 'bound_not_admissible';
}
// The owner profile's own bound identity: the owner-migration ceremony binds
// the owner's Google identity to the constant owner principal, and that
// binding — placed behind the owner passphrase — is its vetting. (Named by
// the admission classifier, 2026-11-05: the systems identity lives here, not
// on any user principal.)
export async function getBoundOwnerPrincipal(issuer,sub){
 if(!validSub(sub))return null;
 const rows=await sql()`SELECT principal_id FROM principal_google_identities
   WHERE issuer=${issuer} AND google_sub=${sub} AND principal_id=${OWNER_ID}::uuid`;
 return rows.length===1?OWNER_ID:null;
}
export async function bindVerifiedIdentity({issuer,sub,verifiedEmail,identityOnlyPilot=false}){
 requireScope(['accounts.google.com','https://accounts.google.com'].includes(issuer)&&validSub(sub)&&validEmail(verifiedEmail),'invalid_identity');
 const q=sql();
 const reserved=await q`SELECT 1 FROM google_accounts WHERE lower(email)=lower(${verifiedEmail}) LIMIT 1`;
 const legacyIdentityOnly=reserved.length>0&&identityOnlyPilot===true&&legacyPilotLoginAllowed(sub);
 const old=await getVerifiedPrincipal(issuer,sub);
 // A full principal's bound identity binds on its own record, even when its
 // email is a legacy-reserved mailbox and its subject is on no pilot list:
 // the reservation below guards NEW bindings and the identity-only
 // coexistence principal, never an established full principal (2026-11-05).
 if(old&&(await getBoundFullPrincipal(issuer,sub))===old)return old;
 // The owner profile's own bound identity likewise binds on its record: the
 // mailbox reservation guards new bindings, never the owner's established
 // profile (2026-11-05).
 if(old&&(await getBoundOwnerPrincipal(issuer,sub))===old)return old;
 if(old&&reserved.length){
   // A historical owner-connected mailbox may ALSO carry its own explicitly
   // consented V2 grant. Never infer cross-principal authority from email.
   const independent=await q`SELECT 1 FROM principals p
     JOIN principal_google_identities i ON i.principal_id=p.id
     WHERE p.id=${old}::uuid AND p.kind='user' AND p.status='active'
       AND p.legacy_pilot_identity_only=true AND p.legacy_pilot_fresh_grant=true
       AND i.issuer=${issuer} AND i.google_sub=${sub}
       AND lower(i.verified_email)=lower(${verifiedEmail}) LIMIT 1`;
   if(independent.length===1){
   // Graduation (the separately approved owner migration, 2026-11-05): a
   // LOGIN — never an authorize — by the shell's own holder, with the bound
   // identity, the recorded independent fresh grant and the legacy-reserved
   // verified mailbox all proven by this query, promotes the identity-only
   // shell to a full profile. One-way, at the moment of proven control; the
   // shell's accounts and connections carry over untouched.
   if(identityOnlyPilot===true){
     await q`UPDATE principals SET legacy_pilot_identity_only=false,updated_at=now()
       WHERE id=${old}::uuid AND legacy_pilot_identity_only=true`;
   }
   return old;
   }
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
// The callback's denial reason is deliberately never exposed on the public
// error page, and server logs are not always reachable — so the most recent
// link refusal is also recorded against the principal, where the account
// holder can read it on their own account page. Fixed vocabulary only
// (phase + denial code): no identity, account or token material is stored.
export async function recordLinkDenial({principalId,phase,code}){
 requireScope(validUuid(principalId)&&typeof phase==='string'&&typeof code==='string','invalid_link');
 const q=sql();
 await q`INSERT INTO principal_link_denials(principal_id,phase,code)
   VALUES (${principalId}::uuid,${phase},${code})
   ON CONFLICT(principal_id) DO UPDATE SET phase=EXCLUDED.phase,code=EXCLUDED.code,created_at=now()`;
}
export async function getLatestLinkDenial(principalId){
 requireScope(validUuid(principalId),'invalid_identity');
 const rows=await sql()`SELECT phase,code,created_at FROM principal_link_denials
   WHERE principal_id=${principalId}::uuid`;
 return rows[0]||null;
}
// A refused browser SIGN-IN has no principal to record against yet, so the
// refusal is stored under a one-time id and carried to the sign-in page by
// redirect: the person at the browser reads the exact reason there instead
// of a bare failure sentence (2026-11-05). Fixed vocabulary only (phase +
// denial code), single-read, one-hour life; the id itself grants nothing.
export async function recordSigninDenial({phase,code}){
 requireScope(typeof phase==='string'&&typeof code==='string','invalid_link');
 const id=crypto.randomUUID();
 const q=sql();
 await q`INSERT INTO principal_signin_denials(id,phase,code)
   VALUES (${id}::uuid,${phase},${code})`;
 return id;
}
export async function getSigninDenial(id){
 if(!validUuid(id))return null;
 const rows=await sql()`SELECT phase,code,created_at FROM principal_signin_denials
   WHERE id=${id}::uuid AND created_at>now()-interval '1 hour'`;
 return rows[0]||null;
}
export async function deleteSigninDenial(id){
 if(!validUuid(id))return;
 await sql()`DELETE FROM principal_signin_denials WHERE id=${id}::uuid`;
}
export async function upsertLinkedAccount({principalId,issuer,sub,verifiedEmail,scopeList,tokens}){
 requireScope(validUuid(principalId)&&validSub(sub)&&validEmail(verifiedEmail)&&
   Array.isArray(scopeList)&&scopeList.every(x=>typeof x==='string')&&tokens?.access_token,'invalid_link');
 const q=sql();
 const prior=await q`SELECT p.legacy_pilot_identity_only AS historical,
   p.legacy_pilot_fresh_grant AS fresh FROM principals p
   WHERE p.id=${principalId}::uuid AND p.status='active'
   AND (p.kind='user' OR p.id=${OWNER_ID}::uuid)`;
 requireScope(prior.length===1,'invalid_identity');
 const historical=prior[0].historical===true;
 // ADOPT-1 (owner-ordered, 2026-11-09): the adoption test runs BEFORE the
 // reservation and foreign-grant refusals below, because it decides from
 // the holding profile's own bound identity — the one fact those refusals
 // exist to protect. The presenter must be signed in as the identity the
 // HOLDING profile is bound to (for the owner profile: the identity bound
 // by the owner-migration ceremony — the systems mailbox itself), and the
 // consent being presented must be for that SAME identity (issuer+subject
 // exact). A session plus a fresh verified consent for the exact identity
 // IS the proof — the self-move doctrine the foreign-grant check below
 // already states. Any presenter short of that proof falls through to the
 // refusals unchanged, byte for byte.
 const adoptableHolder=await q`SELECT h.id AS holder_id FROM principals h
   JOIN principal_google_identities hi ON hi.principal_id=h.id
   WHERE hi.issuer=${issuer} AND hi.google_sub=${sub} AND h.status='active'
     AND h.id<>${principalId}::uuid
     AND EXISTS(SELECT 1 FROM principal_google_identities mi
       WHERE mi.principal_id=${principalId}::uuid AND mi.issuer=hi.issuer
         AND mi.google_sub=hi.google_sub)`;
 const adoption=adoptableHolder.length===1?adoptableHolder[0].holder_id:null;
 // The reservation below protects the original connection's legacy
 // mailboxes from OTHER profiles. The owner profile IS the original
 // connection's own record: its holder claiming one of those mailboxes
 // with a live session and a fresh Google consent for that exact account
 // is the reservation's owner, not a stranger it guards against.
 let independentlyEligible=principalId===OWNER_ID;
 if(historical){
   const matching=await q`SELECT 1 FROM principal_google_identities i
     JOIN google_accounts old ON lower(old.email)=lower(i.verified_email)
     WHERE i.principal_id=${principalId}::uuid
       AND i.issuer=${issuer} AND i.google_sub=${sub}
       AND lower(i.verified_email)=lower(${verifiedEmail})`;
   // The legacy-mailbox match gates only the FIRST independent link: it
   // proves the historical tester controls this principal before any fresh
   // grant exists. Once that first fresh-consent link has landed
   // (legacy_pilot_fresh_grant), control is proven and later links are
   // ordinary — requiring every later account to also match a legacy
   // mailbox would bar the owner from ever adding a non-legacy account
   // (owner-raised defect, 2026-11-05: a personal Gmail could never link).
   independentlyEligible=prior[0].fresh===true||
     (matching.length===1&&legacyPilotFreshConsentAllowed(sub));
   requireScope(independentlyEligible,'legacy_pilot_identity_only');
 }
 const reserved=await q`SELECT 1 FROM google_accounts WHERE lower(email)=lower(${verifiedEmail}) LIMIT 1`;
 requireScope(!reserved.length||independentlyEligible||adoption,'reserved_identity');
 // Ownership is an ACTIVE grant on another profile. A revoked grant there
 // is history, not ownership: the holder disconnected the account, and a
 // fresh consent here may attach it to this profile (self-move doctrine
 // below). An actively linked account can never be taken.
 const foreign=await q`SELECT id,principal_id FROM principal_google_accounts
   WHERE issuer=${issuer} AND google_sub=${sub} AND principal_id<>${principalId}::uuid
     AND status='active'`;
 requireScope(!foreign.length||(adoption&&foreign.every(row=>row.principal_id===adoption)),
   'identity_owned_elsewhere');
 if(adoption){
   // Adoption moves the ACCOUNT, never the holding profile's execution
   // material: the holder's agent connections keep pointing at the old
   // account row, and its OAuth tokens are a legacy table this function
   // never touches. The adopted row is retired (not deleted) and
   // principal_defaults rows that named it are dropped, exactly as a
   // disconnect on the holder would leave them.
   for(const row of foreign){
     await q`UPDATE principal_google_accounts SET status='revoked',updated_at=now()
       WHERE id=${row.id}::uuid AND principal_id=${adoption}::uuid AND status='active'`;
     await q`DELETE FROM principal_defaults
       WHERE principal_id=${adoption}::uuid AND account_id=${row.id}::uuid`;
   }
   if(reserved.length){
     // Retire the legacy reservation for THIS mailbox only, and for the
     // ADOPTED mailbox only: the row is deleted from both legacy tables,
     // so the reservation releases exactly the identity whose verified
     // holder claimed it — never another mailbox, never by another hand.
     // Legacy execution does not read these tables for tokens (validated
     // tokens live in google_accounts.tokens/tokens_enc, mirrored by the
     // refresh path in db.js), so the holder's live connections keep
     // their grants; the deletion also ends the sign-in reservation the
     // mailbox carried into bindVerifiedIdentity.
     await q`DELETE FROM principal_legacy_accounts WHERE lower(email)=lower(${verifiedEmail})`;
     await q`DELETE FROM google_accounts WHERE lower(email)=lower(${verifiedEmail})`;
   }
 }
 // A sign-in identity binding on another profile does not block this link
 // either. Binding governs SIGN-IN; attaching the account as data is proven
 // by this flow itself — a session on this profile plus a fresh, verified
 // Google consent for this exact identity, completed in the same browser-
 // bound transaction. A stranger cannot produce that consent for someone
 // else's Google account. (Owner-approved self-move doctrine, 2026-11-05:
 // one holder's profiles must be able to consolidate their own accounts.)
 const same=await q`SELECT id,status,token_version FROM principal_google_accounts
   WHERE issuer=${issuer} AND google_sub=${sub} AND principal_id=${principalId}::uuid
     AND status='active'`;
 if(same.length===1){
   const record=await findAccount(principalId,same[0].id);
   await updateLinkedGrant({principalId,accountId:record.id,version:record.token_version,tokens,scopeList});
   if(historical)await recordLegacyFreshConsent(principalId,record.id);
   return record.id;
 }
 const mine=await q`SELECT id,status,token_version FROM principal_google_accounts
   WHERE issuer=${issuer} AND google_sub=${sub} AND principal_id=${principalId}::uuid
     AND status='revoked'`;
 if(mine.length===1){
   // Provider OAuth links are uniquely keyed by issuer/subject; a user who
   // turns off God mode must be able to reauthorize that SAME Google identity
   // with a fresh, narrower provider grant. Old V2 agents remain revoked and
   // cannot become valid again: advance the credential version, and never
   // reactivate an owner or foreign principal's account.
   const fresh=sealV2(tokens,principalId,mine[0].id,'google-grant');
   const revived=await q`UPDATE principal_google_accounts SET status='active',
     grant_ciphertext=${fresh},scope_list=${scopeList},
     token_version=token_version+1,refresh_version=refresh_version+1,updated_at=now()
     WHERE id=${mine[0].id}::uuid AND principal_id=${principalId}::uuid
       AND status='revoked' AND token_version=${mine[0].token_version}
     RETURNING id`;
   requireScope(revived.length===1,'version_conflict');
   if(historical)await recordLegacyFreshConsent(principalId,revived[0].id);
   return revived[0].id;
 }
 const id=crypto.randomUUID();
 const sealed=sealV2(tokens,principalId,id,'google-grant');
 const rows=await q`INSERT INTO principal_google_accounts
   (id,principal_id,issuer,google_sub,email,scope_list,grant_ciphertext)
   SELECT ${id}::uuid,p.id,${issuer},${sub},${verifiedEmail},${scopeList},${sealed}
   FROM principals p WHERE p.id=${principalId}::uuid AND p.status='active'
   AND (p.kind='user' OR p.id=${OWNER_ID}::uuid)
   ON CONFLICT(issuer,google_sub) WHERE status='active' DO NOTHING RETURNING id`;
 // Zero rows here means a concurrent active grant appeared for this
 // identity between the check and the insert — still owned elsewhere.
 requireScope(rows.length===1,'identity_owned_elsewhere');
 if(historical)await recordLegacyFreshConsent(principalId,rows[0].id);
 return rows[0].id;
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
// A server-minted context is executable for a full user principal and for
// the owner profile itself: the owner's kind is 'legacy_owner', not 'user',
// and the hub's own agent connections must execute like any other profile's
// (owner ruling, 2026-11-05 — the three-account hub completes only when the
// owner's connections actually run). Every other kind stays refused.
const executableContext=context=>!!context&&
 (context.principalKind==='user'||context.principalId===OWNER_ID);
export async function persistPrincipalGoogleRefresh(context,tokens){
 requireScope(context&&trustedContexts.has(context)&&executableContext(context),
   'invalid_scoped_context');
 requireScope(tokens?.access_token&&typeof tokens.access_token==='string'&&
   Number.isFinite(tokens.expiry_date)&&tokens.expiry_date>Date.now()&&
   validUuid(context.principalId)&&validUuid(context.accountId)&&
   validUuid(context.connectionId),'invalid_google_refresh');
 const {principalId,connectionId}=context;
 // The connection's home account proves the connection is live; the grant
 // refreshed is the account this call acts as (the same one unless derived).
 const home=context.accountId;
 const accountId=context.googleAccountId||context.accountId;
 const accountVersion=context.googleAccountId?context.googleAccountVersion:context.accountVersion;
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
       AND c.account_id=${home}::uuid AND c.revoked_at IS NULL
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
   FROM principals WHERE id=${principalId}::uuid AND status='active'
   AND (kind='user' OR id=${OWNER_ID}::uuid)
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
   AND s.revoked_at IS NULL AND p.status='active'
   AND (p.kind='user' OR p.id=${OWNER_ID}::uuid)`;
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
// D-006 MC-7.3 (2026-11-09): the Google callback gate. A browser can hold
// several copies of the flow cookie (an older attempt's cookie under the
// same name and path survives alongside the current attempt's), and which
// copies the browser sends is not guaranteed by any contract the server
// controls. The gate therefore accepts ANY presented copy that matches a
// live transaction for this state: the match is still an atomic
// state+browser consume, so a copy is only ever good for the one flow
// whose start issued it. Strict single-copy reading at this gate
// (readCookie) killed real sign-ins whenever a stale copy rode along —
// the 2026-11-09 22:22 UTC attempt died here with its transaction row
// left unconsumed while clean single-copy rides passed. This mirrors how
// requireSession and the owner-proof door already treat duplicates.
export async function consumeBrowserTransaction({state,browsers,purpose,principalId=null}){
 for(const browser of Array.isArray(browsers)?browsers:[]){
  const tx=await consumeTransaction({state,browser,purpose,principalId});
  if(tx)return tx;
 }
 return null;
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

// D-006 MC-7.0: cookie-free transactions. The public connect sign-in and
// "add another Google account" from the Approve page carry no browser
// cookie, because in-app browsers (Muse) lose them. Only a transaction that
// was CREATED cookie-free can be consumed without one; every other flow
// keeps its browser binding. Nothing reaches any app from such a sign-in
// until the person taps Approve on a page showing who is signed in and
// which site receives access (the GitHub public-connect safety shape).
export async function consumeCookieFreeTransaction({state,purpose}){
 if(typeof state!=='string'||!state)return null;
 const q=sql(),hash=digest(state);
 const rows=await q`UPDATE user_oauth_transactions SET consumed_at=now()
   WHERE state_hash=${hash} AND purpose=${purpose} AND consumed_at IS NULL
   AND expires_at>now() AND policy->>'cookieFree'='true'
   RETURNING *`;
 if(rows.length!==1)return null;
 return {...rows[0],...openV2(rows[0].provider_verifier_ciphertext,
   rows[0].principal_id||OWNER_ID,hash,'provider-transaction')};
}
const CONNECT_HANDLE=/^p10h_[A-Za-z0-9_-]{43}$/;
export async function issueConnectHandle({principalId,clientId,redirectUri,resource,codeChallenge,clientState=null}){
 requireScope(validUuid(principalId)&&typeof clientId==='string'&&clientId&&
  typeof redirectUri==='string'&&redirectUri&&typeof resource==='string'&&resource&&
  /^[A-Za-z0-9_-]{43}$/.test(codeChallenge||''),'invalid_connect');
 const handle=mint('p10h_'),q=sql();
 const rows=await q`INSERT INTO principal_connect_handles
   (handle_hash,principal_id,client_id,redirect_uri,resource,code_challenge,client_state,expires_at)
   SELECT ${digest(handle)},p.id,${clientId},${redirectUri},${resource},${codeChallenge},
     ${clientState},now()+interval '15 minutes'
   FROM principals p WHERE p.id=${principalId}::uuid AND p.status='active'
   RETURNING handle_hash`;
 requireScope(rows.length===1,'invalid_connect');
 return handle;
}
// The handle must match the exact client, redirect, resource and PKCE
// challenge in the address it arrived with; anything else reads as absent.
const connectMatches=(row,expect)=>!!row&&(!expect||
 (row.client_id===expect.clientId&&row.redirect_uri===expect.redirectUri&&
  row.resource===expect.resource&&row.code_challenge===expect.codeChallenge));
export async function readConnectHandle(handle,expect=null){
 if(typeof handle!=='string'||!CONNECT_HANDLE.test(handle))return null;
 const rows=await sql()`SELECT h.* FROM principal_connect_handles h JOIN principals p ON p.id=h.principal_id
   WHERE h.handle_hash=${digest(handle)} AND h.consumed_at IS NULL AND h.expires_at>now()
   AND p.status='active'`;
 return connectMatches(rows[0],expect)?rows[0]:null;
}
export async function consumeConnectHandle(handle,expect=null){
 if(typeof handle!=='string'||!CONNECT_HANDLE.test(handle))return null;
 const q=sql();
 if(expect&&!await readConnectHandle(handle,expect))return null;
 const rows=await q`UPDATE principal_connect_handles SET consumed_at=now()
   WHERE handle_hash=${digest(handle)} AND consumed_at IS NULL AND expires_at>now()
   RETURNING *`;
 return connectMatches(rows[0],expect)?rows[0]:null;
}
// The verified Google address a person signed in with (shown on the
// Approve page so a person can see whose sign-in they are approving).
export async function principalSignInEmail(principalId){
 if(!validUuid(principalId))return null;
 const rows=await sql()`SELECT verified_email FROM principal_google_identities
   WHERE principal_id=${principalId}::uuid ORDER BY updated_at DESC LIMIT 1`;
 return rows[0]?.verified_email||null;
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
   p.status AS principal_status,COALESCE(st.writes_paused,false) AS writes_paused
   FROM principal_connections c JOIN principals p ON p.id=c.principal_id
   JOIN principal_google_accounts a ON a.id=c.account_id AND a.principal_id=c.principal_id
   LEFT JOIN principal_settings st ON st.principal_id=c.principal_id
   WHERE c.access_hash=${digest(token)} AND c.expires_at>now()
   AND c.revoked_at IS NULL AND p.status='active' AND a.status='active'`;
 if(rows.length!==1)return null;
 const row=rows[0],settings=policy(row);
 const context=Object.freeze({principalId:row.principal_id,principalKind:row.principal_kind,
   accountId:row.account_id,connectionId:row.connection_id,mode:settings.mode,
   profile:settings.profile,listing:settings.listing,areas:settings.areas,
   resource:row.resource,clientId:row.client_id,
   accountVersion:row.account_version,actingAs:row.account_email,
   writesPaused:row.writes_paused===true,
   costPolicy:Object.freeze({...settings.cost_policy})});
 trustedContexts.add(context);
 return context;
}
// One connection, every Google account its person has linked (owner
// ruling 2026-11-09: public users add a second and third account inside the
// product, with no roster). The connection keeps its own account as the
// HOME for its results, change log and rate windows; a tool call that names
// another account gets a derived context whose Google credential is that
// account's. Only an account this same principal holds, active, qualifies.
export async function accountContext(context,accountId){
 requireScope(context&&trustedContexts.has(context)&&Object.isFrozen(context)&&
  executableContext(context),'invalid_scoped_context');
 if(accountId===context.accountId&&!context.googleAccountId)return context;
 const account=await findAccount(context.principalId,accountId);
 requireScope(account&&account.principal_id===context.principalId,'outside_scope');
 if(account.id===context.accountId)return context;
 const derived=Object.freeze({...context,googleAccountId:account.id,
  googleAccountVersion:account.token_version,actingAs:account.email});
 trustedContexts.add(derived);
 return derived;
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
// CONTROLS-1: a person changes one of their own app connections' access
// level (Read only / Everyday / Full) from My Workspace connections. Effective
// on the connection's next request; only a live connection this person holds.
export async function setConnectionProfile(principalId,connectionId,profile){
 requireScope(validUuid(principalId)&&validUuid(connectionId)&&
  CONNECTION_PROFILES.includes(profile),'invalid_profile');
 const rows=await sql()`UPDATE principal_connections SET profile=${profile}
   WHERE id=${connectionId}::uuid AND principal_id=${principalId}::uuid
   AND revoked_at IS NULL AND expires_at>now() RETURNING profile`;
 requireScope(rows.length===1,'outside_scope');
 return rows[0].profile;
}
export async function setWritesPaused(principalId,paused){
 requireScope(validUuid(principalId)&&typeof paused==='boolean','invalid_setting');
 const rows=await sql()`INSERT INTO principal_settings(principal_id,writes_paused)
   SELECT id,${paused} FROM principals WHERE id=${principalId}::uuid AND status='active'
   ON CONFLICT(principal_id) DO UPDATE SET writes_paused=excluded.writes_paused,updated_at=now()
   RETURNING writes_paused`;
 requireScope(rows.length===1,'outside_scope');
 return rows[0].writes_paused;
}
export async function getWritesPaused(principalId){
 if(!validUuid(principalId))return false;
 const rows=await sql()`SELECT writes_paused FROM principal_settings WHERE principal_id=${principalId}::uuid`;
 return rows[0]?.writes_paused===true;
}
/**
 * OAuth RFC 7009: an access or refresh token can revoke ONLY its registered
 * client's V2 family. Hashed lookup avoids storing secret token material.
 * Unknown, stale, foreign-client or replayed tokens are indistinguishable.
 */
export async function revokeClientPrincipalToken(token,clientId) {
 if(typeof token!=='string'||!/^p10[ar]_[A-Za-z0-9_-]{43}$/.test(token)||
    typeof clientId!=='string'||!clientId)return 0;
 const q=sql(),tokenHash=digest(token);
 const rows=await q`WITH owned AS (
   SELECT family FROM principal_connections
   WHERE client_id=${clientId} AND revoked_at IS NULL
     AND (access_hash=${tokenHash} OR refresh_hash=${tokenHash})
 ), revoked AS (
   UPDATE principal_connections SET revoked_at=now()
   WHERE family IN (SELECT family FROM owned) AND client_id=${clientId}
     AND revoked_at IS NULL RETURNING id
 ) SELECT count(*)::int AS revoked FROM revoked`;
 return rows[0]?.revoked??0;
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
  executableContext(context),'invalid_scoped_context');
 return loadCustomerDelegation(context);
}
export function scopedStore(context){
 // Inject this wrapper into future P10-4 public clients, never call global DB
 // helpers with a caller-provided tenant. No public tool dispatch exists yet.
 requireScope(context&&trustedContexts.has(context)&&Object.isFrozen(context)&&executableContext(context)&&
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
