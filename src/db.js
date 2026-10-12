// Persistence for the hosted (Vercel) deployment. Vercel serverless functions
// don't keep local files between requests, so anything that needs to survive
// between calls -- your Google login tokens, and the connector's own OAuth
// state -- lives in Postgres (Neon) instead.
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import { loadKey, encryptJson, decryptJson } from './crypto.js';
import { normalizeDomains, domainOfEmail } from './domains.js';

let sql;
function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. This is required for the hosted deployment (Neon connection string).');
    }
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

export async function initSchema() {
  const q = db();
  await q`
    CREATE TABLE IF NOT EXISTS google_auth (
      id INTEGER PRIMARY KEY DEFAULT 1,
      tokens JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT single_row CHECK (id = 1)
    )
  `;
  await q`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY,
      client_secret TEXT,
      redirect_uris JSONB NOT NULL,
      client_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await q`
    CREATE TABLE IF NOT EXISTS oauth_codes (
      code TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      code_challenge TEXT,
      code_challenge_method TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false
    )
  `;
  await q`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      access_token TEXT PRIMARY KEY,
      refresh_token TEXT,
      client_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // One row per Google mailbox this server is allowed to act as. Before
  // 2026-09-30 there was exactly one sign-in (the google_auth table above,
  // kept so existing deployments upgrade in place -- see migrateLegacyGoogleAuth).
  await q`
    CREATE TABLE IF NOT EXISTS google_accounts (
      email TEXT PRIMARY KEY,
      label TEXT,
      tokens JSONB NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Which Google account each Claude connection acts as. NULL means "the
  // default account", which is what every connection made before this
  // column existed gets, so nothing changes for them.
  await q`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS google_account TEXT`;
  // Same for the short-lived login codes: the account picked on the login
  // page rides along until the token is issued.
  await q`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS google_account TEXT`;
  for (const table of ['oauth_codes','oauth_tokens']) {
    if (table === 'oauth_codes') {
      await q`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS profile TEXT NOT NULL DEFAULT 'full'`;
      await q`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS listing TEXT NOT NULL DEFAULT 'catalog'`;
      await q`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS areas TEXT[]`;
    } else {
      await q`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS profile TEXT NOT NULL DEFAULT 'full'`;
      await q`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS listing TEXT NOT NULL DEFAULT 'catalog'`;
      await q`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS areas TEXT[]`;
    }
  }
  // Every try at the passphrase page, so repeated wrong guesses from one
  // address can be locked out (see src/oauth/login-guard.js). Additive only.
  await q`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id BIGSERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      success BOOLEAN NOT NULL DEFAULT false
    )
  `;
  await q`CREATE INDEX IF NOT EXISTS login_attempts_ip_time ON login_attempts (ip, attempted_at)`;
  await q`CREATE INDEX IF NOT EXISTS login_attempts_time ON login_attempts (attempted_at)`;
  // Every large result is isolated by its issuing connection and expires automatically.
  await q`CREATE TABLE IF NOT EXISTS rtc_results (
    handle TEXT PRIMARY KEY,
    connection TEXT NOT NULL,
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS rtc_results_expiry ON rtc_results(expires_at)`;
  // RTC 1 owner-issued passes are hashed at rest; plaintext is never stored.
  await q`CREATE TABLE IF NOT EXISTS rtc_passes (
    id TEXT PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    google_account TEXT NOT NULL,
    profile TEXT NOT NULL DEFAULT 'read_only',
    areas TEXT[],
    listing TEXT NOT NULL DEFAULT 'compact',
    mode TEXT NOT NULL DEFAULT 'test',
    allow_writes BOOLEAN NOT NULL DEFAULT false,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
  )`;
  await q`CREATE INDEX IF NOT EXISTS rtc_passes_expiry ON rtc_passes(expires_at)`;
  await q`CREATE TABLE IF NOT EXISTS rtc_rate_limits (
    pass_id TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY(pass_id,window_start)
  )`;
  // Connection bookkeeping: when a Claude connection last did something, and whether it was switched off by hand.
  await q`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ`;
  await q`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ`;
  // A record of changes made to Workspace through this server (what, to whom, as which account, before/after).
  // Never holds credentials; see src/changelog.js.
  await q`
    CREATE TABLE IF NOT EXISTS change_log (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      acting_as TEXT,
      connection TEXT,
      tool TEXT NOT NULL,
      target TEXT,
      summary TEXT,
      before JSONB,
      after JSONB,
      dry_run BOOLEAN NOT NULL DEFAULT false
    )
  `;
  await q`CREATE INDEX IF NOT EXISTS change_log_at ON change_log (at)`;
  // Encrypted copy of google_accounts.tokens (see src/crypto.js). The plaintext
  // column stays in step until a later cleanup removes it, so older code that
  // only knows `tokens` keeps working during a deploy.
  await q`ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS tokens_enc TEXT`;
  // Which email domains this account's connections may manage through the admin tools. NULL means "only the account's own domain" (see src/tools/domain-guard.js).
  await q`ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS allowed_domains TEXT[]`;
  // Google IDs (calendars, folders) the business apps look up by name instead of hard-coding. Additive only.
  await q`
    CREATE TABLE IF NOT EXISTS business_resources (
      business TEXT NOT NULL,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      google_id TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (business, kind, key)
    )
  `;
}

// ---------- Google accounts (one row per mailbox the server can act as) ----------

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Every connected Google account, default first. Tokens are NOT included. */
export async function listGoogleAccounts() {
  const q = db();
  const rows = await q`
    SELECT email, label, is_default, created_at, updated_at, allowed_domains
    FROM google_accounts
    ORDER BY is_default DESC, created_at ASC
  `;
  return rows.map(withDomains);
}

const domainOf = domainOfEmail;
// `allowed_domains` is always the list in force; `allowed_domains_custom` says whether someone set it (otherwise it is just the account's own domain).
function withDomains(row) {
  const { allowed_domains: custom, ...rest } = row;
  return { ...rest, allowed_domains: custom && custom.length ? custom : [domainOf(row.email)], allowed_domains_custom: !!(custom && custom.length) };
}

/** The domains a connection acting as this account may manage. Defaults to the account's own domain. */
export async function getAllowedDomains(email) {
  const q = db();
  const e = normalizeEmail(email);
  const rows = await q`SELECT allowed_domains FROM google_accounts WHERE email = ${e}`;
  const custom = rows[0]?.allowed_domains;
  return custom && custom.length ? custom : [domainOf(e)];
}

/** `domains` null (or empty) goes back to "own domain only". Returns the list now in force. */
export async function setAllowedDomains(email, domains) {
  const q = db();
  const e = normalizeEmail(email);
  const list = normalizeDomains(domains);
  const rows = await q`UPDATE google_accounts SET allowed_domains = ${list.length ? list : null}, updated_at = now() WHERE email = ${e} RETURNING email`;
  if (!rows.length) throw new Error(`No connected Google account named ${e}.`);
  return list.length ? list : [domainOf(e)];
}


/** The account a connection with no explicit choice acts as. */
export async function getDefaultGoogleAccount() {
  const q = db();
  const rows = await q`SELECT email FROM google_accounts ORDER BY is_default DESC, created_at ASC LIMIT 1`;
  return rows[0]?.email || null;
}

// Same content regardless of key order, so two copies of the same tokens compare equal.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function getGoogleTokensFor(email) {
  const q = db();
  const e = normalizeEmail(email);
  const rows = await q`SELECT tokens, tokens_enc FROM google_accounts WHERE email = ${e}`;
  if (!rows[0]) return null;
  const { tokens, tokens_enc } = rows[0];
  if (!tokens) return null;
  const key = loadKey();
  if (!key) return tokens;
  // The plain copy is always written by every version of the code, so it is the authority. The encrypted
  // copy is used only when it says exactly the same thing; a stale, damaged or wrong-key copy (older code
  // saved a refresh without knowing about it, or the key was changed) is replaced from the plain copy.
  if (tokens_enc) {
    try {
      const decrypted = decryptJson(tokens_enc, key);
      if (canonical(decrypted) === canonical(tokens)) return decrypted;
    } catch {
      console.warn('[crypto] Could not decrypt the stored tokens for an account; using the plain copy and re-encrypting it. If this repeats, check TOKEN_ENCRYPTION_KEY.');
    }
  }
  await storeEncryptedCopy(q, e, tokens, key); // first read after turning encryption on, or healing a stale/damaged copy
  return tokens;
}

/** Write the encrypted copy, but only if the plain copy is still the one we encrypted (a newer save writes its own). */
async function storeEncryptedCopy(q, email, tokens, key) {
  try {
    const enc = encryptJson(tokens, key);
    await q`UPDATE google_accounts SET tokens_enc = ${enc} WHERE email = ${email} AND tokens = ${JSON.stringify(tokens)}::jsonb`;
  } catch {
    console.warn('[crypto] Could not store the encrypted copy of an account\'s tokens; the plain copy is still correct.');
  }
}

/**
 * Save (or refresh) the tokens for one account. Merging with `||` keeps the
 * refresh_token from the first sign-in when Google later hands back an
 * access_token-only refresh.
 */
export async function saveGoogleTokensFor(email, tokens, { label } = {}) {
  const q = db();
  const e = normalizeEmail(email);
  const count = await q`SELECT count(*)::int AS n FROM google_accounts`;
  const makeDefault = count[0].n === 0; // the first account ever added is the default
  const rows = await q`
    INSERT INTO google_accounts (email, label, tokens, is_default, updated_at)
    VALUES (${e}, ${label || null}, ${JSON.stringify(tokens)}::jsonb, ${makeDefault}, now())
    ON CONFLICT (email) DO UPDATE SET
      tokens = google_accounts.tokens || EXCLUDED.tokens,
      tokens_enc = NULL,
      label = COALESCE(EXCLUDED.label, google_accounts.label),
      updated_at = now()
    RETURNING tokens
  `;
  // The upsert above cleared the encrypted copy, so a failure below only means "not encrypted yet", never "stale".
  const key = loadKey();
  if (key) await storeEncryptedCopy(q, e, rows[0].tokens, key);
}

export async function setDefaultGoogleAccount(email) {
  const q = db();
  const e = normalizeEmail(email);
  const rows = await q`SELECT 1 FROM google_accounts WHERE email = ${e}`;
  if (!rows[0]) throw new Error(`No connected Google account named ${e}.`);
  await q`UPDATE google_accounts SET is_default = (email = ${e})`;
}

export async function removeGoogleAccount(email) {
  const q = db();
  await q`DELETE FROM google_accounts WHERE email = ${normalizeEmail(email)}`;
}

/**
 * One-time upgrade for deployments that predate google_accounts: copy the
 * single legacy sign-in into the new table as the default account.
 * `resolveEmail` is given the old tokens and must return the mailbox they
 * belong to (we ask Gmail, since the tokens themselves don't say).
 *
 * The legacy row is deliberately LEFT IN PLACE, not deleted: Vercel builds a
 * preview of every branch against the same database, so old and new code
 * can be running at the same time, and the old code still reads google_auth.
 * Safe to call on every request: it does nothing once google_accounts has
 * any row. The legacy table can be dropped by hand once nothing old is
 * deployed.
 */
export async function migrateLegacyGoogleAuth(resolveEmail) {
  const q = db();
  const existing = await q`SELECT count(*)::int AS n FROM google_accounts`;
  if (existing[0].n > 0) return null;
  const legacy = await q`SELECT tokens FROM google_auth WHERE id = 1`;
  if (!legacy[0]) return null;
  const email = normalizeEmail(await resolveEmail(legacy[0].tokens));
  if (!email) throw new Error('Could not determine which mailbox the existing Google sign-in belongs to.');
  await saveGoogleTokensFor(email, legacy[0].tokens, { label: 'Migrated from single-account setup' });
  return email;
}

// Kept for anything still importing the old names; both now mean "the default account".
export async function getGoogleTokens() {
  const email = await getDefaultGoogleAccount();
  return email ? getGoogleTokensFor(email) : null;
}

export async function saveGoogleTokens(tokens) {
  const email = await getDefaultGoogleAccount();
  if (!email) throw new Error('No Google account connected yet.');
  return saveGoogleTokensFor(email, tokens);
}

// ---------- Connector OAuth: dynamic client registration ----------
export async function createOAuthClient({ clientId, clientSecret, redirectUris, clientName }) {
  const q = db();
  await q`
    INSERT INTO oauth_clients (client_id, client_secret, redirect_uris, client_name)
    VALUES (${clientId}, ${clientSecret}, ${JSON.stringify(redirectUris)}::jsonb, ${clientName || null})
  `;
}

export async function getOAuthClient(clientId) {
  const q = db();
  const rows = await q`SELECT client_id, client_secret, redirect_uris, client_name FROM oauth_clients WHERE client_id = ${clientId}`;
  return rows[0] || null;
}

// ---------- Connector OAuth: authorization codes (PKCE) ----------
export async function createAuthCode({ code, clientId, redirectUri, codeChallenge, codeChallengeMethod, googleAccount, profile = 'full', listing = 'catalog', areas = null, ttlSeconds = 600 }) {
  const q = db();
  await q`
    INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, google_account, profile, listing, areas, expires_at)
    VALUES (${code}, ${clientId}, ${redirectUri}, ${codeChallenge || null}, ${codeChallengeMethod || null}, ${googleAccount ? normalizeEmail(googleAccount) : null}, ${profile}, ${listing}, ${areas}, now() + (${ttlSeconds} || ' seconds')::interval)
  `;
}

export async function consumeAuthCode(code) {
  const q = db();
  const rows = await q`SELECT * FROM oauth_codes WHERE code = ${code} AND used = false AND expires_at > now()`;
  if (!rows[0]) return null;
  await q`UPDATE oauth_codes SET used = true WHERE code = ${code}`;
  return rows[0];
}

// ---------- Connector OAuth: access tokens ----------
export async function createAccessToken({ accessToken, refreshToken, clientId, googleAccount, profile = 'full', listing = 'catalog', areas = null, ttlSeconds = 3600 * 24 * 30 }) {
  const q = db();
  await q`
    INSERT INTO oauth_tokens (access_token, refresh_token, client_id, google_account, profile, listing, areas, expires_at)
    VALUES (${accessToken}, ${refreshToken || null}, ${clientId}, ${googleAccount ? normalizeEmail(googleAccount) : null}, ${profile}, ${listing}, ${areas}, now() + (${ttlSeconds} || ' seconds')::interval)
  `;
}

/** The most recent token row we issued for this refresh token, or null if we never issued it. */
export async function getTokenByRefreshToken(refreshToken) {
  const q = db();
  if (!refreshToken) return null;
  const rows = await q`SELECT client_id, google_account, profile, listing, areas FROM oauth_tokens WHERE refresh_token = ${refreshToken} AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`;
  return rows[0] || null;
}

export async function getAccessToken(accessToken) {
  const q = db();
  const rows = await q`SELECT * FROM oauth_tokens WHERE access_token = ${accessToken} AND expires_at > now() AND revoked_at IS NULL`;
  return rows[0] || null;
}

export async function deleteAccessToken(accessToken) {
  const q = db();
  await q`DELETE FROM oauth_tokens WHERE access_token = ${accessToken}`;
}

// ---------- Connector OAuth: passphrase-page attempt log (lockout) ----------
/** Write down a sign-in attempt (as a failure until proven otherwise) and return its id. */
export async function recordLoginAttempt(ip) {
  const q = db();
  // Housekeeping: attempts older than a day no longer matter (the lockout window is minutes),
  // so the table cannot grow forever, even from addresses that never come back.
  await q`DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'`;
  const rows = await q`INSERT INTO login_attempts (ip, success) VALUES (${ip}, false) RETURNING id`;
  return rows[0].id;
}

