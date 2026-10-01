import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const hr = await import('../../src/tools/health-report.js');
const dg = await import('../../src/tools/digest.js');
const { applyDomainGuard, domainsTargeted } = await import('../../src/tools/domain-guard.js');
const licensing = await import('../../src/tools/licensing.js');

const NOW = Date.parse('2026-10-01T00:00:00Z');
const recent = '2026-09-25T00:00:00Z';
const user = (email, extra = {}) => ({ primaryEmail: email, isEnrolledIn2Sv: true, isEnforcedIn2Sv: true, lastLoginTime: recent, recoveryEmail: 'r@x.test', orgUnitPath: '/Staff', ...extra });
const find = (rows, name) => rows.find((r) => r.check.startsWith(name));
beforeEach(() => { holder.db = createFakeDb(); licensing.forgetCustomerIds(); });

describe('scoring: users', () => {
  it('a tidy Workspace passes everything', () => {
    const rows = hr.scoreUsers([user('a@x.test', { isAdmin: true }), user('b@x.test', { isAdmin: true }), user('c@x.test')], NOW);
    expect(rows.filter((r) => r.status === 'FAIL' || r.status === 'WARN')).toEqual([]);
  });
  it('an admin without 2-Step Verification is a FAIL; an ordinary user is a WARN', () => {
    const admin = hr.scoreUsers([user('a@x.test', { isAdmin: true, isEnrolledIn2Sv: false }), user('b@x.test', { isAdmin: true })], NOW);
    expect(find(admin, '2-Step Verification').status).toBe('FAIL');
    const plain = hr.scoreUsers([user('a@x.test', { isAdmin: true }), user('b@x.test', { isAdmin: true }), user('c@x.test', { isEnrolledIn2Sv: false })], NOW);
    expect(find(plain, '2-Step Verification').status).toBe('WARN');
  });
  it('suspended and archived people are not counted against the rules', () => {
    const rows = hr.scoreUsers([user('a@x.test', { isAdmin: true }), user('b@x.test', { isAdmin: true }), user('gone@x.test', { suspended: true, isEnrolledIn2Sv: false, recoveryEmail: '', lastLoginTime: '2020-01-01T00:00:00Z' })], NOW);
    expect(find(rows, '2-Step Verification').status).toBe('PASS');
    expect(find(rows, 'Recovery').status).toBe('PASS');
    expect(find(rows, 'Suspended').found).toContain('gone@x.test');
  });
  it('flags zero, one and too many super admins', () => {
    expect(find(hr.scoreUsers([user('a@x.test')], NOW), 'Super admins').status).toBe('FAIL');
    expect(find(hr.scoreUsers([user('a@x.test', { isAdmin: true })], NOW), 'Super admins').status).toBe('WARN');
    expect(find(hr.scoreUsers(Array.from({ length: 5 }, (_, i) => user(`a${i}@x.test`, { isAdmin: true })), NOW), 'Super admins').status).toBe('WARN');
  });
  it('flags no recovery option, and stale or never-signed-in accounts (Google reports never as 1970)', () => {
    const rows = hr.scoreUsers([user('a@x.test', { isAdmin: true }), user('b@x.test', { isAdmin: true }), user('c@x.test', { recoveryEmail: '', recoveryPhone: '' }), user('old@x.test', { lastLoginTime: '2026-05-01T00:00:00Z' }), user('never@x.test', { lastLoginTime: '1970-01-01T00:00:00.000Z' })], NOW);
    expect(find(rows, 'Recovery').found).toContain('c@x.test');
    const stale = find(rows, 'Sign-ins').found;
    expect(stale).toContain('old@x.test');
    expect(stale).toContain('never@x.test');
    expect(stale).not.toContain('c@x.test');
  });
  it('lists people in the top org unit', () => {
    const rows = hr.scoreUsers([user('a@x.test', { orgUnitPath: '/' }), user('b@x.test', { orgUnitPath: '/' })], NOW);
    expect(find(rows, 'Users in the top').fix).toMatch(/org units/);
  });
});

