import { describe, it, expect } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { inboxSummary, findUnanswered, sinceClause, describeThread } from '../../src/tools/inbox.js';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const H = 3600000;
const msg = (from, hoursAgo, labels = ['INBOX'], subject = 'Hello') => ({ internalDate: String(NOW - hoursAgo * H), labelIds: labels, payload: { headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }] } });
const thread = (id, ...messages) => ({ id, messages });

// the fake returns one value per path, so serve threads.get from a function
function setup(threads, opts) {
  const f = makeFakeClients({ actingAs: 'ops@x.test' });
  const byId = Object.fromEntries(threads.map((t) => [t.id, t]));
  f.when('gmail.users.labels.list').resolves({ data: { labels: (opts?.labels) || [{ id: 'INBOX', name: 'INBOX', type: 'system' }, { id: 'L1', name: 'Leads', type: 'user' }, { id: 'L2', name: 'Support', type: 'user' }] } });
  f.when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: [{ sendAsEmail: 'ops@x.test' }, { sendAsEmail: 'help@x.test' }] } });
  f.when('gmail.users.threads.list').resolves({ data: { threads: threads.map((t) => ({ id: t.id })) } });
  f.when('gmail.users.threads.get').resolves(({ id }) => ({ data: byId[id] }));
  return f;
}

describe('sinceClause', () => {
  it('reads days, hours and dates, and rejects nonsense', () => {
    expect(sinceClause('7d', NOW)).toBe(`after:${Math.floor((NOW - 7 * 24 * H) / 1000)}`);
    expect(sinceClause('48h', NOW)).toBe(`after:${Math.floor((NOW - 48 * H) / 1000)}`);
    expect(sinceClause('2026-09-28')).toBe(`after:${Math.floor(Date.parse('2026-09-28') / 1000)}`);
    expect(sinceClause(undefined)).toBe('');
    expect(() => sinceClause('soonish')).toThrow(/could not read/);
  });
});

describe('describeThread', () => {
  const mine = new Set(['ops@x.test', 'help@x.test']);
  it('a thread is unanswered when the LAST message is from someone else', () => {
    expect(describeThread(thread('a', msg('Cust <c@y.test>', 5)), mine).unanswered).toBe(true);
    expect(describeThread(thread('b', msg('c@y.test', 9), msg('ops@x.test', 2, ['SENT'])), mine).unanswered).toBe(false);
    expect(describeThread(thread('c', msg('ops@x.test', 9, ['SENT']), msg('c@y.test', 2)), mine).unanswered).toBe(true);
  });
  it('replies from any of my own send-as addresses count as answered, whatever the case or display name', () => {
    expect(describeThread(thread('d', msg('c@y.test', 9), msg('"Support" <HELP@x.test>', 2, [])), mine).unanswered).toBe(false);
  });
  it('a draft is not an answer; order does not depend on how Google lists the messages', () => {
    expect(describeThread(thread('e', msg('c@y.test', 5), msg('other@y.test', 1, ['DRAFT'])), mine).unanswered).toBe(false); // a DRAFT label alone is enough, even from an address not in my list
    expect(describeThread(thread('f', msg('ops@x.test', 1, ['SENT']), msg('c@y.test', 5)), mine).unanswered).toBe(false); // out-of-order list: the newest is mine
  });
  it('bounces, no-reply and list mail, and a last message in the bin, do not count as someone waiting', () => {
    for (const from of ['Mail Delivery <mailer-daemon@googlemail.com>', 'noreply@shop.test', 'no-reply@shop.test', 'postmaster@y.test', 'bounces@y.test']) {
      expect(describeThread(thread('x', msg(from, 3)), mine).unanswered, from).toBe(false);
    }
    const listMail = msg('news@y.test', 3); listMail.payload.headers.push({ name: 'List-Id', value: '<list.y.test>' });
    expect(describeThread(thread('l', listMail), mine).unanswered).toBe(false);
    const auto = msg('c@y.test', 3); auto.payload.headers.push({ name: 'Auto-Submitted', value: 'auto-replied' });
    expect(describeThread(thread('a', auto), mine).unanswered).toBe(false);
    expect(describeThread(thread('t', msg('c@y.test', 3, ['TRASH'])), mine).unanswered).toBe(false);
    expect(describeThread(thread('p', msg('', 3)), mine).unanswered).toBe(false);
  });
  it('an empty thread is ignored', () => expect(describeThread({ id: 'z', messages: [] }, mine)).toBeNull());
});

