import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const KEY = JSON.stringify({ client_email: 'robot@proj.iam.gserviceaccount.com', private_key: privateKey, client_id: '1234567890', project_id: 'proj' });
const saved = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GMAIL = ['https://www.googleapis.com/auth/gmail.settings.basic', 'https://www.googleapis.com/auth/gmail.settings.sharing'];
const CAL = 'https://www.googleapis.com/auth/calendar';
const DRV = 'https://www.googleapis.com/auth/drive.file';

beforeEach(() => { vi.resetModules(); process.env.GOOGLE_SERVICE_ACCOUNT_JSON = KEY; });
afterEach(() => { if (saved === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = saved; });

describe('the robot identity\'s permission list', () => {
  it('is exactly the Gmail pair plus the two approved ones, and nothing else', async () => {
    const sa = await import('../../src/auth/service-account.js');
    expect(sa.DELEGATED_SCOPES).toEqual([...GMAIL, CAL, DRV]);
    expect(sa.describeServiceAccount().scopesToAuthorize).toEqual([...GMAIL, CAL, DRV]);
  });
  it('asking for a permission outside the list throws, whatever the call', async () => {
    const sa = await import('../../src/auth/service-account.js');
    for (const bad of [['https://www.googleapis.com/auth/drive'], ['https://mail.google.com/'], [CAL, 'https://www.googleapis.com/auth/gmail.modify'], []]) {
      expect(() => sa.buildDelegatedAuth('sam@x.test', bad)).toThrow(/may only be asked for these permissions/);
      expect(() => sa.delegatedClients('sam@x.test', bad)).toThrow(/may only be asked for/);
    }
  });
  it('by default a call asks only for the Gmail pair, so existing tools work before the Admin console is updated', async () => {
    const sa = await import('../../src/auth/service-account.js');
    expect(sa.buildDelegatedAuth('Sam@X.test').scopes).toEqual(GMAIL);
    expect(sa.buildDelegatedAuth('Sam@X.test').subject).toBe('sam@x.test');
  });
  it('each client carries only the permission requested for it', async () => {
    const sa = await import('../../src/auth/service-account.js');
    const cal = sa.delegatedClients('sam@x.test', [CAL]);
    expect(Object.keys(cal)).toEqual(['calendar']);
    expect(cal.calendar.context._options.auth.scopes).toEqual([CAL]);
    const drv = sa.delegatedClients('sam@x.test', [DRV]);
    expect(Object.keys(drv)).toEqual(['drive']);
    expect(drv.drive.context._options.auth.scopes).toEqual([DRV]);
    expect(Object.keys(sa.delegatedClients('sam@x.test', [CAL, DRV])).sort()).toEqual(['calendar', 'drive']);
  });
  it('an address with no @ is refused', async () => {
    const sa = await import('../../src/auth/service-account.js');
    expect(() => sa.buildDelegatedAuth('sam', [CAL])).toThrow(/full email address/);
  });
});

describe('workspace_delegation_status', () => {
  const ok = (v) => async () => v;
  const fakes = (failing = []) => ({
    clients: {
      allowedDomains: ['x.test'], actingAs: 'ops@x.test',
      gmailFor: () => ({ users: { settings: { sendAs: { list: failing.includes('gmail') ? async () => { throw new Error('unauthorized_client: Client is unauthorized to retrieve access tokens using this method'); } : ok({ data: { sendAs: [{}, {}] } }) } } } }),
      delegatedClientsFor: (_u, scopes) => ({
        ...(scopes.includes(CAL) ? { calendar: { calendarList: { list: failing.includes('calendar') ? async () => { throw new Error('unauthorized_client'); } : ok({ data: { items: [] } }) } } } : {}),
        ...(scopes.includes(DRV) ? { drive: { files: { list: failing.includes('drive') ? async () => { throw new Error('unauthorized_client'); } : ok({ data: { files: [] } }) } } } : {})
      })
    }
  });
  const status = async (failing) => { const { handlers } = await import('../../src/tools/mailbox-branding.js'); return JSON.parse((await handlers.workspace_delegation_status({ testUser: 'Sam@X.test' }, fakes(failing).clients)).content[0].text); };

  it('proves every permission works, each tried on its own', async () => {
    const out = await status([]);
    expect(out.allScopesWork).toBe(true);
    expect(out.scopeChecks.map((s) => [s.what, s.works])).toEqual([['Gmail settings (name, signature, send-as)', true], ['Calendar', true], ['Drive (files the robot itself creates)', true]]);
    expect(out.test).toMatchObject({ user: 'sam@x.test', works: true, sendAsCount: 2 });
    expect(out.nextStep).toBeUndefined();
  });
  it('names exactly the permission that is not in the Admin console yet, and says what to type', async () => {
    const out = await status(['calendar', 'drive']);
    expect(out.allScopesWork).toBe(false);
    expect(out.notWorkingYet).toEqual(['Calendar', 'Drive (files the robot itself creates)']);
    expect(out.test.works).toBe(true); // Gmail is unaffected
    expect(out.nextStep).toContain(CAL);
    expect(out.nextStep).toContain(DRV);
    expect(out.nextStep).toContain('1234567890');
    expect(out.scopeChecks[1].hint).toMatch(/missing from/);
  });
  it('a Gmail failure is reported in the old test field too', async () => {
    const out = await status(['gmail']);
    expect(out.test).toMatchObject({ works: false });
    expect(out.test.hint).toMatch(/Admin console/);
    expect(out.scopeChecks[1].works).toBe(true);
  });
  it('without a key it says how to set up, and tries nothing', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    vi.resetModules();
    const { handlers } = await import('../../src/tools/mailbox-branding.js');
    const out = JSON.parse((await handlers.workspace_delegation_status({ testUser: 'sam@x.test' }, {})).content[0].text);
    expect(out.configured).toBe(false);
    expect(out.scopesToAuthorize).toEqual([...GMAIL, CAL, DRV]);
  });
});

