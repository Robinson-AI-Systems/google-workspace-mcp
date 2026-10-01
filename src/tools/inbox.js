// Inbox triage helpers (read-only): a summary of what is waiting, and a list of conversations where
// the last message is from someone else and nobody has answered yet.
import { ok } from './util.js';

const HOUR = 3600000;
const MAX_THREADS = 100;
const MAX_THREADS_UNANSWERED = 500;   // find_unanswered pages further: the oldest waiting threads are the ones it exists to find
const AUTOMATED = /^(mailer-daemon|postmaster|no-?reply|donotreply|do-not-reply|bounces?)\b/i;

const emailIn = (header) => { const m = /<([^>]+)>/.exec(header || '') || /([^\s<>",;]+@[^\s<>",;]+)/.exec(header || ''); return m ? m[1].trim().toLowerCase() : ''; };
const headerOf = (message, name) => (message.payload?.headers || []).find((h) => h.name?.toLowerCase() === name)?.value || '';

/** "7d", "48h" or a date; returns a Gmail search clause like `after:1727000000`. */
export function sinceClause(since, now = Date.now()) {
  if (!since) return '';
  const rel = /^(\d+)\s*([dh])$/i.exec(String(since).trim());
  const t = rel ? now - Number(rel[1]) * (rel[2].toLowerCase() === 'd' ? 24 : 1) * HOUR : Date.parse(since);
  if (Number.isNaN(t)) throw new Error(`I could not read "${since}" as a time. Use a number of days like 7d, hours like 48h, or a date like 2026-09-28.`);
  return `after:${Math.floor(t / 1000)}`;
}

async function myAddresses(gmail, actingAs) {
  const mine = new Set([String(actingAs || '').toLowerCase()]);
  try { for (const s of (await gmail.users.settings.sendAs.list({ userId: 'me' })).data.sendAs || []) mine.add(String(s.sendAsEmail).toLowerCase()); }
  catch { mine.incomplete = true; } // only the acting address is known: replies sent from an alias would look unanswered
  return mine;
}

