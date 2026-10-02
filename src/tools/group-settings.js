// What this server may change on a Google Group through the Groups Settings API, in one place:
// the field names, the values Google accepts, and the checking that turns a plain request into the
// request body Google wants. Used by admin_update_group_settings (admin-directory.js) and by its
// safety wrapper (guards-admin.js), so the two can never disagree about which settings exist.
//
// Field names and allowed values follow Google's Groups Settings API reference (checked 2026-10-02).
// Left out on purpose: showInGroupDirectory, which Google has deprecated, and the fields Google has
// merged into others (whoCanInvite, whoCanAdd, whoCanApproveMembers, whoCanBanUsers, ...).

// The original six. Their values are passed through as given (Google checks them), exactly as before.
const PASSTHROUGH_TEXT = ['whoCanJoin', 'whoCanPostMessage', 'whoCanViewMembership', 'whoCanViewGroup'];
const PASSTHROUGH_BOOLEAN = ['allowExternalMembers', 'isArchived'];

// Settings with a fixed list of allowed values. A value outside the list is refused with the list.
export const CHOICE_FIELDS = {
  replyTo: ['REPLY_TO_CUSTOM', 'REPLY_TO_SENDER', 'REPLY_TO_LIST', 'REPLY_TO_OWNER', 'REPLY_TO_IGNORE', 'REPLY_TO_MANAGERS'],
  messageModerationLevel: ['MODERATE_ALL_MESSAGES', 'MODERATE_NON_MEMBERS', 'MODERATE_NEW_MEMBERS', 'MODERATE_NONE'],
  spamModerationLevel: ['ALLOW', 'MODERATE', 'SILENTLY_MODERATE', 'REJECT'],
  whoCanModerateContent: ['ALL_MEMBERS', 'OWNERS_AND_MANAGERS', 'OWNERS_ONLY', 'NONE'],
  whoCanModerateMembers: ['ALL_MEMBERS', 'OWNERS_AND_MANAGERS', 'OWNERS_ONLY', 'NONE'],
  whoCanContactOwner: ['ALL_IN_DOMAIN_CAN_CONTACT', 'ALL_MANAGERS_CAN_CONTACT', 'ALL_MEMBERS_CAN_CONTACT', 'ANYONE_CAN_CONTACT'],
  whoCanDiscoverGroup: ['ANYONE_CAN_DISCOVER', 'ALL_IN_DOMAIN_CAN_DISCOVER', 'ALL_MEMBERS_CAN_DISCOVER']
};

// On/off settings.
export const BOOLEAN_FIELDS = ['allowWebPosting', 'membersCanPostAsTheGroup', 'enableCollaborativeInbox', 'sendMessageDenyNotification', 'includeCustomFooter', 'includeInGlobalAddressList'];

// Free text, with the longest value Google accepts. customReplyTo must also look like an email address.
export const TEXT_FIELDS = {
  customReplyTo: { max: 320, email: true },
  customFooterText: { max: 1000 },
  defaultMessageDenyNotificationText: { max: 10000 }
};

/** Every setting this tool can change: the original six first, then the newer ones. Drives the preview text and the read-back. */
export const SETTING_KEYS = [...PASSTHROUGH_TEXT, ...PASSTHROUGH_BOOLEAN, ...Object.keys(CHOICE_FIELDS), ...BOOLEAN_FIELDS, ...Object.keys(TEXT_FIELDS)];

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Turns the arguments into the request body Google wants, or throws one plain message that lists
 * every problem. An empty string means "not given", as it always did. Booleans become the words
 * "true" / "false", which is how this API stores them. A choice may be given in any letter case.
 */
export function buildSettingsBody(args = {}) {
  const body = {};
  const problems = [];

  for (const k of PASSTHROUGH_TEXT) if (args[k]) body[k] = args[k];
  for (const k of PASSTHROUGH_BOOLEAN) if (typeof args[k] === 'boolean') body[k] = String(args[k]);

  for (const [k, allowed] of Object.entries(CHOICE_FIELDS)) {
    const v = args[k];
    if (v === undefined || v === null || v === '') continue;
    const wanted = String(v).trim().toUpperCase();
    if (allowed.includes(wanted)) body[k] = wanted;
    else problems.push(`"${v}" is not a valid ${k}. Allowed values: ${allowed.join(', ')}.`);
  }

  for (const k of BOOLEAN_FIELDS) {
    const v = args[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'boolean') body[k] = String(v);
    else if (/^(true|false)$/i.test(String(v).trim())) body[k] = String(v).trim().toLowerCase();
    else problems.push(`${k} must be true or false (you gave "${v}").`);
  }

  for (const [k, rule] of Object.entries(TEXT_FIELDS)) {
    const v = args[k];
    if (v === undefined || v === null || v === '') continue;
    const text = String(v);
    if (text.length > rule.max) problems.push(`${k} is ${text.length} characters long; Google allows at most ${rule.max}.`);
    else if (rule.email && !LOOKS_LIKE_EMAIL.test(text.trim())) problems.push(`${k} must be one email address (you gave "${text.slice(0, 60)}").`);
    else body[k] = rule.email ? text.trim() : text;
  }

  if (problems.length) throw new Error(`${problems.join(' ')} Nothing was changed.`);
  return body;
}

