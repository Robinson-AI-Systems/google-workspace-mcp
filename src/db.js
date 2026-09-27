// Persistence for the hosted (Vercel) deployment. Vercel serverless functions
// don't keep local files between requests, so anything that needs to survive
// between calls -- your Google login tokens, and the connector's own OAuth
// state -- lives in Postgres (Neon) instead.
import { neon } from '@neondatabase/serverless';

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
}

// ---------- Google tokens (single tenant: one Workspace account) ----------
export async function getGoogleTokens() {
  const q = db();
  const rows = await q`SELECT tokens FROM google_auth WHERE id = 1`;
  return rows[0]?.tokens || null;
}

export async function saveGoogleTokens(tokens) {
  const q = db();
  await q`
    INSERT INTO google_auth (id, tokens, updated_at) VALUES (1, ${JSON.stringify(tokens)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET tokens = google_auth.tokens || EXCLUDED.tokens, updated_at = now()
  `;
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
export async function createAuthCode({ code, clientId, redirectUri, codeChallenge, codeChallengeMethod, ttlSeconds = 600 }) {
  const q = db();
  await q`
    INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, expires_at)
    VALUES (${code}, ${clientId}, ${redirectUri}, ${codeChallenge || null}, ${codeChallengeMethod || null}, now() + (${ttlSeconds} || ' seconds')::interval)
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
export async function createAccessToken({ accessToken, refreshToken, clientId, ttlSeconds = 3600 * 24 * 30 }) {
  const q = db();
  await q`
    INSERT INTO oauth_tokens (access_token, refresh_token, client_id, expires_at)
    VALUES (${accessToken}, ${refreshToken || null}, ${clientId}, now() + (${ttlSeconds} || ' seconds')::interval)
  `;
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
