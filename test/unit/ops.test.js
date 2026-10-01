import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';
import { explainError } from '../../src/tools/errors.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { handlers, matchSettings, planSummary, checkVerification, geminiVerdict } = await import('../../src/tools/ops.js');
const { CONSOLE_MAP } = await import('../../src/data/console-map.js');
const licensing = await import('../../src/tools/licensing.js');

const body = (r) => JSON.parse(r.content[0].text);
beforeEach(() => { holder.db = createFakeDb(); licensing.forgetCustomerIds(); });

describe('calendar_update_calendar', () => {
  const setup = (zone = 'America/Denver') => {
    const f = makeFakeClients();
    f.when('calendar.calendars.get').resolvesOnce({ data: { id: 'primary', summary: 'Rentals', timeZone: 'America/New_York' } });
    f.when('calendar.calendars.get').resolves({ data: { id: 'primary', summary: 'Rentals', timeZone: zone } });
    return f;
  };
  it('changes only the fields given, then reads the calendar back and says what Google holds', async () => {
    const { clients, calls } = setup();
    const out = body(await handlers.calendar_update_calendar({ timeZone: 'America/Denver' }, clients));
    const patch = calls.find((c) => c.path === 'calendar.calendars.patch');
    expect(patch.args[0]).toEqual({ calendarId: 'primary', requestBody: { timeZone: 'America/Denver' } });
    expect(out).toMatchObject({ done: true, confirmed: true, before: { timeZone: 'America/New_York' }, after: { timeZone: 'America/Denver' } });
    expect((await holder.db.listRecentChanges())[0]).toMatchObject({ tool: 'calendar_update_calendar', target: 'primary' });
  });
  it('says not confirmed when Google still holds the old value', async () => {
    const { clients } = setup('America/New_York');
    expect(body(await handlers.calendar_update_calendar({ timeZone: 'America/Denver' }, clients)).confirmed).toBe(false);
  });
  it('rejects an unknown time zone before calling Google', async () => {
    const { clients, calls } = makeFakeClients();
    await expect(handlers.calendar_update_calendar({ timeZone: 'Mountain Time' }, clients)).rejects.toThrow(/not a time zone name/);
    expect(calls).toEqual([]);
  });
  it('accepts real IANA names including UTC, and refuses an empty change', async () => {
    const { clients } = setup('UTC');
    expect(body(await handlers.calendar_update_calendar({ timeZone: 'UTC' }, clients)).done).toBe(true);
    await expect(handlers.calendar_update_calendar({}, makeFakeClients().clients)).rejects.toThrow(/Nothing to change/);
  });
  it('a preview changes nothing', async () => {
    const { clients, calls } = setup();
    await handlers.calendar_update_calendar({ timeZone: 'America/Denver', dryRun: true }, clients);
    expect(calls.some((c) => c.path === 'calendar.calendars.patch')).toBe(false);
  });
});

describe('calendar time zones', () => {
  it('accepts current and older spellings of real zones, rejects made-up ones', async () => {
    for (const zone of ['Asia/Kolkata', 'Asia/Calcutta', 'Europe/Kyiv', 'Europe/Kiev', 'America/Argentina/Buenos_Aires', 'Asia/Ho_Chi_Minh', 'Pacific/Kanton', 'Etc/GMT+5', 'US/Mountain', 'UTC']) {
      const f = makeFakeClients();
      f.when('calendar.calendars.get').resolves({ data: { id: 'primary', timeZone: zone } });
      expect(body(await handlers.calendar_update_calendar({ timeZone: zone, dryRun: true }, f.clients)).dryRun, zone).toBe(true);
    }
    for (const zone of ['Mountain Time', ' America/Denver', 'America/Denverr', '']) {
      await expect(handlers.calendar_update_calendar({ timeZone: zone }, makeFakeClients().clients), JSON.stringify(zone)).rejects.toThrow();
    }
  });
  it('is confirmed when Google stores an alias of the zone that was sent', async () => {
    const f = makeFakeClients();
    f.when('calendar.calendars.get').resolvesOnce({ data: { id: 'primary', timeZone: 'America/Denver' } });
    f.when('calendar.calendars.get').resolves({ data: { id: 'primary', timeZone: 'Asia/Calcutta' } });
    expect(body(await handlers.calendar_update_calendar({ timeZone: 'Asia/Kolkata' }, f.clients)).confirmed).toBe(true);
  });
  it('clearing the description to empty is allowed and confirmed', async () => {
    const f = makeFakeClients();
    f.when('calendar.calendars.get').resolvesOnce({ data: { id: 'primary', description: 'old' } });
    f.when('calendar.calendars.get').resolves({ data: { id: 'primary' } });
    const out = body(await handlers.calendar_update_calendar({ description: '' }, f.clients));
    expect(f.calls.find((c) => c.path === 'calendar.calendars.patch').args[0].requestBody).toEqual({ description: '' });
    expect(out.confirmed).toBe(true);
  });
});

