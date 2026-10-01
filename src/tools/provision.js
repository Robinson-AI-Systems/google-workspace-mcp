// Small building blocks shared by the staff and business workflows. Every helper looks first and only
// changes what is missing, so running a workflow twice changes nothing the second time.
import crypto from 'node:crypto';
import { isNotFound } from './write.js';

export const norm = (v) => String(v || '').trim().toLowerCase();
export const reasonOf = (err) => String(err?.response?.data?.error?.message || err?.message || err).slice(0, 200);
const FOLDER = 'application/vnd.google-apps.folder';

/** A one-time password that satisfies Google's rules. Random bytes, never Math.random. */
export const tempPassword = () => `${crypto.randomBytes(12).toString('base64url')}aA1!`;

/** Run one step; a failure is recorded and the next step still runs. `fn` returns { changed, ...details } or { skipped: 'why' }. */
export async function runStep(steps, name, fn) {
  try {
    const r = (await fn()) || {};
    if (r.skipped) steps.push({ step: name, status: 'skipped', note: r.skipped });
    else steps.push({ step: name, status: r.changed === false ? 'unchanged' : 'ok', ...r });
  } catch (err) {
    steps.push({ step: name, status: 'failed', error: reasonOf(err) });
  }
}

/** The user, or null when Google has no such person. */
export async function getUser(admin, userKey, fields = 'primaryEmail,orgUnitPath,suspended,isEnrolledIn2Sv,isEnforcedIn2Sv,name') {
  try {
    const d = (await admin.users.get({ userKey, fields })).data;
    return d && d.primaryEmail ? d : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function listAliases(admin, userKey) {
  try { return ((await admin.users.aliases.list({ userKey })).data.aliases || []).map((a) => norm(a.alias)); }
  catch (err) { if (isNotFound(err)) return []; throw err; }
}

/** Add each alias that is not there yet. */
export async function ensureAliases(admin, userKey, wanted) {
  const have = new Set(await listAliases(admin, userKey));
  const added = [];
  for (const a of wanted.map(norm).filter(Boolean)) {
    if (have.has(a)) continue;
    await admin.users.aliases.insert({ userKey, requestBody: { alias: a } });
    added.push(a);
  }
  return { changed: added.length > 0, added, alreadyThere: wanted.map(norm).filter((a) => have.has(a)) };
}

export async function calendarRole(calendar, calendarId, email) {
  const rules = [];
  let pageToken;
  do { const r = (await calendar.acl.list({ calendarId, maxResults: 250, ...(pageToken ? { pageToken } : {}) })).data; rules.push(...(r.items || [])); pageToken = r.nextPageToken; } while (pageToken);
  return rules.find((r) => r.scope?.type === 'user' && norm(r.scope.value) === norm(email)) || null;
}

/** Give one person a role on a calendar; add the rule, or change the role if it differs. Nobody is emailed. */
export async function ensureCalendarAccess(calendar, calendarId, email, role) {
  const rule = await calendarRole(calendar, calendarId, email);
  if (!rule) {
    await calendar.acl.insert({ calendarId, sendNotifications: false, requestBody: { role, scope: { type: 'user', value: norm(email) } } });
    return { changed: true, role, was: null };
  }
  if (rule.role !== role) {
    const was = rule.role;
    await calendar.acl.patch({ calendarId, ruleId: rule.id, sendNotifications: false, requestBody: { role } });
    return { changed: true, role, was };
  }
  return { changed: false, role };
}

export async function drivePermission(drive, fileId, email) {
  const perms = [];
  let pageToken;
  do { const r = (await drive.permissions.list({ fileId, supportsAllDrives: true, pageSize: 100, fields: 'nextPageToken,permissions(id,type,role,emailAddress)', ...(pageToken ? { pageToken } : {}) })).data; perms.push(...(r.permissions || [])); pageToken = r.nextPageToken; } while (pageToken);
  return perms.find((p) => p.type === 'user' && norm(p.emailAddress) === norm(email)) || null;
}

/** Share a Drive file or folder with one person at a level; add or change as needed. Nobody is emailed. */
export async function ensureDriveAccess(drive, fileId, email, role) {
  const p = await drivePermission(drive, fileId, email);
  if (!p) {
    await drive.permissions.create({ fileId, supportsAllDrives: true, sendNotificationEmail: false, requestBody: { type: 'user', role, emailAddress: norm(email) } });
    return { changed: true, role, was: null };
  }
  if (['owner', 'organizer', 'fileOrganizer'].includes(p.role)) return { changed: false, role: p.role, note: `Already ${p.role}, which is higher than ${role}; left alone.` };
  if (p.role !== role) {
    const was = p.role;
    await drive.permissions.update({ fileId, permissionId: p.id, supportsAllDrives: true, requestBody: { role } });
    return { changed: true, role, was };
  }
  return { changed: false, role };
}

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** The folder with this name under `parentId`, created if it is missing. */
export async function ensureFolder(drive, name, parentId = 'root') {
  const found = (await drive.files.list({ q: `name = '${q(name)}' and mimeType = '${FOLDER}' and '${q(parentId)}' in parents and trashed = false`, fields: 'files(id,name)', supportsAllDrives: true, includeItemsFromAllDrives: true })).data.files || [];
  if (found.length) return { id: found[0].id, name, created: false };
  const made = (await drive.files.create({ supportsAllDrives: true, requestBody: { name, mimeType: FOLDER, parents: [parentId] }, fields: 'id,name' })).data;
  return { id: made.id, name, created: true };
}

/** Send a plain-text email from the acting mailbox. Callers only use this after `confirm: true`. */
export async function sendPlainEmail(gmail, { to, subject, text }) {
  const clean = (s) => String(s).replace(/[\r\n]+/g, ' ');
  const raw = [`To: ${clean(to)}`, `Subject: ${clean(subject)}`, 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0', '', text].join('\r\n');
  const sent = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } });
  return { id: sent.data?.id };
}

/** Take one person off a calendar. Returns the role they had, or null when they were not on it. */
export async function removeCalendarAccess(calendar, calendarId, email) {
  const rule = await calendarRole(calendar, calendarId, email);
  if (!rule) return null;
  const was = rule.role;
  await calendar.acl.delete({ calendarId, ruleId: rule.id });
  return was;
}

/** Take one person off a Drive file or folder. Returns the role they had, or null when they were not on it. */
export async function removeDriveAccess(drive, fileId, email) {
  const p = await drivePermission(drive, fileId, email);
  if (!p) return null;
  const was = p.role;
  await drive.permissions.delete({ fileId, permissionId: p.id, supportsAllDrives: true });
  return was;
}
