import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { restrictionsOf } = await import('../../src/tools/shared-drives.js');

const body = (r) => JSON.parse(r.content[0].text);
const call = (name, args, clients) => registry.handlers[name](args, clients);
const paths = (calls, p) => calls.filter((c) => c.path === p);
const tool = (n) => registry.tools.find((t) => t.name === n);

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' });
});

describe('shared drives: tools exist and are protected', () => {
  it('registers the six new tools; the changing four have dryRun, and delete needs confirm', () => {
    for (const n of ['drive_list_shared_drives', 'drive_get_shared_drive']) expect(tool(n)).toBeTruthy();
    for (const n of ['drive_create_shared_drive', 'drive_update_shared_drive', 'drive_delete_shared_drive', 'drive_update_permission']) expect(tool(n).inputSchema.properties.dryRun, n).toBeTruthy();
    expect(tool('drive_delete_shared_drive').inputSchema.properties.confirm).toBeTruthy();
    expect(tool('drive_update_shared_drive').inputSchema.properties.confirm).toBeTruthy();
  });
  it('only reads for list and get (no dryRun needed, nothing is written)', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.list').resolves({ data: { drives: [{ id: 'd1', name: 'Finance' }] } });
    expect(body(await call('drive_list_shared_drives', { asAdmin: true, query: "name contains 'Fin'" }, x.clients)).drives[0].id).toBe('d1');
    expect(paths(x.calls, 'drive.drives.list')[0].args[0]).toMatchObject({ useDomainAdminAccess: true, q: "name contains 'Fin'" });
  });
});

describe('create', () => {
  it('sends a unique requestId and the restrictions, then returns what Google holds, confirmed', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.create').resolves({ data: { id: 'new1' } });
    x.when('drive.drives.get').resolves({ data: { id: 'new1', name: 'Ops', restrictions: { domainUsersOnly: true } } });
    const out = body(await call('drive_create_shared_drive', { name: 'Ops', domainUsersOnly: true }, x.clients));
    const sent = paths(x.calls, 'drive.drives.create')[0].args[0];
    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent.requestBody).toEqual({ name: 'Ops', restrictions: { domainUsersOnly: true } });
    expect(out).toMatchObject({ done: true, confirmed: true });
  });
  it('dryRun creates nothing', async () => {
    const x = makeFakeClients();
    const out = body(await call('drive_create_shared_drive', { name: 'Ops', dryRun: true }, x.clients));
    expect(out).toMatchObject({ done: false, dryRun: true });
    expect(paths(x.calls, 'drive.drives.create')).toHaveLength(0);
  });
  it('says so when Google does not show the restriction that was asked for', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.create').resolves({ data: { id: 'n' } });
    x.when('drive.drives.get').resolves({ data: { id: 'n', name: 'Ops', restrictions: {} } });
    expect(body(await call('drive_create_shared_drive', { name: 'Ops', driveMembersOnly: true }, x.clients))).toMatchObject({ confirmed: false });
  });
});

