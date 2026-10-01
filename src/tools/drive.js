import { ok } from './util.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fetchLimited } from './safe-fetch.js';

export const tools = [
  { name: 'drive_list_files', description: 'List files in Google Drive', inputSchema: { type: 'object', properties: { query: { type: 'string', description: "Drive query syntax e.g. \"mimeType='application/pdf'\"" }, maxResults: { type: 'number', default: 20 }, pageToken: { type: 'string' }, orderBy: { type: 'string' } } } },
  { name: 'drive_search_files', description: 'Search Drive by name/content (simplified wrapper around list)', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'drive_get_file', description: 'Get metadata for a Drive file or folder', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_download_file', description: 'Download the raw contents of a Drive file (returned as base64). Files over about 48 KB are not sent through chat: you get the size instead; open big files from their Drive link (webViewLink from drive_get_file)', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_upload_file', description: 'Upload a new file to Drive from base64 content', inputSchema: { type: 'object', properties: { name: { type: 'string' }, mimeType: { type: 'string' }, base64Data: { type: 'string' }, parentFolderId: { type: 'string' } }, required: ['name', 'base64Data'] } },
  { name: 'drive_upload_from_url', description: 'Copy a file from a web address straight into Drive, without passing the file through chat. Max 10 MB, http(s) only, internal/private addresses are refused. Works with any public link; for private GitHub files use a raw.githubusercontent.com link (the server\'s GitHub token is sent only to that host). Creates a new file; nothing is overwritten.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, name: { type: 'string', description: 'File name in Drive' }, parentFolderId: { type: 'string' }, mimeType: { type: 'string', description: 'Optional; defaults to what the web address reports' } }, required: ['url', 'name'] } },
  { name: 'drive_create_folder', description: 'Create a folder in Drive', inputSchema: { type: 'object', properties: { name: { type: 'string' }, parentFolderId: { type: 'string' } }, required: ['name'] } },
  { name: 'drive_create_doc', description: 'Create a new empty Google Doc in Drive', inputSchema: { type: 'object', properties: { name: { type: 'string' }, parentFolderId: { type: 'string' } }, required: ['name'] } },
  { name: 'drive_create_spreadsheet', description: 'Create a new empty Google Sheet in Drive', inputSchema: { type: 'object', properties: { name: { type: 'string' }, parentFolderId: { type: 'string' } }, required: ['name'] } },
  { name: 'drive_create_shortcut', description: 'Create a shortcut to a file elsewhere in Drive', inputSchema: { type: 'object', properties: { targetFileId: { type: 'string' }, name: { type: 'string' }, parentFolderId: { type: 'string' } }, required: ['targetFileId', 'name'] } },
  { name: 'drive_copy_file', description: 'Copy a Drive file', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, name: { type: 'string' }, parentFolderId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_rename_file', description: 'Rename a Drive file or folder', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, newName: { type: 'string' } }, required: ['fileId', 'newName'] } },
  { name: 'drive_move_file', description: 'Move a Drive file to a different folder', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, newParentFolderId: { type: 'string' }, removeFromCurrentParents: { type: 'boolean', default: true } }, required: ['fileId', 'newParentFolderId'] } },
  { name: 'drive_delete_file', description: 'Permanently delete a Drive file (skips trash)', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_list_trash', description: 'List files currently in Drive trash', inputSchema: { type: 'object', properties: { maxResults: { type: 'number', default: 20 } } } },
  { name: 'drive_restore_from_trash', description: 'Restore a file from Drive trash', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_empty_trash', description: 'Permanently delete everything in Drive trash', inputSchema: { type: 'object', properties: {} } },
  { name: 'drive_share_file', description: 'Share a Drive file/folder with a user, group, domain, or make it public', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, type: { type: 'string', enum: ['user', 'group', 'domain', 'anyone'], default: 'user' }, role: { type: 'string', enum: ['owner', 'organizer', 'fileOrganizer', 'writer', 'commenter', 'reader'], default: 'reader' }, emailAddress: { type: 'string' }, sendNotificationEmail: { type: 'boolean', default: true } }, required: ['fileId', 'role'] } },
  { name: 'drive_list_permissions', description: 'List everyone who has access to a Drive file', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_remove_permission', description: "Revoke someone's access to a Drive file", inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, permissionId: { type: 'string' } }, required: ['fileId', 'permissionId'] } },
  { name: 'drive_transfer_ownership', description: 'Transfer ownership of a file to another user in the same domain', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, newOwnerEmail: { type: 'string' } }, required: ['fileId', 'newOwnerEmail'] } },
  { name: 'drive_star_file', description: 'Star a Drive file', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_unstar_file', description: 'Remove star from a Drive file', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_list_starred', description: 'List starred Drive files', inputSchema: { type: 'object', properties: {} } },
  { name: 'drive_list_shared_with_me', description: 'List files other people have shared with you', inputSchema: { type: 'object', properties: {} } },
  { name: 'drive_list_recent_files', description: 'List recently accessed Drive files', inputSchema: { type: 'object', properties: { maxResults: { type: 'number', default: 20 } } } },
  { name: 'drive_export_file', description: 'Export a Google Doc/Sheet/Slide to another format (PDF, docx, xlsx, csv, etc), returned as base64', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, mimeType: { type: 'string' } }, required: ['fileId', 'mimeType'] } },
  { name: 'drive_export_as_pdf', description: 'Export a Google Doc/Sheet/Slide as PDF (returned as base64)', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_list_revisions', description: 'List version history of a Drive file', inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] } },
  { name: 'drive_get_revision', description: 'Get details of one specific file revision', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, revisionId: { type: 'string' } }, required: ['fileId', 'revisionId'] } },
  { name: 'drive_delete_revision', description: 'Delete an old revision of a file', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, revisionId: { type: 'string' } }, required: ['fileId', 'revisionId'] } },
  { name: 'drive_get_storage_quota', description: "Get this account's Drive storage usage and limit", inputSchema: { type: 'object', properties: {} } },
  { name: 'drive_get_about', description: 'Get info about the current user and their Drive capabilities/limits', inputSchema: { type: 'object', properties: {} } },
  { name: 'drive_list_changes', description: 'List changes to Drive since a page token (for sync)', inputSchema: { type: 'object', properties: { pageToken: { type: 'string' } }, required: ['pageToken'] } },
  { name: 'drive_get_start_page_token', description: 'Get a starting page token to begin tracking Drive changes', inputSchema: { type: 'object', properties: {} } },
  { name: 'drive_create_drive_label_assignment', description: 'Apply a Drive Label to a file (for classification/compliance tagging)', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, labelId: { type: 'string' }, fieldValues: { type: 'object' } }, required: ['fileId', 'labelId'] } }
];