describe('Gemini verdict', () => {
  it('only claims what it knows', () => {
    expect(geminiVerdict([])).toMatch(/unknown/);
    expect(geminiVerdict([{ geminiIncluded: true }])).toBe('yes');
    expect(geminiVerdict([{ geminiIncluded: false }])).toBe('not on these plans');
    expect(geminiVerdict([{ geminiIncluded: null }])).toMatch(/unknown/);
    expect(geminiVerdict([{ geminiIncluded: true }, { geminiIncluded: null }])).toBe('on some plans');
  });
});

describe('workspace_where_is_setting: questions people actually ask', () => {
  const top = (q) => matchSettings(q)[0]?.id;
  it('lands on the right page', () => {
    expect(top('stop people sharing files externally')).toBe('drive-sharing');
    expect(top('forward email')).toBe('email-forwarding');
    expect(top('email forwarding')).toBe('email-forwarding');
    expect(top('who is admin')).toBe('admin-roles');
    expect(top('out of office')).toBe('out-of-office');
    expect(top('vacation responder')).toBe('out-of-office');
    expect(top('signature')).toBe('signature');
    expect(top('set up SPF')).toBe('spf-dmarc');
    expect(top('set up DMARC')).toBe('spf-dmarc');
    expect(top('reset a user password')).toBe('password-policy');
    expect(top('email allowlist')).toBe('gmail-spam');
  });
  it('the old email-allowlist entry is merged into the spam page, not duplicated', () => {
    expect(CONSOLE_MAP.filter((e) => /allowlist/.test(e.title) && /spam|allow/.test(e.id)).length).toBeLessThanOrEqual(2);
    expect(CONSOLE_MAP.some((e) => e.id === 'email-allowlist')).toBe(false);
    expect(JSON.stringify(CONSOLE_MAP)).not.toMatch(/Chris/);
  });
});