describe('scoring: apps, forwarding, groups, licences, sharing', () => {
  it('only sign-in scopes pass; wider scopes warn; full mail, Drive or admin access fails', () => {
    const basic = ['openid', 'email', 'profile'];
    expect(hr.scoreApps({ 'a@x.test': [{ displayText: 'Login', scopes: basic }] }).status).toBe('PASS');
    expect(hr.scoreApps({ 'a@x.test': [{ displayText: 'Cal', scopes: [...basic, 'https://www.googleapis.com/auth/calendar.readonly'] }] }).status).toBe('WARN');
    const full = hr.scoreApps({ 'a@x.test': [{ displayText: 'Mailer', scopes: ['https://mail.google.com/'] }] });
    expect(full.status).toBe('FAIL');
    expect(full.found).toContain('Mailer (a@x.test)');
    expect(hr.scoreApps({ 'a@x.test': [{ displayText: 'Narrow', scopes: ['https://www.googleapis.com/auth/drive.file'] }] }).status).toBe('WARN');
  });
  it('forwarding outside the company is a FAIL, inside is a WARN, none passes', () => {
    const own = new Set(['x.test']);
    expect(hr.scoreForwarding({}, own).status).toBe('PASS');
    expect(hr.scoreForwarding({ 'a@x.test': { enabled: false, emailAddress: 'z@evil.test' } }, own).status).toBe('PASS');
    expect(hr.scoreForwarding({ 'a@x.test': { enabled: true, emailAddress: 'b@x.test' } }, own).status).toBe('WARN');
    expect(hr.scoreForwarding({ 'a@x.test': { enabled: true, emailAddress: 'z@evil.test' } }, own).status).toBe('FAIL');
  });
  it('groups that let anyone post or take outside members warn', () => {
    expect(hr.scoreGroups({ 'g@x.test': { whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST', allowExternalMembers: 'false' } }).status).toBe('PASS');
    expect(hr.scoreGroups({ 'support@x.test': { whoCanPostMessage: 'ANYONE_CAN_POST' } }).found).toContain('support@x.test');
    expect(hr.scoreGroups({ 'o@x.test': { whoCanPostMessage: 'ALL_MEMBERS_CAN_POST', allowExternalMembers: 'true' } }).status).toBe('WARN');
  });
  it('licences held by suspended or inactive accounts are flagged; unknown holders ignored', () => {
    const users = [user('a@x.test'), user('b@x.test', { suspended: true }), user('c@x.test', { lastLoginTime: '2026-01-01T00:00:00Z' })];
    const r = hr.scoreLicences(users, ['a@x.test', 'B@x.test', 'c@x.test', 'ghost@x.test'], NOW);
    expect(r.status).toBe('WARN');
    expect(r.found).toContain('2 licences');
    expect(hr.scoreLicences(users, ['a@x.test'], NOW).status).toBe('PASS');
  });
  it('public-link files warn', () => {
    expect(hr.scoreSharing([]).status).toBe('PASS');
    expect(hr.scoreSharing([{ name: 'Price list' }]).found).toContain('Price list');
  });
});

describe('workflow_health_report end to end', () => {
  const setup = ({ users, delegated = true } = {}) => {
    const f = makeFakeClients({ actingAs: 'ops@x.test' });
    f.when('admin.users.list').resolves({ data: { users: users || [user('a@x.test', { isAdmin: true }), user('b@x.test', { isAdmin: true }), user('c@x.test')] } });
    f.when('admin.tokens.list').resolves({ data: { items: [{ displayText: 'Zoom', clientId: 'cid', scopes: ['openid', 'https://www.googleapis.com/auth/calendar'] }] } });
    f.when('admin.groups.list').resolves({ data: { groups: [{ email: 'support@x.test' }] } });
    f.when('groupssettings.groups.get').resolves({ data: { whoCanPostMessage: 'ANYONE_CAN_POST' } });
    f.when('admin.customers.get').resolves({ data: { id: 'C1' } });
    f.when('licensing.licenseAssignments.listForProduct').resolves({ data: { items: [{ userId: 'a@x.test' }] } });
    f.when('drive.files.list').resolves({ data: { files: [{ id: '1', name: 'Public sheet' }] } });
    const gmailFor = vi.fn(() => ({ users: { settings: { getAutoForwarding: async () => ({ data: { enabled: false } }) } } }));
    return { ...f, gmailFor, opts: { gmailFor, delegationReady: delegated, now: NOW } };
  };

  it('builds a report with every section, makes only read calls, and sends the scope as a domain when given', async () => {
    const { clients, calls, opts } = setup();
    const out = await hr.healthReport('x.test', clients, opts);
    for (const name of ['2-Step Verification', 'Super admins', 'Third-party app access', 'Automatic forwarding', 'Groups open', 'Paid licences', 'Drive files']) expect(find(out.checks, name), name).toBeTruthy();
    expect(find(out.checks, 'Third-party app access').status).toBe('WARN');
    expect(out.report).toContain('## Workspace health report: x.test');
    expect(out.report).toContain('### What to do');
    expect(calls.filter((c) => !/\.(get|list)[A-Za-z]*$/.test(c.path))).toEqual([]);
    expect(calls.find((c) => c.path === 'admin.users.list').args[0]).toMatchObject({ domain: 'x.test', customer: undefined });
  });
  it("scope 'all' reads the whole customer", async () => {
    const { clients, calls, opts } = setup();
    await hr.healthReport('all', clients, opts);
    expect(calls.find((c) => c.path === 'admin.users.list').args[0]).toMatchObject({ customer: 'my_customer', domain: undefined });
  });
  it('without delegation, forwarding is INFO (not a false PASS) and no mailbox is opened', async () => {
    const { clients, opts, gmailFor } = setup({ delegated: false });
    const out = await hr.healthReport('all', clients, opts);
    expect(find(out.checks, 'Automatic forwarding').status).toBe('INFO');
    expect(gmailFor).not.toHaveBeenCalled();
  });
  it('one failing data source becomes a warning in the report, and the rest still run', async () => {
    const { clients, when, opts } = setup();
    when('admin.tokens.list').rejects(googleError(403, 'forbidden', 'Not Authorized'));
    const out = await hr.healthReport('all', clients, opts);
    expect(find(out.checks, 'Third-party app access')).toMatchObject({ status: 'WARN' });
    expect(find(out.checks, 'Third-party app access').found).toMatch(/Could not check/);
    expect(find(out.checks, 'Groups open')).toBeTruthy();
  });
  it('unreadable mailboxes are reported by name, not treated as clean', async () => {
    const { clients, opts } = setup();
    opts.gmailFor = () => ({ users: { settings: { getAutoForwarding: async () => { throw googleError(401, 'authError', 'unauthorized_client'); } } } });
    const f = find((await hr.healthReport('all', clients, opts)).checks, 'Automatic forwarding');
    expect(f.status).toBe('WARN');
    expect(f.found).toMatch(/Could not read 3 mailboxes/);
  });
  it('only deep-checks the first 100 people and says so', async () => {
    const many = Array.from({ length: 130 }, (_, i) => user(`u${i}@x.test`, { isAdmin: i < 2 }));
    const { clients, calls, opts } = setup({ users: many });
    const out = await hr.healthReport('all', clients, opts);
    expect(calls.filter((c) => c.path === 'admin.tokens.list')).toHaveLength(100);
    expect(find(out.checks, 'Third-party app access').found).toMatch(/30 not checked/);
  });
  it('never prints secrets: no token, password or key text in the report', async () => {
    const { clients, opts, when } = setup();
    when('admin.tokens.list').resolves({ data: { items: [{ displayText: 'App', scopes: ['https://mail.google.com/'], accessToken: 'SECRET-TOKEN-123', password: 'hunter2' }] } });
    const out = JSON.stringify(await hr.healthReport('all', clients, opts));
    expect(out).not.toMatch(/SECRET-TOKEN|hunter2/);
  });
  it('an empty result explains itself instead of reporting all-clear', async () => {
    const { clients, opts } = setup({ users: [] });
    clients.admin; // eslint-friendly no-op
    const f = makeFakeClients(); f.when('admin.users.list').resolves({ data: {} });
    const out = await hr.healthReport('nowhere.test', f.clients, opts);
    expect(out.checks[0].status).toBe('WARN');
  });
});

describe('the domain guard understands scope', () => {
  it("scope 'all' targets no domain; a domain scope is checked against the connection's allowed domains", async () => {
    expect(domainsTargeted({ scope: 'all' })).toEqual([]);
    expect(domainsTargeted({ scope: 'Other.test' })).toEqual([{ arg: 'scope', value: 'other.test', domain: 'other.test' }]);
    const reg = applyDomainGuard({ tools: [{ name: 'workflow_health_report', description: 'd', inputSchema: { type: 'object', properties: { scope: { type: 'string' } } } }], handlers: { workflow_health_report: async () => ({ content: [{ type: 'text', text: 'ran' }] }) } });
    const clients = { actingAs: 'ops@mine.test', allowedDomains: ['mine.test'] };
    expect((await reg.handlers.workflow_health_report({ scope: 'other.test' }, clients)).content[0].text).toMatch(/Refused: other\.test is outside/);
    expect((await reg.handlers.workflow_health_report({ scope: 'mine.test' }, clients)).content[0].text).toBe('ran');
    expect((await reg.handlers.workflow_health_report({ scope: 'all' }, clients)).content[0].text).toBe('ran');
  });
});

describe('workflow_weekly_digest', () => {
  const login = (name, email, ip) => ({ actor: { email }, ipAddress: ip, events: [{ name }] });
  const setup = () => {
    const f = makeFakeClients({ actingAs: 'ops@x.test' });
    f.when('adminReports.activities.list').resolves({ data: { items: [login('login_success', 'a@x.test', '1.1.1.1'), login('login_success', 'b@x.test', '1.1.1.2'), login('suspicious_login', 'c@x.test', '9.9.9.9')] } });
    f.when('gmail.users.labels.list').resolves({ data: { labels: [{ id: 'L1', name: 'Leads' }, { id: 'L2', name: 'Support' }] } });
    f.when('gmail.users.labels.get').resolves({ data: { messagesUnread: 4, threadsUnread: 3 } });
    f.when('gmail.users.messages.send').resolves({ data: { id: 'sent1' } });
    f.when('gmail.users.messages.get').resolves({ data: { labelIds: ['SENT'] } });
    const health = async () => ({ summary: { warn: 1 }, checks: [{ check: 'DMARC', status: 'FAIL', found: 'No DMARC record.', fix: 'Add one.' }] });
    return { ...f, health };
  };

  it('summarises sign-ins, suspicious ones, admin actions, change log, unread counts and email-health failures', async () => {
    const { clients, health } = setup();
    await holder.db.recordChange({ actingAs: 'ops@x.test', tool: 'admin_move_user_orgunit', summary: 'Moved sam' });
    await holder.db.recordChange({ actingAs: 'ops@x.test', tool: 'preview_only', summary: 'PREVIEW', dryRun: true });
    const d = await dg.buildDigest('x.test', clients, { now: Date.now(), health });
    expect(d.text).toContain('login_success 2');
    expect(d.text).toContain('1 suspicious or blocked sign-ins');
    expect(d.text).toContain('c@x.test from 9.9.9.9');
    expect(d.text).toContain('admin_move_user_orgunit 1');
    expect(d.text).not.toContain('preview_only');
    expect(d.text).toContain('Leads: 4 unread (3 conversations)');
    expect(d.text).toContain('Billing: no label with that name');
    expect(d.text).toContain('**FAIL** DMARC');
    expect(d.needsAttention).toEqual(['1 suspicious or blocked sign-ins', '1 email health failure']);
  });
  it('asks only for the last 7 days', async () => {
    const { clients, calls, health } = setup();
    const now = Date.parse('2026-10-01T12:00:00Z');
    await dg.buildDigest('x.test', clients, { now, health });
    expect(calls.find((c) => c.path === 'adminReports.activities.list').args[0].startTime).toBe('2026-09-24T12:00:00.000Z');
  });
  it('a failing source is reported in the digest rather than hiding it or aborting', async () => {
    const { clients, when, health } = setup();
    when('adminReports.activities.list').rejects(googleError(403, 'forbidden', 'Not Authorized'));
    const d = await dg.buildDigest('x.test', clients, { health });
    expect(d.text).toContain('Could not read the Reports');
    expect(d.needsAttention).toContain('Admin Reports unavailable');
    expect(d.text).toContain('Leads: 4 unread');
  });
  it('says "nothing needs attention" when it is true', async () => {
    const { clients, when } = setup();
    when('adminReports.activities.list').resolves({ data: { items: [login('login_success', 'a@x.test', '1.1.1.1')] } });
    const d = await dg.buildDigest('x.test', clients, { health: async () => ({ summary: { warn: 0 }, checks: [] }) });
    expect(d.text).toContain('Nothing needs attention');
  });

  describe('emailing it', () => {
    const run = async (args, f) => JSON.parse((await dg.handlers.workflow_weekly_digest({ domain: 'x.test', ...args }, f.clients)).content[0].text);
    it('does NOT send without confirm, and says how to', async () => {
      const f = setup();
      const out = await run({ emailTo: 'boss@x.test' }, f);
      expect(out.sent).toBe(false);
      expect(out.note).toMatch(/confirm: true/);
      expect(f.calls.some((c) => c.path === 'gmail.users.messages.send')).toBe(false);
    });
    it('sends once with confirm, checks it reached Sent, and logs it', async () => {
      const f = setup();
      const out = await run({ emailTo: 'boss@x.test', confirm: true }, f);
      expect(out).toMatchObject({ sent: true, to: 'boss@x.test', messageId: 'sent1', confirmed: true, logged: true });
      const sends = f.calls.filter((c) => c.path === 'gmail.users.messages.send');
      expect(sends).toHaveLength(1);
      const raw = Buffer.from(sends[0].args[0].requestBody.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
      expect(raw).toMatch(/^To: boss@x.test\r\nSubject: =\?UTF-8\?B\?/);
      expect((await holder.db.listRecentChanges())[0]).toMatchObject({ tool: 'workflow_weekly_digest', target: 'boss@x.test' });
    });
    it('refuses a malformed or header-injecting address before doing anything', async () => {
      for (const bad of ['nope', 'a@b.test\r\nBcc: evil@x.test', 'a@b.test, c@d.test']) {
        const f = setup();
        const out = (await dg.handlers.workflow_weekly_digest({ domain: 'x.test', emailTo: bad, confirm: true }, f.clients)).content[0].text;
        expect(out).toMatch(/not a usable email address/);
        expect(f.calls).toEqual([]);
      }
    });
  });
});
