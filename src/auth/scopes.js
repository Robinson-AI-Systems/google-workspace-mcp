// Every OAuth scope this server can use, grouped by the Google service it unlocks.
// The sign-in page requests ALL of these at once so you only ever log in once.
// If you don't use a service (e.g. Classroom), Google simply never gets asked to use it.

export const SCOPE_GROUPS = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.settings.basic',
    'https://www.googleapis.com/auth/gmail.settings.sharing'
  ],
  // Owner-approved read-only Postmaster access (2026-10-02). Existing
  // connected accounts must explicitly re-authorize at /api/google/authorize.
  postmaster: ['https://www.googleapis.com/auth/postmaster.readonly'],
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
  // Approved in writing 2026-10-02; requires new user OAuth consent and
  // Google Super Admin role. Do not add to DELEGATED_SCOPES.
  cloudIdentityPolicies: ['https://www.googleapis.com/auth/cloud-identity.policies.readonly'],
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
  ]
  // alertCenter ('https://www.googleapis.com/auth/apps.alerts') is intentionally
  // left out of the login request: Alert Center is a limited-availability Google
  // API and Google's OAuth consent screen won't let this scope be requested/shown
  // even with the API enabled, which blocks the ENTIRE login. The alertcenter
  // tools still exist in the code; they just won't be authorized until Google
  // allowlists this scope for the project (or a future service-account/domain-wide
  // delegation setup, which doesn't go through this same consent screen).
};

export const ALL_SCOPES = Array.from(new Set(Object.values(SCOPE_GROUPS).flat()));

// Incremental consent for the observed acceptance-read gaps. Keep this outside
// SCOPE_GROUPS so the standard enrollment contract does not silently expand.
export const ACCEPTANCE_READ_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/ediscovery.readonly'
]);

// Optional repair for the remaining catalog reads. Never included in standard
// enrollment or the already-approved four-scope acceptance request.
export const CATALOG_READ_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/cloud-identity.groups.readonly',
  'https://www.googleapis.com/auth/chrome.management.policy.readonly',
  'https://www.googleapis.com/auth/chat.memberships.readonly'
]);

// Independent Tasks recovery when eDiscovery consent is excluded by the owner.
// Keep the earlier acceptance and standard enrollment contracts unchanged.
export const TASKS_READ_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/tasks.readonly'
]);
