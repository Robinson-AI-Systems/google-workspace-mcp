import { describe, it, expect } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { emailHealth, spfLookupCount, parseDmarc, checkSpf, checkDmarc, checkMx } from '../../src/tools/email-health.js';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const dnsErr = (code) => Object.assign(new Error(code), { code });

/** A stand-in for DNS: tables of name -> records. A name not listed has no records. */
function resolver({ mx = {}, txt = {}, fail = {} } = {}) {
  const guard = (name) => { if (fail[name]) throw dnsErr(fail[name]); };
  return {
    resolveMx: async (n) => { guard(n); if (!mx[n]) throw dnsErr('ENODATA'); return mx[n]; },
    resolveTxt: async (n) => { guard(n); if (!txt[n]) throw dnsErr('ENODATA'); return txt[n]; },
    resolveCname: async () => { throw dnsErr('ENODATA'); }
  };
}
const GOOD = {
  mx: { 'example.test': [{ priority: 1, exchange: 'smtp.google.com' }] },
  txt: {
    'example.test': ['v=spf1 include:_spf.google.com ~all'],
    'google._domainkey.example.test': ['v=DKIM1; k=rsa; p=MIGfMA0'],
    '_dmarc.example.test': ['v=DMARC1; p=reject; rua=mailto:r@example.test']
  }
};
const status = (out, startsWith) => out.checks.find((c) => c.check.startsWith(startsWith));
const otherDomain = () => makeFakeClients({ actingAs: 'someone@elsewhere.test' }).clients;

describe('email health: DNS checks', () => {
  it('a correctly set up domain has nothing to fix', async () => {
    const out = await emailHealth('example.test', otherDomain(), { resolver: resolver(GOOD), now: NOW });
    expect(out.summary.fail).toBe(0);
    expect(out.summary.warn).toBe(0);
    expect(status(out, 'MX').status).toBe('PASS');
    expect(status(out, 'SPF').status).toBe('PASS');
    expect(status(out, 'DKIM (google)').status).toBe('PASS');
    expect(status(out, 'DMARC').status).toBe('PASS');
  });

  it('a domain with no records fails MX, SPF, DKIM and DMARC and gives the exact record to add for each', async () => {
    const out = await emailHealth('example.test', otherDomain(), { resolver: resolver(), now: NOW });
    expect(out.summary.fail).toBe(4);
    expect(status(out, 'MX').fix).toContain('example.test  MX  priority 1  smtp.google.com');
    expect(status(out, 'SPF').fix).toContain('v=spf1 include:_spf.google.com ~all');
    expect(status(out, 'DMARC').fix).toContain('_dmarc.example.test  TXT  "v=DMARC1; p=none;');
    expect(status(out, 'DKIM (google)').fix).toMatch(/Authenticate email/);
    expect(out.report).toContain('4 to fix');
  });

  it('Resend records that are not there are information, not a failure', async () => {
    const out = await emailHealth('example.test', otherDomain(), { resolver: resolver(GOOD), now: NOW });
    expect(status(out, 'Resend').status).toBe('INFO');
    expect(status(out, 'DKIM (resend)').status).toBe('INFO');
  });

  it('recognises a complete Resend setup, and flags a half-finished one', async () => {
    const full = resolver({ mx: { ...GOOD.mx, 'send.example.test': [{ priority: 10, exchange: 'feedback-smtp.us-east-1.amazonses.com' }] }, txt: { ...GOOD.txt, 'send.example.test': ['v=spf1 include:amazonses.com ~all'], 'resend._domainkey.example.test': ['p=MIGfMA0'] } });
    const a = await emailHealth('example.test', otherDomain(), { resolver: full, now: NOW });
    expect(status(a, 'Resend').status).toBe('PASS');
    expect(status(a, 'DKIM (resend)').status).toBe('PASS');
    const half = resolver({ ...GOOD, txt: { ...GOOD.txt, 'send.example.test': ['v=spf1 include:amazonses.com ~all'] } });
    expect(status(await emailHealth('example.test', otherDomain(), { resolver: half, now: NOW }), 'Resend').status).toBe('WARN');
  });

  it('a DNS failure (not "no such record") is a warning to retry, never a false FAIL or PASS', async () => {
    const out = await emailHealth('example.test', otherDomain(), { resolver: resolver({ ...GOOD, fail: { 'example.test': 'ESERVFAIL' } }), now: NOW });
    expect(status(out, 'MX').status).toBe('WARN');
    expect(status(out, 'MX').found).toMatch(/Could not look this up \(ESERVFAIL\)/);
    expect(status(out, 'SPF').status).toBe('WARN');
    expect(status(out, 'DMARC').status).toBe('PASS');
  });
});