describe('workspace_where_is_setting', () => {
  const top = (q) => matchSettings(q)[0]?.id;
  it('finds the right page for plain-English questions', () => {
    expect(top('how do I turn on DKIM')).toBe('dkim');
    expect(top('block sharing files outside the company')).toBe('drive-sharing');
    expect(top('set up a catch-all routing rule')).toBe('gmail-routing');
    expect(top('where do I turn off gemini')).toBe('gemini');
    expect(top('password length rules')).toBe('password-policy');
    expect(top('how long do people stay signed in')).toBe('session-length');
    expect(top('which marketplace apps are allowed')).toBe('marketplace-allowlist');
    expect(top('change my plan or payment method')).toBe('billing-plan');
    expect(top('legal hold')).toBe('vault-retention');
    expect(top('require two factor authentication')).toBe('2sv');
    expect(top('licences')).toBe('license-assign-ui');
  });
  it('returns nothing for nonsense or only filler words, and the tool then lists topics', async () => {
    expect(matchSettings('zzqx wibble')).toEqual([]);
    expect(matchSettings('where is the setting')).toEqual([]);
    const out = body(await handlers.workspace_where_is_setting({ query: 'zzqx wibble' }));
    expect(out.found).toBe(false);
    expect(out.topics.length).toBe(CONSOLE_MAP.length);
  });
  it('gives link and numbered clicks, and a console fallback where there is no direct link', async () => {
    const dkim = body(await handlers.workspace_where_is_setting({ query: 'dkim' })).matches[0];
    expect(dkim.link).toMatch(/^https:\/\/admin\.google\.com\//);
    expect(dkim.steps[0]).toMatch(/^1\. Apps/);
    const gemini = body(await handlers.workspace_where_is_setting({ query: 'gemini' })).matches[0];
    expect(gemini.link).toMatch(/follow the clicks below/);
  });
  it('the map itself is well formed: unique ids, titles, clicks, and links only to Google addresses', () => {
    const ids = CONSOLE_MAP.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of CONSOLE_MAP) {
      expect(e.title.length, e.id).toBeGreaterThan(5);
      expect(e.keywords.length, e.id).toBeGreaterThan(1);
      expect(e.path.length, e.id).toBeGreaterThan(0);
      if (e.link) expect(e.link, e.id).toMatch(/^https:\/\/(admin|vault)\.google\.com(\/|$)/);
    }
  });
  it('asks for a query when none is given', async () => {
    expect((await handlers.workspace_where_is_setting({})).content[0].text).toMatch(/Say which setting/);
  });
});

describe('licensing: real customer ID and the plan summary', () => {
  it('licensing_list_assignments sends the real customer ID, looked up once per account', async () => {
    const { clients, calls, when } = makeFakeClients({ actingAs: 'a@one.test' });
    when('admin.customers.get').resolves({ data: { id: 'C0123abc' } });
    when('licensing.licenseAssignments.listForProductAndSku').resolves({ data: { items: [] } });
    await licensing.handlers.licensing_list_assignments({ skuId: '1010020027' }, clients);
    await licensing.handlers.licensing_list_assignments({ skuId: '1010020027' }, clients);
    expect(calls.filter((c) => c.path === 'licensing.licenseAssignments.listForProductAndSku').map((c) => c.args[0].customerId)).toEqual(['C0123abc', 'C0123abc']);
    expect(calls.filter((c) => c.path === 'admin.customers.get')).toHaveLength(1);
  });
  it('falls back to my_customer if Google will not give the ID, without hiding the real problem', async () => {
    const { clients, calls, when } = makeFakeClients({ actingAs: 'b@two.test' });
    when('admin.customers.get').rejects(googleError(403, 'forbidden', 'nope'));
    when('licensing.licenseAssignments.listForProductAndSku').resolves({ data: {} });
    await licensing.handlers.licensing_list_assignments({ skuId: 'x' }, clients);
    expect(calls.find((c) => c.path.endsWith('listForProductAndSku')).args[0].customerId).toBe('my_customer');
  });
  it('workspace_plan_summary groups assignments by plan, names them, and says whether Gemini is included', async () => {
    const { clients, when } = makeFakeClients({ actingAs: 'c@three.test' });
    when('admin.customers.get').resolves({ data: { id: 'C9' } });
    when('licensing.licenseAssignments.listForProduct').resolves({ data: { items: [{ skuId: '1010020028' }, { skuId: '1010020028' }, { skuId: '1010020027' }] } });
    const out = body(await handlers.workspace_plan_summary({}, clients));
    expect(out).toMatchObject({ customerId: 'C9', totalLicensesAssigned: 3, geminiIncluded: 'yes' });
    expect(out.plans).toEqual([{ skuId: '1010020028', plan: 'Business Standard', assigned: 2, geminiIncluded: true }, { skuId: '1010020027', plan: 'Business Starter', assigned: 1, geminiIncluded: true }]);
  });
  it('shows unrecognised plans by ID instead of guessing, and does not claim Gemini for them', async () => {
    const { clients, when } = makeFakeClients({ actingAs: 'd@four.test' });
    when('licensing.licenseAssignments.listForProduct').resolves({ data: { items: [{ skuId: '999' }, { skuId: '1010060001' }] } });
    const out = body(await handlers.workspace_plan_summary({}, clients));
    expect(out.plans.find((p) => p.skuId === '999')).toMatchObject({ plan: 'Unrecognised plan (999)', geminiIncluded: null });
    expect(out.geminiIncluded).toBe('unknown (plan not recognised)');
  });
  it('follows every page of assignments', async () => {
    const { clients, when } = makeFakeClients();
    when('licensing.licenseAssignments.listForProduct').resolvesOnce({ data: { items: [{ skuId: '1010020027' }], nextPageToken: 'p2' } });
    when('licensing.licenseAssignments.listForProduct').resolvesOnce({ data: { items: [{ skuId: '1010020027' }] } });
    expect((await planSummary(clients, { customerId: 'C1' })).plans[0].assigned).toBe(2);
  });
  it('a switched-off licensing API is explained in plain words, naming the API to enable', () => {
    const err = googleError(403, 'accessNotConfigured', 'Enterprise License Manager API has not been used in project 123456 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/licensing.googleapis.com/overview?project=123456 then retry.');
    const e = explainError(err);
    expect(e.what).toMatch(/Enterprise License Manager API/);
    expect(e.todo).toContain('Enterprise License Manager');
    expect(e.todo).toContain('https://console.developers.google.com/apis/api/licensing.googleapis.com');
  });
  it('only the API name is taken from the message, not a sentence in front of it; and other "disabled" text is left alone', () => {
    const e = explainError(googleError(403, 'accessNotConfigured', 'Request failed. Admin SDK API has not been used in project 1 before or it is disabled.'));
    expect(e.what).toMatch(/The Admin SDK API is switched off/);
    expect(explainError(googleError(403, 'forbidden', 'The calendar is disabled. Enable it in settings.')).what).toMatch(/not allowed/);
  });
  it('a plain permission error is still not mistaken for a switched-off API', () => {
    expect(explainError(googleError(403, 'forbidden', 'Not Authorized to access this resource/api')).what).toMatch(/not allowed/);
  });
});

