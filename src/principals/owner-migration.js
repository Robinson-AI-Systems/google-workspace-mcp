// P10-7: additive owner identity proof; never move or decrypt legacy grants.
// The owner principal is constant. Google issuer/sub is verified by the SDK in
// the caller, never inferred from an email suffix or a claimed domain.
import {neon} from '@neondatabase/serverless';
import {OWNER_ID,digest,mint,validEmail,requireScope} from './security.js';
let cached;
const sql=()=>{if(!cached){if(!process.env.DATABASE_URL)throw Error('database_unavailable');cached=neon(process.env.DATABASE_URL);}return cached;};
const issuerOk=x=>x==='accounts.google.com'||x==='https://accounts.google.com';
const subOk=x=>typeof x==='string'&&x.length>=4&&x.length<=255&&/^[\x21-\x7e]+$/.test(x);
const textOk=x=>typeof x==='string'&&x.length>0&&x.length<=2048;
const proofRe=/^p10owner_[A-Za-z0-9_-]{43}$/;
const required=['clientId','redirectUri','resource','codeChallenge','clientState'];
function metadataOK(m){
 return m&&required.every(k=>typeof m[k]==='string'&&m[k].length<=2048)&&
  textOk(m.clientId)&&textOk(m.redirectUri)&&
  /^[A-Za-z0-9_-]{43}$/.test(m.codeChallenge);
}
export async function initOwnerMigrationSchema(q=sql()){
 await q`CREATE TABLE IF NOT EXISTS principal_owner_login_proofs (
   secret_hash TEXT PRIMARY KEY,
   issuer TEXT NOT NULL, google_sub TEXT NOT NULL,
   client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,resource TEXT NOT NULL,
   code_challenge TEXT NOT NULL,client_state TEXT NOT NULL,
   expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await q`CREATE INDEX IF NOT EXISTS principal_owner_proofs_expiry
   ON principal_owner_login_proofs(expires_at)`;
}
export async function ownerMigrationSnapshot(q=sql()){
 // This is reachable only after existing owner passphrase verification.
 // Preserve exact identities/mailboxes and connection selectors for a usable
 // dry run, but NEVER include bearer values, raw grants or ciphertext.
 const accounts=await q`SELECT email,label,is_default,
   tokens_enc IS NOT NULL AS encrypted FROM google_accounts
   ORDER BY is_default DESC,created_at ASC`;
 const connections=await q`SELECT client_id,google_account,profile,listing,areas,
   expires_at,created_at FROM oauth_tokens
   WHERE revoked_at IS NULL AND expires_at>now() ORDER BY created_at ASC`;
 const linked=await q`SELECT issuer,google_sub,verified_email
   FROM principal_google_identities WHERE principal_id=${OWNER_ID}::uuid
   ORDER BY issuer,google_sub`;
 const rows=await q`SELECT
    (SELECT count(*)::int FROM google_accounts) AS owner_accounts,
    (SELECT count(*)::int FROM google_accounts WHERE tokens_enc IS NOT NULL) AS encrypted_accounts,
    (SELECT count(*)::int FROM oauth_tokens WHERE revoked_at IS NULL AND expires_at>now()) AS active_owner_connections,
    (SELECT count(*)::int FROM principal_google_identities WHERE principal_id=${OWNER_ID}::uuid) AS linked_owner_google_subjects,
    (SELECT count(*)::int FROM principals WHERE kind='user') AS separate_user_principals,
    (SELECT encrypted_only_at IS NOT NULL FROM google_token_storage WHERE id=true) AS encrypted_only`;
 return Object.freeze({...rows[0],accounts,connections,
  linkedOwnerIdentities:linked.map(x=>({issuer:x.issuer,verifiedEmail:x.verified_email,
   subjectFingerprint:digest(x.issuer+'\n'+x.google_sub).slice(0,32)})),
  dryRun:true,grantsChanged:false,connectionsRevoked:0,
  next:'Explicit owner-only Google proof is required to link an identity; existing OAuth remains available.'});
}
export async function linkVerifiedOwner({issuer,sub,email},q=sql()){
 requireScope(issuerOk(issuer)&&subOk(sub)&&validEmail(email),'invalid_verified_identity');
 // Deny any public principal's account or login subject. Never reassign.
 const foreign=await q`SELECT 1 FROM principal_google_accounts
   WHERE issuer=${issuer} AND google_sub=${sub} AND principal_id<>${OWNER_ID}::uuid LIMIT 1`;
 requireScope(foreign.length===0,'identity_owned_elsewhere');
 const saved=await q`INSERT INTO principal_google_identities
   (issuer,google_sub,principal_id,verified_email)
   VALUES (${issuer},${sub},${OWNER_ID}::uuid,${email.toLowerCase()})
   ON CONFLICT(issuer,google_sub) DO UPDATE
     SET verified_email=excluded.verified_email,updated_at=now()
   WHERE principal_google_identities.principal_id=${OWNER_ID}::uuid
   RETURNING principal_id`;
 requireScope(saved.length===1,'identity_owned_elsewhere');
 return {linked:true,principalKind:'legacy_owner',idempotent:true,
   grantsMoved:false,connectionsRevoked:0};
}
// Reversible mapping only; do not revoke Google application grants, existing
// agent bearers or other principals. Exact owner identity, never an email match.
export async function unlinkVerifiedOwner(subjectFingerprint,q=sql()){
 requireScope(typeof subjectFingerprint==='string'&&/^[a-f0-9]{32}$/.test(subjectFingerprint),
  'invalid_subject_fingerprint');
 const linked=await q`SELECT issuer,google_sub FROM principal_google_identities
   WHERE principal_id=${OWNER_ID}::uuid`;
 const found=linked.filter(x=>digest(x.issuer+'\n'+x.google_sub).slice(0,32)===subjectFingerprint);
 requireScope(found.length===1,'owner_mapping_not_found');
 const row=found[0];
 const removed=await q`DELETE FROM principal_google_identities
   WHERE principal_id=${OWNER_ID}::uuid AND issuer=${row.issuer} AND google_sub=${row.google_sub}
   RETURNING principal_id`;
 requireScope(removed.length===1,'owner_mapping_not_found');
 return {unlinked:true,grantsMoved:false,connectionsRevoked:0};
}
export async function isVerifiedOwner(issuer,sub,q=sql()){
 if(!issuerOk(issuer)||!subOk(sub))return false;
 const rows=await q`SELECT 1 FROM principal_google_identities i
   JOIN principals p ON p.id=i.principal_id
   WHERE i.issuer=${issuer} AND i.google_sub=${sub}
   AND p.id=${OWNER_ID}::uuid AND p.kind='legacy_owner' AND p.status='active'`;
 return rows.length===1;
}
export async function issueOwnerLoginProof(identity,meta,q=sql()){
 requireScope(metadataOK(meta)&&await isVerifiedOwner(identity.issuer,identity.sub,q),
   'owner_identity_unlinked');
 const proof=mint('p10owner_');
 const saved=await q`INSERT INTO principal_owner_login_proofs
   (secret_hash,issuer,google_sub,client_id,redirect_uri,resource,
    code_challenge,client_state,expires_at)
   VALUES (${digest(proof)},${identity.issuer},${identity.sub},${meta.clientId},
    ${meta.redirectUri},${meta.resource},${meta.codeChallenge},${meta.clientState},
    now()+interval '5 minutes') RETURNING secret_hash`;
 requireScope(saved.length===1,'owner_proof_unavailable');
 return proof;
}
async function queryProof(proof,meta,consume,q){
 if(!proofRe.test(proof||'')||!metadataOK(meta))return false;
 const rows=consume
  ?await q`UPDATE principal_owner_login_proofs SET consumed_at=now()
    WHERE secret_hash=${digest(proof)} AND consumed_at IS NULL AND expires_at>now()
    AND client_id=${meta.clientId} AND redirect_uri=${meta.redirectUri}
    AND resource=${meta.resource} AND code_challenge=${meta.codeChallenge}
    AND client_state=${meta.clientState} AND EXISTS(
      SELECT 1 FROM principal_google_identities i JOIN principals p ON p.id=i.principal_id
      WHERE i.issuer=principal_owner_login_proofs.issuer
       AND i.google_sub=principal_owner_login_proofs.google_sub
       AND p.id=${OWNER_ID}::uuid AND p.kind='legacy_owner' AND p.status='active')
    RETURNING secret_hash`
  :await q`SELECT secret_hash FROM principal_owner_login_proofs
    WHERE secret_hash=${digest(proof)} AND consumed_at IS NULL AND expires_at>now()
    AND client_id=${meta.clientId} AND redirect_uri=${meta.redirectUri}
    AND resource=${meta.resource} AND code_challenge=${meta.codeChallenge}
    AND client_state=${meta.clientState} AND EXISTS(
      SELECT 1 FROM principal_google_identities i JOIN principals p ON p.id=i.principal_id
      WHERE i.issuer=principal_owner_login_proofs.issuer
       AND i.google_sub=principal_owner_login_proofs.google_sub
       AND p.id=${OWNER_ID}::uuid AND p.kind='legacy_owner' AND p.status='active')`;
 return rows.length===1;
}
export const inspectOwnerLoginProof=(proof,meta,q=sql())=>queryProof(proof,meta,false,q);
export const consumeOwnerLoginProof=(proof,meta,q=sql())=>queryProof(proof,meta,true,q);
export function legacyNewLoginEnabled(env=process.env){
 // Fail closed on invalid values, but existing access/refresh tokens still work.
 const value=env.LEGACY_OWNER_SIGNIN_ENABLED??'true';
 requireScope(value==='true'||value==='false','invalid_legacy_login_setting');
 return value==='true';
}