export async function markLoginAttemptSucceeded(id) {
  const q = db();
  await q`UPDATE login_attempts SET success = true WHERE id = ${id}`;
}

/** Failed attempts from this address inside the last `minutes` minutes. */
export async function countRecentFailedLogins(ip, minutes) {
  const q = db();
  const rows = await q`
    SELECT count(*)::int AS n FROM login_attempts
    WHERE ip = ${ip} AND success = false AND attempted_at > now() - (${minutes} || ' minutes')::interval
  `;
  return rows[0].n;
}

// ---------- Connections (Claude connectors that hold a token) ----------
/** A short label for a connection that is safe to store and show: a hash of its token, never the token itself. */
export function connectionId(accessToken) {
  return crypto.createHash('sha256').update(String(accessToken), 'utf8').digest('hex').slice(0, 8);
}

/** Note that a connection was just used. At most once a minute per token, to keep writes down. */
export async function touchAccessToken(accessToken) {
  const q = db();
  await q`UPDATE oauth_tokens SET last_used_at = now() WHERE access_token = ${accessToken} AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`;
}

/** Every connection token that has not expired, newest first. Only the first 8 characters of a token are ever returned. */
export async function listConnections() {
  const q = db();
  const connectors=await q`
    SELECT left(t.access_token, 8) AS token_prefix, left(encode(sha256(convert_to(t.access_token, 'UTF8')), 'hex'), 8) AS connection_id, t.client_id, c.client_name, t.google_account, t.profile, t.listing, t.areas,
           t.created_at, t.expires_at, t.last_used_at, t.revoked_at
    FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id = t.client_id
    WHERE t.expires_at > now()
    ORDER BY t.created_at DESC
  `;
  const passes=await listRtcPasses();
  return [...connectors.map(c=>({...c,kind:'connector'})),...passes.map(p=>({...p,token_prefix:p.id}))].sort((x,y)=>new Date(y.created_at)-new Date(x.created_at));
}

