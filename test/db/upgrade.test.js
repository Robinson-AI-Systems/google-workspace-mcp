// Database tests: the real src/db.js against a real Postgres.
//   TEST_DATABASE_URL=postgres://... npm run test:db
// Any Postgres works, including a Neon branch. Every run works inside its own
// throwaway schema and drops it at the end, so existing tables and data are
// never read or changed. Without TEST_DATABASE_URL the tests are reported as
// SKIPPED (visible in the summary), not silently passed.
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { runDbContract } from '../contract/db-contract.js';
import { openIsolatedSchema, closeIsolatedSchema, rawQuery, neonShapedQuery } from '../helpers/pg-neon-adapter.js';

vi.mock('@neondatabase/serverless', async () => {
  const adapter = await import('../helpers/pg-neon-adapter.js');
  return { neon: () => adapter.neonShapedQuery() };
});

const url = process.env.TEST_DATABASE_URL;
if (!url) console.warn('\n[test:db] TEST_DATABASE_URL is not set: database tests are SKIPPED, not passed.\n');

describe.skipIf(!url)('database (real Postgres)', () => {
  let db;
  const OLD_SCHEMA_SQL = [
    // The tables exactly as they were before multi-account support (2026-09-30).
    `CREATE TABLE google_auth (id INTEGER PRIMARY KEY DEFAULT 1, tokens JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT single_row CHECK (id = 1))`,
    `CREATE TABLE oauth_clients (client_id TEXT PRIMARY KEY, client_secret TEXT, redirect_uris JSONB NOT NULL, client_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE TABLE oauth_codes (code TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT, code_challenge_method TEXT, expires_at TIMESTAMPTZ NOT NULL, used BOOLEAN NOT NULL DEFAULT false)`,
    `CREATE TABLE oauth_tokens (access_token TEXT PRIMARY KEY, refresh_token TEXT, client_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  ];
  const columnsOf = async (table) => (await rawQuery(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY column_name`, [table])).map((r) => r.column_name);

  beforeAll(async () => {
    process.env.DATABASE_URL = url; // src/db.js insists on it being set; the mocked neon() above ignores the value
    await openIsolatedSchema(url);
    db = await import('../../src/db.js');
  });
  afterAll(async () => { await closeIsolatedSchema(); });

  describe('upgrading an older database in place', () => {
    it('adds the new columns and tables without touching existing rows, and a second run changes nothing', async () => {
      for (const statement of OLD_SCHEMA_SQL) await rawQuery(statement);
      await rawQuery(`INSERT INTO google_auth (id, tokens) VALUES (1, $1::jsonb)`, [JSON.stringify({ access_token: 'old-a', refresh_token: 'old-r' })]);
      await rawQuery(`INSERT INTO oauth_clients (client_id, redirect_uris) VALUES ('old-client', '["https://example.test/cb"]'::jsonb)`);
      await rawQuery(`INSERT INTO oauth_tokens (access_token, refresh_token, client_id, expires_at) VALUES ('old-at', 'old-rt', 'old-client', now() + interval '1 day')`);

      await db.initSchema();
      const afterFirst = { tokens: await columnsOf('oauth_tokens'), codes: await columnsOf('oauth_codes'), accounts: await columnsOf('google_accounts'), attempts: await columnsOf('login_attempts') };
      await db.initSchema();
      const afterSecond = { tokens: await columnsOf('oauth_tokens'), codes: await columnsOf('oauth_codes'), accounts: await columnsOf('google_accounts'), attempts: await columnsOf('login_attempts') };

      expect(afterSecond).toEqual(afterFirst);
      expect(afterFirst.tokens).toContain('google_account');
      expect(afterFirst.tokens).toEqual(expect.arrayContaining(['last_used_at', 'revoked_at']));
      expect(await columnsOf('change_log')).toEqual(['acting_as', 'after', 'at', 'before', 'connection', 'dry_run', 'id', 'summary', 'target', 'tool']);
      expect(afterFirst.accounts).toContain('allowed_domains');
      expect(afterFirst.codes).toContain('google_account');
      expect(afterFirst.attempts).toEqual(['attempted_at', 'id', 'ip', 'success']);

      // Old rows are intact, and old-style code (which only knows the old columns) still works.
      expect((await rawQuery(`SELECT tokens FROM google_auth WHERE id = 1`))[0].tokens).toEqual({ access_token: 'old-a', refresh_token: 'old-r' });
      expect((await db.getAccessToken('old-at')).google_account).toBeNull();
      expect((await db.getTokenByRefreshToken('old-rt')).client_id).toBe('old-client');
      expect(await rawQuery(`SELECT access_token FROM oauth_tokens WHERE access_token = 'old-at'`)).toHaveLength(1);
    });

    it('migrates the legacy sign-in on that older database and leaves the legacy row in place', async () => {
      const email = await db.migrateLegacyGoogleAuth(async (tokens) => {
        expect(tokens.refresh_token).toBe('old-r');
        return 'OPS@Example.test';
      });
      expect(email).toBe('ops@example.test');
      expect((await rawQuery(`SELECT count(*)::int AS n FROM google_auth`))[0].n).toBe(1);
      expect(await db.migrateLegacyGoogleAuth(async () => { throw new Error('must not run twice'); })).toBeNull();
    });
  });

  describe('lockout window', () => {
    it('stops counting failures older than the window', async () => {
      await rawQuery(`DELETE FROM login_attempts`);
      await rawQuery(`INSERT INTO login_attempts (ip, attempted_at, success) VALUES ('9.9.9.9', now() - interval '16 minutes', false), ('9.9.9.9', now() - interval '14 minutes', false)`);
      expect(await db.countRecentFailedLogins('9.9.9.9', 15)).toBe(1);
      expect(await db.countRecentFailedLogins('9.9.9.9', 20)).toBe(2);
    });
  });

  describe('encrypted Google tokens', () => {
    const tokens = { access_token: 'fake-access-1', refresh_token: 'fake-refresh-1' };
    const row = async (email) => (await rawQuery(`SELECT tokens, tokens_enc FROM google_accounts WHERE email = $1`, [email]))[0];
    const reset = async () => { await rawQuery(`DELETE FROM google_accounts`); };
    afterEach(() => { delete process.env.TOKEN_ENCRYPTION_KEY; });

    it('adds the encrypted column additively and keeps writing the plain copy for older code', async () => {
      await db.initSchema();
      expect(await columnsOf('google_accounts')).toContain('tokens_enc');
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test', tokens);
      const r = await row('a@example.test');
      expect(r.tokens).toEqual(tokens);               // older code reading only `tokens` still works
      expect(r.tokens_enc).toMatch(/^v1:/);
      expect(await db.getGoogleTokensFor('a@example.test')).toEqual(tokens);
    });

    it('merges a later refresh into both copies and the encrypted copy follows', async () => {
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test', tokens);
      await db.saveGoogleTokensFor('a@example.test', { access_token: 'fake-access-2' });
      const merged = { access_token: 'fake-access-2', refresh_token: 'fake-refresh-1' };
      expect((await row('a@example.test')).tokens).toEqual(merged);
      expect(await db.getGoogleTokensFor('a@example.test')).toEqual(merged);
    });

    it('fills in the encrypted copy for existing accounts on first read once a key is set', async () => {
      await reset();
      await db.saveGoogleTokensFor('old@example.test', tokens);       // saved before encryption existed
      await db.saveGoogleTokensFor('old2@example.test', tokens);
      expect((await row('old@example.test')).tokens_enc).toBeNull();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      expect(await db.getGoogleTokensFor('old@example.test')).toEqual(tokens);
      expect(await db.getGoogleTokensFor('old2@example.test')).toEqual(tokens);
      expect((await row('old@example.test')).tokens_enc).toMatch(/^v1:/);
      expect((await row('old2@example.test')).tokens_enc).toMatch(/^v1:/);
    });

    it('without a key it behaves as before, and clears a stale encrypted copy instead of serving it', async () => {
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test', tokens);
      delete process.env.TOKEN_ENCRYPTION_KEY;
      await db.saveGoogleTokensFor('a@example.test', { access_token: 'fake-access-3' });
      expect((await row('a@example.test')).tokens_enc).toBeNull();
      expect((await db.getGoogleTokensFor('a@example.test')).access_token).toBe('fake-access-3');
    });

    it('a save made by older code (plain copy only) is never hidden behind a stale encrypted copy', async () => {
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test', tokens);
      expect((await row('a@example.test')).tokens_enc).toMatch(/^v1:/);
      // What the previous version of the server does on a refresh or re-sign-in: touches only `tokens`.
      await rawQuery(`UPDATE google_accounts SET tokens = tokens || '{"access_token":"fake-from-old-code","refresh_token":"fake-rotated"}'::jsonb WHERE email = 'a@example.test'`);
      const got = await db.getGoogleTokensFor('a@example.test');
      expect(got).toEqual({ access_token: 'fake-from-old-code', refresh_token: 'fake-rotated' });
      // ...and the encrypted copy has caught up, so the next read is served from it.
      const healed = await row('a@example.test');
      expect(healed.tokens_enc).toMatch(/^v1:/);
      const { decryptJson } = await import('../../src/crypto.js');
      expect(decryptJson(healed.tokens_enc, Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'base64'))).toEqual(got);
    });

    it('a save clears the encrypted copy first, so a failed re-encrypt can only mean "not encrypted yet"', async () => {
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test', tokens);
      process.env.TOKEN_ENCRYPTION_KEY = 'not-a-valid-key'; // makes the encrypted step a no-op
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await db.saveGoogleTokensFor('a@example.test', { access_token: 'fake-access-9' });
      warn.mockRestore();
      expect((await row('a@example.test')).tokens_enc).toBeNull();
    });

    it('the encrypted copy really holds the tokens (decrypts to exactly the plain copy)', async () => {
      await reset();
      const key = crypto.randomBytes(32);
      process.env.TOKEN_ENCRYPTION_KEY = key.toString('base64');
      await db.saveGoogleTokensFor('a@example.test', tokens);
      const { decryptJson } = await import('../../src/crypto.js');
      expect(decryptJson((await row('a@example.test')).tokens_enc, key)).toEqual(tokens);
    });

    it('a damaged or wrong-key encrypted copy never crashes a read: it warns and uses the plain copy', async () => {
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test', tokens);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await rawQuery(`UPDATE google_accounts SET tokens_enc = 'v1:AAAA:AAAA:AAAA' WHERE email = 'a@example.test'`);
      expect(await db.getGoogleTokensFor('a@example.test')).toEqual(tokens);
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64'); // a different key
      await db.saveGoogleTokensFor('b@example.test', tokens);
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      const rotatedKey = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'base64');
      expect(await db.getGoogleTokensFor('b@example.test')).toEqual(tokens);
      const { decryptJson } = await import('../../src/crypto.js');
      expect(decryptJson((await row('b@example.test')).tokens_enc, rotatedKey)).toEqual(tokens); // healed to the new key
      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain('fake-');
      warn.mockRestore();
    });
  });

  describe('attempt-log housekeeping', () => {
    it('removes every attempt older than a day when a new attempt is recorded, and keeps recent ones', async () => {
      await rawQuery(`DELETE FROM login_attempts`);
      await rawQuery(`INSERT INTO login_attempts (ip, attempted_at, success) VALUES ('7.7.7.7', now() - interval '2 days', false), ('7.7.7.7', now() - interval '2 hours', false), ('8.8.4.4', now() - interval '2 days', false), ('8.8.4.4', now() - interval '1 minute', false)`);
      await db.recordLoginAttempt('7.7.7.7');
      const rows = await rawQuery(`SELECT ip, count(*)::int AS n FROM login_attempts GROUP BY ip ORDER BY ip`);
      expect(rows).toEqual([{ ip: '7.7.7.7', n: 2 }, { ip: '8.8.4.4', n: 1 }]);
    });
  });

  runDbContract('real Postgres', {
    makeDb: async () => {
      await rawQuery(`TRUNCATE google_accounts, google_auth, oauth_clients, oauth_codes, oauth_tokens, login_attempts, change_log`);
      return db;
    },
    seedLegacy: async (_db, tokens) => { await rawQuery(`INSERT INTO google_auth (id, tokens) VALUES (1, $1::jsonb)`, [JSON.stringify(tokens)]); }
  });
});
