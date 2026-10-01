// workflow_weekly_digest: one plain-English page about the last 7 days: sign-ins and admin actions
// (Admin Reports), changes made through this server (change log), unread mail in chosen labels, and any
// failing email-health check. Optionally emails it from the acting mailbox, only with confirm: true.
import { ok } from './util.js';
import { emailHealth } from './email-health.js';
import { recordChange } from '../changelog.js';
import { listRecentChanges } from '../db.js';
import { domainOfEmail } from '../domains.js';

const DAY = 86400000;
const DEFAULT_LABELS = ['Leads', 'Support', 'Billing'];
const trouble = (err) => String(err?.response?.data?.error?.message || err?.message || err).slice(0, 160);
const tally = (names) => Object.entries(names.reduce((m, n) => ({ ...m, [n]: (m[n] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);

async function activities(clients, applicationName, startTime) {
  const rows = [];
  let pageToken;
  for (let i = 0; i < 5; i++) {
    const res = await clients.adminReports.activities.list({ userKey: 'all', applicationName, startTime, maxResults: 1000, pageToken });
    rows.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return { rows, more: Boolean(pageToken) };
}
/** Reports are domain-wide; keep only what the named domain's own people did. */
const ofDomain = (rows, domain) => rows.filter((r) => domainOfEmail(r.actor?.email) === domain);
const eventNames = (rows) => rows.flatMap((r) => (r.events || []).map((e) => e.name));

export async function buildDigest(domain, clients, { now = Date.now(), labels = DEFAULT_LABELS, health = emailHealth } = {}) {
  const since = new Date(now - 7 * DAY).toISOString();
  const sections = [];
  const problems = [];

  try {
    const [loginAll, adminAll] = await Promise.all([activities(clients, 'login', since), activities(clients, 'admin', since)]);
    const login = { ...loginAll, rows: ofDomain(loginAll.rows, domain) };
    const admin = { ...adminAll, rows: ofDomain(adminAll.rows, domain) };
    const logins = tally(eventNames(login.rows));
    const suspicious = login.rows.filter((r) => (r.events || []).some((e) => /suspicious|blocked/i.test(e.name)));
    const adminActions = tally(eventNames(admin.rows));
    sections.push({ title: 'Sign-ins', lines: [
      `${login.rows.length}${login.more ? '+' : ''} sign-in events: ${logins.slice(0, 5).map(([n, c]) => `${n} ${c}`).join(', ') || 'none'}.`,
      suspicious.length ? `**${suspicious.length} suspicious or blocked sign-ins**: ${suspicious.slice(0, 5).map((r) => `${r.actor?.email || 'unknown'} from ${r.ipAddress || 'unknown address'}`).join('; ')}.` : 'No suspicious or blocked sign-ins reported.'
    ] });
    if (suspicious.length) problems.push(`${suspicious.length} suspicious or blocked sign-ins`);
    sections.push({ title: 'Admin console actions', lines: [`${admin.rows.length}${admin.more ? '+' : ''} actions: ${adminActions.slice(0, 8).map(([n, c]) => `${n} ${c}`).join(', ') || 'none'}.`] });
  } catch (err) { sections.push({ title: 'Sign-ins and admin actions', lines: [`Could not read the Reports: ${trouble(err)}`] }); problems.push('Admin Reports unavailable'); }

  try {
    const rows = (await listRecentChanges({ since, includeDryRuns: false, limit: 500 })).filter((r) => domainOfEmail(r.acting_as) === domain);
    sections.push({ title: 'Changes made through this server', lines: rows.length
      ? [`${rows.length} changes: ${tally(rows.map((r) => r.tool)).slice(0, 8).map(([n, c]) => `${n} ${c}`).join(', ')}.`, ...rows.slice(0, 10).map((r) => `- ${new Date(r.at).toISOString().slice(0, 10)} ${r.acting_as || ''}: ${r.summary || r.tool}`)]
      : ['None.'] });
  } catch (err) { sections.push({ title: 'Changes made through this server', lines: [`Could not read the change log: ${trouble(err)}`] }); }

  try {
    const all = (await clients.gmail.users.labels.list({ userId: 'me' })).data.labels || [];
    const lines = [];
    for (const wanted of labels) {
      const label = all.find((l) => String(l.name).toLowerCase() === String(wanted).toLowerCase());
      if (!label) { lines.push(`${wanted}: no label with that name in ${clients.actingAs}'s mailbox.`); continue; }
      const full = (await clients.gmail.users.labels.get({ userId: 'me', id: label.id })).data;
      lines.push(`${label.name}: ${full.messagesUnread ?? 0} unread (${full.threadsUnread ?? 0} conversations).`);
    }
    sections.push({ title: `Unread mail in ${clients.actingAs}`, lines });
  } catch (err) { sections.push({ title: 'Unread mail', lines: [`Could not read labels: ${trouble(err)}`] }); }

  try {
    const h = await health(domain, clients, { now });
    const fails = h.checks.filter((c) => c.status === 'FAIL');
    sections.push({ title: `Email health for ${domain}`, lines: fails.length ? fails.map((c) => `**FAIL** ${c.check}: ${c.found} Fix: ${c.fix}`) : [`No failing checks (${h.summary.warn} to improve).`] });
    if (fails.length) problems.push(`${fails.length} email health failure${fails.length === 1 ? '' : 's'}`);
  } catch (err) { sections.push({ title: `Email health for ${domain}`, lines: [`Could not run: ${trouble(err)}`] }); }

  const text = [`# Weekly digest for ${domain}`, `${since.slice(0, 10)} to ${new Date(now).toISOString().slice(0, 10)}`, '',
    problems.length ? `**Needs attention:** ${problems.join('; ')}.` : '**Nothing needs attention.**', '',
    ...sections.flatMap((s) => [`## ${s.title}`, ...s.lines, ''])].join('\n').trim();
  return { domain, since, needsAttention: problems, sections, text };
}

const EMAIL_RE = /^[^\s<>",;\r\n]+@[^\s<>",;\r\n]+\.[^\s<>",;\r\n]+$/;
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeSubject = (s) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;

export async function sendDigest(digest, to, clients) {
  const subject = `Weekly digest for ${digest.domain}${digest.needsAttention.length ? ' - needs attention' : ''}`;
  const mime = [`To: ${to}`, `Subject: ${encodeSubject(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(digest.text, 'utf8').toString('base64')].join('\r\n');
  const sent = (await clients.gmail.users.messages.send({ userId: 'me', requestBody: { raw: b64url(mime) } })).data;
  let confirmed = false;
  try { confirmed = (await clients.gmail.users.messages.get({ userId: 'me', id: sent.id, format: 'minimal' })).data.labelIds?.includes('SENT') === true; } catch { /* reported as not confirmed */ }
  const logged = await recordChange(clients, { tool: 'workflow_weekly_digest', target: to, summary: `Emailed the weekly digest for ${digest.domain} to ${to}${confirmed ? '' : ' (could not confirm it landed in Sent)'}`, after: { messageId: sent.id, confirmed } });
  return { sent: true, to, messageId: sent.id, confirmed, logged: logged.logged };
}

export const tools = [
  { name: 'workflow_weekly_digest', description: "Plain-English summary of the last 7 days for a domain: sign-ins (incl. suspicious), admin actions, changes made through this server, unread counts in labels (default Leads, Support, Billing) of the acting mailbox, and any failing email-health checks. Pass emailTo to send it from the acting mailbox; that only happens with confirm: true (without it you get the digest and a note that nothing was sent).", inputSchema: { type: 'object', properties: { domain: { type: 'string' }, labels: { type: 'array', items: { type: 'string' }, description: 'Gmail label names to count unread in' }, emailTo: { type: 'string', description: 'Send the digest to this address from the acting mailbox' }, confirm: { type: 'boolean', description: 'Required with emailTo: confirms the email may be sent.' } }, required: ['domain'] } }
];

export const handlers = {
  workflow_weekly_digest: async (args, clients) => {
    if (!String(args.domain || '').includes('.')) return ok('Give a domain such as example.com.');
    if (args.emailTo !== undefined && !EMAIL_RE.test(String(args.emailTo).trim())) return ok(`"${args.emailTo}" is not a usable email address. Nothing was sent.`);
    const digest = await buildDigest(String(args.domain).trim().toLowerCase(), clients, { labels: args.labels?.length ? args.labels : DEFAULT_LABELS });
    if (!args.emailTo) return ok({ ...digest, sent: false });
    if (args.confirm !== true) return ok({ ...digest, sent: false, note: `Not sent. To email this to ${args.emailTo} from ${clients.actingAs}, run it again with confirm: true (ask the person first).` });
    return ok({ ...digest, ...(await sendDigest(digest, String(args.emailTo).trim(), clients)) });
  }
};
