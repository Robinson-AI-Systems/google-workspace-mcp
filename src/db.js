// Persistence for the hosted (Vercel) deployment. Vercel serverless functions
// don't keep local files between requests, so anything that needs to survive
// between calls -- your Google login tokens, and the connector's own OAuth
// state -- lives in Postgres (Neon) instead.
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadKey, encryptJson, decryptJson } from './crypto.js';
import { normalizeDomains, domainOfEmail } from './domains.js';
import {passOptions,testAccountEnrolled} from './rtc/pass-options.js';
import {normalizeBillingPolicy} from './rtc/billing-authority.js';
import {initPrincipalSchema} from './principals/store.js';

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

// Serverless cold starts can concurrently execute IF NOT EXISTS DDL on different
// instances. PostgreSQL may still reject a racing CREATE with a duplicate
// internal catalog key (23505) or duplicate DDL object (42P07/42710/42701).
// Re-run only the additive schema setup; never retry a caller's Google/user write.
let initializationInFlight = null;
const RETRYABLE_DDL_CODES = new Set(['42P07', '42710', '42701']);
const RETRYABLE_CATALOG_KEYS = new Set([
  'pg_type_typname_nsp_index',
  'pg_class_relname_nsp_index'
]);
function isConcurrentSchemaDdl(error) {
  const source = error?.sourceError || error;
  const code = source?.code || error?.code;
  if (RETRYABLE_DDL_CODES.has(code)) return true;
  const constraint = source?.constraint || error?.constraint;
  return code === '23505' && RETRYABLE_CATALOG_KEYS.has(constraint);
}
async function initializeSchemaWithRetry() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await initializeSchemaSteps();
    } catch (error) {
      if (attempt === 4 || !isConcurrentSchemaDdl(error)) throw error;
      // Bounded, non-transactional restart is safe because all DDL below is
      // additive/idempotent, with existing owner/token rows preserved.
      await new Promise(resolve => setTimeout(resolve, 30 * 2 ** attempt));
    }
  }
}
export function initSchema() {
  if (!initializationInFlight) {
    initializationInFlight = initializeSchemaWithRetry().finally(() => {
      // A failed initialization must not permanently poison warm instances.
      initializationInFlight = null;
    });
  }
  return initializationInFlight;
}
async function initializeSchemaSteps() {
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
  // New explicitly selected owner connector policy. NULL mode preserves the
  // existing legacy-owner bearer without treating it as a TEST enrollment.
  await q`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS mode TEXT`;
  await q`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS mode TEXT`;
  await q`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS cost_policy JSONB NOT NULL DEFAULT '{"mode":"per_action"}'::jsonb`;
  await q`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS cost_policy JSONB NOT NULL DEFAULT '{"mode":"per_action"}'::jsonb`;
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
  await q`ALTER TABLE rtc_passes ADD COLUMN IF NOT EXISTS for_hub BOOLEAN NOT NULL DEFAULT false`;
  // Historical TEST passes have no standing cost authorization.
  await q`ALTER TABLE rtc_passes ADD COLUMN IF NOT EXISTS cost_policy JSONB NOT NULL DEFAULT '{"mode":"deny"}'::jsonb`;
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
  // P5-2: evidence is stored per mailbox, without ever logging token contents.
  // An encrypted copy proves backfill; a real OAuth token event proves refresh.
  await q`ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS tokens_enc_verified_at TIMESTAMPTZ`;
  await q`ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS tokens_enc_refreshed_at TIMESTAMPTZ`;
  // Dormant until a separate owner-controlled, all-account checked activation.
  // Once active it is durable across function instances and environment changes.
  await q`CREATE TABLE IF NOT EXISTS google_token_storage (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    encrypted_only_at TIMESTAMPTZ
  )`;
  await q`INSERT INTO google_token_storage (id) VALUES (true) ON CONFLICT (id) DO NOTHING`;
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
  // P8-7: only objects created for a named development run can be cleaned up.
  await q`CREATE TABLE IF NOT EXISTS dev_runs (
    id TEXT PRIMARY KEY,
    acting_as TEXT NOT NULL,
    connection TEXT NOT NULL,
    scenario TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS dev_run_objects (
    run_id TEXT NOT NULL REFERENCES dev_runs(id),
    kind TEXT NOT NULL,
    google_id TEXT NOT NULL,
    parent_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cleaned_at TIMESTAMPTZ,
    PRIMARY KEY(run_id,kind,google_id)
  )`;
  await q`CREATE INDEX IF NOT EXISTS dev_run_objects_run ON dev_run_objects(run_id)`;
  await q`CREATE UNIQUE INDEX IF NOT EXISTS dev_run_objects_single_kind ON dev_run_objects(run_id,kind)`;
  await q`ALTER TABLE dev_runs ADD COLUMN IF NOT EXISTS root_folder TEXT`;
  await q`ALTER TABLE dev_runs ADD COLUMN IF NOT EXISTS calendar_id TEXT`;
  await q`ALTER TABLE dev_runs ADD COLUMN IF NOT EXISTS request_spec JSONB`;
  // An immutable reservation exists BEFORE any provider mutation. A retry is
  // reconciliation-only while a slot is pending; never blindly create again.
  await q`CREATE TABLE IF NOT EXISTS dev_run_steps (
    run_id TEXT NOT NULL REFERENCES dev_runs(id),
    kind TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    google_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(run_id,kind),
    CONSTRAINT dev_run_step_state CHECK (state IN ('pending','recorded'))
  )`;
  // P10 V2 is additive. Owner OAuth and encrypted legacy bytes stay in place.
  await initPrincipalSchema(q);
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

// P5-2: every process uses the durable database state, never a local feature flag.
// Old deployments must be drained before activation: they know only plaintext.
async function encryptedOnlyEnabled(q) {
  const rows = await q`SELECT encrypted_only_at FROM google_token_storage WHERE id = true`;
  if (rows.length !== 1) throw new Error('Google token storage state is unavailable. Nothing was changed.');
  return rows[0].encrypted_only_at !== null;
}
const objectTokens = v => v && typeof v === 'object' && !Array.isArray(v);
function strictEncryptedTokens(value, key) {
  if (!key || !value) throw new Error('Encrypted Google tokens unavailable; reconnect using the approved recovery procedure.');
  try {
    const tokens = decryptJson(value, key);
    if (!objectTokens(tokens) || !Object.keys(tokens).length) throw Error('empty credentials');
    return tokens;
  } catch {
    throw new Error('Encrypted Google token integrity check failed; no plaintext fallback is allowed.');
  }
}
export async function getGoogleTokensFor(email) {
  const q = db();
  const e = normalizeEmail(email);
  const rows = await q`SELECT tokens, tokens_enc FROM google_accounts WHERE email = ${e}`;
  if (!rows[0]) return null;
  const { tokens, tokens_enc } = rows[0];
  const key = loadKey();
  // An active retirement must fail closed: {} is not a valid credential and
  // stale plaintext is never consulted if the key is absent or corrupted.
  if (await encryptedOnlyEnabled(q)) return strictEncryptedTokens(tokens_enc, key);
  if (!tokens) return null;
  if (!key) return tokens;
  if (tokens_enc) {
    try {
      const decrypted = decryptJson(tokens_enc, key);
      if (canonical(decrypted) === canonical(tokens)) return decrypted;
    } catch {
      console.warn('[crypto] Could not decrypt the stored tokens for an account; using the plain copy and re-encrypting it. If this repeats, check TOKEN_ENCRYPTION_KEY.');
    }
  }
  await storeEncryptedCopy(q, e, tokens, key);
  return tokens;
}

/** Backfill without overwriting a newer plaintext save; never mark a fake refresh. */
async function storeEncryptedCopy(q, email, tokens, key, refreshed = false) {
  try {
    const enc = encryptJson(tokens, key);
    await q`WITH mode_guard AS MATERIALIZED (
      SELECT id FROM google_token_storage WHERE id = true AND encrypted_only_at IS NULL FOR SHARE
    )
    UPDATE google_accounts SET tokens_enc = ${enc},
      tokens_enc_verified_at = now(),
      tokens_enc_refreshed_at = CASE WHEN ${refreshed}::boolean THEN now() ELSE tokens_enc_refreshed_at END
      WHERE email = ${email} AND tokens = ${JSON.stringify(tokens)}::jsonb
        AND EXISTS (SELECT 1 FROM mode_guard)`;
  } catch {
    console.warn('[crypto] Could not store the encrypted copy of an account\'s tokens; the plain copy is still correct.');
  }
}

/**
 * In encrypted-only mode the ciphertext is the optimistic compare-and-swap
 * version. Two serverless refresh callbacks cannot clobber one another's
 * refresh_token or other new fields. There is no temporary plaintext write.
 */
async function saveEncryptedOnly(q, email, tokens, label, key, refreshed) {
  if (!key) throw new Error('A valid TOKEN_ENCRYPTION_KEY is required for encrypted-only storage.');
  for (let attempt = 0; attempt < 10; attempt++) {
    const rows = await q`SELECT tokens_enc, tokens_enc_refreshed_at FROM google_accounts WHERE email = ${email}`;
    const before = rows[0];
    const previous = before ? strictEncryptedTokens(before.tokens_enc, key) : {};
    const merged = { ...previous, ...tokens };
    const enc = encryptJson(merged, key);
    // The pre-multi-account copy must retire on the SAME successful renewal.
    // Never clear an unmatched legacy credential or remove the recovery table.
    const clearMatchingLegacy = async () => {
      if (!refreshed) return;
      const oldRefresh = typeof previous.refresh_token === 'string' && previous.refresh_token ? previous.refresh_token : null;
      const newRefresh = typeof merged.refresh_token === 'string' && merged.refresh_token ? merged.refresh_token : null;
      if (!oldRefresh && !newRefresh) return;
      await q`UPDATE google_auth SET tokens = '{}'::jsonb, updated_at = now()
        WHERE id = 1 AND tokens ->> 'refresh_token' IN (${oldRefresh}, ${newRefresh})
        AND EXISTS (SELECT 1 FROM google_token_storage WHERE id = true AND encrypted_only_at IS NOT NULL)`;
    };
    if (before) {
      const result = await q`UPDATE google_accounts SET
        tokens = '{}'::jsonb, tokens_enc = ${enc},
        tokens_enc_verified_at = now(),
        tokens_enc_refreshed_at = CASE WHEN ${refreshed}::boolean THEN now() ELSE tokens_enc_refreshed_at END,
        label = COALESCE(${label}, label), updated_at = now()
        WHERE email = ${email} AND tokens_enc = ${before.tokens_enc}
          AND EXISTS (SELECT 1 FROM google_token_storage WHERE id = true AND encrypted_only_at IS NOT NULL)
        RETURNING email`;
      if (result.length) { await clearMatchingLegacy(); return; }
    } else {
      const result = await q`INSERT INTO google_accounts
        (email, label, tokens, tokens_enc, tokens_enc_verified_at, tokens_enc_refreshed_at, is_default, updated_at)
        SELECT ${email}, ${label}, '{}'::jsonb, ${enc}, now(),
          CASE WHEN ${refreshed}::boolean THEN now() ELSE NULL END,
          NOT EXISTS (SELECT 1 FROM google_accounts), now()
        WHERE EXISTS (SELECT 1 FROM google_token_storage WHERE id = true AND encrypted_only_at IS NOT NULL)
        ON CONFLICT (email) DO NOTHING RETURNING email`;
      if (result.length) { await clearMatchingLegacy(); return; }
    }
  }
  throw new Error('Concurrent encrypted Google token refresh could not be safely reconciled; retry using the same credentials.');
}

/**
 * Dual-write until independent approval, verified backfill/refresh for EVERY
 * mailbox, and drained incompatible deployments. This remains compatible with old code.
 * After activation all newly connected accounts also start encrypted-only.
 */
export async function saveGoogleTokensFor(email, tokens, { label, source } = {}) {
  if (!objectTokens(tokens) || !Object.keys(tokens).length)
    throw new Error('Google credentials must be a nonempty token object.');
  const q = db();
  const e = normalizeEmail(email);
  const refreshed = source === 'refresh';
  const key = loadKey();
  if (await encryptedOnlyEnabled(q)) return saveEncryptedOnly(q, e, tokens, label || null, key, refreshed);
  // Write both copies in ONE PostgreSQL statement. Locking the mode row
  // for this statement serializes activation against any in-flight dual save.
  // CAS on the previous JSON value prevents concurrent refreshes losing fields.
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await encryptedOnlyEnabled(q))
      return saveEncryptedOnly(q, e, tokens, label || null, key, refreshed);
    const previous = await q`SELECT tokens FROM google_accounts WHERE email = ${e}`;
    const current = previous[0];
    const merged = { ...(current?.tokens || {}), ...tokens };
    const encrypted = key ? encryptJson(merged, key) : null;
    let rows;
    if (current) {
      rows = await q`WITH mode_guard AS MATERIALIZED (
        SELECT id FROM google_token_storage WHERE id = true AND encrypted_only_at IS NULL FOR SHARE
      )
      UPDATE google_accounts SET
        tokens = ${JSON.stringify(merged)}::jsonb, tokens_enc = ${encrypted},
        tokens_enc_verified_at = CASE WHEN ${encrypted}::text IS NULL THEN NULL ELSE now() END,
        tokens_enc_refreshed_at = CASE
          WHEN ${encrypted}::text IS NULL THEN NULL
          WHEN ${refreshed}::boolean THEN now()
          ELSE tokens_enc_refreshed_at END,
        label = COALESCE(${label || null}, label), updated_at = now()
      WHERE email = ${e} AND tokens = ${JSON.stringify(current.tokens)}::jsonb
        AND EXISTS (SELECT 1 FROM mode_guard)
      RETURNING email`;
    } else {
      rows = await q`WITH mode_guard AS MATERIALIZED (
        SELECT id FROM google_token_storage WHERE id = true AND encrypted_only_at IS NULL FOR SHARE
      )
      INSERT INTO google_accounts
        (email, label, tokens, tokens_enc, tokens_enc_verified_at, tokens_enc_refreshed_at, is_default, updated_at)
      SELECT ${e}, ${label || null}, ${JSON.stringify(merged)}::jsonb, ${encrypted},
        CASE WHEN ${encrypted}::text IS NULL THEN NULL ELSE now() END,
        CASE WHEN ${encrypted}::text IS NOT NULL AND ${refreshed}::boolean THEN now() ELSE NULL END,
        NOT EXISTS (SELECT 1 FROM google_accounts), now()
      WHERE EXISTS (SELECT 1 FROM mode_guard)
      ON CONFLICT (email) DO NOTHING RETURNING email`;
    }
    if (rows.length) return;
  }
  throw new Error('Concurrent Google token refresh could not be safely reconciled; retry using the same credentials.');
}

