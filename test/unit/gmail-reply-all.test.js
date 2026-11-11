import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { computeReplyRecipients } = await import('../../src/tools/gmail.js');

const body = (r) => JSON.parse(r.content[0].text);
const run = (name, args, clients) => registry.handlers[name](args, clients).then(body);

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' });
});

// The thread that broke on 2026-11-11, reduced to stand-ins: the owner opened
// the thread to six people (m1), then sent the newest message himself (m2) —
// so a plain "reply" computed from the newest message goes back to the owner,
// and only a real reply-all reaches the other participants.
const THREAD = {
  data: {
    id: 't1',
    messages: [
      { id: 'm1', payload: { headers: [
        { name: 'From', value: 'Owner <owner@me.test>' },
        { name: 'To', value: 'Lead <lead@co.test>, Ann <ann@co.test>, Bob <bob@co.test>' },
        { name: 'Cc', value: 'Carol <carol@co.test>' },
        { name: 'Subject', value: 'Acquisition Interest' },
        { name: 'Message-ID', value: '<m1@mail>' }
      ] } },
      { id: 'm2', payload: { headers: [
        { name: 'From', value: 'Lead <lead@co.test>' },
        { name: 'To', value: 'Owner <owner@me.test>' },
        { name: 'Subject', value: 'Re: Acquisition Interest' },
        { name: 'Message-ID', value: '<m2@mail>' },
        { name: 'References', value: '<m1@mail>' }
      ] } },
      { id: 'm3', payload: { headers: [
        { name: 'From', value: 'Owner <owner@me.test>' },
        { name: 'To', value: 'Lead <lead@co.test>, Ann <ann@co.test>, Bob <bob@co.test>' },
        { name: 'Subject', value: 'Re: Acquisition Interest' },
        { name: 'Message-ID', value: '<m3@mail>' },
        { name: 'References', value: '<m1@mail> <m2@mail>' }
      ] } }
    ]
  }
};

const stubThread = (when) => {
  when('gmail.users.threads.get').resolves(THREAD);
  when('gmail.users.getProfile').resolves({ data: { emailAddress: 'owner@me.test' } });
  when('gmail.users.messages.send').resolves({ data: { id: 'sent1', threadId: 't1' } });
  when('gmail.users.messages.get').resolves({ data: { id: 'sent1', threadId: 't1', labelIds: ['SENT'], payload: { headers: [{ name: 'Subject', value: 'Re: Acquisition Interest' }] } } });
};

const sentRaw = (calls) => {
  const send = calls.find((c) => c.path === 'gmail.users.messages.send');
  expect(send, 'a message was sent').toBeTruthy();
  return { requestBody: send.args[0].requestBody, raw: Buffer.from(send.args[0].requestBody.raw, 'base64url').toString('utf8') };
};
const headerLine = (raw, name) => raw.split('\r\n').find((l) => l.toLowerCase().startsWith(name.toLowerCase() + ':')) || '';

