// Shared drives (Drive API `drives.*`): list, look at, create, change and delete them.
// Who is IN a shared drive is handled by the permission tools, using the drive's id as the fileId:
// drive_list_permissions, drive_share_file, drive_update_permission, drive_remove_permission.
//
// Google's rules, checked against its Drive API reference on 2026-10-02:
//   - Google deduplicates creation only when a retry uses the *same* requestId.
//     Auto-generated IDs are unique per invocation, NOT stable across caller retries.
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

// The caller can retain a UUID across a transport timeout. Without that, a new
// random UUID on a later call is a new Google create, not an idempotent retry.
const REQUEST_ID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function savedSharedDriveRequestId(args = {}) {
  if (args.requestId === undefined) return null;
  if (typeof args.requestId !== 'string' || !REQUEST_ID_V4.test(args.requestId))
    throw Error('requestId must be a saved UUID v4, e.g. 123e4567-e89b-42d3-a456-426614174000. Nothing was created.');
  return args.requestId.toLowerCase();
}
const REQUEST_ID = { type: 'string', description: 'Optional UUID v4 chosen and saved before the first create. Reuse the identical UUID and unchanged name/restrictions after an uncertain timeout; a new UUID may create another drive.' };

const ADMIN = { type: 'boolean', description: 'Act as a Workspace administrator: see or change shared drives you are not a member of (needs the Drive admin privilege).' };
const visualProps = {
  themeId: { type: 'string', description: 'One Google-approved Drive theme ID from drive_get_about driveThemes; never combine with colorRgb.' },
  colorRgb: { type: 'string', description: 'Shared drive accent color as #RRGGBB; update only, never combine with themeId.' }
};
const SAFE_THEME = /^[a-zA-Z0-9_-]{1,128}$/;
const RGB = /^#[a-fA-F0-9]{6}$/;
/** Validate the real Google Drive v3 theme contract before any write or preview. */
export function driveVisualsOf(a = {}, { creating = false } = {}) {
  const result = {};
  if (a.themeId !== undefined) {
    if (typeof a.themeId !== 'string' || !SAFE_THEME.test(a.themeId))
      throw Error('themeId must be a nonempty Drive theme identifier from drive_get_about. Nothing was changed.');
    result.themeId = a.themeId;
  }
  if (a.colorRgb !== undefined) {
    if (creating) throw Error('colorRgb can only be set after shared-drive creation. Nothing was changed.');
    if (typeof a.colorRgb !== 'string' || !RGB.test(a.colorRgb))
      throw Error('colorRgb must be a six-digit #RRGGBB string. Nothing was changed.');
    if (result.themeId) throw Error('Google does not allow themeId and colorRgb in one update. Nothing was changed.');
    result.colorRgb = a.colorRgb.toUpperCase();
  }
  return result;
}
const validateDriveName = (name) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 255)
    throw Error('Shared drive name must be 1–255 nonblank characters. Nothing was changed.');
  return name.trim();
};
// Only coarse provider failure categories are returned; Google response
// messages can contain resource identities and are never copied into audit.
const providerFailureCode = e => {
  const status = Number(e?.response?.status ?? e?.status ?? e?.code);
  return Number.isInteger(status) && status >= 400 && status < 600 ?
    'google_http_' + status : 'provider_update_failed';
};
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
  { name: 'drive_create_shared_drive', description: 'Create a shared drive with a saved retry UUID; when restrictions are supplied, apply them by a separate update. If the restriction update fails, the response preserves the new drive ID for recovery without a duplicate create.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, requestId: REQUEST_ID, themeId: visualProps.themeId, ...restrictionProps }, required: ['name'] } },
  { name: 'drive_update_shared_drive', description: 'Rename, set theme/color, hide or show, or change restrictions. Separate Drive updates are safely audited even when the second (hide/unhide) call fails.', inputSchema: { type: 'object', properties: { driveId: { type: 'string' }, name: { type: 'string' }, hidden: { type: 'boolean', description: 'true hides it from the usual list, false shows it again.' }, ...visualProps, ...restrictionProps, asAdmin: ADMIN }, required: ['driveId'] } },
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
    // Empty native pages may omit drives; retain the page cursor and
    // expose an explicit typed collection for consumer and smoke checks.
    return ok({ ...res.data, drives: res.data.drives || [] });
  },
  drive_get_shared_drive: async (a, { drive }) => ok((await drive.drives.get({ driveId: a.driveId, fields: VIEW, ...asAdmin(a) })).data),
  drive_create_shared_drive: async (a, { drive }) => {
    const requestId = savedSharedDriveRequestId(a) || randomUUID();
    const requestBody = { name: validateDriveName(a.name), ...driveVisualsOf(a, { creating: true }) };
    const restrictions = restrictionsOf(a);
    // Google Drive v3 does not allow restrictions on drives.create. We create
    // with name/theme only, then apply restrictions through drives.update.
    // The same saved UUID is reusable after an uncertain create; never mint
    // a replacement or retry automatically after a timeout/409.
    const created = await drive.drives.create({ requestId, requestBody, fields: VIEW });
    const details = { ...created.data, requestId };
    if (restrictions) {
      if (!details.id) {
        details.partialFailure = { step: 'apply_restrictions', code: 'created_drive_id_missing',
          recovery: 'Inspect shared drives and the saved requestId before retrying; do not create another drive.' };
      } else {
        try {
          await drive.drives.update({ driveId: details.id, requestBody: { restrictions }, fields: VIEW });
          details.restrictionsApplied = true;
        } catch (error) {
          // The drive already exists. Throwing here would lose the created ID
          // and invite accidental duplicate creation. Return a partial outcome
          // so the guard can read back and durably audit the state.
          details.partialFailure = { step: 'apply_restrictions', code: providerFailureCode(error),
            recovery: 'Use drive_update_shared_drive on the created drive ID after inspecting read-back; never issue a fresh create.' };
        }
      }
    }
    return ok(details);
  },
  drive_update_shared_drive: async (a, { drive }) => {
    const requestBody = { ...driveVisualsOf(a) };
    if (a.name !== undefined) requestBody.name = validateDriveName(a.name);
    const restrictions = restrictionsOf(a);
    if (restrictions) requestBody.restrictions = restrictions;
    let metadataApplied = false;
    if (Object.keys(requestBody).length) {
      await drive.drives.update({ driveId: a.driveId, requestBody, fields: 'id', ...asAdmin(a) });
      metadataApplied = true;
    }
    if (typeof a.hidden === 'boolean') {
      try {
        await (a.hidden ? drive.drives.hide({ driveId: a.driveId }) : drive.drives.unhide({ driveId: a.driveId }));
      } catch (error) {
        if (!metadataApplied) throw error;
        return ok({ driveId: a.driveId, changed: true,
          partialFailure: { step: a.hidden ? 'hide' : 'unhide', code: providerFailureCode(error),
            recovery: 'Inspect drive_get_shared_drive before retrying only the failed visibility step.' } });
      }
    }
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
const OPENING = { copyRequiresWriterPermission: false, domainUsersOnly: false, driveMembersOnly: false,
  adminManagedRestrictions: false, sharingFoldersRequiresOrganizerPermission: false };
const opens = (a) => Object.entries(OPENING).some(([k, v]) => a[k] === v);

export const GUARDS_SHARED_DRIVES = {
  drive_create_shared_drive: { destructive: false,
    describe: (a) => {
      const saved = savedSharedDriveRequestId(a); // fail before any provider mutation
      validateDriveName(a.name);
      driveVisualsOf(a, { creating: true });
      return { target: `new shared drive "${shortName(a.name)}"`,
        summary: `Create the shared drive "${shortName(a.name)}"${a.themeId ? ` with theme ${a.themeId}` : ''}${wantedRestrictions(a) ? `; after creation, set restrictions: ${wantedRestrictions(a)}` : ''}.${saved ? ` Retain requestId ${saved} and reuse it with identical settings after uncertain create; a duplicate requestId may return 409.` : ' No saved requestId: after a timeout inspect existing drives before starting another create.'}` };
    },
    after: (a, { drive }, details) => (details?.id ? data(drive.drives.get({ driveId: details.id, fields: VIEW })) : { note: "Google did not return the new drive's id." }),
    verify: (a, b, after, details) => !details?.partialFailure && !!after?.id &&
      after.name === a.name && !a.themeId /* Google's themeId is write-only, so source cannot prove that value */ &&
      Object.entries(restrictionsOf(a) || {}).every(([k, v]) => same(after.restrictions?.[k], v)) },
  drive_update_shared_drive: { destructive: false, confirmWhen: opens,
    describe: (a) => {
      const visuals = driveVisualsOf(a);
      if (a.name !== undefined) validateDriveName(a.name);
      const bits = [a.name && `rename it to "${shortName(a.name)}"`,
        visuals.themeId && `set theme ${visuals.themeId} (write-only; confirm visual outcome manually)`,
        visuals.colorRgb && `set color ${visuals.colorRgb}`,
        typeof a.hidden === 'boolean' && (a.hidden ? 'hide it' : 'show it'),
        wantedRestrictions(a) && `set ${wantedRestrictions(a)}`].filter(Boolean);
      if (!bits.length) throw new Error('Nothing to change: give a name, hidden, or at least one restriction. Nothing was changed.');
      return { target: a.driveId, summary: `On the shared drive ${a.driveId}: ${bits.join(', ')}` };
    },
    before: async (a, { drive }) => { const d = await driveView(drive, a); return { ...pick(d, ['id', 'name', 'hidden', 'colorRgb']), restrictions: d.restrictions }; },
    after: async (a, { drive }) => { const d = await driveView(drive, a); return { ...pick(d, ['id', 'name', 'hidden', 'colorRgb']), restrictions: d.restrictions }; },
    verify: (a, b, after, details) => !details?.partialFailure &&
      !a.themeId /* write-only, not independently verifiable */ &&
      (!a.name || after?.name === a.name) &&
      (a.colorRgb === undefined || String(after?.colorRgb).toUpperCase() === a.colorRgb.toUpperCase()) &&
      (typeof a.hidden !== 'boolean' || same(after?.hidden, a.hidden)) &&
      Object.entries(restrictionsOf(a) || {}).every(([k, v]) => same(after?.restrictions?.[k], v)) },
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