/**
 * Readiness is intentionally a protected, sanitized operator check. It NEVER
 * grants permission or changes a real account. A verified encrypted backfill
 * and an actual subsequent OAuth refresh are both needed per account.
 */
export async function inspectGoogleTokenRetirement() {
  const q = db();
  const active = await encryptedOnlyEnabled(q);
  const rows = await q`SELECT tokens, tokens_enc, tokens_enc_verified_at, tokens_enc_refreshed_at FROM google_accounts`;
  const key = loadKey();
  const legacy = await q`SELECT count(*)::int AS n FROM google_auth WHERE tokens <> '{}'::jsonb`;
  const problems = { missingKey: !key, noAccounts: rows.length === 0,
    missingCopy: 0, corruptOrStale: 0, unverifiedBackfill: 0, refreshNotObserved: 0 };
  for (const row of rows) {
    if (!row.tokens_enc) { problems.missingCopy++; continue; }
    if (!row.tokens_enc_verified_at) problems.unverifiedBackfill++;
    if (!row.tokens_enc_refreshed_at) problems.refreshNotObserved++;
    if (key) {
      try {
        const decrypted = strictEncryptedTokens(row.tokens_enc, key);
        if (!active && canonical(decrypted) !== canonical(row.tokens)) problems.corruptOrStale++;
      } catch { problems.corruptOrStale++; }
    }
  }
  const ready = rows.length > 0 && key !== null &&
    Object.values(problems).every(v => v === false || v === 0);
  return { encryptedOnly: active, accountsChecked: rows.length,
    legacyPlaintextCopies: legacy[0].n,
    plaintextAccounts: rows.filter(row => objectTokens(row.tokens) && Object.keys(row.tokens).length > 0).length, ready, problems,
    notBefore: null };
}

