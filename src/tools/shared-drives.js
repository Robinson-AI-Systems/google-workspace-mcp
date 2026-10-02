// Shared drives (Drive API `drives.*`): list, look at, create, change and delete them.
// Who is IN a shared drive is handled by the permission tools, using the drive's id as the fileId:
// drive_list_permissions, drive_share_file, drive_update_permission, drive_remove_permission.
//
// Google's rules, checked against its Drive API reference on 2026-10-02:
//   - create needs a unique requestId (made here, so a retry cannot make a second drive);
//   - a shared drive can only be deleted when it holds no untrashed files, and only by an organizer
//     (or an administrator using asAdmin). This file never asks Google to delete files inside it.
//   - hiding is its own call (hide / unhide), not a field of update.
import { randomUUID } from 'node:crypto';
import { ok } from './util.js';
import { pick, data, D, same } from './guard-helpers.js';
import { gone } from './write.js';

const RESTRICTION_KEYS = ['copyRequiresWriterPermission', 'domainUsersOnly', 'driveMembersOnly', 'adminManagedRestrictions', 'sharingFoldersRequiresOrganizerPermission'];
const VIEW = 'id,name,hidden,themeId,colorRgb,createdTime,orgUnitId,restrictions,capabilities(canManageMembers,canDeleteDrive,canRenameDrive,canChangeDriveBackground)';
const LIST_VIEW = 'nextPageToken,drives(id,name,hidden,createdTime,orgUnitId)';

const ADMIN = { type: 'boolean', description: 'Act as a Workspace administrator: see or change shared drives you are not a member of (needs the Drive admin privilege).' };
const restrictionProps = {
  copyRequiresWriterPermission: { type: 'boolean', description: 'Only editors may copy, print or download files.' },
  domainUsersOnly: { type: 'boolean', description: 'Files can only be shared with people in the organization.' },
  driveMembersOnly: { type: 'boolean', description: 'Files can only be shared with members of this shared drive.' },
  adminManagedRestrictions: { type: 'boolean', description: 'Only administrators may change the restrictions.' },
  sharingFoldersRequiresOrganizerPermission: { type: 'boolean', description: 'Only organizers may share folders.' }
};

export const tools = [
  { name: 'drive_list_shared_drives', description: 'List the shared drives you belong to (or, as an administrator, all of them). Use a shared drive id as the fileId of the permission tools to see or change who is a member.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: "Drive search, e.g. \"name contains 'Finance'\"" }, maxResults: { type: 'number', default: 50 }, pageToken: { type: 'string' }, asAdmin: ADMIN } } },
  { name: 'drive_get_shared_drive', description: 'Get one shared drive: name, restrictions, hidden or not, and what you may do with it.', inputSchema: { type: 'object', properties: { driveId: { type: 'string' }, asAdmin: ADMIN }, required: ['driveId'] } },
  { name: 'drive_create_shared_drive', description: 'Create a shared drive. The person acting becomes its organizer. Add members afterwards with drive_share_file (fileId = the new drive id).', inputSchema: { type: 'object', properties: { name: { type: 'string' }, ...restrictionProps }, required: ['name'] } },
  { name: 'drive_update_shared_drive', description: 'Rename a shared drive, hide or show it, or change its restrictions. Give only what you want to change.', inputSchema: { type: 'object', properties: { driveId: { type: 'string' }, name: { type: 'string' }, hidden: { type: 'boolean', description: 'true hides it from the usual list, false shows it again.' }, ...restrictionProps, asAdmin: ADMIN }, required: ['driveId'] } },
  { name: 'drive_delete_shared_drive', description: 'Permanently delete a shared drive. Google only allows it when the drive holds no files that are not in the trash; this tool never deletes files inside it.', inputSchema: { type: 'object', properties: { driveId: { type: 'string' }, asAdmin: ADMIN }, required: ['driveId'] } },
  { name: 'drive_update_permission', description: "Change a person's role on a Drive file, folder or shared drive (use a shared drive id as fileId to change a member's role). Roles: reader, commenter, writer, fileOrganizer (shared drives), organizer (shared drives), owner is not allowed here (use drive_transfer_ownership).", inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, permissionId: { type: 'string', description: 'From drive_list_permissions.' }, role: { type: 'string', enum: ['reader', 'commenter', 'writer', 'fileOrganizer', 'organizer'] } }, required: ['fileId', 'permissionId', 'role'] } }
];

const asAdmin = (a) => (a.asAdmin === true ? { useDomainAdminAccess: true } : {});

/** The restrictions the caller asked for, as Google wants them (an object, or undefined when none were given). */
export function restrictionsOf(a = {}) {
  const r = {};
  for (const k of RESTRICTION_KEYS) if (typeof a[k] === 'boolean') r[k] = a[k];
  return Object.keys(r).length ? r : undefined;
}