/**
 * Switch a connection off. `prefix` is the start of its token (at least 8 characters, from listConnections).
 * Also switches off any other token issued for the same refresh token, so it cannot simply renew itself.
 * Returns { revoked: <count> } or { revoked: 0, reason: 'not_found' | 'ambiguous' }.
 */
export async function revokeConnection(prefix) {
  const q = db();
  const p = String(prefix || '');
  if (p.length < 8) return { revoked: 0, reason: 'too_short' };
  if (p.startsWith('pass_')) return { revoked: await revokeRtcPass(p) };
  const found = await q`SELECT access_token, refresh_token FROM oauth_tokens WHERE left(access_token, ${p.length}) = ${p}`;
  if (found.length === 0) return { revoked: 0, reason: 'not_found' };
  if (found.length > 1) return { revoked: 0, reason: 'ambiguous' };
  const { access_token, refresh_token } = found[0];
  const done = await q`
    UPDATE oauth_tokens SET revoked_at = now()
    WHERE revoked_at IS NULL AND (access_token = ${access_token} OR (${refresh_token}::text IS NOT NULL AND refresh_token = ${refresh_token}))
    RETURNING access_token
  `;
  // A renewal that slipped in between the lookup and the update would otherwise survive; sweep once more.
  const late = refresh_token ? await q`UPDATE oauth_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND refresh_token = ${refresh_token} RETURNING access_token` : [];
  return { revoked: done.length + late.length };
}

