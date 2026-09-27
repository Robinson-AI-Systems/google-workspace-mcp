// Every OAuth scope this server can use, grouped by the Google service it unlocks.
// The authorize script requests ALL of these at once so you only ever log in once.
// If you don't use a service (e.g. Classroom), Google simply never gets asked to use it.

export const SCOPE_GROUPS = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.settings.basic',
    'https://www.googleapis.com/auth/gmail.settings.sharing'
  ],
  drive: [
    'https://www.googleapis.com/auth/drive'
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar'
  ],
  sheets: [
    'https://www.googleapis.com/auth/spreadsheets'
  ],
  docs: [
    'https://www.googleapis.com/auth/documents'
  ],
  slides: [
    'https://www.googleapis.com/auth/presentations'
  ],
  forms: [
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly'
  ],
  tasks: [
    'https://www.googleapis.com/auth/tasks'
  ],
  contacts: [
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/directory.readonly'
  ],
  chat: [
    'https://www.googleapis.com/auth/chat.spaces',
    'https://www.googleapis.com/auth/chat.messages'
  ],
  classroom: [
    'https://www.googleapis.com/auth/classroom.courses',
    'https://www.googleapis.com/auth/classroom.rosters',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.coursework.me'
  ],
  // --- Admin SDK: everything needed for "manage the whole Workspace" ---
  adminDirectory: [
    'https://www.googleapis.com/auth/admin.directory.user',
    'https://www.googleapis.com/auth/admin.directory.group',
    'https://www.googleapis.com/auth/admin.directory.group.member',
    'https://www.googleapis.com/auth/admin.directory.orgunit',
    'https://www.googleapis.com/auth/admin.directory.domain',
    'https://www.googleapis.com/auth/admin.directory.rolemanagement',
    'https://www.googleapis.com/auth/admin.directory.device.mobile',
    'https://www.googleapis.com/auth/admin.directory.device.chromeos',
    'https://www.googleapis.com/auth/admin.directory.resource.calendar',
    'https://www.googleapis.com/auth/admin.directory.userschema',
    'https://www.googleapis.com/auth/admin.directory.customer',
    'https://www.googleapis.com/auth/admin.directory.notifications'
  ],
  adminReports: [
    'https://www.googleapis.com/auth/admin.reports.usage.readonly',
    'https://www.googleapis.com/auth/admin.reports.audit.readonly'
  ],
  adminSecurity: [
    'https://www.googleapis.com/auth/admin.directory.user.security'
  ],
  groupsSettings: [
    'https://www.googleapis.com/auth/apps.groups.settings'
  ],
  licensing: [
    'https://www.googleapis.com/auth/apps.licensing'
  ],
  dataTransfer: [
    'https://www.googleapis.com/auth/admin.datatransfer'
  ],
  alertCenter: [
    'https://www.googleapis.com/auth/apps.alerts'
  ]
};

export const ALL_SCOPES = Array.from(new Set(Object.values(SCOPE_GROUPS).flat()));
