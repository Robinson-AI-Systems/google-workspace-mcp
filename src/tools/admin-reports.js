import { ok } from './util.js';

export const tools = [
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