async function loadThreads(gmail, { q, labelIds, max = MAX_THREADS }) {  // newest first, so a cut-off drops the OLDEST
  const ids = [];
  let pageToken;
  while (ids.length < max) {
    const res = await gmail.users.threads.list({ userId: 'me', q: q || undefined, labelIds, maxResults: Math.min(100, max - ids.length), pageToken });
    ids.push(...(res.data.threads || []).map((t) => t.id));
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  const threads = [];
  for (let i = 0; i < ids.length; i += 5) {
    threads.push(...await Promise.all(ids.slice(i, i + 5).map(async (id) => (await gmail.users.threads.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date', 'Auto-Submitted', 'Precedence', 'List-Id'] })).data)));
  }
  return { threads, more: Boolean(pageToken) };
}

/** What we need to know about one conversation. */
export function describeThread(thread, mine) {
  const messages = [...(thread.messages || [])].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  const last = messages.at(-1);
  if (!last) return null;
  const from = emailIn(headerOf(last, 'from'));
  const labelIds = new Set(messages.flatMap((m) => m.labelIds || []));
  const lastLabels = last.labelIds || [];
  const automated = AUTOMATED.test(from) || /auto-(replied|generated)/i.test(headerOf(last, 'auto-submitted')) || /^(bulk|list|junk)$/i.test(headerOf(last, 'precedence')) || Boolean(headerOf(last, 'list-id'));
  const inbound = from !== '' && !mine.has(from) && !automated && !['SENT', 'DRAFT', 'TRASH', 'SPAM'].some((l) => lastLabels.includes(l)); // a person wrote last and it is not in the bin
  return {
    threadId: thread.id,
    subject: headerOf(messages[0], 'subject') || '(no subject)',
    lastFrom: from,
    lastAt: Number(last.internalDate),
    messages: messages.length,
    unread: messages.some((m) => (m.labelIds || []).includes('UNREAD')),
    unanswered: inbound,
    labelIds
  };
}

const labelNames = async (gmail) => new Map(((await gmail.users.labels.list({ userId: 'me' })).data.labels || []).map((l) => [l.id, l]));
const findLabel = (labels, name) => [...labels.values()].find((l) => String(l.name).toLowerCase() === String(name).toLowerCase());
const SYSTEM = /^(INBOX|SENT|DRAFT|UNREAD|STARRED|IMPORTANT|SPAM|TRASH|CHAT|CATEGORY_.*)$/;

export async function inboxSummary(args, clients, { now = Date.now() } = {}) {
  const { gmail, actingAs } = clients;
  const labels = await labelNames(gmail);
  let labelId;
  if (args.label) {
    const l = findLabel(labels, args.label);
    if (!l) return { found: false, note: `No label called "${args.label}" in ${actingAs}'s mailbox. Labels: ${[...labels.values()].filter((x) => !SYSTEM.test(x.id)).map((x) => x.name).join(', ') || 'none'}.` };
    labelId = l.id;
  }
  const q = [args.label ? '' : 'in:inbox', sinceClause(args.since, now)].filter(Boolean).join(' ');
  const mine = await myAddresses(gmail, actingAs);
  const { threads, more } = await loadThreads(gmail, { q, labelIds: labelId ? [labelId] : undefined });
  const rows = threads.map((t) => describeThread(t, mine)).filter(Boolean);

  const senders = new Map();
  for (const r of rows) if (r.unanswered) senders.set(r.lastFrom, (senders.get(r.lastFrom) || 0) + 1);
  const oldestPerLabel = {};
  for (const r of rows.filter((x) => x.unanswered)) {
    for (const id of r.labelIds) {
      const l = labels.get(id);
      if (!l || SYSTEM.test(id) || l.type === 'system') continue;
      if (!oldestPerLabel[l.name] || r.lastAt < oldestPerLabel[l.name].lastAt) oldestPerLabel[l.name] = r;
    }
  }
  const show = (r) => ({ threadId: r.threadId, subject: r.subject, from: r.lastFrom, waitingHours: Math.round((now - r.lastAt) / HOUR) });
  return {
    found: true, mailbox: actingAs, label: args.label || 'Inbox', since: args.since || null,
    conversations: rows.length, unread: rows.filter((r) => r.unread).length, waitingForReply: rows.filter((r) => r.unanswered).length,
    topSenders: [...senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([from, count]) => ({ from, waiting: count })),
    oldestUnansweredPerLabel: Object.fromEntries(Object.entries(oldestPerLabel).map(([name, r]) => [name, show(r)])),
    ...(more ? { note: `Only the newest ${MAX_THREADS} conversations were looked at; older ones are not in these counts. Narrow it with since.` } : {}),
    ...(mine.incomplete ? { warning: 'Could not read your send-as addresses, so replies sent from an alias may look unanswered.' } : {})
  };
}

export async function findUnanswered(args, clients, { now = Date.now() } = {}) {
  const { gmail, actingAs } = clients;
  const labels = await labelNames(gmail);
  const l = findLabel(labels, args.label);
  if (!l) return { found: false, note: `No label called "${args.label}" in ${actingAs}'s mailbox.` };
  const hours = Number.isFinite(Number(args.olderThanHours)) ? Number(args.olderThanHours) : 24;
  const mine = await myAddresses(gmail, actingAs);
  const { threads, more } = await loadThreads(gmail, { labelIds: [l.id], max: MAX_THREADS_UNANSWERED });
  const waiting = threads.map((t) => describeThread(t, mine)).filter((r) => r && r.unanswered && now - r.lastAt >= hours * HOUR)
    .sort((a, b) => a.lastAt - b.lastAt)
    .map((r) => ({ threadId: r.threadId, subject: r.subject, from: r.lastFrom, waitingHours: Math.round((now - r.lastAt) / HOUR), messages: r.messages, unread: r.unread }));
  return { found: true, mailbox: actingAs, label: l.name, olderThanHours: hours, count: waiting.length, threads: waiting, ...(more ? { note: `Only the newest ${MAX_THREADS_UNANSWERED} conversations in this label were looked at, so the OLDEST waiting ones may be missing. Narrow the label or answer the newest first.` } : {}), ...(mine.incomplete ? { warning: 'Could not read your send-as addresses, so replies sent from an alias may look unanswered.' } : {}) };
}

export const tools = [
  { name: 'gmail_inbox_summary', description: "What is waiting in the acting mailbox: conversation count, unread, how many are waiting for a reply (last message is from someone else), top senders, and the oldest unanswered conversation in each of your labels. Optional label (default: the inbox) and since (7d, 48h or a date). Read-only.", inputSchema: { type: 'object', properties: { label: { type: 'string', description: 'Label name, e.g. Leads. Default: the inbox.' }, since: { type: 'string', description: '7d, 48h or a date' } } } },
  { name: 'gmail_find_unanswered', description: 'Conversations in a label where the last message is from someone else and has been waiting at least olderThanHours (default 24), oldest first. Read-only.', inputSchema: { type: 'object', properties: { label: { type: 'string' }, olderThanHours: { type: 'number', default: 24 } }, required: ['label'] } }
];
export const handlers = {
  gmail_inbox_summary: async (args, clients) => ok(await inboxSummary(args, clients)),
  gmail_find_unanswered: async (args, clients) => ok(await findUnanswered(args, clients))
};
