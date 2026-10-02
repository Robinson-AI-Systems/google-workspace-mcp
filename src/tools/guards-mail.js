// Safety table, part: Gmail, Calendar, Tasks, Contacts, Chat.
// Same entry shape as guards.js (describe / before / after / destructive / confirmWhen / verify); see write.js.
// Descriptions show who and how big, never the text of a message (or any secret).
import { pick, data, D, same, SCALARS } from './guard-helpers.js';

// ---------- small helpers ----------
const hdr = (headers, name) => (headers || []).find((h) => String(h?.name).toLowerCase() === name.toLowerCase())?.value;
const eqi = (x, y) => String(x ?? '').trim().toLowerCase() === String(y ?? '').trim().toLowerCase();
const addrs = (s) => (String(s || '').toLowerCase().match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []);
const hasAll = (haveStr, wantStr) => { const have = new Set(addrs(haveStr)); return addrs(wantStr).every((x) => have.has(x)); };
const list = (v) => (Array.isArray(v) ? v : []);
const size = (s) => `${String(s ?? '').length} characters`;

const recipients = (a) => [a.to, a.cc && `cc ${a.cc}`, a.bcc && `bcc ${a.bcc}`].filter(Boolean).join(', ') || '(no recipient given)';
const subjectOf = (a) => (a.subject ? `"${String(a.subject).slice(0, 120)}"` : '(no subject)');
const attachmentsNote = (a) => {
  const files = list(a.attachments);
  if (!files.length) return '';
  const total = files.reduce((n, f) => n + Math.round(String(f?.base64Data || '').length * 0.75), 0);
  return `, with ${files.length} attachment(s) (${files.map((f) => String(f?.filename || 'unnamed').slice(0, 60)).join(', ')}; about ${total} bytes)`;
};