// ---------- Change log ----------
export async function recordChange({ actingAs, connection, tool, target, summary, before, after, dryRun }) {
  const q = db();
  const j = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
  const rows = await q`
    INSERT INTO change_log (acting_as, connection, tool, target, summary, before, after, dry_run)
    VALUES (${actingAs || null}, ${connection || null}, ${tool}, ${target || null}, ${summary || null}, ${j(before)}::jsonb, ${j(after)}::jsonb, ${!!dryRun})
    RETURNING id
  `;
  return rows[0].id;
}

/** Newest first. `since` is a date/time; omit it for "everything". */
export async function listRecentChanges({ since, tool, actingAs, limit = 50, includeDryRuns = true } = {}) {
  const q = db();
  const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
  return q`
    SELECT id, at, acting_as, connection, tool, target, summary, before, after, dry_run
    FROM change_log
    WHERE (${since ? new Date(since).toISOString() : null}::timestamptz IS NULL OR at >= ${since ? new Date(since).toISOString() : null}::timestamptz)
      AND (${tool || null}::text IS NULL OR tool = ${tool || null})
      AND (${actingAs ? normalizeEmail(actingAs) : null}::text IS NULL OR acting_as = ${actingAs ? normalizeEmail(actingAs) : null})
      AND (${includeDryRuns === true}::boolean OR dry_run = false)
    ORDER BY at DESC, id DESC
    LIMIT ${n}
  `;
}

