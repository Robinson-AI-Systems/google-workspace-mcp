// End-to-end check of the multi-account database upgrade. Run it against a
// THROWAWAY Neon branch copied from production, never production itself:
//   DATABASE_URL="<branch connection string>" node scripts/test-db-upgrade.mjs
// It expects the copy to still hold the single legacy Google sign-in, and it
// never calls Google: the mailbox lookup is stubbed.
import * as db from '../src/db.js';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL to a throwaway branch first.');
  process.exit(2);
}
const q = neon(process.env.DATABASE_URL);
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok  -', m); };

// 0. What the copy looks like before the upgrade
const before = await q`SELECT (SELECT count(*)::int FROM google_auth) AS legacy, (SELECT count(*)::int FROM oauth_tokens) AS conns`;
console.log('before:', before[0]);
assert(before[0].legacy === 1, 'exactly one legacy Google sign-in exists on the copy');

// 1. Schema upgrade is additive and idempotent
await db.initSchema(); await db.initSchema();
const cols = await q`SELECT column_name FROM information_schema.columns WHERE table_name = 'oauth_tokens' AND column_name = 'google_account'`;
assert(cols.length === 1, 'oauth_tokens gained google_account column');

// 2. Migration copies the legacy tokens under the email we resolve
const legacyTokens = (await q`SELECT tokens FROM google_auth WHERE id = 1`)[0].tokens;
const migrated = await db.migrateLegacyGoogleAuth(async (t) => {
  assert(t.refresh_token === legacyTokens.refresh_token, 'migration hands the real tokens to the resolver');
  return 'OPS@RobinsonAISystems.com';
});
assert(migrated === 'ops@robinsonaisystems.com', 'migration normalizes the email');
assert((await q`SELECT count(*)::int AS n FROM google_auth`)[0].n === 1, 'legacy row is kept so old code keeps working');
const again = await db.migrateLegacyGoogleAuth(async () => { throw new Error('should not be called'); });
assert(again === null, 'second migration is a no-op');
const acct = (await q`SELECT * FROM google_accounts`)[0];
assert(acct.is_default === true && JSON.stringify(acct.tokens) === JSON.stringify(legacyTokens), 'migrated account is default and tokens are identical');

// 3. Old connections (no account) resolve to the default
assert((await db.getGoogleTokens()).refresh_token === legacyTokens.refresh_token, 'legacy getGoogleTokens() returns the default account tokens');

// 4. A second account, token merging on refresh
await db.saveGoogleTokensFor('ops@robinsonappliancerentals.com', { access_token: 'a1', refresh_token: 'r1' }, { label: 'Appliance Rentals' });
await db.saveGoogleTokensFor('ops@robinsonappliancerentals.com', { access_token: 'a2' });
const t2 = await db.getGoogleTokensFor('ops@robinsonappliancerentals.com');
assert(t2.access_token === 'a2' && t2.refresh_token === 'r1', 'refresh merges: new access token, refresh token kept');
const list = await db.listGoogleAccounts();
assert(list.length === 2 && list[0].email === 'ops@robinsonaisystems.com' && list[0].is_default, 'two accounts, the original is still default');
assert(!('tokens' in list[0]), 'listing never exposes tokens');

// 5. Connector login carries the chosen account through code -> token -> refresh
await db.createAuthCode({ code: 'test-c1', clientId: 'test-client', redirectUri: 'https://example.invalid/cb', googleAccount: 'ops@robinsonappliancerentals.com' });
const rec = await db.consumeAuthCode('test-c1');
assert(rec.google_account === 'ops@robinsonappliancerentals.com', 'auth code stores the account');
await db.createAccessToken({ accessToken: 'test-at1', refreshToken: 'test-rt1', clientId: 'test-client', googleAccount: rec.google_account });
assert((await db.getAccessToken('test-at1')).google_account === 'ops@robinsonappliancerentals.com', 'access token carries the account');
assert((await db.getTokenByRefreshToken('test-rt1'))?.google_account === 'ops@robinsonappliancerentals.com', 'refresh keeps the account');
assert((await db.getTokenByRefreshToken('never-issued')) === null, 'unknown refresh tokens are rejected');
await db.createAccessToken({ accessToken: 'test-at0', clientId: 'test-client' });
assert((await db.getAccessToken('test-at0')).google_account === null, 'an old-style connection has no account (=> default)');

// 6. Default switch and removal
await db.setDefaultGoogleAccount('ops@robinsonappliancerentals.com');
assert((await db.getDefaultGoogleAccount()) === 'ops@robinsonappliancerentals.com', 'default can be switched');
await db.setDefaultGoogleAccount('ops@robinsonaisystems.com');
await db.removeGoogleAccount('ops@robinsonappliancerentals.com');
assert((await db.listGoogleAccounts()).length === 1, 'account removal works');
let threw = false;
try { await db.setDefaultGoogleAccount('nobody@example.invalid'); } catch { threw = true; }
assert(threw, 'setting an unknown default is refused');

console.log('\nALL PASSED');