describe('update', () => {
  const held = { id: 'd1', name: 'Old', hidden: false, restrictions: { domainUsersOnly: true } };
  it('renames, hides and sets a restriction with the right calls, and confirms from the read-back', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.get').resolves({ data: { id: 'd1', name: 'New', hidden: true, restrictions: { copyRequiresWriterPermission: true } } });
    const out = body(await call('drive_update_shared_drive', { driveId: 'd1', name: 'New', hidden: true, copyRequiresWriterPermission: true }, x.clients));
    expect(paths(x.calls, 'drive.drives.update')[0].args[0]).toMatchObject({ driveId: 'd1', requestBody: { name: 'New', restrictions: { copyRequiresWriterPermission: true } } });
    expect(paths(x.calls, 'drive.drives.hide')).toHaveLength(1);
    expect(paths(x.calls, 'drive.drives.unhide')).toHaveLength(0);
    expect(out).toMatchObject({ done: true, confirmed: true });
  });
  it('only hiding does not call update at all', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.get').resolves({ data: { ...held, hidden: true } });
    await call('drive_update_shared_drive', { driveId: 'd1', hidden: true }, x.clients);
    expect(paths(x.calls, 'drive.drives.update')).toHaveLength(0);
    expect(paths(x.calls, 'drive.drives.hide')).toHaveLength(1);
  });
  it('showing again uses unhide', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.get').resolves({ data: held });
    await call('drive_update_shared_drive', { driveId: 'd1', hidden: false }, x.clients);
    expect(paths(x.calls, 'drive.drives.unhide')).toHaveLength(1);
  });
  it('turning a restriction off needs confirm; nothing happens without it', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.get').resolves({ data: held });
    const out = body(await call('drive_update_shared_drive', { driveId: 'd1', domainUsersOnly: false }, x.clients));
    expect(out).toMatchObject({ done: false, needsConfirmation: true });
    expect(paths(x.calls, 'drive.drives.update')).toHaveLength(0);
  });
  it('turning a restriction on needs no confirm', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.get').resolves({ data: { ...held, restrictions: { driveMembersOnly: true } } });
    expect(body(await call('drive_update_shared_drive', { driveId: 'd1', driveMembersOnly: true }, x.clients))).toMatchObject({ done: true });
  });
  it('refuses a call that changes nothing, even as a preview, before touching Google', async () => {
    const x = makeFakeClients();
    await expect(call('drive_update_shared_drive', { driveId: 'd1', dryRun: true }, x.clients)).rejects.toThrow(/Nothing to change/);
    expect(x.calls).toHaveLength(0);
  });
  it('asAdmin is passed to Google for the change and the read-back', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.get').resolves({ data: { id: 'd1', name: 'N' } });
    await call('drive_update_shared_drive', { driveId: 'd1', name: 'N', asAdmin: true }, x.clients);
    expect(paths(x.calls, 'drive.drives.update')[0].args[0].useDomainAdminAccess).toBe(true);
    expect(paths(x.calls, 'drive.drives.get').every((c) => c.args[0].useDomainAdminAccess === true)).toBe(true);
  });
});

describe('delete', () => {
  it('does nothing without confirm, and previews with dryRun', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.get').resolves({ data: { id: 'd1', name: 'Old' } });
    expect(body(await call('drive_delete_shared_drive', { driveId: 'd1' }, x.clients))).toMatchObject({ done: false, needsConfirmation: true });
    expect(body(await call('drive_delete_shared_drive', { driveId: 'd1', dryRun: true }, x.clients))).toMatchObject({ done: false, dryRun: true });
    expect(paths(x.calls, 'drive.drives.delete')).toHaveLength(0);
  });
  it('deletes with confirm and confirms it is gone; never asks Google to delete the files inside', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.delete').resolves({ data: {} });
    x.when('drive.drives.get').rejects(googleError(404, 'notFound', 'Shared drive not found'));
    const out = body(await call('drive_delete_shared_drive', { driveId: 'd1', confirm: true }, x.clients));
    expect(out).toMatchObject({ done: true, confirmed: true });
    expect(paths(x.calls, 'drive.drives.delete')[0].args[0]).toEqual({ driveId: 'd1' });
    expect(JSON.stringify(x.calls)).not.toContain('allowItemDeletion');
  });
  it('says so if Google still shows the drive after a delete', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.delete').resolves({ data: {} });
    x.when('drive.drives.get').resolves({ data: { id: 'd1', name: 'Old' } });
    expect(body(await call('drive_delete_shared_drive', { driveId: 'd1', confirm: true }, x.clients))).toMatchObject({ done: true, confirmed: false });
  });
  it('reports Google\'s refusal for a drive that still has files', async () => {
    const x = makeFakeClients();
    x.when('drive.drives.get').resolves({ data: { id: 'd1' } });
    x.when('drive.drives.delete').rejects(googleError(403, 'teamDriveNotEmpty', 'The shared drive cannot contain any untrashed items.'));
    await expect(call('drive_delete_shared_drive', { driveId: 'd1', confirm: true }, x.clients)).rejects.toThrow();
  });
});