// ---------- Business resources (Google IDs the business apps look up by name) ----------

/** Every stored resource for a business, optionally only one kind ('calendar', 'folder'). */
export async function listBusinessResources(business, kind) {
  const q = db();
  const rows = kind
    ? await q`SELECT business, kind, key, google_id, updated_at FROM business_resources WHERE business = ${business} AND kind = ${kind} ORDER BY key`
    : await q`SELECT business, kind, key, google_id, updated_at FROM business_resources WHERE business = ${business} ORDER BY kind, key`;
  return rows;
}

/** Remember (or correct) one Google ID. Running it twice with the same values changes nothing but the timestamp. */
export async function saveBusinessResource({ business, kind, key, googleId }) {
  const q = db();
  await q`
    INSERT INTO business_resources (business, kind, key, google_id)
    VALUES (${business}, ${kind}, ${key}, ${googleId})
    ON CONFLICT (business, kind, key) DO UPDATE SET google_id = EXCLUDED.google_id, updated_at = now()
  `;
}

export async function storeRtcResult({handle,connection,payload,ttlHours=24}){
 if(!handle||!connection)throw new Error('Missing result owner.');
 const q=db();
 await q`DELETE FROM rtc_results WHERE expires_at < now()`;
 await q`INSERT INTO rtc_results(handle,connection,payload,expires_at)
 VALUES (${handle},${connection},${JSON.stringify(payload)}::jsonb,now() + (${ttlHours} || ' hours')::interval)`;
 return handle;
}
export async function getRtcResult(handle,connection){
 if(!handle||!connection)return null;
 const q=db();
 const rows=await q`SELECT payload FROM rtc_results WHERE handle=${handle} AND connection=${connection} AND expires_at > now()`;
 return rows[0]?.payload ?? null;
}