describe('gmail_reply_to_thread: reply-all', () => {
  it('acceptance: newest message is the owner\'s own — reply-all reaches the other participants plus an added recipient, in the thread, owner excluded', async () => {
    const { clients, calls, when } = makeFakeClients();
    stubThread(when);
    const out = await run('gmail_reply_to_thread', { threadId: 't1', body: 'Adding the CFO here.', replyAll: true, addTo: 'CFO <cfo@co.test>', confirm: true }, clients);
    expect(out.done).toBe(true);
    const { requestBody, raw } = sentRaw(calls);
    expect(requestBody.threadId).toBe('t1');
    const to = headerLine(raw, 'To');
    for (const addr of ['lead@co.test', 'ann@co.test', 'bob@co.test', 'cfo@co.test']) expect(to).toContain(addr);
    expect(to).not.toContain('owner@me.test');
    expect(headerLine(raw, 'Cc')).toBe('');
    expect(headerLine(raw, 'In-Reply-To')).toContain('<m3@mail>');
    expect(headerLine(raw, 'References')).toContain('<m1@mail> <m2@mail> <m3@mail>');
    expect(headerLine(raw, 'Subject')).toContain('Re: Acquisition Interest');
  });

  it('reply-all anchored to an earlier message uses that message\'s participants and headers', async () => {
    const { clients, calls, when } = makeFakeClients();
    stubThread(when);
    await run('gmail_reply_to_thread', { threadId: 't1', body: 'Answering the original note.', replyAll: true, replyToMessageId: 'm1', confirm: true }, clients);
    const { raw } = sentRaw(calls);
    const to = headerLine(raw, 'To');
    // m1 was the owner's own opening message: its To line is the participant set.
    for (const addr of ['lead@co.test', 'ann@co.test', 'bob@co.test']) expect(to).toContain(addr);
    expect(to).not.toContain('owner@me.test');
    expect(headerLine(raw, 'Cc')).toContain('carol@co.test');
    expect(headerLine(raw, 'In-Reply-To')).toContain('<m1@mail>');
  });

  it('reply-all anchored to a message addressed only to the owner leaves just its sender', async () => {
    const { clients, calls, when } = makeFakeClients();
    stubThread(when);
    await run('gmail_reply_to_thread', { threadId: 't1', body: 'Answering that reply.', replyAll: true, replyToMessageId: 'm2', confirm: true }, clients);
    const { raw } = sentRaw(calls);
    const to = headerLine(raw, 'To');
    expect(to).toContain('lead@co.test');
    expect(to).not.toContain('owner@me.test');
    expect(headerLine(raw, 'In-Reply-To')).toContain('<m2@mail>');
    expect(headerLine(raw, 'References')).toContain('<m1@mail> <m2@mail>');
  });

  it('dry-run preview names the computed recipients and sends nothing', async () => {
    const { clients, calls, when } = makeFakeClients();
    stubThread(when);
    const out = await run('gmail_reply_to_thread', { threadId: 't1', body: 'Adding the CFO here.', replyAll: true, addTo: 'CFO <cfo@co.test>', dryRun: true }, clients);
    expect(out).toMatchObject({ done: false, dryRun: true });
    expect(out.before.repliesGoTo).toContain('cfo@co.test');
    expect(out.before.repliesGoTo).toContain('lead@co.test');
    expect(out.before.repliesGoTo).not.toContain('owner@me.test');
    expect(calls.some((c) => c.path === 'gmail.users.messages.send')).toBe(false);
  });

  it('an unknown replyToMessageId refuses and sends nothing', async () => {
    const { clients, calls, when } = makeFakeClients();
    stubThread(when);
    await expect(run('gmail_reply_to_thread', { threadId: 't1', body: 'x', replyToMessageId: 'nope', confirm: true }, clients)).rejects.toThrow(/replyToMessageId/);
    expect(calls.some((c) => c.path === 'gmail.users.messages.send')).toBe(false);
  });

  it('explicit to replaces the computed list; addCc appends', async () => {
    const { clients, calls, when } = makeFakeClients();
    stubThread(when);
    await run('gmail_reply_to_thread', { threadId: 't1', body: 'Direct answer.', to: 'Only <only@co.test>', addCc: 'Watcher <watcher@co.test>', confirm: true }, clients);
    const { raw } = sentRaw(calls);
    expect(headerLine(raw, 'To')).toContain('only@co.test');
    expect(headerLine(raw, 'To')).not.toContain('lead@co.test');
    expect(headerLine(raw, 'Cc')).toContain('watcher@co.test');
  });
});

describe('gmail_reply_to_thread: plain reply behaviour is unchanged', () => {
  it('plain reply still goes to the most recent message\'s sender only, in the thread', async () => {
    const { clients, calls, when } = makeFakeClients();
    stubThread(when);
    await run('gmail_reply_to_thread', { threadId: 't1', body: 'Plain reply.', confirm: true }, clients);
    const { requestBody, raw } = sentRaw(calls);
    expect(requestBody.threadId).toBe('t1');
    const to = headerLine(raw, 'To');
    expect(to).toContain('owner@me.test'); // the newest message (m3) is the owner's own: the documented plain-reply behaviour
    expect(to).not.toContain('lead@co.test');
    expect(headerLine(raw, 'Cc')).toBe('');
    expect(headerLine(raw, 'In-Reply-To')).toContain('<m3@mail>');
  });

  it('plain reply to someone else\'s message still answers just them', async () => {
    const { clients, calls, when } = makeFakeClients();
    stubThread(when);
    await run('gmail_reply_to_thread', { threadId: 't1', body: 'Plain reply.', replyToMessageId: 'm2', confirm: true }, clients);
    const { raw } = sentRaw(calls);
    expect(headerLine(raw, 'To')).toContain('lead@co.test');
    expect(headerLine(raw, 'To')).not.toContain('ann@co.test');
  });
});

describe('computeReplyRecipients', () => {
  const headers = [
    { name: 'From', value: 'Lead <lead@co.test>' },
    { name: 'To', value: 'Owner <owner@me.test>, Ann <ann@co.test>' },
    { name: 'Cc', value: 'Owner <owner@me.test>, Carol <carol@co.test>, Ann <ann@co.test>' }
  ];
  it('reply-all: sender + To participants in To, Cc participants in Cc, own address and duplicates removed', () => {
    const { to, cc } = computeReplyRecipients({ headers, ownEmail: 'owner@me.test', replyAll: true });
    expect(to).toContain('lead@co.test');
    expect(to).toContain('ann@co.test');
    expect(to).not.toContain('owner@me.test');
    expect(cc).toContain('carol@co.test');
    expect(cc).not.toContain('ann@co.test');
    expect(cc).not.toContain('owner@me.test');
  });
  it('plain: sender only', () => {
    const { to, cc } = computeReplyRecipients({ headers, ownEmail: 'owner@me.test' });
    expect(to).toBe('Lead <lead@co.test>');
    expect(cc).toBeUndefined();
  });
});
