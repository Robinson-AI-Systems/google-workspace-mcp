// An in-memory stand-in for src/db.js, so unit tests can run the real login
// page, tool and OAuth code without Postgres. It must behave like the real
// module; test/contract/db-contract.js runs the SAME checks against both this
// and a real Postgres, so the two cannot quietly drift apart.
//
// `createFakeDb({ clock })` makes a fresh, empty database. The clock is a
// function returning the current time in milliseconds, so tests can move time
// forward (for lockout windows and token expiry) without waiting.
const norm = (email) => String(email || '').trim().toLowerCase();

export function createFakeDb({ clock = () => Date.now() } = {}) {
  const state = {
    legacyTokens: null,
    accounts: new Map(),
    clients: new Map(),
    codes: new Map(),
    tokens: [],
    attempts: [],
    nextAttemptId: 1,
    changes: [],
    nextChangeId: 1
  };
  const at = () => new Date(clock());
  const afterSeconds = (s) => new Date(clock() + s * 1000);

  const api = {
    async initSchema() {},

    async listGoogleAccounts() {
      return [...state.accounts.values()]
        .sort((a, b) => (Number(b.is_default) - Number(a.is_default)) || (a.created_at - b.created_at))
        .map(({ email, label, is_default, created_at, updated_at }) => ({ email, label, is_default, created_at, updated_at }));
    },
    async getDefaultGoogleAccount() {
      return (await api.listGoogleAccounts())[0]?.email || null;
    },
    async getGoogleTokensFor(email) {
      return state.accounts.get(norm(email))?.tokens || null;
    },
    async saveGoogleTokensFor(email, tokens, { label } = {}) {
      const e = norm(email);
      const existing = state.accounts.get(e);
      if (existing) {
        existing.tokens = { ...existing.tokens, ...tokens };
        existing.label = label || existing.label;
        existing.updated_at = at();
      } else {
        state.accounts.set(e, { email: e, label: label || null, tokens: { ...tokens }, is_default: state.accounts.size === 0, created_at: at(), updated_at: at() });
      }
    },
    async setDefaultGoogleAccount(email) {
      const e = norm(email);
      if (!state.accounts.has(e)) throw new Error(`No connected Google account named ${e}.`);
      for (const a of state.accounts.values()) a.is_default = a.email === e;
    },
    async removeGoogleAccount(email) {
      state.accounts.delete(norm(email));
    },
    async migrateLegacyGoogleAuth(resolveEmail) {
      if (state.accounts.size > 0) return null;
      if (!state.legacyTokens) return null;
      const email = norm(await resolveEmail(state.legacyTokens));
      if (!email) throw new Error('Could not determine which mailbox the existing Google sign-in belongs to.');
      await api.saveGoogleTokensFor(email, state.legacyTokens, { label: 'Migrated from single-account setup' });
      return email;
    },
    async getGoogleTokens() {
      const email = await api.getDefaultGoogleAccount();
      return email ? api.getGoogleTokensFor(email) : null;
    },
    async saveGoogleTokens(tokens) {
      const email = await api.getDefaultGoogleAccount();
      if (!email) throw new Error('No Google account connected yet.');
      return api.saveGoogleTokensFor(email, tokens);
    },

    async createOAuthClient({ clientId, clientSecret, redirectUris, clientName }) {
      if (state.clients.has(clientId)) throw new Error('duplicate key value violates unique constraint "oauth_clients_pkey"');
      state.clients.set(clientId, { client_id: clientId, client_secret: clientSecret, redirect_uris: redirectUris, client_name: clientName || null });
    },
    async getOAuthClient(clientId) {
      return state.clients.get(clientId) || null;
    },

    async createAuthCode({ code, clientId, redirectUri, codeChallenge, codeChallengeMethod, googleAccount, ttlSeconds = 600 }) {
      state.codes.set(code, {
        code, client_id: clientId, redirect_uri: redirectUri,
        code_challenge: codeChallenge || null, code_challenge_method: codeChallengeMethod || null,
        google_account: googleAccount ? norm(googleAccount) : null,
        expires_at: afterSeconds(ttlSeconds), used: false
      });
    },
    async consumeAuthCode(code) {
      const row = state.codes.get(code);
      if (!row || row.used || row.expires_at <= at()) return null;
      const snapshot = { ...row };
      row.used = true;
      return snapshot;
    },

    async createAccessToken({ accessToken, refreshToken, clientId, googleAccount, ttlSeconds = 3600 * 24 * 30 }) {
      state.tokens.push({
        access_token: accessToken, refresh_token: refreshToken || null, client_id: clientId,
        google_account: googleAccount ? norm(googleAccount) : null,
        expires_at: afterSeconds(ttlSeconds), created_at: at(), last_used_at: null, revoked_at: null
      });
    },
    async getTokenByRefreshToken(refreshToken) {
      if (!refreshToken) return null;
      const rows = state.tokens.filter((t) => t.refresh_token === refreshToken && !t.revoked_at).sort((a, b) => b.created_at - a.created_at);
      return rows[0] ? { client_id: rows[0].client_id, google_account: rows[0].google_account } : null;
    },
    async getAccessToken(accessToken) {
      const row = state.tokens.find((t) => t.access_token === accessToken && t.expires_at > at() && !t.revoked_at);
      return row ? { ...row } : null;
    },
    async deleteAccessToken(accessToken) {
      state.tokens = state.tokens.filter((t) => t.access_token !== accessToken);
    },

    async touchAccessToken(accessToken) {
      const row = state.tokens.find((t) => t.access_token === accessToken);
      if (row && (!row.last_used_at || row.last_used_at.getTime() < clock() - 60 * 1000)) row.last_used_at = at();
    },
    async listConnections() {
      return state.tokens.filter((t) => t.expires_at > at())
        .sort((a, b) => b.created_at - a.created_at)
        .map((t) => ({
          token_prefix: t.access_token.slice(0, 8), client_id: t.client_id, client_name: state.clients.get(t.client_id)?.client_name ?? null,
          google_account: t.google_account, created_at: t.created_at, expires_at: t.expires_at, last_used_at: t.last_used_at, revoked_at: t.revoked_at
        }));
    },
    async revokeConnection(prefix) {
      const p = String(prefix || '');
      if (p.length < 8) return { revoked: 0, reason: 'too_short' };
      const found = state.tokens.filter((t) => t.access_token.startsWith(p));
      if (found.length === 0) return { revoked: 0, reason: 'not_found' };
      if (found.length > 1) return { revoked: 0, reason: 'ambiguous' };
      const { access_token, refresh_token } = found[0];
      let n = 0;
      for (const t of state.tokens) {
        if (!t.revoked_at && (t.access_token === access_token || (refresh_token && t.refresh_token === refresh_token))) { t.revoked_at = at(); n++; }
      }
      return { revoked: n };
    },

    async recordChange({ actingAs, connection, tool, target, summary, before, after, dryRun }) {
      const id = state.nextChangeId++;
      const copy = (v) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
      state.changes.push({ id, at: at(), acting_as: actingAs || null, connection: connection || null, tool, target: target || null, summary: summary || null, before: copy(before), after: copy(after), dry_run: !!dryRun });
      return id;
    },
    async listRecentChanges({ since, tool, actingAs, limit = 50 } = {}) {
      const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
      const from = since ? new Date(since).getTime() : null;
      return state.changes
        .filter((c) => (from === null || c.at.getTime() >= from) && (!tool || c.tool === tool) && (!actingAs || c.acting_as === norm(actingAs)))
        .sort((a, b) => (b.at - a.at) || (b.id - a.id))
        .slice(0, n);
    },

    async recordLoginAttempt(ip) {
      const id = String(state.nextAttemptId++);
      state.attempts.push({ id, ip, attempted_at: at(), success: false });
      return id;
    },
    async markLoginAttemptSucceeded(id) {
      const row = state.attempts.find((a) => a.id === String(id));
      if (row) row.success = true;
    },
    async countRecentFailedLogins(ip, minutes) {
      const since = clock() - minutes * 60 * 1000;
      return state.attempts.filter((a) => a.ip === ip && !a.success && a.attempted_at.getTime() > since).length;
    },

    // Test-only helper: put a pre-multi-account sign-in in place.
    __seedLegacyGoogleAuth(tokens) { state.legacyTokens = tokens; },
    __state: state
  };
  return api;
}