export const handlers = {
  drive_list_files: async (args, { drive }) => {
    const res = await drive.files.list({ q: args.query, pageSize: args.maxResults || 20, pageToken: args.pageToken, orderBy: args.orderBy, fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, owners, webViewLink, parents)' });
    return ok(res.data);
  },
  drive_search_files: async (args, { drive }) => {
    const res = await drive.files.list({ q: `fullText contains '${args.text.replace(/'/g, "\\'")}'`, fields: 'files(id, name, mimeType, webViewLink)' });
    return ok(res.data.files || []);
  },
  drive_get_file: async (args, { drive }) => {
    const res = await drive.files.get({ fileId: args.fileId, fields: '*' });
    return ok(res.data);
  },
  drive_download_file: async (args, { drive }) => {
    const res = await drive.files.get({ fileId: args.fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return ok({ base64Data: Buffer.from(res.data).toString('base64') });
  },
  drive_upload_file: async (args, { drive }) => {
    // Google's upload client needs a stream, not a Buffer (a Buffer fails with "part.body.pipe is not a function").
    const body = Readable.from(Buffer.from(args.base64Data, 'base64'));
    const res = await drive.files.create({
      requestBody: { name: args.name, parents: args.parentFolderId ? [args.parentFolderId] : undefined },
      media: { mimeType: args.mimeType || 'application/octet-stream', body }
    });
    return ok(res.data);
  },
  drive_upload_from_url: async (args, { drive }, deps = {}) => {
    const { bytes, contentType } = await fetchLimited(args.url, deps.fetchOptions);
    const res = await drive.files.create({
      requestBody: { name: args.name, parents: args.parentFolderId ? [args.parentFolderId] : undefined },
      media: { mimeType: args.mimeType || (contentType || 'application/octet-stream').split(';')[0].trim(), body: Readable.from(bytes) },
      fields: 'id, name, mimeType, size, webViewLink, parents'
    });
    return ok(res.data);
  },
  drive_create_folder: async (args, { drive }) => {
    const res = await drive.files.create({ requestBody: { name: args.name, mimeType: 'application/vnd.google-apps.folder', parents: args.parentFolderId ? [args.parentFolderId] : undefined } });
    return ok(res.data);
  },
  drive_create_doc: async (args, { drive }) => {
    const res = await drive.files.create({ requestBody: { name: args.name, mimeType: 'application/vnd.google-apps.document', parents: args.parentFolderId ? [args.parentFolderId] : undefined } });
    return ok(res.data);
  },
  drive_create_spreadsheet: async (args, { drive }) => {
    const res = await drive.files.create({ requestBody: { name: args.name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: args.parentFolderId ? [args.parentFolderId] : undefined } });
    return ok(res.data);
  },
  drive_create_shortcut: async (args, { drive }) => {
    const res = await drive.files.create({ requestBody: { name: args.name, mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: args.targetFileId }, parents: args.parentFolderId ? [args.parentFolderId] : undefined } });
    return ok(res.data);
  },
  drive_copy_file: async (args, { drive }) => {
    const res = await drive.files.copy({ fileId: args.fileId, requestBody: { name: args.name, parents: args.parentFolderId ? [args.parentFolderId] : undefined } });
    return ok(res.data);
  },
  drive_rename_file: async (args, { drive }) => {
    const res = await drive.files.update({ fileId: args.fileId, requestBody: { name: args.newName } });
    return ok(res.data);
  },
  drive_move_file: async (args, { drive }) => {
    const file = await drive.files.get({ fileId: args.fileId, fields: 'parents' });
    const removeParents = args.removeFromCurrentParents !== false ? (file.data.parents || []).join(',') : undefined;
    const res = await drive.files.update({ fileId: args.fileId, addParents: args.newParentFolderId, removeParents, requestBody: {} });
    return ok(res.data);
  },
  drive_delete_file: async (args, { drive }) => {
    await drive.files.delete({ fileId: args.fileId });
    return ok({ deleted: args.fileId });
  },
  drive_list_trash: async (args, { drive }) => {
    const res = await drive.files.list({ q: 'trashed = true', pageSize: args.maxResults || 20, fields: 'files(id, name, mimeType, trashedTime)' });
    return ok(res.data.files || []);
  },
  drive_restore_from_trash: async (args, { drive }) => {
    const res = await drive.files.update({ fileId: args.fileId, requestBody: { trashed: false } });
    return ok(res.data);
  },
  drive_empty_trash: async (_args, { drive }) => {
    await drive.files.emptyTrash({});
    return ok({ status: 'trash emptied' });
  },
  drive_share_file: async (args, { drive }) => {
    const res = await drive.permissions.create({ fileId: args.fileId, sendNotificationEmail: args.sendNotificationEmail !== false, requestBody: { type: args.type || 'user', role: args.role, emailAddress: args.emailAddress } });
    return ok(res.data);
  },
  drive_list_permissions: async (args, { drive }) => {
    const res = await drive.permissions.list({ fileId: args.fileId, fields: 'permissions(id, type, role, emailAddress, domain)' });
    return ok(res.data.permissions || []);
  },
  drive_remove_permission: async (args, { drive }) => {
    await drive.permissions.delete({ fileId: args.fileId, permissionId: args.permissionId });
    return ok({ removed: args.permissionId });
  },
  drive_transfer_ownership: async (args, { drive }) => {
    const res = await drive.permissions.create({ fileId: args.fileId, transferOwnership: true, requestBody: { type: 'user', role: 'owner', emailAddress: args.newOwnerEmail } });
    return ok(res.data);
  },
  drive_star_file: async (args, { drive }) => {
    const res = await drive.files.update({ fileId: args.fileId, requestBody: { starred: true } });
    return ok(res.data);
  },
  drive_unstar_file: async (args, { drive }) => {
    const res = await drive.files.update({ fileId: args.fileId, requestBody: { starred: false } });
    return ok(res.data);
  },
  drive_list_starred: async (_args, { drive }) => {
    const res = await drive.files.list({ q: 'starred = true', fields: 'files(id, name, mimeType)' });
    return ok(res.data.files || []);
  },
  drive_list_shared_with_me: async (_args, { drive }) => {
    const res = await drive.files.list({ q: 'sharedWithMe = true', fields: 'files(id, name, mimeType, owners, sharingUser)' });
    return ok(res.data.files || []);
  },
  drive_list_recent_files: async (args, { drive }) => {
    const res = await drive.files.list({ orderBy: 'viewedByMeTime desc', pageSize: args.maxResults || 20, fields: 'files(id, name, mimeType, viewedByMeTime)' });
    return ok(res.data.files || []);
  },
  drive_export_file: async (args, { drive }) => {
    const res = await drive.files.export({ fileId: args.fileId, mimeType: args.mimeType }, { responseType: 'arraybuffer' });
    return ok({ base64Data: Buffer.from(res.data).toString('base64'), mimeType: args.mimeType });
  },
  drive_export_as_pdf: async (args, { drive }) => {
    const res = await drive.files.export({ fileId: args.fileId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
    return ok({ base64Data: Buffer.from(res.data).toString('base64'), mimeType: 'application/pdf' });
  },
  drive_list_revisions: async (args, { drive }) => {
    const res = await drive.revisions.list({ fileId: args.fileId });
    return ok(res.data.revisions || []);
  },
  drive_get_revision: async (args, { drive }) => {
    const res = await drive.revisions.get({ fileId: args.fileId, revisionId: args.revisionId });
    return ok(res.data);
  },
  drive_delete_revision: async (args, { drive }) => {
    await drive.revisions.delete({ fileId: args.fileId, revisionId: args.revisionId });
    return ok({ deleted: args.revisionId });
  },
  drive_get_storage_quota: async (_args, { drive }) => {
    const res = await drive.about.get({ fields: 'storageQuota' });
    return ok(res.data.storageQuota);
  },
  drive_get_about: async (_args, { drive }) => {
    const res = await drive.about.get({ fields: '*' });
    return ok(res.data);
  },
  drive_list_changes: async (args, { drive }) => {
    const res = await drive.changes.list({ pageToken: args.pageToken });
    return ok(res.data);
  },
  drive_get_start_page_token: async (_args, { drive }) => {
    const res = await drive.changes.getStartPageToken({});
    return ok(res.data);
  },
  drive_create_drive_label_assignment: async (args, { drive }) => {
    const res = await drive.files.modifyLabels({ fileId: args.fileId, requestBody: { labelModifications: [{ labelId: args.labelId, fieldModifications: args.fieldValues ? Object.entries(args.fieldValues).map(([fieldId, value]) => ({ fieldId, setSelectionValues: Array.isArray(value) ? value : undefined, setTextValues: typeof value === 'string' ? [value] : undefined })) : [] }] } });
    return ok(res.data);
  }
};
