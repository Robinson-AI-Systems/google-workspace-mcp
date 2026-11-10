import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { GUARDS_MAIL } = await import('../../src/tools/guards-mail.js');

const body = (r) => JSON.parse(r.content[0].text);
const READ_ONLY = /\.(get|list|search)[A-Za-z]*$/;
const mutations = (calls) => calls.filter((c) => !READ_ONLY.test(c.path));
const run = (name, args, clients) => registry.handlers[name](args, clients).then(body);

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' });
});

// A realistic call for every tool in this table.
const CALLS = {
  gmail_send_email: { to: 'a@b.test', subject: 'Hi', body: 'secret body text' },
  gmail_send_with_attachment: { to: 'a@b.test', subject: 'Hi', body: 'x', attachments: [{ filename: 'f.txt', base64Data: 'aGVsbG8=' }] },
  gmail_forward_message: { messageId: 'm1', to: 'a@b.test' },
  gmail_reply_to_thread: { threadId: 't1', body: 'reply' },
  gmail_send_draft: { draftId: 'd1' },
  gmail_add_forwarding_address: { forwardingEmail: 'fwd@b.test' },
  gmail_update_imap_settings: { enabled: true },
  gmail_update_pop_settings: { accessWindow: 'allMail' },
  gmail_create_send_as: { sendAsEmail: 'support@b.test' },
  gmail_add_delegate: { delegateEmail: 'asst@b.test' },
  calendar_add_attendee: { eventId: 'e1', email: 'g@b.test' },
  chat_create_space: { displayName: 'Ops' },
  chat_add_member: { spaceName: 'spaces/S', memberEmail: 'g@b.test' },
  chat_send_message: { spaceName: 'spaces/S', text: 'hello team' }
};
// Calls that are risky only in some uses.
const RISKY_SOMETIMES = {
  calendar_create_recurring_event: { summary: 'Standup', start: '2026-01-05T09:00:00Z', end: '2026-01-05T09:15:00Z', recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=3', attendees: ['g@b.test'] },
  calendar_create_video_meeting: { summary: 'Sync', start: '2026-01-05T09:00:00Z', end: '2026-01-05T09:30:00Z', attendees: ['g@b.test'] },
  calendar_quick_add: { text: 'Lunch with sam@b.test tomorrow 1pm' },
  calendar_update_event: { eventId: 'e1', updates: { summary: 'Moved' } }
};

describe('mail/calendar/tasks/contacts/chat safety table: shape', () => {
  it('has the expected destructive tools and none of the others', () => {
    const destructive = Object.entries(GUARDS_MAIL).filter(([, s]) => s.destructive).map(([n]) => n).sort();
    expect(destructive).toEqual(Object.keys(CALLS).sort());
  });
  it('every tool with a risky-only-sometimes rule is not always destructive', () => {
    for (const n of Object.keys(RISKY_SOMETIMES)) {
      expect(GUARDS_MAIL[n].destructive).toBe(false);
      expect(typeof GUARDS_MAIL[n].confirmWhen).toBe('function');
    }
  });
});

describe('destructive tools refuse without confirm and touch nothing', () => {
  for (const [name, args] of Object.entries(CALLS)) {
    it(`${name}: no confirm means no Google mutation and no change-log row`, async () => {
      const { clients, calls } = makeFakeClients();
      const out = await run(name, args, clients);
      expect(out).toMatchObject({ done: false, needsConfirmation: true });
      expect(mutations(calls)).toEqual([]);
      expect(await holder.db.listRecentChanges()).toEqual([]);
    });
    it(`${name}: confirm: false is still a refusal`, async () => {
      const { clients, calls } = makeFakeClients();
      const out = await run(name, { ...args, confirm: false }, clients);
      expect(out.needsConfirmation).toBe(true);
      expect(mutations(calls)).toEqual([]);
    });
    it(`${name}: dryRun previews, says confirm is needed, and changes nothing`, async () => {
      const { clients, calls } = makeFakeClients();
      const out = await run(name, { ...args, dryRun: true, confirm: true }, clients);
      expect(out).toMatchObject({ done: false, dryRun: true });
      expect(out.note).toMatch(/confirm: true/);
      expect(mutations(calls)).toEqual([]);
    });
  }
});

describe('sends only happen with confirm', () => {
  const SENDS = { gmail_send_email: 'gmail.users.messages.send', gmail_send_with_attachment: 'gmail.users.messages.send', gmail_reply_to_thread: 'gmail.users.messages.send', gmail_forward_message: 'gmail.users.messages.send', gmail_send_draft: 'gmail.users.drafts.send', chat_send_message: 'chat.spaces.messages.create' };
  for (const [name, path] of Object.entries(SENDS)) {
    it(`${name}: sends nothing without confirm, exactly once with it`, async () => {
      const a = makeFakeClients();
      await run(name, CALLS[name], a.clients);
      expect(a.calls.filter((c) => c.path === path)).toHaveLength(0);
      const b = makeFakeClients();
      b.when('gmail.users.threads.get').resolves({ data: { messages: [{ payload: { headers: [{ name: 'From', value: 'x@y.test' }, { name: 'Subject', value: 's' }] } }] } });
      b.when('gmail.users.messages.get').resolves({ data: { payload: { headers: [{ name: 'Subject', value: 's' }] } } });
      await run(name, { ...CALLS[name], confirm: true }, b.clients);
      expect(b.calls.filter((c) => c.path === path)).toHaveLength(1);
    });
  }
});

describe('descriptions show recipients and sizes, never the text', () => {
  it('send_email names who and how long, not what', async () => {
    const { clients } = makeFakeClients();
    const out = await run('gmail_send_email', { ...CALLS.gmail_send_email, cc: 'c@b.test', bcc: 'd@b.test' }, clients);
    expect(out.summary).toContain('a@b.test');
    expect(out.summary).toContain('cc c@b.test');
    expect(out.summary).toContain('bcc d@b.test');
    expect(out.summary).toContain('"Hi"');
    expect(out.summary).not.toContain('secret body text');
  });
  it('attachments are listed by name and size, not content', async () => {
    const { clients } = makeFakeClients();
    const out = await run('gmail_send_with_attachment', { to: 'a@b.test', subject: 's', body: 'x', attachments: [{ filename: 'plan.pdf', base64Data: 'QUJDREVGR0g=' }] }, clients);
    expect(out.summary).toMatch(/plan\.pdf/);
    expect(out.summary).not.toContain('QUJDREVGR0g=');
  });
  it('chat_send_message does not echo the text', async () => {
    const { clients } = makeFakeClients();
    const out = await run('chat_send_message', { spaceName: 'spaces/S', text: 'private plans' }, clients);
    expect(JSON.stringify(out)).not.toContain('private plans');
  });
});

describe('sent messages are read back by the id Google returned', () => {
  it('confirmed: true when the message carries the SENT label', async () => {
    const { clients, when, calls } = makeFakeClients();
    when('gmail.users.messages.send').resolves({ data: { id: 'sent1', threadId: 't1' } });
    when('gmail.users.messages.get').resolves({ data: { id: 'sent1', threadId: 't1', labelIds: ['SENT'], payload: { headers: [{ name: 'Subject', value: 'Hi' }, { name: 'To', value: 'a@b.test' }] } } });
    const out = await run('gmail_send_email', { ...CALLS.gmail_send_email, confirm: true }, clients);
    expect(out).toMatchObject({ done: true, confirmed: true, after: { id: 'sent1', subject: 'Hi' } });
    expect(calls.some((c) => c.path === 'gmail.users.messages.get' && c.args[0].id === 'sent1')).toBe(true);
  });
  it('confirmed: false when Google cannot show the sent message', async () => {
    const { clients, when } = makeFakeClients();
    when('gmail.users.messages.send').resolves({ data: { id: 'sent1' } });
    when('gmail.users.messages.get').resolves({ data: { id: 'sent1', labelIds: ['DRAFT'] } });
    expect((await run('gmail_send_email', { ...CALLS.gmail_send_email, confirm: true }, clients)).confirmed).toBe(false);
  });
  it('confirmed: false when the send returned no id', async () => {
    const { clients } = makeFakeClients();
    expect((await run('gmail_send_email', { ...CALLS.gmail_send_email, confirm: true }, clients)).confirmed).toBe(false);
  });
});

describe('read-back mismatch gives confirmed: false', () => {
  it('gmail_modify_message: label not actually added', async () => {
    const { clients, when, calls } = makeFakeClients();
    when('gmail.users.messages.get').resolves({ data: { id: 'm1', labelIds: ['INBOX'] } });
    const out = await run('gmail_modify_message', { messageId: 'm1', addLabelIds: ['Label_1'] }, clients);
    expect(calls.some((c) => c.path === 'gmail.users.messages.modify')).toBe(true); // no confirm needed: reversible
    expect(out).toMatchObject({ done: true, confirmed: false });
    expect(out.warning).toMatch(/does not show/);
  });
  it('gmail_modify_message: label still present after a remove is not confirmed', async () => {
    const { clients, when } = makeFakeClients();
    when('gmail.users.messages.get').resolves({ data: { id: 'm1', labelIds: ['INBOX', 'STARRED'] } });
    expect((await run('gmail_modify_message', { messageId: 'm1', removeLabelIds: ['STARRED'] }, clients)).confirmed).toBe(false);
  });
  it('gmail_modify_message: confirmed when Google shows the requested labels', async () => {
    const { clients, when } = makeFakeClients();
    when('gmail.users.messages.get').resolvesOnce({ data: { id: 'm1', labelIds: ['INBOX', 'STARRED'] } });
    when('gmail.users.messages.get').resolves({ data: { id: 'm1', labelIds: ['INBOX', 'Label_1'] } });
    const out = await run('gmail_modify_message', { messageId: 'm1', addLabelIds: ['Label_1'], removeLabelIds: ['STARRED'] }, clients);
    expect(out).toMatchObject({ confirmed: true, before: { labelIds: ['INBOX', 'STARRED'] }, after: { labelIds: ['INBOX', 'Label_1'] } });
  });
  it('gmail_mark_read: still unread afterwards is not confirmed; read is', async () => {
    const a = makeFakeClients();
    a.when('gmail.users.messages.get').resolves({ data: { id: 'm1', labelIds: ['UNREAD'] } });
    expect((await run('gmail_mark_read', { messageId: 'm1' }, a.clients)).confirmed).toBe(false);
    const b = makeFakeClients();
    b.when('gmail.users.messages.get').resolves({ data: { id: 'm1', labelIds: ['INBOX'] } });
    expect((await run('gmail_mark_read', { messageId: 'm1' }, b.clients)).confirmed).toBe(true);
  });
  it('gmail_trash_message: not in the trash afterwards is not confirmed', async () => {
    const { clients, when } = makeFakeClients();
    when('gmail.users.messages.get').resolves({ data: { id: 'm1', labelIds: ['INBOX'] } });
    expect((await run('gmail_trash_message', { messageId: 'm1' }, clients)).confirmed).toBe(false);
  });
  it('gmail_modify_thread: one message missing the label is not confirmed', async () => {
    const { clients, when } = makeFakeClients();
    when('gmail.users.threads.get').resolves({ data: { id: 't', messages: [{ labelIds: ['L1'] }, { labelIds: [] }] } });
    expect((await run('gmail_modify_thread', { threadId: 't', addLabelIds: ['L1'] }, clients)).confirmed).toBe(false);
  });
  it('gmail_create_label: the created label is read back by its id', async () => {
    const { clients, when, calls } = makeFakeClients();
    when('gmail.users.labels.create').resolves({ data: { id: 'Label_9', name: 'Bills' } });
    when('gmail.users.labels.get').resolves({ data: { id: 'Label_9', name: 'Bills' } });
    expect((await run('gmail_create_label', { name: 'Bills' }, clients)).confirmed).toBe(true);
    expect(calls.some((c) => c.path === 'gmail.users.labels.get' && c.args[0].id === 'Label_9')).toBe(true);
  });
  it('calendar_update_event: a changed title that Google does not show is not confirmed', async () => {
    const { clients, when, calls } = makeFakeClients();
    when('calendar.events.get').resolves({ data: { id: 'e1', summary: 'Old title' } });
    const out = await run('calendar_update_event', { eventId: 'e1', updates: { summary: 'New title' }, confirm: true }, clients);
    expect(calls.some((c) => c.path === 'calendar.events.patch')).toBe(true);
    expect(out).toMatchObject({ done: true, confirmed: false });
  });
  it('calendar_update_event: confirmed when the event shows the change, times compared as moments', async () => {
    const { clients, when } = makeFakeClients();
    when('calendar.events.get').resolves({ data: { id: 'e1', summary: 'New', start: { dateTime: '2026-01-05T10:00:00+01:00' } } });
    const out = await run('calendar_update_event', { eventId: 'e1', sendUpdates: 'none', updates: { summary: 'New', start: { dateTime: '2026-01-05T09:00:00Z' } } }, clients);
    expect(out.confirmed).toBe(true);
  });
  it('calendar_set_event_color: wrong colour afterwards is not confirmed', async () => {
    const { clients, when } = makeFakeClients();
    when('calendar.events.get').resolves({ data: { id: 'e1', colorId: '3' } });
    expect((await run('calendar_set_event_color', { eventId: 'e1', colorId: '5' }, clients)).confirmed).toBe(false);
  });
  it('tasks_update_task: title not changed is not confirmed', async () => {
    const { clients, when } = makeFakeClients();
    when('tasks.tasks.get').resolves({ data: { id: 't', title: 'Old' } });
    expect((await run('tasks_update_task', { taskId: 't', title: 'New' }, clients)).confirmed).toBe(false);
  });
  it('tasks_create_task: confirmed when the created task is found by its id', async () => {
    const { clients, when } = makeFakeClients();
    when('tasks.tasks.insert').resolves({ data: { id: 'T9', title: 'Buy' } });
    when('tasks.tasks.get').resolves({ data: { id: 'T9', title: 'Buy' } });
    expect((await run('tasks_create_task', { title: 'Buy' }, clients)).confirmed).toBe(true);
  });
  it('contacts_update: a name Google does not show is not confirmed', async () => {
    const { clients, when } = makeFakeClients();
    when('people.people.get').resolves({ data: { resourceName: 'people/c1', names: [{ givenName: 'Old' }] } });
    expect((await run('contacts_update', { resourceName: 'people/c1', etag: 'e', givenName: 'New' }, clients)).confirmed).toBe(false);
  });
  it('gmail_update_imap_settings: confirmed only when the setting really changed', async () => {
    const a = makeFakeClients();
    a.when('gmail.users.settings.getImap').resolves({ data: { enabled: false } });
    expect((await run('gmail_update_imap_settings', { enabled: true, confirm: true }, a.clients)).confirmed).toBe(false);
    const b = makeFakeClients();
    b.when('gmail.users.settings.getImap').resolves({ data: { enabled: true } });
    expect((await run('gmail_update_imap_settings', { enabled: true, confirm: true }, b.clients)).confirmed).toBe(true);
  });
  it('gmail_add_delegate: confirmed when the delegate is listed afterwards', async () => {
    const { clients, when } = makeFakeClients();
    when('gmail.users.settings.delegates.get').resolves({ data: { delegateEmail: 'ASST@b.test' } });
    expect((await run('gmail_add_delegate', { delegateEmail: 'asst@b.test', confirm: true }, clients)).confirmed).toBe(true);
  });
});

describe('uses that are risky only sometimes', () => {
  it('calendar_update_event needs confirm when guests would be told (the default), not with sendUpdates none or a quiet change', async () => {
    const needs = async (args) => (await run('calendar_update_event', args, makeFakeClients().clients)).needsConfirmation === true;
    expect(await needs({ eventId: 'e', updates: { summary: 'x' } })).toBe(true);
    expect(await needs({ eventId: 'e', updates: { summary: 'x' }, sendUpdates: 'externalOnly' })).toBe(true);
    expect(await needs({ eventId: 'e', updates: { summary: 'x' }, sendUpdates: 'none' })).toBe(false);
    expect(await needs({ eventId: 'e', updates: { colorId: '3' } })).toBe(false);
    expect(await needs({ eventId: 'e', updates: { attendees: [{ email: 'n@b.test' }] }, sendUpdates: 'none' })).toBe(true);
  });
  it('calendar_update_event makes no change without confirm when guests would be told', async () => {
    const { clients, calls } = makeFakeClients();
    await run('calendar_update_event', RISKY_SOMETIMES.calendar_update_event, clients);
    expect(mutations(calls)).toEqual([]);
  });
  it('events that invite people need confirm; the same events without guests do not', async () => {
    for (const n of ['calendar_create_recurring_event', 'calendar_create_video_meeting']) {
      const a = makeFakeClients();
      const out = await run(n, RISKY_SOMETIMES[n], a.clients);
      expect(out.needsConfirmation, n).toBe(true);
      expect(mutations(a.calls), n).toEqual([]);
      const b = makeFakeClients();
      const solo = await run(n, { ...RISKY_SOMETIMES[n], attendees: [] }, b.clients);
      expect(solo.done, n).toBe(true);
    }
  });
  it('calendar_quick_add needs confirm only when the text names an email address', async () => {
    const a = makeFakeClients();
    expect((await run('calendar_quick_add', RISKY_SOMETIMES.calendar_quick_add, a.clients)).needsConfirmation).toBe(true);
    expect(mutations(a.calls)).toEqual([]);
    const b = makeFakeClients();
    expect((await run('calendar_quick_add', { text: 'Dentist Friday 3pm' }, b.clients)).done).toBe(true);
  });
});

describe('reversible tools do not need confirm but still preview without changing anything', () => {
  const PLAIN = {
    gmail_trash_message: { messageId: 'm1' }, gmail_mark_read: { messageId: 'm1' }, gmail_mark_unread: { messageId: 'm1' }, gmail_trash_thread: { threadId: 't1' },
    gmail_modify_thread: { threadId: 't1', addLabelIds: ['L'] }, gmail_create_label: { name: 'x' }, gmail_update_label: { labelId: 'L', name: 'y' },
    gmail_create_draft: { to: 'a@b.test', subject: 's', body: 'b' }, gmail_update_draft: { draftId: 'd', to: 'a@b.test', subject: 's', body: 'b' },
    calendar_create_calendar: { summary: 'c' }, calendar_move_event: { calendarId: 'primary', eventId: 'e', destinationCalendarId: 'other' }, calendar_set_event_color: { eventId: 'e', colorId: '1' },
    tasks_create_tasklist: { title: 't' }, tasks_update_tasklist: { tasklistId: 'l', title: 't' }, tasks_create_task: { title: 't' }, tasks_update_task: { taskId: 't', title: 'x' },
    contacts_create: { givenName: 'Sam' }, contacts_update: { resourceName: 'people/c1', etag: 'e', givenName: 'Sam' }
  };
  for (const [name, args] of Object.entries(PLAIN)) {
    it(`${name}: runs without confirm; dryRun changes nothing`, async () => {
      const a = makeFakeClients();
      expect((await run(name, { ...args, dryRun: true }, a.clients)).dryRun).toBe(true);
      expect(mutations(a.calls)).toEqual([]);
      const b = makeFakeClients();
      expect((await run(name, args, b.clients)).done).toBe(true);
      expect(mutations(b.calls).length).toBeGreaterThan(0);
    });
  }
  it('gmail_create_draft never sends anything', async () => {
    const { clients, calls } = makeFakeClients();
    await run('gmail_create_draft', PLAIN.gmail_create_draft, clients);
    expect(calls.some((c) => /\.send$/.test(c.path))).toBe(false);
  });
});