describe('gmail_inbox_summary', () => {
  const threads = [
    thread('t1', msg('Ann <a@y.test>', 50, ['INBOX', 'UNREAD', 'L1'], 'Quote please')),
    thread('t2', msg('Ann <a@y.test>', 30, ['INBOX', 'L1'], 'Another')),
    thread('t3', msg('bob@z.test', 10, ['INBOX', 'UNREAD', 'L2'], 'Broken dryer'), msg('help@x.test', 8, ['SENT', 'L2'])),
    thread('t4', msg('bob@z.test', 3, ['INBOX', 'L2'], 'Thanks'))
  ];
  it('counts, finds who is waiting, and the oldest unanswered per label', async () => {
    const f = setup(threads);
    const out = await inboxSummary({}, f.clients, { now: NOW });
    expect(out).toMatchObject({ found: true, conversations: 4, unread: 2, waitingForReply: 3 });
    expect(out.topSenders[0]).toEqual({ from: 'a@y.test', waiting: 2 });
    expect(out.oldestUnansweredPerLabel.Leads).toMatchObject({ threadId: 't1', waitingHours: 50 });
    expect(out.oldestUnansweredPerLabel.Support).toMatchObject({ threadId: 't4', waitingHours: 3 });
    expect(out.oldestUnansweredPerLabel.INBOX).toBeUndefined();
  });
  it('searches the inbox (not everything) and applies since', async () => {
    const f = setup(threads);
    await inboxSummary({ since: '7d' }, f.clients, { now: NOW });
    expect(f.calls.find((c) => c.path === 'gmail.users.threads.list').args[0].q).toBe(`in:inbox after:${Math.floor((NOW - 7 * 24 * H) / 1000)}`);
  });
  it('can look inside one label, and says what labels exist when the name is wrong', async () => {
    const f = setup(threads);
    await inboxSummary({ label: 'leads' }, f.clients, { now: NOW });
    expect(f.calls.find((c) => c.path === 'gmail.users.threads.list').args[0].labelIds).toEqual(['L1']);
    const bad = await inboxSummary({ label: 'Nope' }, setup(threads).clients, { now: NOW });
    expect(bad.found).toBe(false);
    expect(bad.note).toContain('Leads, Support');
  });
  it('only reads: no changing call is ever made', async () => {
    const f = setup(threads);
    await inboxSummary({}, f.clients, { now: NOW });
    await findUnanswered({ label: 'Leads' }, f.clients, { now: NOW });
    expect(f.calls.filter((c) => !/\.(get|list)$/.test(c.path))).toEqual([]);
  });
});

describe('when the mailbox is big or the address list cannot be read', () => {
  it('find_unanswered pages past 100 conversations, and says the OLDEST may be missing when it still has to stop', async () => {
    const many = Array.from({ length: 130 }, (_, i) => thread(`t${i}`, msg('a@y.test', 100 + i, ['L1'])));
    const f = setup(many);
    const pages = [many.slice(0, 100), many.slice(100)];
    let n = 0;
    f.when('gmail.users.threads.list').resolves(() => { const page = pages[n++]; return { data: { threads: page.map((t) => ({ id: t.id })), nextPageToken: n < 2 ? 'next' : undefined } }; });
    const out = await findUnanswered({ label: 'Leads', olderThanHours: 0 }, f.clients, { now: NOW });
    expect(out.count).toBe(130);
    expect(out.note).toBeUndefined();
    const stuck = setup(many.slice(0, 100));
    stuck.when('gmail.users.threads.list').resolves({ data: { threads: many.slice(0, 100).map((t) => ({ id: t.id })), nextPageToken: 'always-more' } });
    const cut = await findUnanswered({ label: 'Leads', olderThanHours: 0 }, stuck.clients, { now: NOW });
    expect(cut.note).toMatch(/OLDEST waiting ones may be missing/);
  });
  it('warns when the send-as list cannot be read, because alias replies would look unanswered', async () => {
    const f = setup([thread('a', msg('c@y.test', 5, ['INBOX']))]);
    f.when('gmail.users.settings.sendAs.list').rejects(new Error('nope'));
    expect((await inboxSummary({}, f.clients, { now: NOW })).warning).toMatch(/send-as addresses/);
  });
});

describe('gmail_find_unanswered', () => {
  const threads = [
    thread('new', msg('a@y.test', 2, ['L1'])),
    thread('old', msg('b@y.test', 60, ['L1'])),
    thread('mid', msg('c@y.test', 30, ['L1'])),
    thread('answered', msg('d@y.test', 90, ['L1']), msg('ops@x.test', 80, ['SENT', 'L1']))
  ];
  it('lists only threads waiting at least the given hours, oldest first', async () => {
    const out = await findUnanswered({ label: 'Leads', olderThanHours: 24 }, setup(threads).clients, { now: NOW });
    expect(out.threads.map((t) => t.threadId)).toEqual(['old', 'mid']);
    expect(out.count).toBe(2);
    expect(out.threads[0].waitingHours).toBe(60);
  });
  it('defaults to 24 hours, and 0 hours means everything unanswered', async () => {
    expect((await findUnanswered({ label: 'Leads' }, setup(threads).clients, { now: NOW })).olderThanHours).toBe(24);
    expect((await findUnanswered({ label: 'Leads', olderThanHours: 0 }, setup(threads).clients, { now: NOW })).count).toBe(3);
  });
  it('an unknown label says so instead of returning an empty list that looks like good news', async () => {
    const out = await findUnanswered({ label: 'Nothing' }, setup(threads).clients, { now: NOW });
    expect(out.found).toBe(false);
  });
});
