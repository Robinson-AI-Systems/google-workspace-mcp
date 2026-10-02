// One set of behavior checks for the database layer, run against BOTH the
// in-memory fake (npm test) and a real Postgres (npm run test:db). If the fake
// ever disagrees with the real thing, one of the two runs fails.
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * @param label        name shown in the test report
 * @param makeDb       async () => a db module with an EMPTY database behind it
 * @param seedLegacy   async (db, tokens) => put a pre-multi-account sign-in in place
 */
export function runDbContract(label, { makeDb, seedLegacy }) {
  describe(`database contract (${label})`, () => {
    let db;
    beforeEach(async () => { db = await makeDb(); });

    describe('google accounts', () => {
      it('makes the first account the default and keeps later ones non-default', async () => {
        await db.saveGoogleTokensFor('first@example.test', { access_token: 'a' }, { label: 'First' });
        await db.saveGoogleTokensFor('second@example.test', { access_token: 'b' });
        const list = await db.listGoogleAccounts();
        expect(list.map((a) => a.email)).toEqual(['first@example.test', 'second@example.test']);
        expect(list.map((a) => a.is_default)).toEqual([true, false]);
        expect(await db.getDefaultGoogleAccount()).toBe('first@example.test');
      });

      it('never lists tokens', async () => {
        await db.saveGoogleTokensFor('first@example.test', { access_token: 'secret-a', refresh_token: 'secret-r' });
        for (const row of await db.listGoogleAccounts()) expect(Object.keys(row)).not.toContain('tokens');
      });

      it('merges refreshed tokens so the refresh token survives an access-token-only refresh', async () => {
        await db.saveGoogleTokensFor('x@example.test', { access_token: 'a1', refresh_token: 'r1' }, { label: 'Keep me' });
        await db.saveGoogleTokensFor('x@example.test', { access_token: 'a2' });
        expect(await db.getGoogleTokensFor('x@example.test')).toEqual({ access_token: 'a2', refresh_token: 'r1' });
        expect((await db.listGoogleAccounts())[0].label).toBe('Keep me');
      });

      it('treats email case and surrounding spaces as the same account', async () => {
        await db.saveGoogleTokensFor('  Mixed@Example.TEST ', { access_token: 'a' });
        expect(await db.getGoogleTokensFor('mixed@example.test')).toEqual({ access_token: 'a' });
        expect((await db.listGoogleAccounts()).map((a) => a.email)).toEqual(['mixed@example.test']);
      });

      it('returns null for an account it does not hold', async () => {
        expect(await db.getGoogleTokensFor('nobody@example.test')).toBeNull();
        expect(await db.getDefaultGoogleAccount()).toBeNull();
      });

      it('switches the default and refuses an unknown account', async () => {
        await db.saveGoogleTokensFor('a@example.test', { access_token: '1' });
        await db.saveGoogleTokensFor('b@example.test', { access_token: '2' });
        await db.setDefaultGoogleAccount('B@example.test');
        expect(await db.getDefaultGoogleAccount()).toBe('b@example.test');
        await expect(db.setDefaultGoogleAccount('nobody@example.test')).rejects.toThrow(/No connected Google account/);
        expect(await db.getDefaultGoogleAccount()).toBe('b@example.test');
      });

      it('removes an account', async () => {
        await db.saveGoogleTokensFor('a@example.test', { access_token: '1' });
        await db.removeGoogleAccount('A@example.test');
        expect(await db.listGoogleAccounts()).toEqual([]);
      });

      it('the old single-account helpers act on the default account', async () => {
        await db.saveGoogleTokensFor('a@example.test', { access_token: '1', refresh_token: 'r' });
        expect(await db.getGoogleTokens()).toEqual({ access_token: '1', refresh_token: 'r' });
        await db.saveGoogleTokens({ access_token: '2' });
        expect(await db.getGoogleTokensFor('a@example.test')).toEqual({ access_token: '2', refresh_token: 'r' });
      });
    });

    describe('upgrade from the single-account setup', () => {
      it('copies the legacy sign-in in as the default account, once', async () => {
        const legacy = { access_token: 'legacy-a', refresh_token: 'legacy-r' };
        await seedLegacy(db, legacy);
        const seen = [];
        const email = await db.migrateLegacyGoogleAuth(async (tokens) => { seen.push(tokens); return 'OPS@Example.test'; });
        expect(seen).toEqual([legacy]);
        expect(email).toBe('ops@example.test');
        const [account] = await db.listGoogleAccounts();
        expect(account).toMatchObject({ email: 'ops@example.test', is_default: true, label: 'Migrated from single-account setup' });
        expect(await db.getGoogleTokensFor('ops@example.test')).toEqual(legacy);
        const again = await db.migrateLegacyGoogleAuth(async () => { throw new Error('must not be asked again'); });
        expect(again).toBeNull();
      });

      it('does nothing when there is no legacy sign-in', async () => {
        expect(await db.migrateLegacyGoogleAuth(async () => { throw new Error('must not be asked'); })).toBeNull();
      });

      it('does nothing when an account already exists', async () => {
        await seedLegacy(db, { access_token: 'legacy' });
        await db.saveGoogleTokensFor('already@example.test', { access_token: 'x' });
        expect(await db.migrateLegacyGoogleAuth(async () => { throw new Error('must not be asked'); })).toBeNull();
        expect((await db.listGoogleAccounts()).map((a) => a.email)).toEqual(['already@example.test']);
      });

      it('refuses to guess when the mailbox cannot be determined', async () => {
        await seedLegacy(db, { access_token: 'legacy' });
        await expect(db.migrateLegacyGoogleAuth(async () => '')).rejects.toThrow(/Could not determine which mailbox/);
        expect(await db.listGoogleAccounts()).toEqual([]);
      });
    });

    describe('connector login (clients, codes, tokens)', () => {
      it('stores and returns a registered client; unknown clients are null', async () => {
        await db.createOAuthClient({ clientId: 'c1', clientSecret: 's', redirectUris: ['https://example.test/cb'], clientName: 'Claude' });
        expect(await db.getOAuthClient('c1')).toMatchObject({ client_id: 'c1', redirect_uris: ['https://example.test/cb'], client_name: 'Claude' });
        expect(await db.getOAuthClient('nope')).toBeNull();
      });

      it('lets a login code be used exactly once and carries the chosen account', async () => {
        await db.createAuthCode({ code: 'code-1', clientId: 'c1', redirectUri: 'https://example.test/cb', codeChallenge: 'ch', codeChallengeMethod: 'S256', googleAccount: 'Rentals@Example.test' });
        const first = await db.consumeAuthCode('code-1');
        expect(first).toMatchObject({ client_id: 'c1', redirect_uri: 'https://example.test/cb', code_challenge: 'ch', google_account: 'rentals@example.test' });
        expect(await db.consumeAuthCode('code-1')).toBeNull();
        expect(await db.consumeAuthCode('never-issued')).toBeNull();
      });

      it('refuses an expired login code', async () => {
        await db.createAuthCode({ code: 'old', clientId: 'c1', redirectUri: 'https://example.test/cb', ttlSeconds: -60 });
        expect(await db.consumeAuthCode('old')).toBeNull();
      });

      it('carries the account through access and refresh tokens; old-style connections have none', async () => {
        await db.createAccessToken({ accessToken: 'at1', refreshToken: 'rt1', clientId: 'c1', googleAccount: 'Rentals@Example.test' });
        await db.createAccessToken({ accessToken: 'at0', clientId: 'c1' });
        expect((await db.getAccessToken('at1')).google_account).toBe('rentals@example.test');
        expect((await db.getAccessToken('at0')).google_account).toBeNull();
        expect(await db.getTokenByRefreshToken('rt1')).toEqual({ client_id: 'c1', google_account: 'rentals@example.test' });
      });

      it('only honors refresh tokens it issued', async () => {
        expect(await db.getTokenByRefreshToken('never-issued')).toBeNull();
        expect(await db.getTokenByRefreshToken('')).toBeNull();
        expect(await db.getTokenByRefreshToken(undefined)).toBeNull();
      });

      it('refuses an expired access token and forgets a deleted one', async () => {
        await db.createAccessToken({ accessToken: 'expired', clientId: 'c1', ttlSeconds: -60 });
        await db.createAccessToken({ accessToken: 'live', clientId: 'c1' });
        expect(await db.getAccessToken('expired')).toBeNull();
        expect(await db.getAccessToken('live')).not.toBeNull();
        await db.deleteAccessToken('live');
        expect(await db.getAccessToken('live')).toBeNull();
      });
    });

    describe('connections', () => {
      beforeEach(async () => {
        await db.createOAuthClient({ clientId: 'cx', clientSecret: 's', redirectUris: ['https://example.test/cb'], clientName: 'Claude (rentals)' });
        await db.createAccessToken({ accessToken: 'AAAAAAAA-first-secret-tail', refreshToken: 'rt-A', clientId: 'cx', googleAccount: 'rentals@example.test' });
        await db.createAccessToken({ accessToken: 'AAAAAAAA-renewed-secret-tail', refreshToken: 'rt-A', clientId: 'cx', googleAccount: 'rentals@example.test' });
        await db.createAccessToken({ accessToken: 'BBBBBBBB-other-secret-tail', refreshToken: 'rt-B', clientId: 'cx' });
      });

      it('lists live connections with only the first 8 characters of each token, and never the full token', async () => {
        const rows = await db.listConnections();
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.token_prefix).sort()).toEqual(['AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB']);
        expect(rows[0]).toMatchObject({ client_id: 'cx', client_name: 'Claude (rentals)' });
        expect(new Set(rows.map((r) => r.connection_id)).size).toBe(3); // a distinct short label per token, safe to store
        for (const r of rows) expect(r.connection_id).toMatch(/^[0-9a-f]{8}$/);
        // The label in this list is the same one the change log stores (connectionId), computed independently here.
        const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 8);
        const tokens = ['AAAAAAAA-first-secret-tail', 'AAAAAAAA-renewed-secret-tail', 'BBBBBBBB-other-secret-tail'];
        expect(rows.map((r) => r.connection_id).sort()).toEqual(tokens.map(sha).sort());
        for (const t of tokens) expect(db.connectionId(t)).toBe(sha(t));
        expect(JSON.stringify(rows)).not.toMatch(/secret-tail/);
      });

      it('records when a connection was used', async () => {
        expect((await db.listConnections()).every((r) => r.last_used_at == null)).toBe(true);
        await db.touchAccessToken('BBBBBBBB-other-secret-tail');
        const used = (await db.listConnections()).filter((r) => r.last_used_at != null);
        expect(used).toHaveLength(1);
        expect(used[0].token_prefix).toBe('BBBBBBBB');
      });

      it('refuses a prefix that is too short, unknown, or matches more than one token', async () => {
        expect(await db.revokeConnection('BBBB')).toEqual({ revoked: 0, reason: 'too_short' });
        expect(await db.revokeConnection('ZZZZZZZZ')).toEqual({ revoked: 0, reason: 'not_found' });
        expect(await db.revokeConnection('AAAAAAAA')).toEqual({ revoked: 0, reason: 'ambiguous' });
        expect(await db.getAccessToken('BBBBBBBB-other-secret-tail')).not.toBeNull();
      });

      it('switches a connection off: its token stops working, it cannot renew itself, and a sibling token for the same refresh token goes too', async () => {
        expect(await db.revokeConnection('AAAAAAAA-f')).toEqual({ revoked: 2 });
        expect(await db.getAccessToken('AAAAAAAA-first-secret-tail')).toBeNull();
        expect(await db.getAccessToken('AAAAAAAA-renewed-secret-tail')).toBeNull();
        expect(await db.getTokenByRefreshToken('rt-A')).toBeNull();
        expect(await db.getAccessToken('BBBBBBBB-other-secret-tail')).not.toBeNull();
        expect(await db.getTokenByRefreshToken('rt-B')).not.toBeNull();
      });
    });

    describe('allowed domains (account guardrails)', () => {
      it('defaults to the account\'s own domain, and says it is the default', async () => {
        await db.saveGoogleTokensFor('ops@rentals.test', { access_token: 'a' });
        expect(await db.getAllowedDomains('ops@rentals.test')).toEqual(['rentals.test']);
        expect((await db.listGoogleAccounts())[0]).toMatchObject({ allowed_domains: ['rentals.test'], allowed_domains_custom: false });
      });
      it('can be set (cleaned up and de-duplicated) and then reset to the default', async () => {
        await db.saveGoogleTokensFor('ops@rentals.test', { access_token: 'a' });
        expect(await db.setAllowedDomains('Ops@Rentals.test', [' Rentals.test ', '@ai-systems.test', 'rentals.test'])).toEqual(['rentals.test', 'ai-systems.test']);
        expect(await db.getAllowedDomains('ops@rentals.test')).toEqual(['rentals.test', 'ai-systems.test']);
        expect((await db.listGoogleAccounts())[0]).toMatchObject({ allowed_domains_custom: true });
        expect(await db.setAllowedDomains('ops@rentals.test', null)).toEqual(['rentals.test']);
        expect((await db.listGoogleAccounts())[0].allowed_domains_custom).toBe(false);
      });
      it('refuses things that are not domains, and accounts it does not hold', async () => {
        await db.saveGoogleTokensFor('ops@rentals.test', { access_token: 'a' });
        await expect(db.setAllowedDomains('ops@rentals.test', ['not a domain'])).rejects.toThrow(/does not look like a domain/);
        await expect(db.setAllowedDomains('ops@rentals.test', ['x@y.test'])).rejects.toThrow(/does not look like a domain/);
        await expect(db.setAllowedDomains('nobody@rentals.test', ['a.test'])).rejects.toThrow(/No connected Google account/);
      });
      it('an account that was saved again keeps its setting', async () => {
        await db.saveGoogleTokensFor('ops@rentals.test', { access_token: 'a' });
        await db.setAllowedDomains('ops@rentals.test', ['x.test']);
        await db.saveGoogleTokensFor('ops@rentals.test', { access_token: 'b' });
        expect(await db.getAllowedDomains('ops@rentals.test')).toEqual(['x.test']);
      });
    });

    describe('business resources', () => {
      it('remembers an ID, corrects it when saved again, and keeps businesses and kinds apart', async () => {
        await db.saveBusinessResource({ business: 'rentals', kind: 'calendar', key: 'Deliveries & Service', googleId: 'cal-1' });
        await db.saveBusinessResource({ business: 'rentals', kind: 'folder', key: '02 Customers', googleId: 'f-2' });
        await db.saveBusinessResource({ business: 'other', kind: 'calendar', key: 'Deliveries & Service', googleId: 'cal-x' });
        expect((await db.listBusinessResources('rentals')).map((r) => [r.kind, r.key, r.google_id])).toEqual([['calendar', 'Deliveries & Service', 'cal-1'], ['folder', '02 Customers', 'f-2']]);
        await db.saveBusinessResource({ business: 'rentals', kind: 'calendar', key: 'Deliveries & Service', googleId: 'cal-2' });
        expect((await db.listBusinessResources('rentals', 'calendar')).map((r) => r.google_id)).toEqual(['cal-2']);
        expect(await db.listBusinessResources('rentals', 'folder')).toHaveLength(1);
        expect(await db.listBusinessResources('nobody')).toEqual([]);
      });
    });

    describe('change log', () => {
      it('stores a change with before and after, newest first', async () => {
        await db.recordChange({ actingAs: 'a@example.test', connection: 'cx/AAAAAAAA', tool: 'admin_move_user_orgunit', target: 'sam@example.test', summary: 'Moved sam', before: { orgUnitPath: '/' }, after: { orgUnitPath: '/Staff' } });
        await db.recordChange({ actingAs: 'b@example.test', tool: 'admin_set_2sv_enforcement', target: 'kim@example.test', summary: 'Turned on 2SV', dryRun: true });
        const rows = await db.listRecentChanges();
        expect(rows.map((r) => r.tool)).toEqual(['admin_set_2sv_enforcement', 'admin_move_user_orgunit']);
        expect(rows[1]).toMatchObject({ acting_as: 'a@example.test', connection: 'cx/AAAAAAAA', target: 'sam@example.test', before: { orgUnitPath: '/' }, after: { orgUnitPath: '/Staff' }, dry_run: false });
        expect(rows[0]).toMatchObject({ before: null, after: null, dry_run: true });
      });

      it('can leave out previews (dry runs) so the list shows only real changes', async () => {
        await db.recordChange({ actingAs: 'a@example.test', tool: 'real', summary: 'did it' });
        await db.recordChange({ actingAs: 'a@example.test', tool: 'preview', summary: 'PREVIEW', dryRun: true });
        expect((await db.listRecentChanges({ includeDryRuns: false })).map((r) => r.tool)).toEqual(['real']);
        expect(await db.listRecentChanges({ includeDryRuns: true })).toHaveLength(2);
      });

      it('filters by tool, by acting account and by time, and respects the limit', async () => {
        for (let i = 0; i < 5; i++) await db.recordChange({ actingAs: 'a@example.test', tool: 'tool_a', summary: `a${i}` });
        await db.recordChange({ actingAs: 'b@example.test', tool: 'tool_b', summary: 'b' });
        expect(await db.listRecentChanges({ tool: 'tool_b' })).toHaveLength(1);
        expect(await db.listRecentChanges({ actingAs: 'A@Example.test' })).toHaveLength(5);
        expect(await db.listRecentChanges({ limit: 2 })).toHaveLength(2);
        expect(await db.listRecentChanges({ since: new Date(Date.now() + 3600 * 1000).toISOString() })).toHaveLength(0);
        expect(await db.listRecentChanges({ since: new Date(Date.now() - 3600 * 1000).toISOString() })).toHaveLength(6);
      });
    });

    describe('passphrase-page attempt log', () => {
      it('counts failures per address and ignores other addresses', async () => {
        await db.recordLoginAttempt('1.1.1.1');
        await db.recordLoginAttempt('1.1.1.1');
        await db.recordLoginAttempt('2.2.2.2');
        expect(await db.countRecentFailedLogins('1.1.1.1', 15)).toBe(2);
        expect(await db.countRecentFailedLogins('2.2.2.2', 15)).toBe(1);
        expect(await db.countRecentFailedLogins('3.3.3.3', 15)).toBe(0);
      });

      it('stops counting an attempt once it is marked successful', async () => {
        const id = await db.recordLoginAttempt('1.1.1.1');
        await db.recordLoginAttempt('1.1.1.1');
        await db.markLoginAttemptSucceeded(id);
        expect(await db.countRecentFailedLogins('1.1.1.1', 15)).toBe(1);
      });
    });
  });
}