describe('MX', () => {
  it('flags mail that goes somewhere other than Google, and mixed hosts', () => {
    expect(checkMx('x.test', { records: [{ priority: 10, exchange: 'mail.other.test' }] }).status).toBe('WARN');
    expect(checkMx('x.test', { records: [{ priority: 1, exchange: 'aspmx.l.google.com' }, { priority: 5, exchange: 'mail.other.test' }] }).status).toBe('WARN');
    expect(checkMx('x.test', { records: [{ priority: 1, exchange: 'ASPMX.L.GOOGLE.COM.' }, { priority: 5, exchange: 'alt1.aspmx.l.google.com' }] }).status).toBe('PASS');
  });
  it('does not treat lookalike hosts as Google', () => {
    expect(checkMx('x.test', { records: [{ priority: 1, exchange: 'google.com.evil.test' }] }).status).toBe('WARN');
    expect(checkMx('x.test', { records: [{ priority: 1, exchange: 'notgoogle.com' }] }).status).toBe('WARN');
  });
});

describe('SPF', () => {
  const spf = (...records) => checkSpf('x.test', { records });
  it('two SPF records is a failure (receivers ignore both)', () => {
    expect(spf('v=spf1 include:_spf.google.com ~all', 'v=spf1 include:amazonses.com ~all').status).toBe('FAIL');
  });
  it('ignores unrelated TXT records', () => {
    expect(spf('google-site-verification=abc', 'v=spf1 include:_spf.google.com -all').status).toBe('PASS');
  });
  it('warns on +all, bare all, ?all, a missing Google include and no ending', () => {
    for (const bad of ['v=spf1 include:_spf.google.com +all', 'v=spf1 include:_spf.google.com all', 'v=spf1 include:_spf.google.com ?all', 'v=spf1 include:amazonses.com ~all', 'v=spf1 include:_spf.google.com']) {
      expect(spf(bad).status, bad).toBe('WARN');
    }
  });
  it('counts DNS lookups and warns above 10', () => {
    expect(spfLookupCount('v=spf1 include:a.test include:b.test a mx ip4:1.2.3.4 ~all')).toBe(4);
    const many = `v=spf1 ${Array.from({ length: 11 }, (_, i) => `include:s${i}.test`).join(' ')} ~all`;
    expect(spf(many).found).toMatch(/limit is 10/);
  });
});