const msgMeta = async (gmail, id) => {
  const m = await data(gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Date'] }));
  return { id: m.id, threadId: m.threadId, labelIds: m.labelIds, subject: hdr(m.payload?.headers, 'Subject'), from: hdr(m.payload?.headers, 'From'), to: hdr(m.payload?.headers, 'To') };
};
const msgLabels = async (gmail, id) => pick(await data(gmail.users.messages.get({ userId: 'me', id, format: 'minimal' })), ['id', 'threadId', 'labelIds']);
const threadLabels = async (gmail, id) => {
  const t = await data(gmail.users.threads.get({ userId: 'me', id, format: 'minimal' }));
  const messages = list(t.messages);
  return { id: t.id, messages: messages.length, labelIdsPerMessage: messages.map((m) => m.labelIds || []) };
};
const draftMeta = async (gmail, id) => {
  const d = await data(gmail.users.drafts.get({ userId: 'me', id, format: 'metadata' }));
  const h = d.message?.payload?.headers;
  return { id: d.id, messageId: d.message?.id, subject: hdr(h, 'Subject'), to: hdr(h, 'To') };
};

// A message that was just sent: read it back by the id Google returned; it must carry the SENT label.
const sentAfter = (a, { gmail }, details) => (details?.id ? msgMeta(gmail, details.id) : { note: 'Google did not return the id of the sent message.' });
const sentVerify = (a, b, after, details) => Array.isArray(after?.labelIds) && after.labelIds.includes('SENT') && after.id === details?.id;

const labelsOk = (a, labels) => list(a.addLabelIds).every((l) => labels.includes(l)) && list(a.removeLabelIds).every((l) => !labels.includes(l));
const labelChange = (a) => [list(a.addLabelIds).length && `add ${list(a.addLabelIds).join(', ')}`, list(a.removeLabelIds).length && `remove ${list(a.removeLabelIds).join(', ')}`].filter(Boolean).join('; ') || 'no label changes given';

const labelView = (l) => pick(l, ['id', 'name', 'labelListVisibility', 'messageListVisibility', 'type']);
const sendAsView = (s) => pick(s, ['sendAsEmail', 'displayName', 'isDefault', 'replyToAddress', 'verificationStatus']);

// Calendar. A time compares as a moment (Google hands back the same moment with its own offset).
const moment = (t) => (t?.dateTime ? Date.parse(t.dateTime) : t?.date);
const eventView = (e) => ({
  ...pick(e, ['id', 'summary', 'location', 'start', 'end', 'status', 'colorId', 'visibility', 'transparency', 'htmlLink', 'hangoutLink']),
  descriptionLength: typeof e?.description === 'string' ? e.description.length : undefined,
  attendees: list(e?.attendees).map((p) => p.email)
});
const getEvent = (calendar, calendarId, eventId) => data(calendar.events.get({ calendarId: calendarId || 'primary', eventId })).then(eventView);
const createdEvent = (a, { calendar }, details) => (details?.id ? getEvent(calendar, a.calendarId, details.id) : { note: 'Google did not return the new event\'s id.' });
const createdVerify = (a, b, after, details) => !!details?.id && after?.id === details.id && (a.summary === undefined || after.summary === a.summary);
const inviting = (a) => (list(a.attendees).length ? `, inviting ${list(a.attendees).join(', ')}` : '');

const QUIET_EVENT_FIELDS = new Set(['colorId', 'reminders', 'transparency', 'visibility', 'extendedProperties']); // guests are not told about these
const READ_BACK_SCALARS = new Set(['summary', 'location', 'colorId', 'visibility', 'transparency', 'status']);
const eventMatches = (updates, after) => Object.entries(updates || {}).every(([k, v]) => {
  if (k === 'start' || k === 'end') return moment(after?.[k]) === moment(v);
  if (k === 'attendees') return list(v).every((p) => list(after?.attendees).some((x) => eqi(x, p?.email ?? p)));
  if (k === 'description') return typeof v !== 'string' || after?.descriptionLength === v.length;
  if (SCALARS.has(typeof v) && READ_BACK_SCALARS.has(k)) return same(after?.[k], v);
  return true; // fields we do not read back (reminders, recurrence, ...) are not claimed
});

const taskView = (t) => ({ ...pick(t, ['id', 'title', 'status', 'due']), notesLength: String(t?.notes || '').length });
const contactView = (p) => pick(p, ['resourceName', 'names', 'emailAddresses', 'phoneNumbers', 'organizations']);
const CONTACT_FIELDS = 'names,emailAddresses,phoneNumbers,organizations';

export const GUARDS_MAIL = {
  // ---------- Gmail: sending (reaches other people, cannot be taken back) ----------
  gmail_send_email: { destructive: D, verify: sentVerify,
    describe: (a) => ({ target: recipients(a), summary: `SEND an email to ${recipients(a)} with the subject ${subjectOf(a)} (body ${size(a.body)}${a.html ? ', HTML' : ''})` }),
    after: sentAfter },
  gmail_send_with_attachment: { destructive: D, verify: sentVerify,
    describe: (a) => ({ target: recipients(a), summary: `SEND an email to ${recipients(a)} with the subject ${subjectOf(a)} (body ${size(a.body)}${attachmentsNote(a)})` }),
    after: sentAfter },
  gmail_forward_message: { destructive: D, verify: sentVerify,
    describe: (a) => ({ target: a.to, summary: `FORWARD the email ${a.messageId} to ${a.to || '(no recipient given)'}${a.comment ? ` with a ${size(a.comment)} comment` : ''}` }),
    before: (a, { gmail }) => msgMeta(gmail, a.messageId),
    after: sentAfter },
  gmail_reply_to_thread: { destructive: D, verify: sentVerify,
    describe: (a) => ({ target: a.threadId, summary: `SEND a reply (${size(a.body)}) to the most recent message in the thread ${a.threadId}; it goes to that message's sender` }),
    before: async (a, { gmail }) => {
      const t = await data(gmail.users.threads.get({ userId: 'me', id: a.threadId, format: 'metadata', metadataHeaders: ['Subject', 'From'] }));
      const last = list(t.messages).at(-1);
      return { messages: list(t.messages).length, repliesGoTo: hdr(last?.payload?.headers, 'From'), subject: hdr(last?.payload?.headers, 'Subject') };
    },
    after: sentAfter },
  gmail_send_draft: { destructive: D, verify: sentVerify,
    describe: (a) => ({ target: a.draftId, summary: `SEND the saved draft ${a.draftId}` }),
    before: (a, { gmail }) => draftMeta(gmail, a.draftId),
    after: sentAfter },

  // ---------- Gmail: trash, labels, read state (recoverable) ----------
  gmail_trash_message: { destructive: false, verify: (a, b, after) => list(after?.labelIds).includes('TRASH'),
    describe: (a) => ({ target: a.messageId, summary: `Move the email ${a.messageId} to the trash (recoverable for 30 days)` }),
    before: (a, { gmail }) => msgMeta(gmail, a.messageId),
    after: (a, { gmail }) => msgLabels(gmail, a.messageId) },
  gmail_modify_message: { destructive: false, verify: (a, b, after) => labelsOk(a, list(after?.labelIds)),
    describe: (a) => ({ target: a.messageId, summary: `Change the labels on the email ${a.messageId}: ${labelChange(a)}` }),
    before: (a, { gmail }) => msgMeta(gmail, a.messageId),
    after: (a, { gmail }) => msgLabels(gmail, a.messageId) },
  gmail_mark_read: { destructive: false, verify: (a, b, after) => !list(after?.labelIds).includes('UNREAD'),
    describe: (a) => ({ target: a.messageId, summary: `Mark the email ${a.messageId} as read` }),
    before: (a, { gmail }) => msgMeta(gmail, a.messageId),
    after: (a, { gmail }) => msgLabels(gmail, a.messageId) },
  gmail_mark_unread: { destructive: false, verify: (a, b, after) => list(after?.labelIds).includes('UNREAD'),
    describe: (a) => ({ target: a.messageId, summary: `Mark the email ${a.messageId} as unread` }),
    before: (a, { gmail }) => msgMeta(gmail, a.messageId),
    after: (a, { gmail }) => msgLabels(gmail, a.messageId) },
  gmail_untrash_message: { destructive: false, verify: (a, b, after) => !list(after?.labelIds).includes('TRASH'),
    describe: (a) => ({ target: a.messageId, summary: `Move the email ${a.messageId} out of the trash` }),
    before: (a, { gmail }) => msgMeta(gmail, a.messageId),
    after: (a, { gmail }) => msgLabels(gmail, a.messageId) },
  gmail_untrash_thread: { destructive: false, verify: (a, b, after) => after?.messages > 0 && after.labelIdsPerMessage.every((l) => !l.includes('TRASH')),
    describe: (a) => ({ target: a.threadId, summary: `Move the whole email thread ${a.threadId} out of the trash` }),
    before: (a, { gmail }) => threadLabels(gmail, a.threadId),
    after: (a, { gmail }) => threadLabels(gmail, a.threadId) },
  gmail_trash_thread: { destructive: false, verify: (a, b, after) => after?.messages > 0 && after.labelIdsPerMessage.every((l) => l.includes('TRASH')),
    describe: (a) => ({ target: a.threadId, summary: `Move the whole email thread ${a.threadId} to the trash` }),
    before: (a, { gmail }) => threadLabels(gmail, a.threadId),
    after: (a, { gmail }) => threadLabels(gmail, a.threadId) },
  gmail_modify_thread: { destructive: false, verify: (a, b, after) => after?.messages > 0 && after.labelIdsPerMessage.every((l) => labelsOk(a, l)),
    describe: (a) => ({ target: a.threadId, summary: `Change the labels on every email in the thread ${a.threadId}: ${labelChange(a)}` }),
    before: (a, { gmail }) => threadLabels(gmail, a.threadId),
    after: (a, { gmail }) => threadLabels(gmail, a.threadId) },
  gmail_create_label: { destructive: false, verify: (a, b, after) => after?.name === a.name,
    describe: (a) => ({ target: a.name, summary: `Create the Gmail label "${a.name}"` }),
    after: async (a, { gmail }, details) => (details?.id ? labelView(await data(gmail.users.labels.get({ userId: 'me', id: details.id }))) : { note: 'Google did not return the new label\'s id.' }) },
  gmail_update_label: { destructive: false, verify: (a, b, after) => ['name', 'labelListVisibility', 'messageListVisibility'].every((k) => a[k] === undefined || after?.[k] === a[k]),
    describe: (a) => ({ target: a.labelId, summary: `Change the Gmail label ${a.labelId}: ${['name', 'labelListVisibility', 'messageListVisibility'].filter((k) => a[k] !== undefined).map((k) => `${k} to "${a[k]}"`).join(', ') || 'nothing given'}` }),
    before: async (a, { gmail }) => labelView(await data(gmail.users.labels.get({ userId: 'me', id: a.labelId }))),
    after: async (a, { gmail }) => labelView(await data(gmail.users.labels.get({ userId: 'me', id: a.labelId }))) },

  // ---------- Gmail: drafts (nothing leaves the mailbox) ----------
  gmail_create_draft: { destructive: false, verify: (a, b, after, details) => !!details?.id && after?.id === details.id && after.subject === a.subject,
    describe: (a) => ({ target: recipients(a), summary: `Save a draft (not sent) to ${recipients(a)} with the subject ${subjectOf(a)} (body ${size(a.body)})` }),
    after: (a, { gmail }, details) => (details?.id ? draftMeta(gmail, details.id) : { note: 'Google did not return the new draft\'s id.' }) },
  gmail_update_draft: { destructive: false, verify: (a, b, after) => after?.subject === a.subject && hasAll(after?.to, a.to),
    describe: (a) => ({ target: a.draftId, summary: `Replace the draft ${a.draftId} (to ${a.to || '(no recipient given)'}, subject ${subjectOf(a)}, body ${size(a.body)}); the draft is not sent` }),
    before: (a, { gmail }) => draftMeta(gmail, a.draftId),
    after: (a, { gmail }) => draftMeta(gmail, a.draftId) },

  // ---------- Gmail: settings that widen who can see or use the mailbox ----------
  gmail_add_forwarding_address: { destructive: D, verify: (a, b, after) => eqi(after?.forwardingEmail, a.forwardingEmail),
    describe: (a) => ({ target: a.forwardingEmail, summary: `Ask Google to add ${a.forwardingEmail} as an auto-forwarding address (it is emailed a confirmation link; once confirmed, mail can be forwarded there)` }),
    before: async (a, { gmail }) => ({ existing: list((await data(gmail.users.settings.forwardingAddresses.list({ userId: 'me' }))).forwardingAddresses).map((f) => f.forwardingEmail) }),
    after: async (a, { gmail }) => pick(await data(gmail.users.settings.forwardingAddresses.get({ userId: 'me', forwardingEmail: a.forwardingEmail })), ['forwardingEmail', 'verificationStatus']) },
  gmail_update_imap_settings: { destructive: D, verify: (a, b, after) => !!after?.enabled === !!a.enabled,
    describe: (a) => ({ target: 'IMAP access', summary: `${a.enabled ? 'Turn ON' : 'Turn OFF'} IMAP access to this mailbox (lets other mail programs read it)` }),
    before: (a, { gmail }) => data(gmail.users.settings.getImap({ userId: 'me' })),
    after: (a, { gmail }) => data(gmail.users.settings.getImap({ userId: 'me' })) },
  gmail_update_pop_settings: { destructive: D, verify: (a, b, after) => after?.accessWindow === a.accessWindow && (a.disposition === undefined || after?.disposition === a.disposition),
    describe: (a) => ({ target: 'POP access', summary: `Set POP access to "${a.accessWindow}"${a.disposition ? ` (then ${a.disposition})` : ''} (lets other mail programs download this mailbox)` }),
    before: (a, { gmail }) => data(gmail.users.settings.getPop({ userId: 'me' })),
    after: (a, { gmail }) => data(gmail.users.settings.getPop({ userId: 'me' })) },
  gmail_create_send_as: { destructive: D, verify: (a, b, after) => eqi(after?.sendAsEmail, a.sendAsEmail) && ['displayName', 'replyToAddress', 'isDefault'].every((k) => a[k] === undefined || same(after?.[k], a[k])),
    describe: (a) => ({ target: a.sendAsEmail, summary: `Add ${a.sendAsEmail} as a "send mail as" address${a.displayName ? ` named "${a.displayName}"` : ''}${a.isDefault ? ' and make it the default' : ''} (mail can then go out under that address)` }),
    before: async (a, { gmail }) => ({ existing: list((await data(gmail.users.settings.sendAs.list({ userId: 'me' }))).sendAs).map((s) => s.sendAsEmail) }),
    after: async (a, { gmail }) => sendAsView(await data(gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: a.sendAsEmail }))) },
  gmail_add_delegate: { destructive: D, verify: (a, b, after) => eqi(after?.delegateEmail, a.delegateEmail),
    describe: (a) => ({ target: a.delegateEmail, summary: `Give ${a.delegateEmail} delegate access to this whole mailbox (they can read, send and delete mail)` }),
    before: async (a, { gmail }) => ({ delegates: list((await data(gmail.users.settings.delegates.list({ userId: 'me' }))).delegates).map((d) => d.delegateEmail) }),
    after: async (a, { gmail }) => pick(await data(gmail.users.settings.delegates.get({ userId: 'me', delegateEmail: a.delegateEmail })), ['delegateEmail', 'verificationStatus']) },

  // ---------- Calendar ----------
  calendar_create_calendar: { destructive: false, verify: (a, b, after) => after?.summary === a.summary,
    describe: (a) => ({ target: a.summary, summary: `Create the secondary calendar "${a.summary}"${a.timeZone ? ` (time zone ${a.timeZone})` : ''}` }),
    after: async (a, { calendar }, details) => (details?.id ? pick(await data(calendar.calendars.get({ calendarId: details.id })), ['id', 'summary', 'timeZone']) : { note: 'Google did not return the new calendar\'s id.' }) },
  calendar_create_recurring_event: { destructive: false, confirmWhen: (a) => list(a.attendees).length > 0, verify: createdVerify,
    describe: (a) => ({ target: a.summary, summary: `Create the repeating event "${a.summary}" from ${a.start} to ${a.end} (${a.recurrenceRule})${inviting(a)}` }),
    after: createdEvent },
  calendar_create_video_meeting: { destructive: false, confirmWhen: (a) => list(a.attendees).length > 0, verify: createdVerify,
    describe: (a) => ({ target: a.summary, summary: `Create the event "${a.summary}" from ${a.start} to ${a.end} with a Google Meet link${inviting(a)}` }),
    after: createdEvent },
  calendar_quick_add: { destructive: false, confirmWhen: (a) => addrs(a.text).length > 0, verify: (a, b, after, details) => !!details?.id && after?.id === details.id,
    describe: (a) => ({ target: 'new event', summary: `Create a calendar event from the text "${String(a.text ?? '').slice(0, 200)}"${addrs(a.text).length ? ` (it mentions ${addrs(a.text).join(', ')}, who may be invited)` : ''}` }),
    after: createdEvent },
  calendar_update_event: { destructive: false,
    // Guests hear about changes unless sendUpdates is "none" (the default is "all"); changing who is invited always reaches people.
    confirmWhen: (a) => { const u = a.updates || {}; if ('attendees' in u) return true; return (a.sendUpdates || 'all') !== 'none' && Object.keys(u).some((k) => !QUIET_EVENT_FIELDS.has(k)); },
    verify: (a, b, after) => eventMatches(a.updates, after),
    describe: (a) => ({ target: a.eventId, summary: `Change the calendar event ${a.eventId}: ${Object.keys(a.updates || {}).join(', ') || 'nothing given'}${(a.sendUpdates || 'all') !== 'none' ? ` (guests are told: ${a.sendUpdates || 'all'})` : ' (guests are not told)'}` }),
    before: (a, { calendar }) => getEvent(calendar, a.calendarId, a.eventId),
    after: (a, { calendar }) => getEvent(calendar, a.calendarId, a.eventId) },
  calendar_move_event: { destructive: false, verify: (a, b, after) => after?.id === a.eventId,
    describe: (a) => ({ target: a.eventId, summary: `Move the calendar event ${a.eventId} from the calendar ${a.calendarId} to ${a.destinationCalendarId}` }),
    before: (a, { calendar }) => getEvent(calendar, a.calendarId, a.eventId),
    after: (a, { calendar }) => getEvent(calendar, a.destinationCalendarId, a.eventId) },
  calendar_add_attendee: { destructive: D, verify: (a, b, after) => list(after?.attendees).some((x) => eqi(x, a.email)),
    describe: (a) => ({ target: a.eventId, summary: `Add ${a.email} to the guests of the calendar event ${a.eventId} (the event appears on their calendar)` }),
    before: (a, { calendar }) => getEvent(calendar, a.calendarId, a.eventId),
    after: (a, { calendar }) => getEvent(calendar, a.calendarId, a.eventId) },
  calendar_set_event_color: { destructive: false, verify: (a, b, after) => after?.colorId === a.colorId,
    describe: (a) => ({ target: a.eventId, summary: `Set the colour of the calendar event ${a.eventId} to ${a.colorId}` }),
    before: (a, { calendar }) => getEvent(calendar, a.calendarId, a.eventId),
    after: (a, { calendar }) => getEvent(calendar, a.calendarId, a.eventId) },

  // ---------- Tasks ----------
  tasks_create_tasklist: { destructive: false, verify: (a, b, after) => after?.title === a.title,
    describe: (a) => ({ target: a.title, summary: `Create the task list "${a.title}"` }),
    after: async (a, { tasks }, details) => (details?.id ? pick(await data(tasks.tasklists.get({ tasklist: details.id })), ['id', 'title']) : { note: 'Google did not return the new task list\'s id.' }) },
  tasks_update_tasklist: { destructive: false, verify: (a, b, after) => after?.title === a.title,
    describe: (a) => ({ target: a.tasklistId, summary: `Rename the task list ${a.tasklistId} to "${a.title}"` }),
    before: async (a, { tasks }) => pick(await data(tasks.tasklists.get({ tasklist: a.tasklistId })), ['id', 'title']),
    after: async (a, { tasks }) => pick(await data(tasks.tasklists.get({ tasklist: a.tasklistId })), ['id', 'title']) },
  tasks_create_task: { destructive: false, verify: (a, b, after, details) => !!details?.id && after?.id === details.id && after.title === a.title && (a.notes === undefined || after.notesLength === String(a.notes).length),
    describe: (a) => ({ target: a.title, summary: `Create the task "${a.title}" in the list ${a.tasklistId || '@default'}${a.due ? `, due ${a.due}` : ''}` }),
    after: async (a, { tasks }, details) => (details?.id ? taskView(await data(tasks.tasks.get({ tasklist: a.tasklistId || '@default', task: details.id }))) : { note: 'Google did not return the new task\'s id.' }) },
  tasks_update_task: { destructive: false,
    verify: (a, b, after) => ['title', 'status'].every((k) => a[k] === undefined || after?.[k] === a[k]) && (a.notes === undefined || after?.notesLength === String(a.notes).length) && (a.due === undefined || String(after?.due || '').slice(0, 10) === String(a.due).slice(0, 10)),
    describe: (a) => ({ target: a.taskId, summary: `Change the task ${a.taskId}: ${['title', 'notes', 'due', 'status'].filter((k) => a[k] !== undefined).map((k) => (k === 'notes' ? 'notes' : `${k} to "${a[k]}"`)).join(', ') || 'nothing given'}` }),
    before: async (a, { tasks }) => taskView(await data(tasks.tasks.get({ tasklist: a.tasklistId || '@default', task: a.taskId }))),
    after: async (a, { tasks }) => taskView(await data(tasks.tasks.get({ tasklist: a.tasklistId || '@default', task: a.taskId }))) },

  // ---------- Contacts ----------
  contacts_create: { destructive: false, verify: (a, b, after) => !!after?.resourceName && after.names?.[0]?.givenName === a.givenName,
    describe: (a) => ({ target: [a.givenName, a.familyName].filter(Boolean).join(' '), summary: `Create the contact ${[a.givenName, a.familyName].filter(Boolean).join(' ')}${a.email ? ` (${a.email})` : ''}${a.organization ? ` at ${a.organization}` : ''}` }),
    after: async (a, { people }, details) => (details?.resourceName ? contactView(await data(people.people.get({ resourceName: details.resourceName, personFields: CONTACT_FIELDS }))) : { note: 'Google did not return the new contact\'s id.' }) },
  contacts_update: { destructive: false,
    verify: (a, b, after) => (a.givenName === undefined || after?.names?.[0]?.givenName === a.givenName) && (a.familyName === undefined || after?.names?.[0]?.familyName === a.familyName)
      && (!a.email || list(after?.emailAddresses).some((e) => eqi(e.value, a.email))) && (!a.phone || list(after?.phoneNumbers).some((p) => p.value === a.phone)),
    describe: (a) => ({ target: a.resourceName, summary: `Change the contact ${a.resourceName}: ${['givenName', 'familyName', 'email', 'phone'].filter((k) => a[k]).join(', ') || 'nothing given'}` }),
    before: async (a, { people }) => contactView(await data(people.people.get({ resourceName: a.resourceName, personFields: CONTACT_FIELDS }))),
    after: async (a, { people }) => contactView(await data(people.people.get({ resourceName: a.resourceName, personFields: CONTACT_FIELDS }))) },

  // ---------- Chat (reaches other people) ----------
  chat_create_space: { destructive: D, verify: (a, b, after) => after?.displayName === a.displayName,
    describe: (a) => ({ target: a.displayName, summary: `Create the Chat space "${a.displayName}" (people can then be added and see what is posted)` }),
    after: async (a, { chat }, details) => (details?.name ? pick(await data(chat.spaces.get({ name: details.name })), ['name', 'displayName', 'spaceType']) : { note: 'Google did not return the new space\'s name.' }) },
  chat_add_member: { destructive: D, verify: (a, b, after, details) => !!after?.name && after.name === details?.name,
    describe: (a) => ({ target: a.spaceName, summary: `Add ${a.memberEmail} to the Chat space ${a.spaceName} (they can then read it and post)` }),
    before: async (a, { chat }) => pick(await data(chat.spaces.get({ name: a.spaceName })), ['name', 'displayName', 'spaceType']),
    after: async (a, { chat }, details) => (details?.name ? pick(await data(chat.spaces.members.get({ name: details.name })), ['name', 'state', 'role']) : { note: 'Google did not return the new membership\'s name.' }) },
  chat_send_message: { destructive: D, verify: (a, b, after, details) => !!after?.name && after.name === details?.name,
    describe: (a) => ({ target: a.spaceName, summary: `POST a message (${size(a.text)}) in the Chat space ${a.spaceName}; everyone in the space sees it` }),
    before: async (a, { chat }) => pick(await data(chat.spaces.get({ name: a.spaceName })), ['name', 'displayName', 'spaceType']),
    after: async (a, { chat }, details) => {
      if (!details?.name) return { note: 'Google did not return the new message\'s name.' };
      const m = await data(chat.spaces.messages.get({ name: details.name }));
      return { ...pick(m, ['name', 'createTime']), textLength: typeof m.text === 'string' ? m.text.length : undefined };
    } }
};
