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


  describe('P8-7 durable fixture reservation/recording',()=>{
   it('reserves exactly one provider operation, survives replays and prevents cross-connection association',async()=>{
     await db.initSchema();
     const id='71111111-2222-4333-8444-555555555555',opts={id,actingAs:'developer@example.test',connection:'test-conn',scenario:'files'};
     expect((await db.startDevRun(opts)).created).toBe(true);
     expect((await db.startDevRun(opts)).created).toBe(false);
     await expect(db.startDevRun({...opts,connection:'foreign'})).rejects.toThrow();
     const slot={runId:id,actingAs:opts.actingAs,connection:opts.connection,kind:'folder'};
     expect((await db.reserveDevStep(slot)).created).toBe(true);
     expect((await db.reserveDevStep(slot)).created).toBe(false);
     await expect(db.reserveDevStep({...slot,connection:'foreign'})).rejects.toThrow();
     await db.recordDevObject({...slot,googleId:'google-folder-1'});
     await db.recordDevObject({...slot,googleId:'google-folder-1'});
     await expect(db.recordDevObject({...slot,googleId:'google-folder-2'})).rejects.toThrow();
     await db.markDevStepRecorded({...slot,googleId:'google-folder-1'});
     const run=await db.getDevRun({runId:id,actingAs:opts.actingAs,connection:opts.connection});
     expect(run.steps).toMatchObject([{kind:'folder',state:'recorded',google_id:'google-folder-1'}]);
     expect(run.objects).toHaveLength(1);
     expect(await db.getDevRun({...slot,connection:'foreign'})).toBeNull();
     expect((await db.listDevRuns({actingAs:opts.actingAs,connection:opts.connection})).some(x=>x.id===id)).toBe(true);
     await rawQuery('DELETE FROM dev_run_objects WHERE run_id=$1',[id]);
     await rawQuery('DELETE FROM dev_run_steps WHERE run_id=$1',[id]);
     await rawQuery('DELETE FROM dev_runs WHERE id=$1',[id]);
   });
  });
  it('binds real-Postgres fixture creation to immutable intent without depending on JSON key order',async()=>{
    const id=crypto.randomUUID(),actingAs='intent@example.test',connection='intent-owner';
    const requestSpec={version:1,scenario:'calendar',calendarId:'owned-calendar',startAt:'2027-01-01T12:00:00.000Z'};
    const args={id,actingAs,connection,scenario:'calendar',calendarId:'owned-calendar',requestSpec};
    expect((await db.startDevRun(args)).created).toBe(true);
    expect((await db.startDevRun({...args,requestSpec:{startAt:requestSpec.startAt,calendarId:'owned-calendar',scenario:'calendar',version:1}})).created).toBe(false);
    await expect(db.startDevRun({...args,requestSpec:{...requestSpec,startAt:'2027-01-02T12:00:00.000Z'}})).rejects.toThrow(/immutable/);
    expect((await db.getDevRun({runId:id,actingAs,connection})).request_spec).toEqual(requestSpec);
    expect(await db.getDevRun({runId:id,actingAs,connection:'foreign'})).toBeNull();
  });
  describe('RTC hashed read-only passes and atomic limits',()=>{
    it('stores only a hash, honors revocation, and counts concurrent calls atomically',async()=>{
      await db.initSchema();
      await db.saveGoogleTokensFor('rtc-pass@example.test',{access_token:'fake-google-access'});
      process.env.RTC_TEST_ACCOUNT_EMAILS='rtc-pass@example.test';
      const {token,id}=await db.createRtcPass({googleAccount:'rtc-pass@example.test',rateLimit:120,hours:24});
      const active=await db.getRtcPass(token);
      expect(active).toMatchObject({id,profile:'read_only',mode:'test',allow_writes:false,rate_limit_per_minute:120});
      expect((await rawQuery('SELECT token_hash FROM rtc_passes WHERE id=$1',[id]))[0].token_hash).not.toBe(token);
      expect(JSON.stringify(await db.listConnections())).not.toContain(token);
      expect((await db.listConnections()).find(c=>c.connection_id===id)).toMatchObject({kind:'pass',token_prefix:id,google_account:'rtc-pass@example.test',revoked_at:null});
      const results=await Promise.all(Array.from({length:150},()=>db.chargeRtcPass(id,120)));
      expect(results.filter(Boolean)).toHaveLength(120);
      expect(results.filter(x=>!x)).toHaveLength(30);
      expect((await db.revokeConnection(id)).revoked).toBe(1);
      expect(await db.getRtcPass(token)).toBeNull();
      expect(await db.rtcPassFailureCode(token)).toBe('pass_revoked');
      expect((await db.listConnections()).find(c=>c.token_prefix===id)?.revoked_at).toBeTruthy();
      await rawQuery('DELETE FROM rtc_rate_limits WHERE pass_id=$1',[id]);
      await rawQuery('DELETE FROM rtc_passes WHERE id=$1',[id]);
    });
  });
  describe('RTC oversized result storage', () => {
    it('keeps handles private to the issuing connection and rejects expired records',async()=>{
      await db.initSchema();
      await db.storeRtcResult({handle:'test-result-handle',connection:'client-a',payload:{data:{messages:[1,2]},bytes:42}});
      expect(await db.getRtcResult('test-result-handle','client-a')).toMatchObject({bytes:42});
      expect(await db.getRtcResult('test-result-handle','client-b')).toBeNull();
      await rawQuery("UPDATE rtc_results SET expires_at=now()-interval '1 second' WHERE handle='test-result-handle'");
      expect(await db.getRtcResult('test-result-handle','client-a')).toBeNull();
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

    it('atomically keeps ciphertext equal to plaintext across competing dormant-mode refresh saves', async () => {
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test',tokens);
      await Promise.all([
        db.saveGoogleTokensFor('a@example.test',{access_token:'latest-a',id_token:'token-a'},{source:'refresh'}),
        db.saveGoogleTokensFor('a@example.test',{scope:'read-scope',expiry_date:45678},{source:'refresh'})
      ]);
      const current=await row('a@example.test');
      expect(current.tokens).toMatchObject({refresh_token:'fake-refresh-1',id_token:'token-a',scope:'read-scope',expiry_date:45678});
      const {decryptJson}=await import('../../src/crypto.js');
      expect(decryptJson(current.tokens_enc,Buffer.from(process.env.TOKEN_ENCRYPTION_KEY,'base64'))).toEqual(current.tokens);
      expect((await db.inspectGoogleTokenRetirement()).ready).toBe(true);
    });

    it('keeps retirement dormant on upgrade and denies unready/unauthorized activation', async () => {
      await reset();
      await db.initSchema();
      const state = await rawQuery('SELECT encrypted_only_at FROM google_token_storage WHERE id = true');
      expect(state).toHaveLength(1);
      expect(state[0].encrypted_only_at).toBeNull();
      expect(await columnsOf('google_accounts')).toEqual(expect.arrayContaining([
        'tokens_enc_verified_at','tokens_enc_refreshed_at'
      ]));
      await expect(db.activateGoogleTokenRetirement()).rejects.toThrow(/owner confirmation/i);
      await expect(db.activateGoogleTokenRetirement({ownerConfirmed:true})).rejects.toThrow(/Every Google account/);
      expect((await rawQuery('SELECT encrypted_only_at FROM google_token_storage WHERE id = true'))[0].encrypted_only_at).toBeNull();
    });

    it('requires all accounts to have verifiable encrypted backfill AND actual refresh evidence', async () => {
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test', tokens);
      await db.saveGoogleTokensFor('b@example.test', tokens);
      let report = await db.inspectGoogleTokenRetirement();
      expect(report).toMatchObject({encryptedOnly:false,accountsChecked:2,ready:false,problems:{refreshNotObserved:2}});
      expect(JSON.stringify(report)).not.toContain('fake-');
      await db.saveGoogleTokensFor('a@example.test',{access_token:'refreshed-a'},{source:'refresh'});
      report = await db.inspectGoogleTokenRetirement();
      expect(report.problems.refreshNotObserved).toBe(1);
      await db.saveGoogleTokensFor('b@example.test',{access_token:'refreshed-b'},{source:'refresh'});
      expect((await db.inspectGoogleTokenRetirement()).ready).toBe(true);
      await rawQuery("UPDATE google_accounts SET tokens_enc='v1:damaged' WHERE email='b@example.test'");
      expect((await db.inspectGoogleTokenRetirement()).problems.corruptOrStale).toBe(1);
      expect((await db.inspectGoogleTokenRetirement()).ready).toBe(false);
      await expect(db.activateGoogleTokenRetirement({ownerConfirmed:true})).rejects.toThrow(/intact encrypted backfill/);
    });

    it('activates on readiness without a calendar delay and remains idempotent',async()=>{
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test',tokens);
      await db.saveGoogleTokensFor('a@example.test',{access_token:'refreshed'},{source:'refresh'});
      expect((await db.inspectGoogleTokenRetirement()).notBefore).toBeNull();
      expect(await db.activateGoogleTokenRetirement({ownerConfirmed:true})).toEqual({activated:true,alreadyActive:false});
      expect(await db.activateGoogleTokenRetirement({ownerConfirmed:true})).toEqual({activated:false,alreadyActive:true});
      expect(await db.getGoogleTokensFor('a@example.test')).toMatchObject({access_token:'refreshed'});
      expect((await db.inspectGoogleTokenRetirement()).plaintextAccounts).toBe(1);
      await db.saveGoogleTokensFor('a@example.test',{access_token:'encrypted-refresh'},{source:'refresh'});
      expect((await db.inspectGoogleTokenRetirement()).plaintextAccounts).toBe(0);
    });

    it('retires only the matched legacy copy on actual next refresh and keeps its table',async()=>{
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test',tokens,{source:'refresh'});
      await db.saveGoogleTokensFor('b@example.test',{access_token:'other',refresh_token:'other-refresh'},{source:'refresh'});
      await rawQuery('INSERT INTO google_auth (id,tokens) VALUES (1,$1::jsonb) ON CONFLICT (id) DO UPDATE SET tokens=EXCLUDED.tokens',[JSON.stringify(tokens)]);
      await db.activateGoogleTokenRetirement({ownerConfirmed:true});
      expect((await db.inspectGoogleTokenRetirement()).legacyPlaintextCopies).toBe(1);
      await db.saveGoogleTokensFor('b@example.test',{access_token:'other-new'},{source:'refresh'});
      expect((await db.inspectGoogleTokenRetirement()).legacyPlaintextCopies).toBe(1);
      await db.saveGoogleTokensFor('a@example.test',{access_token:'updated'});
      expect((await db.inspectGoogleTokenRetirement()).legacyPlaintextCopies).toBe(1);
      await db.saveGoogleTokensFor('a@example.test',{access_token:'renewed',refresh_token:'rotated'},{source:'refresh'});
      expect((await db.inspectGoogleTokenRetirement()).legacyPlaintextCopies).toBe(0);
      expect((await rawQuery('SELECT tokens FROM google_auth WHERE id=1'))[0].tokens).toEqual({});
      expect(await db.getGoogleTokensFor('a@example.test')).toMatchObject({refresh_token:'rotated'});
      await rawQuery('DELETE FROM google_accounts');
      expect(await db.migrateLegacyGoogleAuth(async()=>{throw Error('cleared credential must not migrate');})).toBeNull();
    });

    it('uses ciphertext as authority after activation, merges partial refreshes, and clears only the updated plaintext row',async()=>{
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test',tokens);
      await db.saveGoogleTokensFor('b@example.test',tokens);
      // Synthetic future mode ONLY inside disposable test schema: real activation
      // still requires owner and real refresh evidence.
      await rawQuery("UPDATE google_token_storage SET encrypted_only_at=now() WHERE id=true");
      const prior=await row('a@example.test');
      await rawQuery("UPDATE google_accounts SET tokens='{\"access_token\":\"stale-plaintext\"}'::jsonb WHERE email='a@example.test'");
      expect(await db.getGoogleTokensFor('a@example.test')).toEqual(tokens);
      await db.saveGoogleTokensFor('a@example.test',{access_token:'new-access'},{source:'refresh'});
      expect((await row('a@example.test')).tokens).toEqual({});
      expect((await row('b@example.test')).tokens).toEqual(tokens);
      expect(await db.getGoogleTokensFor('a@example.test')).toEqual({access_token:'new-access',refresh_token:'fake-refresh-1'});
      expect((await row('a@example.test')).tokens_enc).not.toEqual(prior.tokens_enc);
      const newRow='new@example.test';
      await db.saveGoogleTokensFor(newRow,{access_token:'fresh',refresh_token:'only'});
      expect((await row(newRow)).tokens).toEqual({});
      expect(await db.getGoogleTokensFor(newRow)).toMatchObject({refresh_token:'only'});
    });

    it('never falls back to plaintext with an absent or wrong key once encrypted-only is active',async()=>{
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test',tokens);
      await rawQuery("UPDATE google_token_storage SET encrypted_only_at=now() WHERE id=true");
      const original=await row('a@example.test');
      delete process.env.TOKEN_ENCRYPTION_KEY;
      await expect(db.getGoogleTokensFor('a@example.test')).rejects.toThrow(/Encrypted Google tokens unavailable/);
      await expect(db.saveGoogleTokensFor('a@example.test',{access_token:'unsafe'})).rejects.toThrow(/valid TOKEN_ENCRYPTION_KEY/);
      process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
      await expect(db.getGoogleTokensFor('a@example.test')).rejects.toThrow(/integrity check failed/);
      await expect(db.saveGoogleTokensFor('a@example.test',{access_token:'unsafe'})).rejects.toThrow(/integrity check failed/);
      expect(await row('a@example.test')).toEqual(original);
    });

    it('reconciles concurrent encrypted-only refresh saves without losing new fields or the original refresh token',async()=>{
      await reset();
      process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
      await db.saveGoogleTokensFor('a@example.test',tokens);
      await rawQuery("UPDATE google_token_storage SET encrypted_only_at=now() WHERE id=true");
      await Promise.all([
        db.saveGoogleTokensFor('a@example.test',{access_token:'renewed-a',id_token:'id-a'},{source:'refresh'}),
        db.saveGoogleTokensFor('a@example.test',{scope:'scope-b',expiry_date:12345},{source:'refresh'})
      ]);
      const actual=await db.getGoogleTokensFor('a@example.test');
      expect(actual).toMatchObject({refresh_token:'fake-refresh-1',id_token:'id-a',scope:'scope-b',expiry_date:12345});
      expect((await row('a@example.test')).tokens).toEqual({});
    });

    afterEach(async()=> {
      // Only synthetic mode changes in our disposable schema; never real deployment state.
      await rawQuery('UPDATE google_token_storage SET encrypted_only_at=NULL WHERE id=true');
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

  describe('P8-2 connection-settings source schema and real token refresh continuity',()=>{
    it('rejects a new policy column until both issuing schemas and the central copy list are revised',async()=>{
      await db.initSchema();
      const {CONNECTION_SETTINGS_FIELDS}=await import('../../src/oauth/connection-settings.js');
      const tokenSession=new Set(['access_token','refresh_token','client_id','google_account',
        'expires_at','created_at','last_used_at','revoked_at']);
      const codeSession=new Set(['code','client_id','redirect_uri','code_challenge',
        'code_challenge_method','google_account','expires_at','used']);
      const tokens=await columnsOf('oauth_tokens');
      const codes=await columnsOf('oauth_codes');
      // Every non-session column is a declared connection setting, and every
      // declared setting exists in both tables. A future additive DB setting
      // MUST be included in the shared issuing/refresh copy before CI passes.
      expect(tokens.filter(k=>!tokenSession.has(k)).sort())
        .toEqual([...CONNECTION_SETTINGS_FIELDS].sort());
      expect(codes.filter(k=>!codeSession.has(k)).sort())
        .toEqual([...CONNECTION_SETTINGS_FIELDS].sort());
    });
    it('retains read_only/compact/areas through an actual Postgres token refresh',async()=>{
      await db.initSchema();
      const {connectionPolicyToDb,verifyPolicyCopy}=await import('../../src/oauth/connection-settings.js');
      const source={profile:'read_only',listing:'compact',areas:['mail','calendar']};
      const first='p8-2-access-original',next='p8-2-access-refreshed';
      const refresh='p8-2-refresh';
      const opts={refreshToken:refresh,clientId:'p8-2-client',
        googleAccount:'ops@example.test'};
      await db.createAccessToken({accessToken:first,...opts,...source});
      const issued=await db.getTokenByRefreshToken(refresh);
      expect(connectionPolicyToDb(issued)).toEqual(source);
      await db.createAccessToken({accessToken:next,...opts,
        ...connectionPolicyToDb(issued)});
      const actual=await db.getAccessToken(next);
      expect(verifyPolicyCopy(source,actual)).toBe(true);
      expect(actual.google_account).toBe('ops@example.test');
      expect(actual.profile).toBe('read_only');
      expect(actual.areas).toEqual(['mail','calendar']);
      // Verify the original and refresh are bound to the same client account
      // and no privileged 'full' token was minted as a side effect.
      const rows=await rawQuery(`SELECT access_token,client_id,google_account,profile,listing,areas
        FROM oauth_tokens WHERE access_token IN ($1,$2) ORDER BY access_token`,[first,next]);
      expect(rows).toHaveLength(2);
      expect(rows.every(x=>x.profile==='read_only'&&x.listing==='compact'&&
        x.google_account==='ops@example.test'&&x.client_id==='p8-2-client')).toBe(true);
      await rawQuery('DELETE FROM oauth_tokens WHERE access_token IN ($1,$2)',[first,next]);
    });
  });

  runDbContract('real Postgres', {
    makeDb: async () => {
      await rawQuery(`TRUNCATE google_accounts, google_auth, oauth_clients, oauth_codes, oauth_tokens, login_attempts, change_log, business_resources`);
      return db;
    },
    seedLegacy: async (_db, tokens) => { await rawQuery(`INSERT INTO google_auth (id, tokens) VALUES (1, $1::jsonb)`, [JSON.stringify(tokens)]); }
  });
  it('isolates exact undo entries by account and connection', async()=>{
    await db.initSchema();
    const id=await db.recordChange({actingAs:'owner@example.test',connection:'undo-c',tool:'gmail_update_label',target:'Label_1',before:{name:'old'},after:{name:'new'}});
    expect(Number.isSafeInteger(id)).toBe(true);
    expect((await db.getOwnedChange(Number(id),'OWNER@example.test','undo-c')).target).toBe('Label_1');
    expect(await db.getOwnedChange(Number(id),'other@example.test','undo-c')).toBeNull();
    expect(await db.getOwnedChange(Number(id),'owner@example.test','other')).toBeNull();
    expect(await db.getOwnedChange(-1,'owner@example.test','undo-c')).toBeNull();
  });


 it('stores explicit TEST write settings and Toolkit eligibility with additive migration',async()=>{
  await db.initSchema();await db.initSchema();
  await db.saveGoogleTokensFor('write-pass@example.test',{access_token:'fake'});process.env.RTC_TEST_ACCOUNT_EMAILS='write-pass@example.test';
  await expect(db.createRtcPass({googleAccount:'write-pass@example.test',allowWrites:true,areas:['mail']})).rejects.toThrow('confirmation');
  const {token,id}=await db.createRtcPass({googleAccount:'write-pass@example.test',allowWrites:true,confirmedAccount:'write-pass@example.test',areas:['workspace','mail'],hours:1});
  expect(await db.getRtcPass(token)).toMatchObject({mode:'test',profile:'full',allow_writes:true,for_hub:false,areas:['workspace','mail']});
  expect((await db.listRtcPasses()).find(p=>p.connection_id===id)).toMatchObject({allow_writes:true,for_hub:false});
  await rawQuery('UPDATE rtc_passes SET expires_at=now()-interval \'1 second\' WHERE id=$1',[id]);
  expect(await db.getRtcPass(token)).toBeNull();
  const hub=await db.createRtcPass({googleAccount:'write-pass@example.test',forHub:true,hours:8760});
  expect(await db.getRtcPass(hub.token)).toMatchObject({for_hub:true,allow_writes:false,profile:'read_only'});
  await db.revokeRtcPass(hub.id);expect(await db.getRtcPass(hub.token)).toBeNull();
 });

});
