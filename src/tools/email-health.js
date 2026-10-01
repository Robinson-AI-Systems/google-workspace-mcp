// workflow_email_health: is a domain set up so its email arrives and is trusted?
// Looks up the public DNS records (MX, SPF, DKIM, DMARC), then the acting mailbox's send-as list and
// Directory aliases, and returns a PASS / WARN / FAIL / INFO table with the exact record to add for
// each FAIL. Nothing is changed.
//   PASS  fine           WARN  works but should be improved        FAIL  broken or missing
//   INFO  not a problem (e.g. Resend records when you do not send through Resend)
import dns from 'node:dns/promises';
import { ok } from './util.js';
import { domainOfEmail } from '../domains.js';

const NO_DATA = new Set(['ENODATA', 'ENOTFOUND', 'NXDOMAIN']);
const DAY = 86400000;

export const realResolver = {
  resolveMx: (name) => dns.resolveMx(name),
  resolveTxt: async (name) => (await dns.resolveTxt(name)).map((parts) => parts.join('')),
  resolveCname: (name) => dns.resolveCname(name)
};

/** { records } for a lookup, [] when the name simply has no such records, { error } when DNS itself failed. */
async function look(fn) {
  try { return { records: (await fn()) || [] }; }
  catch (err) { return NO_DATA.has(err?.code) ? { records: [] } : { error: err?.code || err?.message || 'lookup failed' }; }
}

const row = (check, status, found, fix = null) => ({ check, status, found, fix });
const failed = (check, error) => row(check, 'WARN', `Could not look this up (${error}).`, 'Try again in a minute; DNS did not answer.');

/** Rough count of the DNS lookups an SPF record causes (the limit is 10). */
export function spfLookupCount(spf) {
  return String(spf).split(/\s+/).filter((t) => /^[+\-~?]?(include:|a(:|\/|$)|mx(:|\/|$)|ptr|exists:)/i.test(t) || /^redirect=/i.test(t)).length;
}