describe('DMARC', () => {
  it('parses tags', () => expect(parseDmarc('v=DMARC1; p=none; rua=mailto:a@x.test; pct=50')).toMatchObject({ p: 'none', rua: 'mailto:a@x.test', pct: '50' }));
  it('p=none: warns and gives dated next steps (14 days to quarantine, then 30 more to reject)', () => {
    const r = checkDmarc('x.test', { records: ['v=DMARC1; p=none; rua=mailto:a@x.test'] }, NOW);
    expect(r.status).toBe('WARN');
    expect(r.fix).toContain('p=quarantine on or after 2026-10-15');
    expect(r.fix).toContain('p=reject on or after 2026-11-14');
  });
  it('p=none with no rua says reports will not arrive', () => {
    expect(checkDmarc('x.test', { records: ['v=DMARC1; p=none'] }, NOW).found).toMatch(/No rua/);
  });
  it('quarantine passes with a dated next step; reject passes outright', () => {
    const q = checkDmarc('x.test', { records: ['v=DMARC1; p=quarantine; rua=mailto:a@x.test'] }, NOW);
    expect(q.status).toBe('PASS');
    expect(q.fix).toContain('2026-10-31');
    const r = checkDmarc('x.test', { records: ['v=DMARC1; p=reject'] }, NOW);
    expect(r.status).toBe('PASS');
    expect(r.fix).toBeNull();
  });
  it('two records fail; a record with no policy warns', () => {
    expect(checkDmarc('x.test', { records: ['v=DMARC1; p=none', 'v=DMARC1; p=reject'] }, NOW).status).toBe('FAIL');
    expect(checkDmarc('x.test', { records: ['v=DMARC1; rua=mailto:a@x.test'] }, NOW).status).toBe('WARN');
  });
});

describe('mailbox checks (Gmail send-as and Directory aliases)', () => {
  const mine = () => makeFakeClients({ actingAs: 'ops@example.test' });
  it('are skipped, and say so, when the connection acts as a mailbox on another domain', async () => {
    const { clients, calls } = makeFakeClients({ actingAs: 'ops@elsewhere.test' });
    const out = await emailHealth('example.test', clients, { resolver: resolver(GOOD), now: NOW });
    expect(status(out, 'Mailbox').status).toBe('INFO');
    expect(calls).toEqual([]);
  });
  it('passes when send-as is verified and every alias can send', async () => {
    const { clients, when } = mine();
    when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: [{ sendAsEmail: 'ops@example.test', isDefault: true }, { sendAsEmail: 'help@example.test', verificationStatus: 'accepted' }] } });
    when('admin.users.get').resolves({ data: { aliases: ['help@example.test'] } });
    const out = await emailHealth('example.test', clients, { resolver: resolver(GOOD), now: NOW });
    expect(status(out, 'Gmail send-as').status).toBe('PASS');
    expect(status(out, 'Directory aliases').status).toBe('PASS');
  });
  it('warns about an unverified send-as and an alias that cannot send', async () => {
    const { clients, when } = mine();
    when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: [{ sendAsEmail: 'ops@example.test' }, { sendAsEmail: 'help@example.test', verificationStatus: 'pending' }] } });
    when('admin.users.get').resolves({ data: { aliases: ['billing@example.test', 'HELP@example.test'], nonEditableAliases: ['other@other.test'] } });
    const out = await emailHealth('example.test', clients, { resolver: resolver(GOOD), now: NOW });
    expect(status(out, 'Gmail send-as')).toMatchObject({ status: 'WARN' });
    expect(status(out, 'Gmail send-as').found).toContain('help@example.test');
    expect(status(out, 'Directory aliases').status).toBe('WARN');
    expect(status(out, 'Directory aliases').found).toContain('billing@example.test');
    expect(status(out, 'Directory aliases').found).not.toContain('other@other.test');
  });
  it('a Google error on one check becomes a warning, and the rest still run', async () => {
    const { clients, when } = mine();
    when('gmail.users.settings.sendAs.list').rejects(googleError(403, 'forbidden', 'nope'));
    when('admin.users.get').resolves({ data: {} });
    const out = await emailHealth('example.test', clients, { resolver: resolver(GOOD), now: NOW });
    expect(status(out, 'Gmail send-as').status).toBe('WARN');
    expect(status(out, 'Directory aliases').status).toBe('INFO');
  });
  it('never changes anything at Google', async () => {
    const { clients, calls, when } = mine();
    when('admin.users.get').resolves({ data: {} });
    await emailHealth('example.test', clients, { resolver: resolver(GOOD), now: NOW });
    expect(calls.every((c) => /\.(get|list)$/.test(c.path))).toBe(true);
  });
});
