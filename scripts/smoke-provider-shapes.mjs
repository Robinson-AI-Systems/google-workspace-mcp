// P0-2: the RTC transport's 200 OK is not proof that Google returned
// the expected resource. These rules describe our handler outputs, not raw
// Google responses: some handlers deliberately return data.items || [].
// Never log a provider value, email, ID, token, event or message body.
import { verifyAdditionalRead } from './smoke-readonly-cases.mjs';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' && value.trim().length > 0;
const boolean = value => typeof value === 'boolean';
const email = value => string(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const smallArray = (value, item, limit = 200) =>
  Array.isArray(value) && value.length <= limit && value.every(item);
const id = value => object(value) && string(value.id);
const idWith = key => value => object(value) && string(value[key]);
const named = value => id(value) && string(value.name);
const keys = (...fields) => value => object(value) && fields.some(key => value[key] !== undefined);
const objectList = (key, member, limit, emptyMarker) => value => {
  if (!object(value)) return false;
  if (value.nextPageToken !== undefined && !string(value.nextPageToken)) return false;
  if (value[key] !== undefined) return smallArray(value[key], member, limit);
  // Gmail can omit the collection when it is empty; its documented
  // resultSizeEstimate=0 independently distinguishes that from junk {}.
  return emptyMarker ? emptyMarker(value) : false;
};
const optionalString = value => value === undefined || string(value);
const arrayList = (member, limit = 200) => value =>
  smallArray(value, member, limit) ||
  // The generic response compactor records truncation explicitly.
  (object(value) && string(value.truncated) &&
    smallArray(value.items, member, limit));
const mailboxList = (field, member, limit = 200) =>
  objectList(field, member, limit, value =>
    value.resultSizeEstimate === 0 && optionalString(value.nextPageToken));
const message = value => id(value) && optionalString(value.threadId);
// Google can return an empty snippet (for example a bodyless test message).
// Resource identity and string type remain mandatory when the field is present.
const thread = value => id(value) && (value.snippet === undefined || typeof value.snippet === 'string');
const draft = value => id(value) && (!value.message || id(value.message));
const label = value => named(value) && (value.type === undefined ||
  ['system', 'user'].includes(value.type));
const filter = value => id(value) && object(value.criteria) && object(value.action);
const address = key => value => object(value) && email(value[key]);
const calendar = value => id(value) && (value.summary === undefined || string(value.summary));
const task = value => id(value) && (value.title === undefined || typeof value.title === 'string');
const colorMap = value => object(value) &&
  Object.values(value).every(entry => object(entry) &&
    string(entry.background) && string(entry.foreground));
const apiSettings = value => object(value) &&
  boolean(value.enabled);
const quota = value => object(value) &&
  ['limit', 'usage', 'usageInDrive', 'usageInDriveTrash'].some(key =>
    value[key] !== undefined && typeof value[key] === 'string' && /^\d+$/.test(value[key]));
const changes = value => arrayList(row => object(row) &&
  (string(row.tool) || string(row.id) || string(row.summary)))(value) ||
  (object(value) && Array.isArray(value.changes) && value.changes.length === 0 &&
    string(value.note));

export const PROVIDER_READ_PROOFS = Object.freeze({
  workspace_gmail_get_profile: (v, account) => object(v) && email(v.emailAddress) &&
    v.emailAddress.toLowerCase() === String(account).toLowerCase(),
  workspace_gmail_list_labels: arrayList(label),
  workspace_gmail_list_messages: mailboxList('messages', message, 1),
  workspace_gmail_list_threads: mailboxList('threads', thread, 1),
  workspace_gmail_list_drafts: objectList('drafts', draft, 1, v => v.resultSizeEstimate === 0),
  workspace_gmail_list_filters: arrayList(filter),
  workspace_gmail_list_send_as: arrayList(address('sendAsEmail')),
  workspace_gmail_get_imap_settings: apiSettings,
  workspace_gmail_get_pop_settings: v => object(v) &&
    ['disabled','allMail','fromNowOn'].includes(v.accessWindow),
  workspace_gmail_get_vacation_settings: v => object(v) && boolean(v.enableAutoReply),
  workspace_gmail_get_forwarding_settings: apiSettings,
  workspace_gmail_list_forwarding_addresses: arrayList(address('forwardingEmail')),
  workspace_gmail_list_delegates: arrayList(address('delegateEmail')),
  workspace_drive_get_about: v => object(v) && (
    object(v.user) && (string(v.user.permissionId) || email(v.user.emailAddress)) ||
    boolean(v.canCreateDrives) || boolean(v.canCreateTeamDrives) || quota(v.storageQuota)),
  workspace_drive_get_start_page_token: v => object(v) && string(v.startPageToken),
  workspace_drive_list_files: objectList('files', id, 1),
  workspace_drive_list_shared_drives: objectList('drives', named, 1),
  workspace_drive_list_recent_files: arrayList(id, 1),
  workspace_drive_list_starred: arrayList(id),
  workspace_drive_list_trash: arrayList(id, 1),
  workspace_drive_list_shared_with_me: arrayList(id),
  workspace_drive_get_storage_quota: quota,
  workspace_calendar_get_settings: arrayList(v => id(v) && typeof v.value === 'string'),
  workspace_calendar_list_calendars: arrayList(calendar),
  workspace_calendar_list_event_colors: v => object(v) &&
    colorMap(v.calendar) && colorMap(v.event),
  workspace_calendar_list_events: arrayList(id, 1),
  workspace_tasks_list_tasklists: arrayList(task),
  workspace_tasks_list_tasks: arrayList(task),
  // Change history is a connection-owned service read, NOT Google-provider
  // evidence; the report marks this distinction explicitly.
  workspace_recent_changes: changes
});


// Resource-specific reads are optional and require an owner-provided exact
// resource identity. Never infer a fixture from a subject, name or search.
// A 200 response for a different resource must never satisfy the test.
const fixtureId = (field, argField) => (v,_account,args) =>
  object(v) && object(args) && string(args[argField]) &&
  v[field] === args[argField];
export const FIXTURE_READ_PROOFS = Object.freeze({
 workspace_gmail_get_label: fixtureId('id','labelId'),
 workspace_gmail_get_message: fixtureId('id','messageId'),
 workspace_gmail_get_thread: fixtureId('id','threadId'),
 workspace_drive_get_file: fixtureId('id','fileId'),
 workspace_drive_get_shared_drive: fixtureId('id','driveId'),
 workspace_calendar_get_event: fixtureId('id','eventId'),
 workspace_tasks_get_tasklist: fixtureId('id','tasklistId'),
 workspace_tasks_get_task: fixtureId('id','taskId'),
 workspace_docs_get_document: fixtureId('documentId','documentId'),
 workspace_sheets_get_spreadsheet: fixtureId('spreadsheetId','spreadsheetId'),
 workspace_slides_get_presentation: fixtureId('presentationId','presentationId'),
 workspace_forms_get: fixtureId('formId','formId')
});

export const INTERNAL_READ_PROOFS = new Set(['workspace_recent_changes',
  'workspace_dev_list_runs','workspace_dev_get_run','workspace_list_accounts',
  'workspace_list_connections','workspace_admin_console_capabilities',
  'workspace_where_is_setting','workspace_delegation_status']);

export function verifiedProviderReadResult(name, payload, expectedAccount, args={}) {
  if (payload === null || payload === undefined ||
      object(payload) && (payload.isError === true || Object.hasOwn(payload, 'error'))) return false;
  const validate = PROVIDER_READ_PROOFS[name] || FIXTURE_READ_PROOFS[name] ||
  ((value,account,argumentsForRead)=>verifyAdditionalRead(name,value,account,argumentsForRead));
  try { return typeof validate === 'function' && validate(payload, expectedAccount, args) === true; }
  catch { return false; }
}