describe('guards around the status tool and the default request', () => {
  it('the existing Gmail paths still ask for the Gmail pair only', async () => {
    const { delegatedGmail } = await import('../../src/tools/delegated.js');
    const gmail = delegatedGmail(undefined, 'a@x.test');
    expect(gmail.context._options.auth.scopes).toEqual(GMAIL);
  });
  it('delegatedClients with no scopes is refused cleanly', async () => {
    const sa = await import('../../src/auth/service-account.js');
    expect(() => sa.delegatedClients('a@x.test')).toThrow(/None were requested/);
  });
  it('a test user outside the connection\'s domains is not impersonated at all', async () => {
    const { handlers } = await import('../../src/tools/mailbox-branding.js');
    const tried = [];
    const clients = { allowedDomains: ['x.test'], actingAs: 'ops@x.test', gmailFor: () => { tried.push('gmail'); return {}; }, delegatedClientsFor: () => { tried.push('other'); return {}; } };
    const out = JSON.parse((await handlers.workspace_delegation_status({ testUser: 'boss@other-business.test' }, clients)).content[0].text);
    expect(out.test).toMatchObject({ works: false });
    expect(out.test.error).toMatch(/outside the domains this connection manages/);
    expect(tried).toEqual([]);
  });
  it('a failure that is not a missing Admin console entry does not send you to the Admin console', async () => {
    const { handlers } = await import('../../src/tools/mailbox-branding.js');
    const gone = async () => { throw new Error('Resource Not Found: userKey'); };
    const clients = { allowedDomains: ['x.test'], actingAs: 'ops@x.test', gmailFor: () => ({ users: { settings: { sendAs: { list: gone } } } }), delegatedClientsFor: () => ({ calendar: { calendarList: { list: gone } }, drive: { files: { list: gone } } }) };
    const out = JSON.parse((await handlers.workspace_delegation_status({ testUser: 'nobody@x.test' }, clients)).content[0].text);
    expect(out.allScopesWork).toBe(false);
    expect(out.nextStep).toBeUndefined();
  });
});