export function parseDmarc(record) {
  const tags = {};
  for (const part of String(record).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) tags[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return tags;
}

const dateIn = (now, days) => new Date(now + days * DAY).toISOString().slice(0, 10);

export function checkMx(domain, r) {
  if (r.error) return failed('MX (where mail is delivered)', r.error);
  const hosts = r.records.map((m) => `${m.priority} ${String(m.exchange).toLowerCase().replace(/\.$/, '')}`);
  const google = r.records.some((m) => /(^|\.)(google\.com|googlemail\.com)\.?$/i.test(m.exchange));
  const fix = `Add this at your DNS host (and remove other MX records): ${domain}  MX  priority 1  smtp.google.com`;
  if (!r.records.length) return row('MX (where mail is delivered)', 'FAIL', 'No MX records: nobody can email this domain.', fix);
  if (!google) return row('MX (where mail is delivered)', 'WARN', `Mail goes to ${hosts.join(', ')}, not Google.`, `If this domain's mailboxes are in Google Workspace: ${fix}`);
  if (r.records.some((m) => !/(^|\.)(google\.com|googlemail\.com)\.?$/i.test(m.exchange))) return row('MX (where mail is delivered)', 'WARN', `Google plus other hosts: ${hosts.join(', ')}.`, 'Mixed MX records make delivery unpredictable; keep only the Google ones unless this is deliberate.');
  return row('MX (where mail is delivered)', 'PASS', hosts.join(', '));
}

export function checkSpf(domain, r) {
  const name = 'SPF (who may send as this domain)';
  if (r.error) return failed(name, r.error);
  const spf = r.records.filter((t) => /^v=spf1(\s|$)/i.test(t));
  const fix = `Add a TXT record: ${domain}  TXT  "v=spf1 include:_spf.google.com ~all"  (if you also send through Resend, add include:amazonses.com before ~all, in this same one record).`;
  if (!spf.length) return row(name, 'FAIL', 'No SPF record.', fix);
  if (spf.length > 1) return row(name, 'FAIL', `${spf.length} SPF records; receivers ignore all of them when there is more than one.`, `Merge them into ONE record, e.g. "v=spf1 include:_spf.google.com ~all".`);
  const rec = spf[0];
  const issues = [];
  if (!/include:_spf\.google\.com/i.test(rec)) issues.push('does not include Google (_spf.google.com)');
  if (/\s\+?all\s*$/.test(rec)) issues.push('ends in +all, which lets anyone send as you');
  if (/\?all\b/.test(rec)) issues.push('ends in ?all, which says nothing about unknown senders');
  if (!/[~\-?+]?all\s*$/i.test(rec) && !/redirect=/i.test(rec)) issues.push('has no ending (~all or -all)');
  const lookups = spfLookupCount(rec);
  if (lookups > 10) issues.push(`needs about ${lookups} DNS lookups (the limit is 10, over it SPF fails)`);
  return issues.length ? row(name, 'WARN', `${rec}  — ${issues.join('; ')}.`, 'Edit the record: keep include:_spf.google.com, end with ~all (or -all once DMARC reports are clean), stay under 10 lookups.') : row(name, 'PASS', rec);
}

export function checkResendSpf(domain, mx, txt) {
  const name = `Resend sending (send.${domain}) SPF + MX`;
  if (mx.error || txt.error) return failed(name, mx.error || txt.error);
  const spf = txt.records.find((t) => /^v=spf1/i.test(t));
  const mxOk = mx.records.some((m) => /amazonses\.com\.?$/i.test(m.exchange));
  if (!spf && !mx.records.length) return row(name, 'INFO', 'No send. records. Only needed if you send mail through Resend.', `If you do use Resend: add exactly the MX and TXT records Resend shows for ${domain} in its dashboard (Domains > ${domain}).`);
  if (spf && /include:amazonses\.com/i.test(spf) && mxOk) return row(name, 'PASS', `${spf}; MX ${mx.records.map((m) => m.exchange).join(', ')}`);
  return row(name, 'WARN', `Partly set up: SPF ${spf ? `"${spf}"` : 'missing'}, MX ${mxOk ? 'ok' : 'missing or not Amazon SES'}.`, `Compare with the records Resend lists for ${domain} (Domains > ${domain}) and fix the missing one.`);
}

export function checkDkim(selector, domain, r, { required }) {
  const name = `DKIM (${selector})`;
  if (r.error) return failed(name, r.error);
  const rec = r.records.find((t) => /v=DKIM1|k=rsa|p=/i.test(t));
  if (rec) return row(name, /p=\s*(;|$)/i.test(rec) ? 'WARN' : 'PASS', /p=\s*(;|$)/i.test(rec) ? 'The key is empty (revoked).' : 'Published.', /p=\s*(;|$)/i.test(rec) ? 'Generate a new key.' : null);
  if (required) return row(name, 'FAIL', `No record at ${selector}._domainkey.${domain}.`, 'Google makes this key for you: Admin console > Apps > Google Workspace > Gmail > Authenticate email > pick the domain > Generate new record, then add the TXT record it shows and press Start authentication. (Ask workspace_where_is_setting "dkim" for the link.)');
  return row(name, 'INFO', 'Not published. Only needed if you send through Resend.', `Add the DKIM record Resend shows for ${domain} in its dashboard.`);
}

export function checkDmarc(domain, r, now) {
  const name = 'DMARC (what receivers do with failures)';
  if (r.error) return failed(name, r.error);
  const rec = r.records.filter((t) => /^v=DMARC1/i.test(t));
  const start = `_dmarc.${domain}  TXT  "v=DMARC1; p=none; rua=mailto:<a mailbox you read>@${domain}"`;
  if (!rec.length) return row(name, 'FAIL', 'No DMARC record.', `Add this TXT record, using a real mailbox for the reports: ${start}. Review the reports for 14 days (until ${dateIn(now, 14)}), then move to quarantine.`);
  if (rec.length > 1) return row(name, 'FAIL', `${rec.length} DMARC records; receivers ignore them all.`, 'Keep only one.');
  const t = parseDmarc(rec[0]);
  const p = (t.p || '').toLowerCase();
  const noReports = !t.rua;
  if (p === 'none') return row(name, 'WARN', `${rec[0]}  — policy is none: failures are only reported, not blocked.${noReports ? ' No rua= address, so no reports arrive.' : ''}`, `${noReports ? 'Add rua=mailto:<mailbox you read>. ' : ''}If the reports show only your own legitimate mail passing, change p=none to p=quarantine on or after ${dateIn(now, 14)}, then to p=reject on or after ${dateIn(now, 44)}.`);
  if (p === 'quarantine') return row(name, 'PASS', `${rec[0]}  — policy is quarantine.`, `Next step: if reports stay clean, move to p=reject on or after ${dateIn(now, 30)}.`);
  if (p === 'reject') return row(name, 'PASS', `${rec[0]}  — policy is reject (strongest).`);
  return row(name, 'WARN', `${rec[0]}  — no valid p= policy.`, `Set p=none (to start), p=quarantine or p=reject.`);
}

/** Gmail send-as and Directory aliases for the acting mailbox, when it belongs to the domain. */
export async function checkMailbox(domain, clients) {
  const me = clients.actingAs;
  if (domainOfEmail(me) !== domain) {
    return [row('Mailbox checks (send-as and aliases)', 'INFO', `This connection acts as ${me}, which is not on ${domain}, so its send-as and aliases were not checked.`, `Connect or switch to a mailbox on ${domain} and run this again.`)];
  }
  const out = [];
  let sendAs = [];
  try {
    sendAs = (await clients.gmail.users.settings.sendAs.list({ userId: 'me' })).data.sendAs || [];
    const mine = sendAs.filter((s) => domainOfEmail(s.sendAsEmail) === domain);
    const pending = mine.filter((s) => s.verificationStatus && s.verificationStatus !== 'accepted');
    out.push(pending.length
      ? row('Gmail send-as addresses', 'WARN', `${mine.length} on ${domain}; not verified yet: ${pending.map((s) => s.sendAsEmail).join(', ')}.`, 'Open the confirmation email Gmail sent to each address, or resend verification with gmail_update_send_as.')
      : row('Gmail send-as addresses', 'PASS', mine.length ? mine.map((s) => s.sendAsEmail + (s.isDefault ? ' (default)' : '')).join(', ') : 'Only the main address.'));
  } catch (err) { out.push(failed('Gmail send-as addresses', err?.response?.data?.error?.message || err?.message || 'unknown error')); }
  try {
    const u = (await clients.admin.users.get({ userKey: me, fields: 'aliases,nonEditableAliases' })).data;
    const aliases = [...(u.aliases || []), ...(u.nonEditableAliases || [])].filter((a) => domainOfEmail(a) === domain);
    const sendable = new Set(sendAs.map((s) => String(s.sendAsEmail).toLowerCase()));
    const cannotSend = aliases.filter((a) => !sendable.has(a.toLowerCase()));
    out.push(!aliases.length ? row('Directory aliases', 'INFO', `${me} has no aliases on ${domain}.`)
      : cannotSend.length ? row('Directory aliases', 'WARN', `Aliases receive mail but cannot send as themselves: ${cannotSend.join(', ')}.`, 'Add each as a Gmail send-as address (gmail_create_send_as) if people should reply from it.')
        : row('Directory aliases', 'PASS', aliases.join(', ')));
  } catch (err) { out.push(failed('Directory aliases', err?.response?.data?.error?.message || err?.message || 'unknown error')); }
  return out;
}

export async function emailHealth(domain, clients, { resolver = realResolver, now = Date.now() } = {}) {
  const d = String(domain || '').trim().toLowerCase().replace(/^@/, '');
  const [mx, spf, sendMx, sendSpf, dkimGoogle, dkimResend, dmarc] = await Promise.all([
    look(() => resolver.resolveMx(d)),
    look(() => resolver.resolveTxt(d)),
    look(() => resolver.resolveMx(`send.${d}`)),
    look(() => resolver.resolveTxt(`send.${d}`)),
    look(() => resolver.resolveTxt(`google._domainkey.${d}`)),
    look(() => resolver.resolveTxt(`resend._domainkey.${d}`)),
    look(() => resolver.resolveTxt(`_dmarc.${d}`))
  ]);
  const checks = [
    checkMx(d, mx), checkSpf(d, spf), checkResendSpf(d, sendMx, sendSpf),
    checkDkim('google', d, dkimGoogle, { required: true }), checkDkim('resend', d, dkimResend, { required: false }),
    checkDmarc(d, dmarc, now),
    ...(await checkMailbox(d, clients))
  ];
  const count = (s) => checks.filter((c) => c.status === s).length;
  const summary = { pass: count('PASS'), warn: count('WARN'), fail: count('FAIL'), info: count('INFO') };
  const md = ['| Check | Result | What was found |', '|---|---|---|', ...checks.map((c) => `| ${c.check} | **${c.status}** | ${String(c.found).replace(/\|/g, '\\|')} |`)];
  const fixes = checks.filter((c) => c.fix && c.status !== 'PASS' && c.status !== 'INFO').map((c) => `- **${c.check}** (${c.status}): ${c.fix}`);
  const report = `## Email health for ${d}\n\n${md.join('\n')}\n\n**${summary.fail} to fix, ${summary.warn} to improve, ${summary.pass} fine.**` + (fixes.length ? `\n\n### What to do\n${fixes.join('\n')}` : '');
  return { domain: d, summary, checks, report };
}

export const tools = [
  { name: 'workflow_email_health', description: "Check that a domain's email is set up properly: where mail is delivered (MX), SPF, DKIM (Google and Resend), DMARC and its next step with a date, plus the acting mailbox's send-as addresses and aliases. Read-only. Returns PASS/WARN/FAIL/INFO per check and the exact DNS record to add for each FAIL.", inputSchema: { type: 'object', properties: { domain: { type: 'string', description: 'e.g. robinsonappliancerentals.com' } }, required: ['domain'] } }
];
export const handlers = {
  workflow_email_health: async (args, clients) => {
    if (!String(args.domain || '').includes('.')) return ok('Give a domain such as example.com.');
    const result = await emailHealth(args.domain, clients);
    return ok(result);
  }
};
