// Database tests: the real src/db.js against a real Postgres.
//   TEST_DATABASE_URL=postgres://... npm run test:db
// Any Postgres works, including a Neon branch. Every run works inside its own
// throwaway schema and drops it at the end, so existing tables and data are
// never read or changed. Without TEST_DATABASE_URL the tests are reported as
// SKIPPED (visible in the summary), not silently passed.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

  runDbContract('real Postgres', {
    makeDb: async () => {
      await rawQuery(`TRUNCATE google_accounts, google_auth, oauth_clients, oauth_codes, oauth_tokens, login_attempts`);
      return db;
    },
    seedLegacy: async (_db, tokens) => { await rawQuery(`INSERT INTO google_auth (id, tokens) VALUES (1, $1::jsonb)`, [JSON.stringify(tokens)]); }
  });
});
