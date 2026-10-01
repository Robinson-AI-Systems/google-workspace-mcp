// Persistence for the hosted (Vercel) deployment. Vercel serverless functions
// don't keep local files between requests, so anything that needs to survive
// between calls -- your Google login tokens, and the connector's own OAuth
// state -- lives in Postgres (Neon) instead.
import { neon } from '@neondatabase/serverless';
import { loadKey, encryptJson, decryptJson } from './crypto.js';

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
  // Encrypted copy of google_accounts.tokens (see src/crypto.js). The plaintext
  // column stays in step until a later cleanup removes it, so older code that
  // only knows `tokens` keeps working during a deploy.
  await q`ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS tokens_enc TEXT`;
}

// ---------- Google accounts (one row per mailbox the server can act as) ----------

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Every connected Google account, default first. Tokens are NOT included. */
export async function listGoogleAccounts() {
  const q = db();
  return q`
    SELECT email, label, is_default, created_at, updated_at
    FROM google_accounts
    ORDER BY is_default DESC, created_at ASC
  `;
}

/** The account a connection with no explicit choice acts as. */
export async function getDefaultGoogleAccount() {
  const q = db();
  const rows = await q`SELECT email FROM google_accounts ORDER BY is_default DESC, created_at ASC LIMIT 1`;
  return rows[0]?.email || null;
}

export async function getGoogleTokensFor(email) {
  const q = db();
  const e = normalizeEmail(email);
  const rows = await q`SELECT tokens, tokens_enc FROM google_accounts WHERE email = ${e}`;
  if (!rows[0]) return null;
  const { tokens, tokens_enc } = rows[0];
  const key = loadKey();
  if (key && tokens_enc) {
    try { return decryptJson(tokens_enc, key); }
    catch {
      // Wrong key (rotated?) or a damaged value: say so, never print the value, and use the plaintext copy.
      console.warn(`[crypto] Could not decrypt the stored tokens for an account; using the plain copy. Check TOKEN_ENCRYPTION_KEY.`);
    }
  }
  if (key && !tokens_enc && tokens) await storeEncryptedCopy(q, e, tokens, key); // first read after turning encryption on
  return tokens || null;
}

/** Write the encrypted copy, but only if the plain copy is still the one we encrypted (a newer save writes its own). */
async function storeEncryptedCopy(q, email, tokens, key) {
  try {
    const enc = encryptJson(tokens, key);
    await q`UPDATE google_accounts SET tokens_enc = ${enc} WHERE email = ${email} AND tokens = ${JSON.stringify(tokens)}::jsonb`;
  } catch { /* best effort: the plain copy is still correct */ }
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
      label = COALESCE(EXCLUDED.label, google_accounts.label),
      updated_at = now()
    RETURNING tokens
  `;
  const key = loadKey();
  if (key) await storeEncryptedCopy(q, e, rows[0].tokens, key);
  else await q`UPDATE google_accounts SET tokens_enc = NULL WHERE email = ${e}`; // never leave an out-of-date encrypted copy behind
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
export async function createAuthCode({ code, clientId, redirectUri, codeChallenge, codeChallengeMethod, googleAccount, ttlSeconds = 600 }) {
  const q = db();
  await q`
    INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, google_account, expires_at)
    VALUES (${code}, ${clientId}, ${redirectUri}, ${codeChallenge || null}, ${codeChallengeMethod || null}, ${googleAccount ? normalizeEmail(googleAccount) : null}, now() + (${ttlSeconds} || ' seconds')::interval)
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
export async function createAccessToken({ accessToken, refreshToken, clientId, googleAccount, ttlSeconds = 3600 * 24 * 30 }) {
  const q = db();
  await q`
    INSERT INTO oauth_tokens (access_token, refresh_token, client_id, google_account, expires_at)
    VALUES (${accessToken}, ${refreshToken || null}, ${clientId}, ${googleAccount ? normalizeEmail(googleAccount) : null}, now() + (${ttlSeconds} || ' seconds')::interval)
  `;
}

/** The most recent token row we issued for this refresh token, or null if we never issued it. */
export async function getTokenByRefreshToken(refreshToken) {
  const q = db();
  if (!refreshToken) return null;
  const rows = await q`SELECT client_id, google_account FROM oauth_tokens WHERE refresh_token = ${refreshToken} ORDER BY created_at DESC LIMIT 1`;
  return rows[0] || null;
}

export async function getAccessToken(accessToken) {
  const q = db();
  const rows = await q`SELECT * FROM oauth_tokens WHERE access_token = ${accessToken} AND expires_at > now()`;
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
