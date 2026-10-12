import { ok } from './util.js';


// The current Reports API "ApplicationName" enum, verified against Google's
// activities.list reference on 2026-10-12. Retired historical applications
// (such as gplus/jamboard) are intentionally excluded from the new selector.
// Availability depends on the Workspace plan; unknown names fail locally.
export const REPORT_APPLICATIONS = Object.freeze([
  'access_evaluation', 'access_transparency', 'admin', 'admin_data_action',
  'assignments', 'calendar', 'chat', 'chrome', 'chrome_sync', 'classroom',
  'cloud_search', 'contacts', 'context_aware_access', 'data_migration',
  'data_studio', 'directory_sync', 'drive', 'gcp',
  'gemini_in_workspace_apps', 'gmail', 'graduation', 'groups',
  'groups_enterprise', 'keep', 'ldap', 'login', 'meet', 'meet_hardware',
  'mobile', 'profile', 'rules', 'saml', 'takeout', 'tasks', 'token',
  'user_accounts', 'vault', 'voice', 'workspace_studio'
]);

function reportActivityArgs(args = {}) {
  const app = String(args.application || '').trim();
  if (!REPORT_APPLICATIONS.includes(app))
    throw new Error('Unknown Reports application "' + app + '". Allowed: ' + REPORT_APPLICATIONS.join(', '));
  const maxResults = args.maxResults === undefined ? 100 : args.maxResults;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 200)
    throw new Error('maxResults must be an integer from 1 to 200.');
  for (const prop of ['startTime', 'endTime']) {
    if (args[prop] !== undefined && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(args[prop]) || !Number.isFinite(Date.parse(args[prop]))))
      throw new Error(prop + ' must be a valid ISO date-time with a time-zone offset.');
  }
  if (args.endTime && !args.startTime) throw new Error('endTime requires startTime.');
  if (args.startTime && args.endTime && Date.parse(args.startTime) >= Date.parse(args.endTime))
    throw new Error('startTime must precede endTime.');
  if (app === 'gmail' && (!args.startTime || !args.endTime || Date.parse(args.endTime) - Date.parse(args.startTime) > 30 * 86400000))
    throw new Error('Gmail audit requires startTime/endTime within a 30-day interval.');
  if (args.userKey !== undefined && (typeof args.userKey !== 'string' || !args.userKey.trim()))
    throw new Error('userKey must be a non-empty email, profile ID or "all".');
  if (args.pageToken !== undefined && (typeof args.pageToken !== 'string' || !args.pageToken))
    throw new Error('pageToken must be a non-empty string.');
  return {
    applicationName: app, userKey: args.userKey || 'all', maxResults,
    ...(args.startTime ? { startTime: args.startTime } : {}),
    ...(args.endTime ? { endTime: args.endTime } : {}),
    ...(args.pageToken ? { pageToken: args.pageToken } : {})
  };
}

export const tools = [
  { name: 'reports_activity', description: 'Read paged activity/audit logs for an allowed Google Workspace Reports application (Calendar, Meet, Chat, SAML, rules, and others). This is read-only. A Google plan or permission may prevent some apps. Gmail needs a dated window of 30 days or less; no sensitive-content expansion.', inputSchema: { type: 'object', properties: { application: { type: 'string', enum: REPORT_APPLICATIONS }, userKey: { type: 'string', default: 'all' }, startTime: { type: 'string', description: 'ISO timestamp, with time zone' }, endTime: { type: 'string', description: 'ISO timestamp, with time zone' }, maxResults: { type: 'integer', minimum: 1, maximum: 200, default: 100 }, pageToken: { type: 'string' } }, required: ['application'] } },
  { name: 'reports_login_activity', description: "Audit log of sign-ins across the domain (who logged in, from where, suspicious login flags)", inputSchema: { type: 'object', properties: { userKey: { type: 'string', default: 'all' }, startTime: { type: 'string' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'reports_admin_activity', description: 'Audit log of admin console actions across the domain (who changed what setting)', inputSchema: { type: 'object', properties: { userKey: { type: 'string', default: 'all' }, startTime: { type: 'string' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'reports_drive_activity', description: 'Audit log of Drive activity (file views, edits, shares, downloads) domain-wide or for one user', inputSchema: { type: 'object', properties: { userKey: { type: 'string', default: 'all' }, startTime: { type: 'string' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'reports_groups_activity', description: 'Audit log of group membership/settings changes', inputSchema: { type: 'object', properties: { userKey: { type: 'string', default: 'all' }, startTime: { type: 'string' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'reports_oauth_token_activity', description: 'Audit log of OAuth token grants/revocations domain-wide', inputSchema: { type: 'object', properties: { userKey: { type: 'string', default: 'all' }, startTime: { type: 'string' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'reports_mobile_activity', description: 'Audit log of mobile device events (enrollments, wipes, syncs)', inputSchema: { type: 'object', properties: { userKey: { type: 'string', default: 'all' }, startTime: { type: 'string' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'reports_usage_customer', description: 'Domain-wide daily usage summary (accounts, storage, apps activated)', inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] } },
  { name: 'reports_usage_user', description: "Per-user daily usage summary (Gmail/Drive/Meet activity, storage used)", inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['userKey', 'date'] } }
];

async function activities(admin, { applicationName, userKey, startTime, maxResults }) {
  const res = await admin.activities.list({ userKey: userKey || 'all', applicationName, startTime, maxResults: maxResults || 100 });
  return res.data.items || [];
}

export const handlers = {
  reports_activity: async (args, { adminReports }) => {
    const query = reportActivityArgs(args);
    const response = await adminReports.activities.list(query);
    return ok({ application: query.applicationName, activities: response.data?.items || [], ...(response.data?.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}) });
  },
  reports_login_activity: async (args, { adminReports }) => ok(await activities(adminReports, { ...args, applicationName: 'login' })),
  reports_admin_activity: async (args, { adminReports }) => ok(await activities(adminReports, { ...args, applicationName: 'admin' })),
  reports_drive_activity: async (args, { adminReports }) => ok(await activities(adminReports, { ...args, applicationName: 'drive' })),
  reports_groups_activity: async (args, { adminReports }) => ok(await activities(adminReports, { ...args, applicationName: 'groups' })),
  reports_oauth_token_activity: async (args, { adminReports }) => ok(await activities(adminReports, { ...args, applicationName: 'token' })),
  reports_mobile_activity: async (args, { adminReports }) => ok(await activities(adminReports, { ...args, applicationName: 'mobile' })),
  reports_usage_customer: async (args, { adminReports }) => {
    const res = await adminReports.customerUsageReports.get({ date: args.date });
    return ok(res.data.usageReports || []);
  },
  reports_usage_user: async (args, { adminReports }) => {
    const res = await adminReports.userUsageReport.get({ userKey: args.userKey, date: args.date });
    return ok(res.data.usageReports || []);
  }
};
