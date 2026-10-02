// The business calendar and the standard Drive folders, found (or created) by name and remembered in the
// business_resources table so the business apps can look the IDs up instead of hard-coding them.
// Acts as the connection's own Google account (no delegation involved). Safe to run twice: the second run
// returns the same IDs and creates nothing.
import { ok } from './util.js';
import { defineWrite } from './write.js';
import { BUSINESSES, STANDARD_FOLDERS } from '../businesses.js';
import { listBusinessResources, saveBusinessResource } from '../db.js';
import { ensureFolder, reasonOf } from './provision.js';
import { isNotFound } from './write.js';

const TZ = 'America/Denver';
const norm = (e) => String(e || '').trim().toLowerCase();

function problemWith(args, clients) {
  const biz = BUSINESSES[args.business];
  if (!biz) return `Unknown business "${args.business}". Use one of: ${Object.keys(BUSINESSES).join(', ')}.`;
  if (Array.isArray(clients?.allowedDomains) && clients.crossDomain !== true && !clients.allowedDomains.includes(biz.domain)) {
    return `Refused: ${biz.label} is on ${biz.domain}, which this connection (${clients.actingAs}) is not allowed to manage (it is limited to ${clients.allowedDomains.join(', ')}). Nothing was changed. Use the connection for that business.`;
  }
  return null;
}
const stored = async (business, kind) => Object.fromEntries((await listBusinessResources(business, kind)).map((r) => [r.key, r.google_id]));

// ---------- calendar ----------
async function stillThere(calendar, id) {
  try { return (await calendar.calendars.get({ calendarId: id })).data; } catch (err) { if (isNotFound(err)) return null; throw err; }
}

async function resolveCalendar(biz, businessKey, clients) {
  const { calendar } = clients;
  const name = biz.calendarName;
  const known = (await stored(businessKey, 'calendar'))[name];
  for (const [id, source] of [[known, 'table'], [biz.calendarId, 'config']]) {
    if (!id) continue;
    const cal = await stillThere(calendar, id);
    if (cal) return { id, source, name, timeZone: cal.timeZone, created: false };
  }
  const list = [];
  let pageToken;
  do { const r = (await calendar.calendarList.list({ maxResults: 250, ...(pageToken ? { pageToken } : {}) })).data; list.push(...(r.items || [])); pageToken = r.nextPageToken; } while (pageToken);
  const found = list.find((c) => c.summary === name && (c.accessRole === undefined || c.accessRole === 'owner'));
  if (found) return { id: found.id, source: 'found', name, timeZone: found.timeZone, created: false };
  return null;
}

export const businessCalendar = defineWrite({
  name: 'workspace_business_calendar',
  description: 'Returns the Google Calendar ID of a business\'s calendar ("Deliveries & Service" for Appliance Rentals), creating it (America/Denver time) only if it truly does not exist, and remembers the ID in the database so the business apps can look it up. Running it twice returns the same ID. Preview with dryRun.',
  inputSchema: { type: 'object', properties: { business: { type: 'string', enum: Object.keys(BUSINESSES) } }, required: ['business'] },
  plan: (args, clients) => {
    const problem = problemWith(args, clients);
    if (problem) throw new Error(problem);
    const biz = BUSINESSES[args.business];
    if (!biz.calendarName) throw new Error(`${biz.label} has no business calendar defined (see src/businesses.js). Nothing was changed.`);
    return { summary: `Find or create the "${biz.calendarName}" calendar for ${biz.label} and remember its ID`, target: args.business, readBefore: async () => ({ found: await resolveCalendar(biz, args.business, clients), remembered: (await stored(args.business, 'calendar'))[biz.calendarName] || null }) };
  },
  async apply(args, clients) {
    const biz = BUSINESSES[args.business];
    let res = await resolveCalendar(biz, args.business, clients);
    if (!res) {
      const made = (await clients.calendar.calendars.insert({ requestBody: { summary: biz.calendarName, timeZone: TZ } })).data;
      res = { id: made.id, source: 'created', name: biz.calendarName, timeZone: made.timeZone || TZ, created: true };
    }
    await saveBusinessResource({ business: args.business, kind: 'calendar', key: biz.calendarName, googleId: res.id });
    return ok({ calendarId: res.id, calendarName: res.name, timeZone: res.timeZone, source: res.source, created: res.created });
  },
  readAfter: async (args, clients) => { const biz = BUSINESSES[args.business]; return { calendarId: (await stored(args.business, 'calendar'))[biz.calendarName] || null, reachable: !!(await resolveCalendar(biz, args.business, clients)) }; },
  verify: (args, _b, after, details) => after.reachable === true && after.calendarId === details?.calendarId
});

// ---------- folders ----------
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const isLiveFolder = async (drive, id) => {
  try { const f = (await drive.files.get({ fileId: id, fields: 'id,name,mimeType,trashed', supportsAllDrives: true })).data; return !!f && f.trashed !== true && f.mimeType === FOLDER_MIME; }
  catch (err) { if (isNotFound(err)) return false; throw err; }
};

