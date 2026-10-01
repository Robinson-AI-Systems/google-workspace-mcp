import { mergeNamespaces } from './util.js';
import * as gmail from './gmail.js';
import * as drive from './drive.js';
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

export const registry = mergeNamespaces([
  gmail, drive, calendar, sheets, docs, slides, forms, tasks, people,
  adminDirectory, adminReports, licensing, chat, extraAdminApis, workflows, accounts, mailboxBranding
]);
