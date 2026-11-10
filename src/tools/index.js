import { mergeNamespaces } from './util.js';
import { applyGuards } from './guards.js';
import * as rtcMeta from './rtc-meta.js';
import * as bulk from './bulk.js';
import * as undo from './undo.js';
import * as adminOverview from './admin-overview.js';
import * as adminConsoleVerify from './admin-console-verify.js';
import * as devIntegration from './dev-integration.js';
import * as devFixtures from './dev-fixtures.js';
import * as devCalendarSnapshot from './dev-calendar-snapshot.js';
import * as gmail from './gmail.js';
import * as drive from './drive.js';
import * as sharedDrives from './shared-drives.js';
import * as calendar from './calendar.js';
import * as sheets from './sheets.js';
import * as docs from './docs.js';
import * as slides from './slides.js';
import * as forms from './forms.js';
import * as tasks from './tasks.js';
import * as people from './people.js';
import * as adminDirectory from './admin-directory.js';
import * as adminReports from './admin-reports.js';
import * as licensing from './licensing.js';
import * as chat from './chat.js';
import * as extraAdminApis from './extra-admin-apis.js';
import * as workflows from './workflows.js';
import * as accounts from './accounts.js';
import * as mailboxBranding from './mailbox-branding.js';
import * as ops from './ops.js';
import * as policyAudit from './policy-audit.js';
import * as postmaster from './postmaster.js';
import * as emailHealth from './email-health.js';
import * as healthReport from './health-report.js';
import * as digest from './digest.js';
import * as inbox from './inbox.js';
import * as staff from './staff.js';
import * as business from './business.js';
import * as dnsTools from './dns.js';
import * as businessResources from './business-resources.js';
import { applyDomainGuard } from './domain-guard.js';
import { applyResultRules } from '../rtc/results.js';

export const registry = applyResultRules(applyDomainGuard(applyGuards(mergeNamespaces([
  rtcMeta, bulk, undo, adminOverview, adminConsoleVerify, devIntegration, devFixtures, devCalendarSnapshot, gmail, drive, sharedDrives, calendar, sheets, docs, slides, forms, tasks, people,
  adminDirectory, adminReports, licensing, chat, extraAdminApis, workflows, accounts, mailboxBranding, ops, emailHealth, healthReport, digest, inbox, staff, business, dnsTools, postmaster, policyAudit, businessResources
]))));
