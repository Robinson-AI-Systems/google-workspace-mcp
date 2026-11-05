// Database tests: the S-1 store transport (src/db-transport.js) carrying
// the REAL src/db.js against a plain Postgres — no neon-module mock, no
// adapter substitution. STORE_TRANSPORT=pg is declared, DATABASE_URL
// points at a disposable schema on a localhost Postgres, and the whole
// store layer (both schema initializers, all 28 tables) must work
// through the pooled pg handle exactly as it works through the Neon
// driver on Vercel. Fixture data only; the schema is dropped afterwards.
// Without TEST_DATABASE_URL the tests are reported as SKIPPED, not passed.
import crypto from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const base = process.env.TEST_DATABASE_URL;
if (!base) console.warn('\n[test:db] TEST_DATABASE_URL is not set: store-transport tests are SKIPPED, not passed.\n');

// The reconciliation universe (dossier §2.2): every table the two schema
// initializers create.
const EXPECTED_TABLES = [
  'google_auth', 'oauth_clients', 'oauth_codes', 'oauth_tokens',
  'oauth_refresh_revocations', 'google_accounts', 'google_token_storage',
  'login_attempts', 'rtc_results', 'rtc_passes', 'rtc_rate_limits',
  'change_log', 'business_resources', 'dev_runs', 'dev_run_objects',
  'dev_run_steps',
  'principals', 'principal_google_identities', 'principal_google_accounts',
  'principal_defaults', 'principal_legacy_accounts', 'user_sessions',
  'user_oauth_transactions', 'principal_oauth_codes', 'principal_connections',
  'principal_refresh_uses', 'principal_deletion_requests',
  'principal_delegations'
];

describe.skipIf(!base)('store transport (real plain Postgres, pg driver)', () => {
  let admin, schema, storeUrl, db, transport, priorUrl, priorTransport;

  beforeAll(async () => {
    const url = new URL(base);
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) {
      throw new Error('Only isolated localhost Postgres is permitted for the transport proof.');
    }
    admin = new pg.Client({ connectionString: base });
    await admin.connect();
    schema = `gwmcp_transport_${crypto.randomBytes(6).toString('hex')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    storeUrl = url.toString();
    priorUrl = process.env.DATABASE_URL;
    priorTransport = process.env.STORE_TRANSPORT;
    process.env.DATABASE_URL = storeUrl;
    process.env.STORE_TRANSPORT = 'pg';
    transport = await import('../../src/db-transport.js');
    db = await import('../../src/db.js');
    await db.initSchema();
  });

  afterAll(async () => {
    try { await transport.storeSql(storeUrl).end(); } catch { /* pool already ended */ }
    if (priorUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorUrl;
    if (priorTransport === undefined) delete process.env.STORE_TRANSPORT; else process.env.STORE_TRANSPORT = priorTransport;
    if (admin) {
      try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); }
    }
  });

  it('creates every store table through the pg handle', async () => {
    const sql = transport.storeSql(storeUrl);
    const rows = await sql.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1', [schema]);
    const names = rows.map((r) => r.table_name);
    for (const table of EXPECTED_TABLES) expect(names).toContain(table);
    const sequences = await sql.query(
      'SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = $1', [schema]);
    expect(sequences.length).toBeGreaterThanOrEqual(2);
  });

  it('round-trips a registration through src/db.js on the pg transport', async () => {
    await db.createOAuthClient({
      clientId: 'transport-fixture', clientSecret: 'fixture-secret',
      redirectUris: ['https://example.test/cb'], clientName: 'Transport fixture'
    });
    const got = await db.getOAuthClient('transport-fixture');
    expect(got.client_name).toBe('Transport fixture');
    expect(got.redirect_uris).toEqual(['https://example.test/cb']);
    const listed = await db.listOAuthClients();
    const row = listed.find((r) => r.client_id === 'transport-fixture');
    expect(row.has_secret).toBe(true);
    expect(row.token_count).toBe(0);
    const removed = await db.deleteOAuthClient('transport-fixture');
    expect(removed.deleted).toBe(true);
    expect(await db.getOAuthClient('transport-fixture')).toBeNull();
  });

  it('round-trips a fixture Google account and the change log', async () => {
    await db.saveGoogleTokensFor('fixture@example.test',
      { access_token: 'fixture-access', refresh_token: 'fixture-refresh' },
      { label: 'Transport fixture' });
    expect(await db.getDefaultGoogleAccount()).toBe('fixture@example.test');
    const tokens = await db.getGoogleTokensFor('fixture@example.test');
    expect(tokens.access_token).toBe('fixture-access');
    const accounts = await db.listGoogleAccounts();
    expect(accounts.map((a) => a.email)).toContain('fixture@example.test');
    const id = await db.recordChange({
      actingAs: 'fixture@example.test', connection: 'fixture', tool: 'transport_fixture',
      target: 'fixture', summary: 'transport proof'
    });
    expect(Number.isSafeInteger(id) && id >= 1).toBe(true);
    const changes = await db.listRecentChanges({ tool: 'transport_fixture' });
    expect(changes.some((c) => Number(c.id) === id)).toBe(true);
  });
});