describe('workflow_search_presence_check', () => {
  const dom = (identifier) => ({ site: { type: 'INET_DOMAIN', identifier } });
  it('a verified domain covers www and subdomains', () => {
    expect(checkVerification([dom('example.test')], 'example.test')).toEqual({ root: { name: 'example.test', verified: true }, www: { name: 'www.example.test', verified: true } });
  });
  it('a verified www site alone does not verify the root, and similar names do not count', () => {
    const v = checkVerification([{ site: { type: 'SITE', identifier: 'https://www.example.test/' } }, dom('notexample.test')], 'example.test');
    expect(v.root.verified).toBe(false);
    expect(v.www.verified).toBe(true);
  });
  it('reports PASS / WARN / FAIL with next steps and links, and tolerates https:// and www. in the input', async () => {
    const run = async (items, domain = 'example.test') => {
      const { clients, when } = makeFakeClients();
      when('siteVerification.webResource.list').resolves({ data: { items } });
      return body(await handlers.workflow_search_presence_check({ domain }, clients));
    };
    expect(await run([dom('example.test')], 'https://www.Example.test/')).toMatchObject({ domain: 'example.test', status: 'PASS' });
    expect((await run([{ site: { type: 'SITE', identifier: 'https://www.example.test/' } }])).status).toBe('WARN');
    const none = await run([]);
    expect(none.status).toBe('FAIL');
    expect(none.searchConsole).toMatch(/domain_get_verification_token/);
    expect(none.businessProfile).toContain('https://business.google.com');
  });
  it('asks for a real domain', async () => {
    expect((await handlers.workflow_search_presence_check({ domain: 'nope' }, makeFakeClients().clients)).content[0].text).toMatch(/Give the website domain/);
  });
});
