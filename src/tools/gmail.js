import { ok } from './util.js';

function toBase64Url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRawMessage({ to, from, subject, body, html, cc, bcc, attachments, inReplyTo, references }) {
  const boundary = 'gwsmcp_boundary_' + Date.now();
  const headers = [
    `To: ${to}`,
    from ? `From: ${from}` : null,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    'MIME-Version: 1.0'
  ].filter(Boolean);

  if (!attachments || attachments.length === 0) {
    headers.push(`Content-Type: ${html ? 'text/html' : 'text/plain'}; charset="UTF-8"`);
    return headers.join('\r\n') + '\r\n\r\n' + body;
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  let raw = headers.join('\r\n') + '\r\n\r\n';
  raw += `--${boundary}\r\nContent-Type: ${html ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\n\r\n${body}\r\n\r\n`;
  for (const att of attachments) {
    raw += `--${boundary}\r\nContent-Type: ${att.mimeType || 'application/octet-stream'}; name="${att.filename}"\r\n`;
    raw += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n\r\n${att.base64Data}\r\n\r\n`;
  }
  raw += `--${boundary}--`;
  return raw;
}

export const tools = [
  { name: 'gmail_send_email', description: 'Send an email via Gmail', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, html: { type: 'boolean', default: false }, cc: { type: 'string' }, bcc: { type: 'string' } }, required: ['to', 'subject', 'body'] } },
  { name: 'gmail_send_with_attachment', description: 'Send an email with one or more attachments', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, html: { type: 'boolean', default: false }, cc: { type: 'string' }, bcc: { type: 'string' }, attachments: { type: 'array', items: { type: 'object', properties: { filename: { type: 'string' }, mimeType: { type: 'string' }, base64Data: { type: 'string' } }, required: ['filename', 'base64Data'] } } }, required: ['to', 'subject', 'body', 'attachments'] } },
  { name: 'gmail_list_messages', description: "List Gmail messages, optionally filtered with Gmail's search syntax (e.g. 'is:unread from:someone@example.com')", inputSchema: { type: 'object', properties: { q: { type: 'string' }, maxResults: { type: 'number', default: 10 }, labelIds: { type: 'array', items: { type: 'string' } }, pageToken: { type: 'string' } } } },
  { name: 'gmail_search', description: 'Search Gmail messages (alias of list with a required query)', inputSchema: { type: 'object', properties: { q: { type: 'string' }, maxResults: { type: 'number', default: 10 } }, required: ['q'] } },
  { name: 'gmail_get_message', description: 'Get Gmail message metadata and headers by ID', inputSchema: { type: 'object', properties: { messageId: { type: 'string' }, format: { type: 'string', enum: ['full', 'metadata', 'minimal', 'raw'], default: 'full' } }, required: ['messageId'] } },
  { name: 'gmail_get_message_body', description: 'Get the decoded plain-text and HTML body of a Gmail message', inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] } },
  { name: 'gmail_get_attachment', description: 'Download a Gmail message attachment (returned as base64). Attachments over about 48 KB are not sent through chat: you get the size instead', inputSchema: { type: 'object', properties: { messageId: { type: 'string' }, attachmentId: { type: 'string' } }, required: ['messageId', 'attachmentId'] } },
  { name: 'gmail_delete_message', description: 'Permanently delete a Gmail message (cannot be undone)', inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] } },
  { name: 'gmail_batch_delete', description: 'Permanently delete multiple Gmail messages at once', inputSchema: { type: 'object', properties: { messageIds: { type: 'array', items: { type: 'string' } } }, required: ['messageIds'] } },
  { name: 'gmail_trash_message', description: 'Move a Gmail message to trash (recoverable for 30 days)', inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] } },
  { name: 'gmail_untrash_message', description: 'Restore a Gmail message from trash', inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] } },
  { name: 'gmail_modify_message', description: 'Add or remove labels from a Gmail message', inputSchema: { type: 'object', properties: { messageId: { type: 'string' }, addLabelIds: { type: 'array', items: { type: 'string' } }, removeLabelIds: { type: 'array', items: { type: 'string' } } }, required: ['messageId'] } },
  { name: 'gmail_mark_read', description: 'Mark a Gmail message as read', inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] } },
  { name: 'gmail_mark_unread', description: 'Mark a Gmail message as unread', inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] } },
  { name: 'gmail_forward_message', description: 'Forward an existing Gmail message to new recipients', inputSchema: { type: 'object', properties: { messageId: { type: 'string' }, to: { type: 'string' }, comment: { type: 'string' } }, required: ['messageId', 'to'] } },
  { name: 'gmail_reply_to_thread', description: 'Reply to the most recent message in a Gmail thread', inputSchema: { type: 'object', properties: { threadId: { type: 'string' }, body: { type: 'string' }, html: { type: 'boolean', default: false } }, required: ['threadId', 'body'] } },
  { name: 'gmail_get_thread', description: 'Get a full Gmail thread (all messages in the conversation)', inputSchema: { type: 'object', properties: { threadId: { type: 'string' } }, required: ['threadId'] } },
  { name: 'gmail_list_threads', description: 'List Gmail threads', inputSchema: { type: 'object', properties: { q: { type: 'string' }, maxResults: { type: 'number', default: 10 } } } },
  { name: 'gmail_trash_thread', description: 'Move a whole Gmail thread to trash', inputSchema: { type: 'object', properties: { threadId: { type: 'string' } }, required: ['threadId'] } },
  { name: 'gmail_untrash_thread', description: 'Restore a Gmail thread from trash', inputSchema: { type: 'object', properties: { threadId: { type: 'string' } }, required: ['threadId'] } },
  { name: 'gmail_delete_thread', description: 'Permanently delete a Gmail thread', inputSchema: { type: 'object', properties: { threadId: { type: 'string' } }, required: ['threadId'] } },
  { name: 'gmail_modify_thread', description: 'Add or remove labels across an entire Gmail thread', inputSchema: { type: 'object', properties: { threadId: { type: 'string' }, addLabelIds: { type: 'array', items: { type: 'string' } }, removeLabelIds: { type: 'array', items: { type: 'string' } } }, required: ['threadId'] } },
  { name: 'gmail_list_labels', description: 'List all Gmail labels (folders) in the account', inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_get_label', description: 'Get details of one Gmail label', inputSchema: { type: 'object', properties: { labelId: { type: 'string' } }, required: ['labelId'] } },
  { name: 'gmail_create_label', description: 'Create a new Gmail label', inputSchema: { type: 'object', properties: { name: { type: 'string' }, labelListVisibility: { type: 'string', enum: ['labelShow', 'labelShowIfUnread', 'labelHide'] }, messageListVisibility: { type: 'string', enum: ['show', 'hide'] } }, required: ['name'] } },
  { name: 'gmail_update_label', description: 'Rename or reconfigure a Gmail label', inputSchema: { type: 'object', properties: { labelId: { type: 'string' }, name: { type: 'string' }, labelListVisibility: { type: 'string' }, messageListVisibility: { type: 'string' } }, required: ['labelId'] } },
  { name: 'gmail_delete_label', description: 'Delete a Gmail label', inputSchema: { type: 'object', properties: { labelId: { type: 'string' } }, required: ['labelId'] } },
  { name: 'gmail_list_drafts', description: 'List Gmail drafts', inputSchema: { type: 'object', properties: { maxResults: { type: 'number', default: 10 } } } },
  { name: 'gmail_get_draft', description: 'Get a Gmail draft by ID', inputSchema: { type: 'object', properties: { draftId: { type: 'string' } }, required: ['draftId'] } },
  { name: 'gmail_create_draft', description: 'Create a Gmail draft', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, html: { type: 'boolean', default: false }, cc: { type: 'string' }, bcc: { type: 'string' } }, required: ['to', 'subject', 'body'] } },
  { name: 'gmail_update_draft', description: 'Update an existing Gmail draft', inputSchema: { type: 'object', properties: { draftId: { type: 'string' }, to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, html: { type: 'boolean', default: false } }, required: ['draftId', 'to', 'subject', 'body'] } },
  { name: 'gmail_delete_draft', description: 'Delete a Gmail draft', inputSchema: { type: 'object', properties: { draftId: { type: 'string' } }, required: ['draftId'] } },
  { name: 'gmail_send_draft', description: 'Send an existing Gmail draft', inputSchema: { type: 'object', properties: { draftId: { type: 'string' } }, required: ['draftId'] } },
  { name: 'gmail_list_filters', description: 'List Gmail filter rules', inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_get_filter', description: 'Get one Gmail filter rule', inputSchema: { type: 'object', properties: { filterId: { type: 'string' } }, required: ['filterId'] } },
  { name: 'gmail_create_filter', description: 'Create a Gmail filter rule (e.g. auto-archive, auto-label, auto-forward based on sender/subject/keywords)', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, subject: { type: 'string' }, query: { type: 'string' }, hasAttachment: { type: 'boolean' }, addLabelIds: { type: 'array', items: { type: 'string' } }, removeLabelIds: { type: 'array', items: { type: 'string' } }, forward: { type: 'string' } } } },
  { name: 'gmail_delete_filter', description: 'Delete a Gmail filter rule', inputSchema: { type: 'object', properties: { filterId: { type: 'string' } }, required: ['filterId'] } },
  { name: 'gmail_get_vacation_settings', description: 'Get the Gmail vacation responder (out-of-office) settings', inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_update_vacation_settings', description: 'Turn on/off and configure the Gmail out-of-office auto-reply', inputSchema: { type: 'object', properties: { enableAutoReply: { type: 'boolean' }, responseSubject: { type: 'string' }, responseBodyHtml: { type: 'string' }, startTime: { type: 'string', description: 'ms since epoch' }, endTime: { type: 'string', description: 'ms since epoch' }, restrictToContacts: { type: 'boolean' }, restrictToDomain: { type: 'boolean' } }, required: ['enableAutoReply'] } },
  { name: 'gmail_get_forwarding_settings', description: 'Get auto-forwarding settings for this Gmail account', inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_update_forwarding_settings', description: 'Enable/disable auto-forwarding and what happens to the forwarded copy', inputSchema: { type: 'object', properties: { enabled: { type: 'boolean' }, emailAddress: { type: 'string' }, disposition: { type: 'string', enum: ['leaveInInbox', 'archive', 'trash', 'markRead'] } }, required: ['enabled'] } },
  { name: 'gmail_list_forwarding_addresses', description: "List addresses this account is allowed to auto-forward to", inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_add_forwarding_address', description: 'Request a new auto-forwarding address (Google emails that address a confirmation link)', inputSchema: { type: 'object', properties: { forwardingEmail: { type: 'string' } }, required: ['forwardingEmail'] } },
  { name: 'gmail_get_imap_settings', description: 'Get IMAP access settings', inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_update_imap_settings', description: 'Enable/disable IMAP access', inputSchema: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] } },
  { name: 'gmail_get_pop_settings', description: 'Get POP access settings', inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_update_pop_settings', description: 'Configure POP access', inputSchema: { type: 'object', properties: { accessWindow: { type: 'string', enum: ['disabled', 'allMail', 'fromNowOn'] }, disposition: { type: 'string', enum: ['leaveInInbox', 'archive', 'trash', 'markRead'] } }, required: ['accessWindow'] } },
  { name: 'gmail_list_send_as', description: 'List "send mail as" aliases configured on this Gmail account', inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_create_send_as', description: 'Add a "send mail as" alias to this Gmail account', inputSchema: { type: 'object', properties: { sendAsEmail: { type: 'string' }, displayName: { type: 'string' }, replyToAddress: { type: 'string' }, isDefault: { type: 'boolean' } }, required: ['sendAsEmail'] } },
  { name: 'gmail_update_send_as', description: 'Update a "send mail as" alias (display name, signature, default)', inputSchema: { type: 'object', properties: { sendAsEmail: { type: 'string' }, displayName: { type: 'string' }, signature: { type: 'string' }, isDefault: { type: 'boolean' } }, required: ['sendAsEmail'] } },
  { name: 'gmail_delete_send_as', description: 'Remove a "send mail as" alias', inputSchema: { type: 'object', properties: { sendAsEmail: { type: 'string' } }, required: ['sendAsEmail'] } },
  { name: 'gmail_list_delegates', description: 'List accounts that have delegate (assistant) access to this mailbox', inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_add_delegate', description: 'Grant another account delegate (assistant) access to this mailbox', inputSchema: { type: 'object', properties: { delegateEmail: { type: 'string' } }, required: ['delegateEmail'] } },
  { name: 'gmail_remove_delegate', description: 'Remove delegate access from this mailbox', inputSchema: { type: 'object', properties: { delegateEmail: { type: 'string' } }, required: ['delegateEmail'] } },
  { name: 'gmail_get_profile', description: "Get this Gmail account's profile (email address, message/thread counts)", inputSchema: { type: 'object', properties: {} } },
  { name: 'gmail_list_history', description: 'List the change history of the mailbox since a given historyId (for sync)', inputSchema: { type: 'object', properties: { startHistoryId: { type: 'string' } }, required: ['startHistoryId'] } }
];

export const handlers = {
  gmail_send_email: async (args, { gmail }) => {
    const raw = toBase64Url(buildRawMessage(args));
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return ok({ id: res.data.id, threadId: res.data.threadId, status: 'sent' });
  },
  gmail_send_with_attachment: async (args, { gmail }) => {
    const raw = toBase64Url(buildRawMessage(args));
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return ok({ id: res.data.id, threadId: res.data.threadId, status: 'sent' });
  },
  gmail_list_messages: async (args, { gmail }) => {
    const res = await gmail.users.messages.list({ userId: 'me', q: args.q, maxResults: args.maxResults || 10, labelIds: args.labelIds, pageToken: args.pageToken });
    return ok(res.data);
  },
  gmail_search: async (args, { gmail }) => {
    const res = await gmail.users.messages.list({ userId: 'me', q: args.q, maxResults: args.maxResults || 10 });
    return ok(res.data);
  },
  gmail_get_message: async (args, { gmail }) => {
    const res = await gmail.users.messages.get({ userId: 'me', id: args.messageId, format: args.format || 'full' });
    return ok(res.data);
  },
  gmail_get_message_body: async (args, { gmail }) => {
    const res = await gmail.users.messages.get({ userId: 'me', id: args.messageId, format: 'full' });
    const parts = [];
    (function walk(part) {
      if (!part) return;
      if (part.body?.data) parts.push({ mimeType: part.mimeType, data: Buffer.from(part.body.data, 'base64').toString('utf8') });
      (part.parts || []).forEach(walk);
    })(res.data.payload);
    const text = parts.find(p => p.mimeType === 'text/plain')?.data || '';
    const html = parts.find(p => p.mimeType === 'text/html')?.data || '';
    return ok({ subject: res.data.payload.headers.find(h => h.name === 'Subject')?.value, from: res.data.payload.headers.find(h => h.name === 'From')?.value, text, html });
  },
  gmail_get_attachment: async (args, { gmail }) => {
    const res = await gmail.users.messages.attachments.get({ userId: 'me', messageId: args.messageId, id: args.attachmentId });
    return ok({ size: res.data.size, base64Data: res.data.data });
  },
  gmail_delete_message: async (args, { gmail }) => {
    await gmail.users.messages.delete({ userId: 'me', id: args.messageId });
    return ok({ deleted: args.messageId });
  },
  gmail_batch_delete: async (args, { gmail }) => {
    await gmail.users.messages.batchDelete({ userId: 'me', requestBody: { ids: args.messageIds } });
    return ok({ deleted: args.messageIds });
  },
  gmail_trash_message: async (args, { gmail }) => {
    const res = await gmail.users.messages.trash({ userId: 'me', id: args.messageId });
    return ok(res.data);
  },
  gmail_untrash_message: async (args, { gmail }) => {
    const res = await gmail.users.messages.untrash({ userId: 'me', id: args.messageId });
    return ok(res.data);
  },
  gmail_modify_message: async (args, { gmail }) => {
    const res = await gmail.users.messages.modify({ userId: 'me', id: args.messageId, requestBody: { addLabelIds: args.addLabelIds, removeLabelIds: args.removeLabelIds } });
    return ok(res.data);
  },
  gmail_mark_read: async (args, { gmail }) => {
    const res = await gmail.users.messages.modify({ userId: 'me', id: args.messageId, requestBody: { removeLabelIds: ['UNREAD'] } });
    return ok(res.data);
  },
  gmail_mark_unread: async (args, { gmail }) => {
    const res = await gmail.users.messages.modify({ userId: 'me', id: args.messageId, requestBody: { addLabelIds: ['UNREAD'] } });
    return ok(res.data);
  },
  gmail_forward_message: async (args, { gmail }) => {
    const original = await gmail.users.messages.get({ userId: 'me', id: args.messageId, format: 'full' });
    const subject = 'Fwd: ' + (original.data.payload.headers.find(h => h.name === 'Subject')?.value || '');
    const raw = toBase64Url(buildRawMessage({ to: args.to, subject, body: (args.comment ? args.comment + '\n\n---------- Forwarded message ----------\n' : '---------- Forwarded message ----------\n') }));
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: undefined } });
    return ok(res.data);
  },
  gmail_reply_to_thread: async (args, { gmail }) => {
    const thread = await gmail.users.threads.get({ userId: 'me', id: args.threadId, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Message-ID'] });
    const lastMsg = thread.data.messages[thread.data.messages.length - 1];
    const headers = lastMsg.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const to = headers.find(h => h.name === 'From')?.value || '';
    const messageId = headers.find(h => h.name === 'Message-ID')?.value;
    const raw = toBase64Url(buildRawMessage({ to, subject: subject.startsWith('Re:') ? subject : 'Re: ' + subject, body: args.body, html: args.html, inReplyTo: messageId, references: messageId }));
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: args.threadId } });
    return ok(res.data);
  },
  gmail_get_thread: async (args, { gmail }) => {
    const res = await gmail.users.threads.get({ userId: 'me', id: args.threadId, format: 'full' });
    return ok(res.data);
  },
  gmail_list_threads: async (args, { gmail }) => {
    const res = await gmail.users.threads.list({ userId: 'me', q: args.q, maxResults: args.maxResults || 10 });
    return ok(res.data);
  },
  gmail_trash_thread: async (args, { gmail }) => {
    const res = await gmail.users.threads.trash({ userId: 'me', id: args.threadId });
    return ok(res.data);
  },
  gmail_untrash_thread: async (args, { gmail }) => {
    const res = await gmail.users.threads.untrash({ userId: 'me', id: args.threadId });
    return ok(res.data);
  },
  gmail_delete_thread: async (args, { gmail }) => {
    await gmail.users.threads.delete({ userId: 'me', id: args.threadId });
    return ok({ deleted: args.threadId });
  },
  gmail_modify_thread: async (args, { gmail }) => {
    const res = await gmail.users.threads.modify({ userId: 'me', id: args.threadId, requestBody: { addLabelIds: args.addLabelIds, removeLabelIds: args.removeLabelIds } });
    return ok(res.data);
  },
  gmail_list_labels: async (_args, { gmail }) => {
    const res = await gmail.users.labels.list({ userId: 'me' });
    return ok(res.data.labels || []);
  },
  gmail_get_label: async (args, { gmail }) => {
    const res = await gmail.users.labels.get({ userId: 'me', id: args.labelId });
    return ok(res.data);
  },
  gmail_create_label: async (args, { gmail }) => {
    const res = await gmail.users.labels.create({ userId: 'me', requestBody: { name: args.name, labelListVisibility: args.labelListVisibility, messageListVisibility: args.messageListVisibility } });
    return ok(res.data);
  },
  gmail_update_label: async (args, { gmail }) => {
    const res = await gmail.users.labels.patch({ userId: 'me', id: args.labelId, requestBody: { name: args.name, labelListVisibility: args.labelListVisibility, messageListVisibility: args.messageListVisibility } });
    return ok(res.data);
  },
  gmail_delete_label: async (args, { gmail }) => {
    await gmail.users.labels.delete({ userId: 'me', id: args.labelId });
    return ok({ deleted: args.labelId });
  },
  gmail_list_drafts: async (args, { gmail }) => {
    const res = await gmail.users.drafts.list({ userId: 'me', maxResults: args.maxResults || 10 });
    return ok(res.data);
  },
  gmail_get_draft: async (args, { gmail }) => {
    const res = await gmail.users.drafts.get({ userId: 'me', id: args.draftId });
    return ok(res.data);
  },
  gmail_create_draft: async (args, { gmail }) => {
    const raw = toBase64Url(buildRawMessage(args));
    const res = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
    return ok(res.data);
  },
  gmail_update_draft: async (args, { gmail }) => {
    const raw = toBase64Url(buildRawMessage(args));
    const res = await gmail.users.drafts.update({ userId: 'me', id: args.draftId, requestBody: { message: { raw } } });
    return ok(res.data);
  },
  gmail_delete_draft: async (args, { gmail }) => {
    await gmail.users.drafts.delete({ userId: 'me', id: args.draftId });
    return ok({ deleted: args.draftId });
  },
  gmail_send_draft: async (args, { gmail }) => {
    const res = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: args.draftId } });
    return ok(res.data);
  },
  gmail_list_filters: async (_args, { gmail }) => {
    const res = await gmail.users.settings.filters.list({ userId: 'me' });
    return ok(res.data.filter || []);
  },
  gmail_get_filter: async (args, { gmail }) => {
    const res = await gmail.users.settings.filters.get({ userId: 'me', id: args.filterId });
    return ok(res.data);
  },
  gmail_create_filter: async (args, { gmail }) => {
    const requestBody = {
      criteria: { from: args.from, to: args.to, subject: args.subject, query: args.query, hasAttachment: args.hasAttachment },
      action: { addLabelIds: args.addLabelIds, removeLabelIds: args.removeLabelIds, forward: args.forward }
    };
    const res = await gmail.users.settings.filters.create({ userId: 'me', requestBody });
    return ok(res.data);
  },
  gmail_delete_filter: async (args, { gmail }) => {
    await gmail.users.settings.filters.delete({ userId: 'me', id: args.filterId });
    return ok({ deleted: args.filterId });
  },
  gmail_get_vacation_settings: async (_args, { gmail }) => {
    const res = await gmail.users.settings.getVacation({ userId: 'me' });
    return ok(res.data);
  },
  gmail_update_vacation_settings: async (args, { gmail }) => {
    const res = await gmail.users.settings.updateVacation({ userId: 'me', requestBody: args });
    return ok(res.data);
  },
  gmail_get_forwarding_settings: async (_args, { gmail }) => {
    const res = await gmail.users.settings.getAutoForwarding({ userId: 'me' });
    return ok(res.data);
  },
  gmail_update_forwarding_settings: async (args, { gmail }) => {
    const res = await gmail.users.settings.updateAutoForwarding({ userId: 'me', requestBody: args });
    return ok(res.data);
  },
  gmail_list_forwarding_addresses: async (_args, { gmail }) => {
    const res = await gmail.users.settings.forwardingAddresses.list({ userId: 'me' });
    return ok(res.data.forwardingAddresses || []);
  },
  gmail_add_forwarding_address: async (args, { gmail }) => {
    const res = await gmail.users.settings.forwardingAddresses.create({ userId: 'me', requestBody: { forwardingEmail: args.forwardingEmail } });
    return ok(res.data);
  },
  gmail_get_imap_settings: async (_args, { gmail }) => {
    const res = await gmail.users.settings.getImap({ userId: 'me' });
    return ok(res.data);
  },
  gmail_update_imap_settings: async (args, { gmail }) => {
    const res = await gmail.users.settings.updateImap({ userId: 'me', requestBody: { enabled: args.enabled } });
    return ok(res.data);
  },
  gmail_get_pop_settings: async (_args, { gmail }) => {
    const res = await gmail.users.settings.getPop({ userId: 'me' });
    return ok(res.data);
  },
  gmail_update_pop_settings: async (args, { gmail }) => {
    const res = await gmail.users.settings.updatePop({ userId: 'me', requestBody: args });
    return ok(res.data);
  },
  gmail_list_send_as: async (_args, { gmail }) => {
    const res = await gmail.users.settings.sendAs.list({ userId: 'me' });
    return ok(res.data.sendAs || []);
  },
  gmail_create_send_as: async (args, { gmail }) => {
    const res = await gmail.users.settings.sendAs.create({ userId: 'me', requestBody: args });
    return ok(res.data);
  },
  gmail_update_send_as: async (args, { gmail }) => {
    const { sendAsEmail, ...rest } = args;
    const res = await gmail.users.settings.sendAs.patch({ userId: 'me', sendAsEmail, requestBody: rest });
    return ok(res.data);
  },
  gmail_delete_send_as: async (args, { gmail }) => {
    await gmail.users.settings.sendAs.delete({ userId: 'me', sendAsEmail: args.sendAsEmail });
    return ok({ deleted: args.sendAsEmail });
  },
  gmail_list_delegates: async (_args, { gmail }) => {
    const res = await gmail.users.settings.delegates.list({ userId: 'me' });
    return ok(res.data.delegates || []);
  },
  gmail_add_delegate: async (args, { gmail }) => {
    const res = await gmail.users.settings.delegates.create({ userId: 'me', requestBody: { delegateEmail: args.delegateEmail } });
    return ok(res.data);
  },
  gmail_remove_delegate: async (args, { gmail }) => {
    await gmail.users.settings.delegates.delete({ userId: 'me', delegateEmail: args.delegateEmail });
    return ok({ removed: args.delegateEmail });
  },
  gmail_get_profile: async (_args, { gmail }) => {
    const res = await gmail.users.getProfile({ userId: 'me' });
    return ok(res.data);
  },
  gmail_list_history: async (args, { gmail }) => {
    const res = await gmail.users.history.list({ userId: 'me', startHistoryId: args.startHistoryId });
    return ok(res.data);
  }
};