export const handlers = {
  drive_list_shared_drives: async (a, { drive }) => {
    const res = await drive.drives.list({ pageSize: Math.min(Number(a.maxResults) || 50, 100), pageToken: a.pageToken, q: a.query, fields: LIST_VIEW, ...asAdmin(a) });
    return ok(res.data);
  },
  drive_get_shared_drive: async (a, { drive }) => ok((await drive.drives.get({ driveId: a.driveId, fields: VIEW, ...asAdmin(a) })).data),
  drive_create_shared_drive: async (a, { drive }) => {
    const requestBody = { name: a.name, restrictions: restrictionsOf(a) };
    const res = await drive.drives.create({ requestId: randomUUID(), requestBody, fields: VIEW });
    return ok(res.data);
  },
  drive_update_shared_drive: async (a, { drive }) => {
    const requestBody = {};
    if (a.name) requestBody.name = a.name;
    const restrictions = restrictionsOf(a);
    if (restrictions) requestBody.restrictions = restrictions;
    if (Object.keys(requestBody).length) await drive.drives.update({ driveId: a.driveId, requestBody, fields: 'id', ...asAdmin(a) });
    if (typeof a.hidden === 'boolean') await (a.hidden ? drive.drives.hide({ driveId: a.driveId }) : drive.drives.unhide({ driveId: a.driveId }));
    return ok({ driveId: a.driveId, changed: true });
  },
  drive_delete_shared_drive: async (a, { drive }) => {
    await drive.drives.delete({ driveId: a.driveId, ...asAdmin(a) });
    return ok({ deleted: a.driveId });
  },
  drive_update_permission: async (a, { drive }) => {
    const res = await drive.permissions.update({ fileId: a.fileId, permissionId: a.permissionId, supportsAllDrives: true, requestBody: { role: a.role }, fields: 'id,type,role,emailAddress,domain' });
    return ok(res.data);
  }
};

const driveView = (drive, a, fields = VIEW) => data(drive.drives.get({ driveId: a.driveId, fields, ...asAdmin(a) }));
const shortName = (s) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 60)}...` : t; };
const wantedRestrictions = (a) => Object.entries(restrictionsOf(a) || {}).map(([k, v]) => `${k}=${v}`).join(', ');
// Turning a restriction OFF opens the drive up (more sharing, copying or downloading); that is asked about first.
const OPENING = { copyRequiresWriterPermission: false, domainUsersOnly: false, driveMembersOnly: false, sharingFoldersRequiresOrganizerPermission: false };
const opens = (a) => Object.entries(OPENING).some(([k, v]) => a[k] === v);

export const GUARDS_SHARED_DRIVES = {
  drive_create_shared_drive: { destructive: false,
    describe: (a) => ({ target: `new shared drive "${shortName(a.name)}"`, summary: `Create the shared drive "${shortName(a.name)}"${wantedRestrictions(a) ? ` with ${wantedRestrictions(a)}` : ''}` }),
    after: (a, { drive }, details) => (details?.id ? data(drive.drives.get({ driveId: details.id, fields: VIEW })) : { note: "Google did not return the new drive's id." }),
    verify: (a, b, after) => !!after?.id && after.name === a.name && Object.entries(restrictionsOf(a) || {}).every(([k, v]) => same(after.restrictions?.[k], v)) },
  drive_update_shared_drive: { destructive: false, confirmWhen: opens,
    describe: (a) => {
      const bits = [a.name && `rename it to "${shortName(a.name)}"`, typeof a.hidden === 'boolean' && (a.hidden ? 'hide it' : 'show it'), wantedRestrictions(a) && `set ${wantedRestrictions(a)}`].filter(Boolean);
      if (!bits.length) throw new Error('Nothing to change: give a name, hidden, or at least one restriction. Nothing was changed.');
      return { target: a.driveId, summary: `On the shared drive ${a.driveId}: ${bits.join(', ')}` };
    },
    before: async (a, { drive }) => { const d = await driveView(drive, a); return { ...pick(d, ['id', 'name', 'hidden']), restrictions: d.restrictions }; },
    after: async (a, { drive }) => { const d = await driveView(drive, a); return { ...pick(d, ['id', 'name', 'hidden']), restrictions: d.restrictions }; },
    verify: (a, b, after) => (!a.name || after?.name === a.name) && (typeof a.hidden !== 'boolean' || same(after?.hidden, a.hidden)) && Object.entries(restrictionsOf(a) || {}).every(([k, v]) => same(after?.restrictions?.[k], v)) },
  drive_delete_shared_drive: { destructive: D,
    describe: (a) => ({ target: a.driveId, summary: `PERMANENTLY delete the shared drive ${a.driveId} (Google refuses unless it holds no files)` }),
    before: async (a, { drive }) => pick(await driveView(drive, a, 'id,name,createdTime'), ['id', 'name', 'createdTime']),
    after: gone((a, { drive }) => driveView(drive, a, 'id,name')) },
  drive_update_permission: { destructive: false, confirmWhen: (a) => a.role === 'organizer',
    describe: (a) => ({ target: `${a.permissionId} on ${a.fileId}`, summary: `Change permission ${a.permissionId} on ${a.fileId} to ${a.role}${a.role === 'organizer' ? ' (full control, including deleting the drive)' : ''}` }),
    before: (a, { drive }) => data(drive.permissions.get({ fileId: a.fileId, permissionId: a.permissionId, fields: 'id,type,role,emailAddress,domain', supportsAllDrives: true })),
    after: (a, { drive }) => data(drive.permissions.get({ fileId: a.fileId, permissionId: a.permissionId, fields: 'id,type,role,emailAddress,domain', supportsAllDrives: true })),
    verify: (a, b, after) => after?.role === a.role }
};
