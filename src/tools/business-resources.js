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
    return `Refused: ${biz.label} is on ${biz.domain}, which this connection (${clients.actingAs}) is not allowed to manage (it is limited to ${clients.allowedDomains.join(', ')}). Nothing was changed. Use the connection for that business, or crossDomain: true if you really mean it.`;
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
async function rootFolder(biz, businessKey, clients) {
  const { drive } = clients;
  const known = (await stored(businessKey, 'folder'))['(root)'];
  for (const id of [known, biz.driveFolderId]) {
    if (!id) continue;
    try {
      const f = (await drive.files.get({ fileId: id, fields: 'id,name,trashed', supportsAllDrives: true })).data;
      if (f && f.trashed !== true) return { id, created: false };
    } catch (err) { if (!isNotFound(err)) throw err; }
  }
  const r = await ensureFolder(drive, biz.driveFolderName);
  return { id: r.id, created: r.created };
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
    return { summary: `Find or create ${biz.label}'s main Drive folder and its ${STANDARD_FOLDERS.length} standard folders, and remember their IDs`, target: args.business, readBefore: async () => ({ remembered: await stored(args.business, 'folder') }) };
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
  readAfter: async (args) => ({ remembered: await stored(args.business, 'folder') }),
  verify: (args, _b, after, details) => STANDARD_FOLDERS.every((n) => after.remembered[n] && after.remembered[n] === details?.folders?.[n]) && after.remembered['(root)'] === details?.rootFolderId
});

export const tools = [businessCalendar.tool, businessFolders.tool];
export const handlers = { workspace_business_calendar: businessCalendar.handler, workspace_business_folders: businessFolders.handler };