/** The business's main folder: the remembered ID, then the configured one, then a search by name across all of Drive. Created only if there is no match; two matches stop it (it will not guess). */
async function rootFolder(biz, businessKey, clients, { createIfMissing = true } = {}) {
  const { drive } = clients;
  const known = (await stored(businessKey, 'folder'))['(root)'];
  for (const id of [known, biz.driveFolderId]) if (id && await isLiveFolder(drive, id)) return { id, created: false };
  const esc = biz.driveFolderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const found = (await drive.files.list({ q: `name = '${esc}' and mimeType = '${FOLDER_MIME}' and trashed = false`, fields: 'files(id,name)', orderBy: 'createdTime', supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 10 })).data.files || [];
  if (found.length > 1) throw new Error(`There are ${found.length} folders named "${biz.driveFolderName}" in Drive (${found.map((f) => f.id).join(', ')}), so I will not guess which is the business folder. Delete or rename the extras, or put the right ID in src/businesses.js. Nothing was changed.`);
  if (found.length === 1) return { id: found[0].id, created: false };
  if (!createIfMissing) return null;
  const made = (await drive.files.create({ supportsAllDrives: true, requestBody: { name: biz.driveFolderName, mimeType: FOLDER_MIME, parents: ['root'] }, fields: 'id,name' })).data;
  return { id: made.id, created: true };
}

/** What Drive shows now for the standard folders under `rootId` (read-only). */
async function folderStatus(drive, rootId) {
  const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const present = {}; const missing = [];
  for (const name of STANDARD_FOLDERS) {
    const hit = ((await drive.files.list({ q: `name = '${q(name)}' and mimeType = '${FOLDER_MIME}' and '${q(rootId)}' in parents and trashed = false`, fields: 'files(id)', orderBy: 'createdTime', supportsAllDrives: true, includeItemsFromAllDrives: true })).data.files || [])[0];
    if (hit) present[name] = hit.id; else missing.push(name);
  }
  return { present, missing };
}

export const businessFolders = defineWrite({
  name: 'workspace_business_folders',
  description: 'Returns the Drive folder IDs of a business: the main folder and its nine standard folders (01 Brand Kit ... 09 Taxes & Accounting Exports), creating only the ones that are missing, and remembers the IDs in the database so the business apps can look them up. Running it twice returns the same IDs. Preview with dryRun.',
  inputSchema: { type: 'object', properties: { business: { type: 'string', enum: Object.keys(BUSINESSES) } }, required: ['business'] },
  plan: (args, clients) => {
    const problem = problemWith(args, clients);
    if (problem) throw new Error(problem);
    const biz = BUSINESSES[args.business];
    if (!biz.driveFolderName) throw new Error(`${biz.label} has no business Drive folder defined (see src/businesses.js). Nothing was changed.`);
    return { summary: `Find or create ${biz.label}'s main Drive folder and its ${STANDARD_FOLDERS.length} standard folders, and remember their IDs`, target: args.business, readBefore: async () => {
      const root = await rootFolder(biz, args.business, clients, { createIfMissing: false });
      return { remembered: await stored(args.business, 'folder'), mainFolder: root ? { id: root.id, exists: true } : { exists: false, wouldCreate: biz.driveFolderName }, ...(root ? { standardFolders: await folderStatus(clients.drive, root.id) } : { standardFolders: { present: {}, missing: STANDARD_FOLDERS } }) };
    } };
  },
  async apply(args, clients) {
    const biz = BUSINESSES[args.business];
    const root = await rootFolder(biz, args.business, clients);
    await saveBusinessResource({ business: args.business, kind: 'folder', key: '(root)', googleId: root.id });
    const folders = {}; const created = [];
    for (const name of STANDARD_FOLDERS) {
      const r = await ensureFolder(clients.drive, name, root.id);
      folders[name] = r.id;
      if (r.created) created.push(name);
      await saveBusinessResource({ business: args.business, kind: 'folder', key: name, googleId: r.id });
    }
    return ok({ rootFolderId: root.id, rootCreated: root.created, folders, created });
  },
  readAfter: async (args, clients) => {
    const remembered = await stored(args.business, 'folder');
    const live = {};
    for (const id of new Set(Object.values(remembered))) live[id] = await isLiveFolder(clients.drive, id);
    return { remembered, live };
  },
  verify: (args, _b, after, details) => STANDARD_FOLDERS.every((n) => after.remembered[n] && after.remembered[n] === details?.folders?.[n] && after.live[after.remembered[n]]) && after.remembered['(root)'] === details?.rootFolderId && after.live[details.rootFolderId] === true
});

export const tools = [businessCalendar.tool, businessFolders.tool];
export const handlers = { workspace_business_calendar: businessCalendar.handler, workspace_business_folders: businessFolders.handler };