const list = (a) => a.join(', ');

/** The input fields of admin_update_group_settings, with the allowed values spelled out for Claude. */
export const SETTINGS_SCHEMA_PROPERTIES = {
  groupEmail: { type: 'string' },
  whoCanJoin: { type: 'string', description: 'ANYONE_CAN_JOIN, ALL_IN_DOMAIN_CAN_JOIN, INVITED_CAN_JOIN or CAN_REQUEST_TO_JOIN.' },
  whoCanPostMessage: { type: 'string', description: 'NONE_CAN_POST, ALL_MANAGERS_CAN_POST, ALL_MEMBERS_CAN_POST, ALL_OWNERS_CAN_POST, ALL_IN_DOMAIN_CAN_POST or ANYONE_CAN_POST.' },
  whoCanViewMembership: { type: 'string', description: 'ALL_IN_DOMAIN_CAN_VIEW, ALL_MEMBERS_CAN_VIEW or ALL_MANAGERS_CAN_VIEW.' },
  whoCanViewGroup: { type: 'string', description: 'ANYONE_CAN_VIEW, ALL_IN_DOMAIN_CAN_VIEW, ALL_MEMBERS_CAN_VIEW, ALL_MANAGERS_CAN_VIEW or ALL_OWNERS_CAN_VIEW.' },
  allowExternalMembers: { type: 'boolean' },
  isArchived: { type: 'boolean' },
  replyTo: { type: 'string', enum: CHOICE_FIELDS.replyTo, description: `Where replies go. ${list(CHOICE_FIELDS.replyTo)}. REPLY_TO_CUSTOM needs customReplyTo.` },
  customReplyTo: { type: 'string', description: 'One email address; used when replyTo is REPLY_TO_CUSTOM.' },
  messageModerationLevel: { type: 'string', enum: CHOICE_FIELDS.messageModerationLevel, description: `Which messages wait for approval. ${list(CHOICE_FIELDS.messageModerationLevel)}. MODERATE_NONE turns approval off and needs confirm.` },
  spamModerationLevel: { type: 'string', enum: CHOICE_FIELDS.spamModerationLevel, description: `What happens to suspected spam. ${list(CHOICE_FIELDS.spamModerationLevel)}. ALLOW lets it through and needs confirm.` },
  whoCanModerateContent: { type: 'string', enum: CHOICE_FIELDS.whoCanModerateContent, description: `Who may approve, reject and delete messages. ${list(CHOICE_FIELDS.whoCanModerateContent)}.` },
  whoCanModerateMembers: { type: 'string', enum: CHOICE_FIELDS.whoCanModerateMembers, description: `Who may add, approve and remove members. ${list(CHOICE_FIELDS.whoCanModerateMembers)}.` },
  whoCanContactOwner: { type: 'string', enum: CHOICE_FIELDS.whoCanContactOwner, description: `Who may email the group owners. ${list(CHOICE_FIELDS.whoCanContactOwner)}.` },
  whoCanDiscoverGroup: { type: 'string', enum: CHOICE_FIELDS.whoCanDiscoverGroup, description: `Who can find the group in search. ${list(CHOICE_FIELDS.whoCanDiscoverGroup)}.` },
  allowWebPosting: { type: 'boolean', description: 'Members may post from the Groups web page.' },
  membersCanPostAsTheGroup: { type: 'boolean', description: 'Members may send as the group address itself.' },
  enableCollaborativeInbox: { type: 'boolean', description: 'Turn the collaborative inbox (assign and track conversations) on or off.' },
  includeInGlobalAddressList: { type: 'boolean', description: 'Show the group in the company address book.' },
  sendMessageDenyNotification: { type: 'boolean', description: 'Tell a person when their message is rejected.' },
  defaultMessageDenyNotificationText: { type: 'string', description: 'The text of that rejection notice (up to 10000 characters).' },
  includeCustomFooter: { type: 'boolean', description: 'Add the footer text below to every message.' },
  customFooterText: { type: 'string', description: 'Footer added to every message (up to 1000 characters).' }
};

export const SETTINGS_DESCRIPTION = 'Change a group\'s settings (Groups Settings API): who can join, post, view and discover it, external members, reply-to routing, message and spam moderation, who moderates, collaborative inbox, footer and rejection notice. Give only the settings you want to change; the rest are left alone. A value Google does not accept is refused with the list of allowed values.';