describe('members: drive_update_permission', () => {
  it('changes a role on a shared drive, with supportsAllDrives, and reads it back', async () => {
    const x = makeFakeClients();
    x.when('drive.permissions.get').resolves({ data: { id: 'p1', role: 'writer', emailAddress: 'a@example.test' } });
    const out = body(await call('drive_update_permission', { fileId: 'd1', permissionId: 'p1', role: 'writer' }, x.clients));
    expect(paths(x.calls, 'drive.permissions.update')[0].args[0]).toMatchObject({ fileId: 'd1', permissionId: 'p1', supportsAllDrives: true, requestBody: { role: 'writer' } });
    expect(out).toMatchObject({ done: true, confirmed: true });
  });
  it('making someone organizer needs confirm', async () => {
    const x = makeFakeClients();
    x.when('drive.permissions.get').resolves({ data: { id: 'p1', role: 'reader' } });
    expect(body(await call('drive_update_permission', { fileId: 'd1', permissionId: 'p1', role: 'organizer' }, x.clients))).toMatchObject({ done: false, needsConfirmation: true });
    expect(paths(x.calls, 'drive.permissions.update')).toHaveLength(0);
  });
  it('refuses owner as a role (the schema lists the allowed ones)', () => {
    expect(tool('drive_update_permission').inputSchema.properties.role.enum).not.toContain('owner');
  });
});

describe('the existing file tools now work inside shared drives', () => {
  const fileTools = {
    drive_list_files: [{}, 'drive.files.list'], drive_search_files: [{ text: 'x' }, 'drive.files.list'], drive_get_file: [{ fileId: 'f' }, 'drive.files.get'],
    drive_create_folder: [{ name: 'n' }, 'drive.files.create'], drive_copy_file: [{ fileId: 'f' }, 'drive.files.copy'], drive_rename_file: [{ fileId: 'f', newName: 'n', dryRun: false }, 'drive.files.update'],
    drive_list_permissions: [{ fileId: 'f' }, 'drive.permissions.list'], drive_share_file: [{ fileId: 'f', role: 'reader', emailAddress: 'a@example.test' }, 'drive.permissions.create']
  };
  for (const [name, [args, p]] of Object.entries(fileTools)) {
    it(`${name} asks Google to include shared drives`, async () => {
      const x = makeFakeClients();
      x.when(p).resolves({ data: { id: 'f', files: [], permissions: [] } });
      x.when('drive.files.get').resolves({ data: { id: 'f', name: 'n' } });
      await call(name, args, x.clients).catch(() => {});
      const sent = x.calls.filter((c) => c.path === p).map((c) => c.args[0]);
      expect(sent.length, name).toBeGreaterThan(0);
      expect(sent.every((a) => a.supportsAllDrives === true), name).toBe(true);
    });
  }
  it('drive_list_files and drive_search_files can look inside one shared drive', async () => {
    const x = makeFakeClients();
    x.when('drive.files.list').resolves({ data: { files: [] } });
    await call('drive_list_files', { driveId: 'd1' }, x.clients);
    await call('drive_search_files', { text: 'tax', driveId: 'd1' }, x.clients);
    for (const c of paths(x.calls, 'drive.files.list')) expect(c.args[0]).toMatchObject({ corpora: 'drive', driveId: 'd1', includeItemsFromAllDrives: true });
  });
  it('without a driveId the list is the usual one (no corpora)', async () => {
    const x = makeFakeClients();
    x.when('drive.files.list').resolves({ data: { files: [] } });
    await call('drive_list_files', {}, x.clients);
    expect(paths(x.calls, 'drive.files.list')[0].args[0].corpora).toBeUndefined();
  });
});

describe('restrictionsOf', () => {
  it('keeps only real on/off restrictions', () => {
    expect(restrictionsOf({ domainUsersOnly: true, driveMembersOnly: 'yes', other: true })).toEqual({ domainUsersOnly: true });
    expect(restrictionsOf({})).toBeUndefined();
  });
});