/**
 * Does not run from normal HTTP/OAuth startup. Only a separately confirmed
 * operator maintenance call may activate it, after ALL accounts have proven
 * encrypted copy, real refresh and readiness. Do not call before the daily
 * release has retired older plaintext-only server instances.
 */
export async function activateGoogleTokenRetirement({ ownerConfirmed = false } = {}) {
  if (ownerConfirmed !== true) throw new Error('Independent owner confirmation required; no tokens retired.');
  const q = db();
  if (await encryptedOnlyEnabled(q)) return { activated: false, alreadyActive: true };
  const readiness = await inspectGoogleTokenRetirement();
  if (!readiness.ready) throw new Error('Every Google account needs an intact encrypted backfill and observed refresh before retirement.');
  const done = await q`UPDATE google_token_storage SET encrypted_only_at = now()
    WHERE id = true AND encrypted_only_at IS NULL
      AND EXISTS (SELECT 1 FROM google_accounts)
      AND NOT EXISTS (
        SELECT 1 FROM google_accounts
        WHERE tokens_enc IS NULL OR tokens_enc_verified_at IS NULL OR tokens_enc_refreshed_at IS NULL
      )
    RETURNING encrypted_only_at`;
  if (!done.length) throw new Error('Storage readiness changed and refused activation; no tokens retired.');
  return { activated: true, alreadyActive: false };
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
  if (!legacy[0] || !objectTokens(legacy[0].tokens) || !Object.keys(legacy[0].tokens).length) return null;
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
export async function createAuthCode({ code, clientId, redirectUri, codeChallenge, codeChallengeMethod, googleAccount, profile = 'full', listing = 'catalog', areas = null, mode = 'live', costPolicy = {mode:'per_action'}, ttlSeconds = 600 }) {
  const q = db();
  await q`
    INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, google_account, profile, listing, areas, mode, cost_policy, expires_at)
    VALUES (${code}, ${clientId}, ${redirectUri}, ${codeChallenge || null}, ${codeChallengeMethod || null}, ${googleAccount ? normalizeEmail(googleAccount) : null}, ${profile}, ${listing}, ${areas}, ${mode}, ${JSON.stringify(normalizeBillingPolicy(costPolicy,{account:googleAccount}))}::jsonb, now() + (${ttlSeconds} || ' seconds')::interval)
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
export async function createAccessToken({ accessToken, refreshToken, clientId, googleAccount, profile = 'full', listing = 'catalog', areas = null, mode = null, costPolicy = {mode:'per_action'}, cost_policy, ttlSeconds = 3600 * 24 * 30 }) {
  const q = db();
  await q`
    INSERT INTO oauth_tokens (access_token, refresh_token, client_id, google_account, profile, listing, areas, mode, cost_policy, expires_at)
    VALUES (${accessToken}, ${refreshToken || null}, ${clientId}, ${googleAccount ? normalizeEmail(googleAccount) : null}, ${profile}, ${listing}, ${areas}, ${mode}, ${JSON.stringify(normalizeBillingPolicy(cost_policy ?? costPolicy,{account:googleAccount}))}::jsonb, now() + (${ttlSeconds} || ' seconds')::interval)
  `;
}

/** The most recent token row we issued for this refresh token, or null if we never issued it. */
export async function getTokenByRefreshToken(refreshToken) {
  const q = db();
  if (!refreshToken) return null;
  const rows = await q`SELECT client_id, google_account, profile, listing, areas, mode, cost_policy FROM oauth_tokens WHERE refresh_token = ${refreshToken} AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`;
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
  return [...connectors.map(c=>({...c,kind:'connector'})),...passes.map(p=>({...p,token_prefix:p.connection_id}))].sort((x,y)=>new Date(y.created_at)-new Date(x.created_at));
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
  const id = Number(rows[0].id);
  if (!Number.isSafeInteger(id) || id < 1) throw Error('Audit reference exceeds the supported integer range.');
  return id;
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
export async function createRtcPass(options){
 const {account,areas,limit,ttl,forHub,allowWrites,profile,mode}=passOptions(options);
 if(!account)throw new Error('Missing connected account.');
 if(mode==='test'&&!testAccountEnrolled(account))throw new Error('Account is not authorized for RTC non-production TEST passes. Configure RTC_TEST_ACCOUNT_EMAILS with the approved scratch mailbox.');
 const q=db();
 const accountRows=await q`SELECT 1 FROM google_accounts WHERE email=${account}`;
 if(!accountRows[0])throw new Error('Unknown connected account.');
 const token='rtc_pass_'+crypto.randomBytes(32).toString('base64url');
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const id='pass_'+hash.slice(0,20);
 const costPolicy=mode==='test'?{mode:'deny'}:normalizeBillingPolicy(options.costPolicy,{account});
 await q`INSERT INTO rtc_passes(id,token_hash,google_account,areas,rate_limit_per_minute,expires_at,for_hub,allow_writes,profile,mode,cost_policy)
 VALUES (${id},${hash},${account},${areas},${limit},now() + (${ttl} || ' hours')::interval,${forHub},${allowWrites},${profile},${mode},${JSON.stringify(costPolicy)}::jsonb)`;
 return {token,id};
}
export async function getRtcPass(token){
 if(typeof token!=='string'||!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(token))return null;
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const q=db();
 const rows=await q`SELECT id,google_account,profile,areas,listing,mode,cost_policy,allow_writes,for_hub,rate_limit_per_minute,expires_at
 FROM rtc_passes WHERE token_hash=${hash} AND revoked_at IS NULL AND expires_at>now()`;
 const pass=rows[0]||null;
 // Revocation of the TEST enrollment takes effect at every RTC gateway
 // request, not only during pass creation. Do not reissue or widen scope.
 if(!pass||!['test','live'].includes(pass.mode))return null;
 return pass.mode==='live'||testAccountEnrolled(pass.google_account)?pass:null;
}
export async function revokeRtcPass(id){
 const q=db();
 const rows=await q`UPDATE rtc_passes SET revoked_at=now() WHERE id=${id} AND revoked_at IS NULL RETURNING id`;
 return rows.length;
}
export async function listRtcPasses(){
 const q=db();
 return q`SELECT id AS connection_id, 'pass' AS kind,google_account,profile,listing,areas,mode,cost_policy,allow_writes,for_hub,
 rate_limit_per_minute,created_at,expires_at,revoked_at FROM rtc_passes ORDER BY created_at DESC`;
}
export async function chargeRtcPass(id,limit){
 const q=db();
 // The database ON CONFLICT lock serializes overlapping calls across Vercel instances.
 // Prune only this pass's obsolete receipts in the same statement. Never
 // delete another pass's active window or make cleanup an extra counter race.
 const rows=await q`WITH obsolete_windows AS (
 DELETE FROM rtc_rate_limits
 WHERE pass_id=${id} AND window_start<date_trunc('minute',now())
 RETURNING pass_id
 )
 INSERT INTO rtc_rate_limits(pass_id,window_start,count)
 VALUES (${id},date_trunc('minute',now()),1)
 ON CONFLICT(pass_id,window_start) DO UPDATE
 SET count=rtc_rate_limits.count+1
 WHERE rtc_rate_limits.count<${limit}
 RETURNING count`;
 return rows.length===1;
}

// Return only a neutral failure code; never expose pass contents or hashes.
export async function rtcPassFailureCode(token){
 if(typeof token!=='string'||!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(token))return 'permission';
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const q=db();
 const rows=await q`SELECT revoked_at,expires_at,google_account,mode FROM rtc_passes WHERE token_hash=${hash}`;
 if(!rows[0])return 'permission';
 if(rows[0].revoked_at)return 'pass_revoked';
 if(new Date(rows[0].expires_at).getTime()<=Date.now())return 'pass_expired';
 // Do not reveal the configured enrollment list to unauthenticated callers.
 // Report the same neutral permission denial as any unrecognized pass.
 if(rows[0].mode==='test'&&!testAccountEnrolled(rows[0].google_account))return 'permission';
 return 'permission';
}


// Exact-account and exact-connection fixture ledger; Google IDs are never guessed.

export async function startDevRun({id,actingAs,connection,scenario,folder=null,calendarId=null,requestSpec=null}){
 if(!id||!actingAs||!connection||!scenario)throw Error('Authenticated fixture run required.');
 const q=db(),email=normalizeEmail(actingAs);
 const inserted=await q`INSERT INTO dev_runs(id,acting_as,connection,scenario,root_folder,calendar_id,request_spec)
    VALUES (${id},${email},${connection},${scenario},${folder},${calendarId},${requestSpec===null?null:JSON.stringify(requestSpec)}::jsonb)
    ON CONFLICT DO NOTHING RETURNING id`;
 const found=await q`SELECT id,scenario,root_folder,calendar_id,request_spec FROM dev_runs
    WHERE id=${id} AND acting_as=${email} AND connection=${connection}`;
 if(found[0]?.request_spec===null&&requestSpec!==null)throw Error('Legacy fixture run requires an exact-ID reviewed recovery plan, never recreation.');
 if(!found[0]||found[0].scenario!==scenario||found[0].root_folder!==folder||found[0].calendar_id!==calendarId||!isDeepStrictEqual(found[0].request_spec,requestSpec))
   throw Error('Run ID belongs to a different account, connection, scenario, immutable request or root folder.');
 return {created:inserted.length===1,runId:id};
}
// The UNIQUE slot is durably reserved before calling Drive. Even after a crash,
// another request may only reconcile by exact provider tag, not create again.
export async function reserveDevStep({runId,actingAs,connection,kind}){
 const q=db(),email=normalizeEmail(actingAs);
 const rows=await q`INSERT INTO dev_run_steps(run_id,kind,state)
   SELECT id,${kind},'pending' FROM dev_runs
   WHERE id=${runId} AND acting_as=${email} AND connection=${connection}
   ON CONFLICT DO NOTHING RETURNING kind`;
 const found=await q`SELECT s.kind,s.state,s.google_id FROM dev_run_steps s
   JOIN dev_runs r ON r.id=s.run_id WHERE s.run_id=${runId} AND s.kind=${kind}
    AND r.acting_as=${email} AND r.connection=${connection}`;
 if(!found[0])throw Error('Unauthorized or unreserved development step.');
 return {...found[0],created:rows.length===1};
}
export async function recordDevObject({runId,actingAs,connection,kind,googleId,parentId=null}){
 if(!googleId)throw Error('Google fixture ID missing; reservation stays uncertain.');
 const q=db(),email=normalizeEmail(actingAs);
 await q`INSERT INTO dev_run_objects(run_id,kind,google_id,parent_id)
   SELECT id,${kind},${googleId},${parentId} FROM dev_runs
   WHERE id=${runId} AND acting_as=${email} AND connection=${connection}
   ON CONFLICT (run_id,kind) DO NOTHING`;
 const existing=await q`SELECT o.google_id FROM dev_run_objects o JOIN dev_runs r ON r.id=o.run_id
   WHERE o.run_id=${runId} AND o.kind=${kind}
   AND r.acting_as=${email} AND r.connection=${connection}`;
 if(existing.length!==1||existing[0].google_id!==googleId)
   throw Error('Conflicting fixture ID; manual reconciliation required.');
}
export async function markDevStepRecorded({runId,actingAs,connection,kind,googleId}){
 const q=db(),email=normalizeEmail(actingAs);
 const changed=await q`UPDATE dev_run_steps AS s SET state='recorded',
   google_id=${googleId},updated_at=now() FROM dev_runs AS r
   WHERE s.run_id=r.id AND r.id=${runId} AND r.acting_as=${email}
    AND r.connection=${connection} AND s.kind=${kind}
    AND (s.google_id IS NULL OR s.google_id=${googleId}) RETURNING s.kind`;
 if(changed.length!==1)throw Error('Development step could not be reconciled.');
}
export async function getDevRun({runId,actingAs,connection}){
 if(!runId||!actingAs||!connection)return null;
 const q=db(),email=normalizeEmail(actingAs);
 const runs=await q`SELECT id,scenario,root_folder,calendar_id,request_spec,created_at FROM dev_runs
   WHERE id=${runId} AND acting_as=${email} AND connection=${connection}`;
 if(!runs[0])return null;
 const objects=await q`SELECT kind,google_id,parent_id,cleaned_at FROM dev_run_objects
   WHERE run_id=${runId} ORDER BY created_at,kind,google_id`;
 const steps=await q`SELECT kind,state,google_id FROM dev_run_steps
   WHERE run_id=${runId} ORDER BY created_at,kind`;
 return {...runs[0],objects,steps};
}
export async function listDevRuns({actingAs,connection}){
 if(!actingAs||!connection)return [];
 const q=db(),email=normalizeEmail(actingAs);
 return q`SELECT r.id,r.scenario,r.created_at,
   count(s.kind)::integer AS reserved,
   count(s.kind) FILTER (WHERE s.state='pending')::integer AS pending
   FROM dev_runs r LEFT JOIN dev_run_steps s ON s.run_id=r.id
   WHERE r.acting_as=${email} AND r.connection=${connection}
   GROUP BY r.id,r.scenario,r.created_at ORDER BY r.created_at DESC LIMIT 50`;
}

// Only an object's initiating account and connection can mark that exact fixture cleaned.
export async function markDevObjectCleaned({runId,actingAs,connection,kind,googleId}){
 if(!runId||!actingAs||!connection||!kind||!googleId)throw new Error('Complete fixture identity required.');
 const q=db();
 const rows=await q`UPDATE dev_run_objects AS o SET cleaned_at=now()
 FROM dev_runs AS r WHERE o.run_id=r.id AND o.run_id=${runId}
   AND r.acting_as=${normalizeEmail(actingAs)} AND r.connection=${connection}
   AND o.kind=${kind} AND o.google_id=${googleId}
   RETURNING o.google_id`;
 if(rows.length!==1)throw new Error('Fixture cleanup ledger write was refused.');
}

/** Exact scoped log lookup for safe undo. */
export async function getOwnedChange(id, actingAs, connection) {
 if (!Number.isSafeInteger(Number(id)) || Number(id)<1 || !actingAs || !connection) return null;
 const q=db();
 const rows=await q`SELECT id, acting_as, connection, tool, target, summary, before, after, dry_run
 FROM change_log WHERE id=${Number(id)} AND lower(acting_as)=${normalizeEmail(actingAs)} AND connection=${connection}`;
 return rows[0] || null;
}