// RTC 1 passes: test-mode read-only issuance with owner-managed revocation.
// Secrets are returned exactly once to the owner setup page; only SHA256 digests persist.
export async function createRtcPass({googleAccount,areas=null,rateLimit=120,hours=24,forHub=false}){
 const account=normalizeEmail(googleAccount);
 if(!account)throw new Error('Missing connected account.');
 const allowlist=String(process.env.RTC_TEST_ACCOUNT_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allowlist.includes(account))throw new Error('Account is not authorized for RTC non-production TEST passes. Configure RTC_TEST_ACCOUNT_EMAILS with the approved scratch mailbox.');
 const limit=Number(rateLimit),ttl=Number(hours);
 if(!Number.isInteger(limit)||limit<1||limit>600)throw new Error('Rate limit must be 1–600 per minute.');
 if(!Number.isInteger(ttl)||ttl<1||ttl>(forHub?365*24:30*24))throw new Error('Pass duration exceeds the allowed range.');
 if(areas!==null&&(!Array.isArray(areas)||areas.some(x=>typeof x!=='string')))throw new Error('Invalid areas.');
 const q=db();
 const accountRows=await q`SELECT 1 FROM google_accounts WHERE email=${account}`;
 if(!accountRows[0])throw new Error('Unknown connected account.');
 const token='rtc_pass_'+crypto.randomBytes(32).toString('base64url');
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const id='pass_'+hash.slice(0,20);
 await q`INSERT INTO rtc_passes(id,token_hash,google_account,areas,rate_limit_per_minute,expires_at)
 VALUES (${id},${hash},${account},${areas},${limit},now() + (${ttl} || ' hours')::interval)`;
 return {token,id};
}
export async function getRtcPass(token){
 if(typeof token!=='string'||!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(token))return null;
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const q=db();
 const rows=await q`SELECT id,google_account,profile,areas,listing,mode,allow_writes,rate_limit_per_minute,expires_at
 FROM rtc_passes WHERE token_hash=${hash} AND revoked_at IS NULL AND expires_at>now()`;
 return rows[0]||null;
}
export async function revokeRtcPass(id){
 const q=db();
 const rows=await q`UPDATE rtc_passes SET revoked_at=now() WHERE id=${id} AND revoked_at IS NULL RETURNING id`;
 return rows.length;
}
export async function listRtcPasses(){
 const q=db();
 return q`SELECT id AS connection_id, 'pass' AS kind,google_account,profile,listing,areas,mode,allow_writes,
 rate_limit_per_minute,created_at,expires_at,revoked_at FROM rtc_passes ORDER BY created_at DESC`;
}
export async function chargeRtcPass(id,limit){
 const q=db();
 // The database ON CONFLICT lock serializes overlapping calls across Vercel instances.
 const rows=await q`INSERT INTO rtc_rate_limits(pass_id,window_start,count)
 VALUES (${id},date_trunc('minute',now()),1)
 ON CONFLICT(pass_id,window_start) DO UPDATE
 SET count=rtc_rate_limits.count+1
 WHERE rtc_rate_limits.count<${limit}
 RETURNING count`;
 return rows.length===1;
}
