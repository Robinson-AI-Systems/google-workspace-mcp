// workflow_health_report: a read-only security and hygiene check of the whole Workspace (or one domain).
// Collects facts from Google, scores them with the pure rules below, and returns a Markdown report with
// PASS / WARN / FAIL / INFO and a one-line fix for each problem. It prints names, email addresses and
// counts only; never passwords, tokens or keys.
import { google } from 'googleapis';
import { ok } from './util.js';
import { domainOfEmail } from '../domains.js';
import { planSummary } from './ops.js';
import { customerIdFor } from './licensing.js';
import { buildDelegatedAuth, isDelegationConfigured } from '../auth/service-account.js';

const DAY = 86400000;
const BASIC_SCOPES = new Set(['openid', 'email', 'profile', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile']);
const FULL_ACCESS = /^https:\/\/mail\.google\.com\/?$|\/auth\/admin\.|\/auth\/drive$|\/auth\/cloud-platform$/;
export const MAX_USERS = 500;       // users read
export const MAX_DEEP_CHECKS = 100; // users checked one by one (apps, forwarding)
export const STALE_DAYS = 90;

const item = (check, status, found, fix = null) => ({ check, status, found, fix });
const list = (names, n = 8) => names.slice(0, n).join(', ') + (names.length > n ? ` and ${names.length - n} more` : '');

// ---------- scoring rules (pure; unit tested) ----------
export function scoreUsers(users, now = Date.now()) {
  const active = users.filter((u) => !u.suspended && !u.archived);
  const out = [];
  const no2sv = active.filter((u) => !u.isEnrolledIn2Sv);
  const adminsNo2sv = no2sv.filter((u) => u.isAdmin);
  out.push(adminsNo2sv.length ? item('2-Step Verification', 'FAIL', `Admins without it: ${list(adminsNo2sv.map((u) => u.primaryEmail))}${no2sv.length > adminsNo2sv.length ? `. Other people without it: ${no2sv.length - adminsNo2sv.length}` : ''}.`, 'Have each admin enrol today (myaccount.google.com/security), then turn on enforcement (workspace_where_is_setting "2sv").')
    : no2sv.length ? item('2-Step Verification', 'WARN', `${no2sv.length} of ${active.length} active people have not enrolled: ${list(no2sv.map((u) => u.primaryEmail))}.`, 'Ask them to enrol, then turn on enforcement.')
      : item('2-Step Verification', 'PASS', `All ${active.length} active people are enrolled.`));
  const notEnforced = active.filter((u) => !u.isEnforcedIn2Sv);
  out.push(notEnforced.length ? item('2-Step enforcement', 'WARN', `Not enforced for ${notEnforced.length} of ${active.length} active people.`, 'Once everyone is enrolled, set enforcement for the top org unit (admin_set_2sv_enforcement or Security > 2-step verification).') : item('2-Step enforcement', 'PASS', 'Enforced for everyone active.'));

  const admins = active.filter((u) => u.isAdmin);
  out.push(admins.length === 0 ? item('Super admins', 'FAIL', 'No active super admin found.', 'Make sure at least two trusted people are super admins.')
    : admins.length === 1 ? item('Super admins', 'WARN', `Only one: ${admins[0].primaryEmail}. If that account is locked out, nobody can fix things.`, 'Add a second super admin with their own 2-Step Verification.')
      : admins.length > 4 ? item('Super admins', 'WARN', `${admins.length} super admins: ${list(admins.map((u) => u.primaryEmail))}.`, 'Keep it to 2 to 4; give everyone else a narrower admin role.')
        : item('Super admins', 'PASS', list(admins.map((u) => u.primaryEmail))));

  const noRecovery = active.filter((u) => !u.recoveryEmail && !u.recoveryPhone);
  out.push(noRecovery.length ? item('Recovery email or phone', 'WARN', `${noRecovery.length} without either: ${list(noRecovery.map((u) => u.primaryEmail))}.`, 'Set a recovery email or phone (admin_update_user) so a locked-out person can get back in.') : item('Recovery email or phone', 'PASS', 'Everyone active has one.'));

  const cutoff = now - STALE_DAYS * DAY;
  const stale = active.filter((u) => { const t = Date.parse(u.lastLoginTime); return !t || t < Date.parse('1971-01-01') || t < cutoff; });
  out.push(stale.length ? item(`Sign-ins in the last ${STALE_DAYS} days`, 'WARN', `${stale.length} active accounts have not signed in: ${list(stale.map((u) => u.primaryEmail))}.`, 'Suspend or delete accounts nobody uses (they cost a licence and are an easy way in).') : item(`Sign-ins in the last ${STALE_DAYS} days`, 'PASS', 'Everyone active has signed in recently.'));

  const suspended = users.filter((u) => u.suspended);
  out.push(item('Suspended accounts', 'INFO', suspended.length ? `${suspended.length}: ${list(suspended.map((u) => u.primaryEmail))}.` : 'None.'));
  const inRoot = active.filter((u) => (u.orgUnitPath || '/') === '/');
  out.push(item('Users in the top org unit', 'INFO', `${inRoot.length} of ${active.length} active people sit in the top-level org unit${inRoot.length ? `: ${list(inRoot.map((u) => u.primaryEmail))}` : ''}.`, inRoot.length === active.length && active.length > 1 ? 'Consider org units (e.g. one per team) so settings can differ by group.' : null));
  return out;
}

export function scoreApps(appsByUser, skipped = 0) {
  const flagged = [];
  for (const [user, apps] of Object.entries(appsByUser)) {
    for (const app of apps || []) {
      const extra = (app.scopes || []).filter((s) => !BASIC_SCOPES.has(s));
      if (extra.length) flagged.push({ user, app: app.displayText || app.clientId || 'unnamed app', extra, full: extra.some((s) => FULL_ACCESS.test(s)) });
    }
  }
  const note = skipped ? ` (only the first ${MAX_DEEP_CHECKS} people were checked; ${skipped} not checked)` : '';
  if (!flagged.length) return item('Third-party app access', 'PASS', `No app has access beyond sign-in${note}.`);
  const apps = [...new Set(flagged.map((f) => f.app))];
  const full = flagged.filter((f) => f.full);
  return item('Third-party app access', full.length ? 'FAIL' : 'WARN',
    `${apps.length} app${apps.length === 1 ? '' : 's'} can read beyond sign-in: ${list(apps)}${full.length ? `. Full mailbox, Drive or admin access: ${list([...new Set(full.map((f) => `${f.app} (${f.user})`))])}` : ''}${note}.`,
    'Review them with admin_list_tokens; remove ones nobody needs with admin_delete_token, and restrict new ones (workspace_where_is_setting "marketplace allowlist").');
}

export function scoreForwarding(byUser, workspaceDomains, skipped = 0) {
  const on = Object.entries(byUser).filter(([, f]) => f?.enabled && f.emailAddress);
  const note = skipped ? ` (only the first ${MAX_DEEP_CHECKS} people were checked)` : '';
  if (!on.length) return item('Automatic forwarding of mail', 'PASS', `No mailbox forwards its mail automatically${note}.`);
  const outside = on.filter(([, f]) => !workspaceDomains.has(domainOfEmail(f.emailAddress)));
  return item('Automatic forwarding of mail', outside.length ? 'FAIL' : 'WARN',
    `${on.map(([u, f]) => `${u} -> ${f.emailAddress}`).join('; ')}${note}.`,
    outside.length ? 'Mail leaving the company is a classic sign of a taken-over account. Confirm each is intended; if not, turn it off with gmail_update_forwarding_settings and reset that password.' : 'Make sure each is intended.');
}

export function scoreGroups(settingsByGroup) {
  const open = Object.entries(settingsByGroup).filter(([, s]) => s?.whoCanPostMessage === 'ANYONE_CAN_POST');
  const external = Object.entries(settingsByGroup).filter(([, s]) => String(s?.allowExternalMembers) === 'true');
  const names = (rows) => list(rows.map(([g]) => g));
  if (!open.length && !external.length) return item('Groups open to outsiders', 'PASS', 'No group accepts posts from anyone or has outside members.');
  return item('Groups open to outsiders', 'WARN', `${open.length ? `Anyone on the internet can post to: ${names(open)}. ` : ''}${external.length ? `Outside members allowed in: ${names(external)}.` : ''}`.trim(),
    'Fine for a public inbox like support@ (but expect spam). For anything else: admin_update_group_settings, set whoCanPostMessage to ALL_IN_DOMAIN_CAN_POST.');
}

export function scoreLicences(users, licenceHolders, now = Date.now()) {
  const byEmail = new Map(users.map((u) => [String(u.primaryEmail).toLowerCase(), u]));
  const cutoff = now - STALE_DAYS * DAY;
  const wasted = [];
  for (const holder of licenceHolders) {
    const u = byEmail.get(String(holder).toLowerCase());
    if (!u) continue;
    const t = Date.parse(u.lastLoginTime);
    if (u.suspended || !t || t < Date.parse('1971-01-01') || t < cutoff) wasted.push(u.primaryEmail);
  }
  return wasted.length ? item('Paid licences nobody is using', 'WARN', `${wasted.length} licences are held by suspended or inactive accounts: ${list(wasted)}.`, 'Remove the licence (licensing_remove_license) or the account, and ask Google to lower the seat count (Billing > Subscriptions).')
    : item('Paid licences nobody is using', 'PASS', 'Every licence is held by an active account.');
}

export function scoreSharing(files) {
  return files.length ? item('Drive files open to anyone with the link', 'WARN', `${files.length}${files.length >= 50 ? '+' : ''} files owned by or visible to this account: ${list(files.map((f) => f.name))}.`, 'Use workflow_audit_external_sharing for the full list; tighten with drive_remove_permission.')
    : item('Drive files open to anyone with the link', 'PASS', 'None found for this account.');
}

// ---------- collecting the facts ----------
async function allPages(fn, key, { pages = 10 } = {}) {
  const rows = [];
  let pageToken;
  for (let i = 0; i < pages; i++) {
    const res = await fn(pageToken);
    rows.push(...(res.data[key] || []));
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return rows;
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

const trouble = (err) => String(err?.response?.data?.error?.message || err?.message || err).slice(0, 160);
const unavailable = (check, err) => item(check, 'WARN', `Could not check: ${trouble(err)}`, 'Fix the permission or API it names, then run the report again.');

const realGmailFor = (email) => google.gmail({ version: 'v1', auth: buildDelegatedAuth(email) });

export async function healthReport(scope, clients, { gmailFor = realGmailFor, delegationReady = isDelegationConfigured(), now = Date.now() } = {}) {
  const domain = scope && scope !== 'all' ? String(scope).trim().toLowerCase() : null;
  const results = [];
  const note = [];

  const rawUsers = await allPages((pageToken) => clients.admin.users.list({ domain: domain || undefined, customer: domain ? undefined : 'my_customer', maxResults: 500, pageToken, projection: 'full', fields: 'nextPageToken,users(primaryEmail,isAdmin,isEnrolledIn2Sv,isEnforcedIn2Sv,suspended,archived,lastLoginTime,recoveryEmail,recoveryPhone,orgUnitPath)' }), 'users', { pages: Math.ceil(MAX_USERS / 500) });
  const users = rawUsers.slice(0, MAX_USERS);
  if (!users.length) return { scope: domain || 'all', summary: { pass: 0, warn: 0, fail: 0, info: 0 }, checks: [item('Users', 'WARN', 'Google returned no users for this scope.', 'Check the domain name, and that this account is an admin.')], report: 'No users found.' };
  if (rawUsers.length > MAX_USERS) note.push(`Only the first ${MAX_USERS} users were read.`);
  results.push(...scoreUsers(users, now));

  const active = users.filter((u) => !u.suspended && !u.archived);
  const deep = active.slice(0, MAX_DEEP_CHECKS);
  const skipped = active.length - deep.length;

  try {
    const apps = await inBatches(deep, 5, async (u) => [u.primaryEmail, (await clients.admin.tokens.list({ userKey: u.primaryEmail, fields: 'items(displayText,clientId,scopes)' })).data.items || []]);
    results.push(scoreApps(Object.fromEntries(apps), skipped));
  } catch (err) { results.push(unavailable('Third-party app access', err)); }

  if (!delegationReady) {
    results.push(item('Automatic forwarding of mail', 'INFO', 'Not checked: reading other people\'s Gmail settings needs domain-wide delegation, which is not set up.', 'Follow DEPLOY.md Part 5, then run this again.'));
  } else {
    try {
      const rows = await inBatches(deep, 5, async (u) => { try { return [u.primaryEmail, (await gmailFor(u.primaryEmail).users.settings.getAutoForwarding({ userId: 'me' })).data]; } catch (err) { return [u.primaryEmail, { error: trouble(err) }]; } });
      const failed = rows.filter(([, f]) => f.error);
      const r = scoreForwarding(Object.fromEntries(rows.filter(([, f]) => !f.error)), new Set(users.map((u) => domainOfEmail(u.primaryEmail)).filter(Boolean)), skipped);
      if (failed.length) r.found += ` Could not read ${failed.length} mailbox${failed.length === 1 ? '' : 'es'}: ${list(failed.map(([u]) => u), 3)} (${failed[0][1].error}).`;
      if (failed.length === rows.length) { r.status = 'WARN'; r.fix = 'Check that the Admin console delegation entry lists gmail.settings.basic.'; }
      results.push(r);
    } catch (err) { results.push(unavailable('Automatic forwarding of mail', err)); }
  }

  try {
    const groups = await allPages((pageToken) => clients.admin.groups.list({ domain: domain || undefined, customer: domain ? undefined : 'my_customer', maxResults: 200, pageToken, fields: 'nextPageToken,groups(email)' }), 'groups', { pages: 1 });
    const settings = await inBatches(groups.slice(0, MAX_DEEP_CHECKS), 5, async (g) => [g.email, (await clients.groupssettings.groups.get({ groupUniqueId: g.email })).data]);
    results.push(scoreGroups(Object.fromEntries(settings)));
  } catch (err) { results.push(unavailable('Groups open to outsiders', err)); }

  try {
    const customerId = await customerIdFor(clients);
    const holders = [];
    let pageToken;
    for (let i = 0; i < 10; i++) {
      const res = await clients.licensing.licenseAssignments.listForProduct({ productId: 'Google-Apps', customerId, maxResults: 1000, pageToken });
      holders.push(...(res.data.items || []).map((a) => a.userId));
      pageToken = res.data.nextPageToken;
      if (!pageToken) break;
    }
    results.push(scoreLicences(users, holders, now));
  } catch (err) { results.push(unavailable('Paid licences nobody is using', err)); }

  try {
    const files = (await clients.drive.files.list({ q: "visibility='anyoneWithLink' and trashed=false", pageSize: 50, fields: 'files(id,name)', supportsAllDrives: true, includeItemsFromAllDrives: true })).data.files || [];
    results.push(scoreSharing(files));
  } catch (err) { results.push(unavailable('Drive files open to anyone with the link', err)); }

  const count = (s) => results.filter((c) => c.status === s).length;
  const summary = { pass: count('PASS'), warn: count('WARN'), fail: count('FAIL'), info: count('INFO') };
  const rows = results.map((c) => `| ${c.check} | **${c.status}** | ${String(c.found).replace(/\|/g, '\\|')} |`);
  const fixes = results.filter((c) => c.fix && (c.status === 'WARN' || c.status === 'FAIL')).map((c) => `- **${c.check}** (${c.status}): ${c.fix}`);
  const report = [`## Workspace health report: ${domain || 'whole Workspace'}`, '', `${users.length} people read (${active.length} active). **${summary.fail} to fix, ${summary.warn} to improve, ${summary.pass} fine.**`, '',
    '| Check | Result | What was found |', '|---|---|---|', ...rows, ...(fixes.length ? ['', '### What to do', ...fixes] : []), ...(note.length ? ['', note.join(' ')] : []),
    '', `_Read-only. Drive sharing covers only the files this connection's account can see (${clients.actingAs}). Purchased seat counts are not available through Google's API._`].join('\n');
  return { scope: domain || 'all', summary, checks: results, report };
}

export const tools = [
  { name: 'workflow_health_report', description: "Read-only security and hygiene report: who has 2-Step Verification, admins, recovery options, stale accounts, third-party apps with wide access, mail auto-forwarding, groups open to outsiders, licences nobody uses, Drive files open to anyone with the link. PASS/WARN/FAIL with a one-line fix each. Never shows tokens or passwords.", inputSchema: { type: 'object', properties: { scope: { type: 'string', default: 'all', description: "'all' for the whole Workspace, or one domain like example.com" } } } }
];
export const handlers = {
  workflow_health_report: async (args, clients) => ok(await healthReport(args.scope || 'all', clients))
};
