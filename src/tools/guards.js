// The safety rules for every tool that changes things, in one table you can read top to bottom.
//
// For each tool: how to describe what it is about to do, how to look at the item BEFORE, and how to
// look at it AFTER (so the answer is what Google holds, not what we sent). Destructive tools also
// need confirm: true. The old handlers still do the actual work; see write.js.
//
// Rule for adding tools: every tool whose name contains "_delete" must have an entry here
// (test/unit/guards.test.js fails if one is missing).
import { guard, gone } from './write.js';

const CUSTOMER = 'my_customer';
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
const data = async (promise) => (await promise).data;
const orgPath = (p) => String(p || '').replace(/^\//, '');

const D = true; // destructive
// Google leaves out a field that is false, so compare true/false loosely but everything else exactly.
const same = (got, wanted) => (typeof wanted === 'boolean' ? !!got === wanted : got === wanted);
const SCALARS = new Set(['string', 'boolean', 'number']);
// Only these profile details can be changed in a general update without confirm. Anything else (login name, recovery email/phone,
// suspension, password, admin rights, org unit, ...) is treated as risky and needs confirm: true.
const SAFE_USER_FIELDS = new Set(['name', 'phones', 'addresses', 'organizations', 'relations', 'externalIds', 'locations', 'gender', 'websites', 'notes', 'customSchemas', 'includeInGlobalAddressList', 'keywords', 'languages']);
const DELETING_REQUEST = (requests) => (Array.isArray(requests) ? requests : []).some((r) => Object.keys(r || {}).some((k) => /^delete/i.test(k)));

// name -> { destructive, describe(args), before(args, clients), after(args, clients, details) }
export const GUARDS = {
  // ---------- Directory: users ----------
  admin_delete_user: { destructive: D,
    describe: (a) => ({ target: a.userKey, summary: `PERMANENTLY delete the Workspace user ${a.userKey} (their data goes with them after 20 days)` }),
    before: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,name/fullName,suspended,isAdmin,orgUnitPath,lastLoginTime' })),
    after: gone((a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail' }))) },
  admin_suspend_user: { destructive: D, verify: (a, b, after) => !!after?.suspended === true,
    describe: (a) => ({ target: a.userKey, summary: `Suspend ${a.userKey}: they cannot sign in until unsuspended` }),
    before: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,suspended,lastLoginTime' })),
    after: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,suspended' })) },
  admin_reset_user_password: { destructive: D,
    describe: (a) => ({ target: a.userKey, summary: `Reset the password of ${a.userKey} (the new password is never shown or logged)` }),
    before: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,changePasswordAtNextLogin,lastLoginTime' })),
    after: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,changePasswordAtNextLogin' })) },
  admin_sign_out_user: { destructive: D,
    describe: (a) => ({ target: a.userKey, summary: `Sign ${a.userKey} out of every device and session` }),
    before: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,lastLoginTime' })),
    after: async () => ({ note: 'Google does not report open sessions; the sign-out request was accepted.' }) },
  admin_make_super_admin: { destructive: D, verify: (a, b, after) => !!after?.isAdmin === !!a.isAdmin,
    describe: (a) => ({ target: a.userKey, summary: `${a.isAdmin ? 'GRANT' : 'REMOVE'} super admin ${a.isAdmin ? 'to' : 'from'} ${a.userKey}` }),
    before: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,isAdmin' })),
    after: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,isAdmin' })) },
  admin_update_user: { destructive: false,
    // Suspending, resetting a password, archiving or changing admin rights through a general update is the same as using the dedicated tool, so it needs the same confirm.
    confirmWhen: (a) => Object.keys(a.updates || {}).some((k) => !SAFE_USER_FIELDS.has(k)),
    verify: (a, before, after) => Object.entries(a.updates || {}).every(([k, v]) => !SCALARS.has(typeof v) || k === 'password' || same(after?.[k], v)),
    describe: (a) => ({ target: a.userKey, summary: `Update ${a.userKey}: ${Object.keys(a.updates || {}).join(', ') || 'nothing given'}` }),
    before: async (a, { admin }) => pick(await data(admin.users.get({ userKey: a.userKey, projection: 'full' })), Object.keys(a.updates || {}).filter((k) => k !== 'password')),
    after: async (a, { admin }) => pick(await data(admin.users.get({ userKey: a.userKey, projection: 'full' })), Object.keys(a.updates || {}).filter((k) => k !== 'password')) },
  admin_delete_user_alias: { destructive: D,
    describe: (a) => ({ target: `${a.alias} on ${a.userKey}`, summary: `Remove the alias ${a.alias} from ${a.userKey} (mail to it stops arriving)` }),
    before: async (a, { admin }) => ({ aliases: (await data(admin.users.aliases.list({ userKey: a.userKey }))).aliases?.map((x) => x.alias) || [] }),
    after: async (a, { admin }) => { const list = (await data(admin.users.aliases.list({ userKey: a.userKey }))).aliases?.map((x) => x.alias) || []; return { aliases: list, exists: list.includes(a.alias) }; } },
  admin_add_user_alias: { destructive: false,
    describe: (a) => ({ target: `${a.alias} on ${a.userKey}`, summary: `Add the alias ${a.alias} to ${a.userKey}` }),
    before: async (a, { admin }) => ({ aliases: (await data(admin.users.aliases.list({ userKey: a.userKey }))).aliases?.map((x) => x.alias) || [] }),
    after: async (a, { admin }) => ({ aliases: (await data(admin.users.aliases.list({ userKey: a.userKey }))).aliases?.map((x) => x.alias) || [] }) },

  // ---------- Directory: groups, org units, domains ----------
  admin_delete_group: { destructive: D,
    describe: (a) => ({ target: a.groupKey, summary: `PERMANENTLY delete the group ${a.groupKey} and its membership list` }),
    before: (a, { admin }) => data(admin.groups.get({ groupKey: a.groupKey })).then((g) => pick(g, ['email', 'name', 'directMembersCount'])),
    after: gone((a, { admin }) => data(admin.groups.get({ groupKey: a.groupKey }))) },
  admin_delete_group_alias: { destructive: D,
    describe: (a) => ({ target: `${a.alias} on ${a.groupKey}`, summary: `Remove the alias ${a.alias} from the group ${a.groupKey}` }),
    before: async (a, { admin }) => ({ aliases: (await data(admin.groups.aliases.list({ groupKey: a.groupKey }))).aliases?.map((x) => x.alias) || [] }),
    after: async (a, { admin }) => { const list = (await data(admin.groups.aliases.list({ groupKey: a.groupKey }))).aliases?.map((x) => x.alias) || []; return { aliases: list, exists: list.includes(a.alias) }; } },
  admin_delete_orgunit: { destructive: D,
    describe: (a) => ({ target: a.orgUnitPath, summary: `Delete the organizational unit ${a.orgUnitPath} (it must be empty)` }),
    before: (a, { admin }) => data(admin.orgunits.get({ customerId: CUSTOMER, orgUnitPath: orgPath(a.orgUnitPath) })).then((o) => pick(o, ['name', 'orgUnitPath', 'parentOrgUnitPath'])),
    after: gone((a, { admin }) => data(admin.orgunits.get({ customerId: CUSTOMER, orgUnitPath: orgPath(a.orgUnitPath) }))) },
  admin_delete_domain: { destructive: D,
    describe: (a) => ({ target: a.domainName, summary: `Remove the domain ${a.domainName} from this Workspace (mail for it stops)` }),
    before: (a, { admin }) => data(admin.domains.get({ customer: CUSTOMER, domainName: a.domainName })).then((d) => pick(d, ['domainName', 'isPrimary', 'verified'])),
    after: gone((a, { admin }) => data(admin.domains.get({ customer: CUSTOMER, domainName: a.domainName }))) },
  admin_delete_domain_alias: { destructive: D,
    describe: (a) => ({ target: a.domainAliasName, summary: `Remove the domain alias ${a.domainAliasName}` }),
    before: (a, { admin }) => data(admin.domainAliases.get({ customer: CUSTOMER, domainAliasName: a.domainAliasName })),
    after: gone((a, { admin }) => data(admin.domainAliases.get({ customer: CUSTOMER, domainAliasName: a.domainAliasName }))) },

  // ---------- Directory: roles, devices, resources, schemas, security ----------
  admin_delete_role: { destructive: D,
    describe: (a) => ({ target: a.roleId, summary: `Delete the admin role ${a.roleId}` }),
    before: (a, { admin }) => data(admin.roles.get({ customer: CUSTOMER, roleId: a.roleId })).then((r) => pick(r, ['roleName', 'roleDescription', 'isSystemRole'])),
    after: gone((a, { admin }) => data(admin.roles.get({ customer: CUSTOMER, roleId: a.roleId }))) },
  admin_delete_role_assignment: { destructive: D,
    describe: (a) => ({ target: a.roleAssignmentId, summary: `Remove the admin role assignment ${a.roleAssignmentId}` }),
    before: (a, { admin }) => data(admin.roleAssignments.get({ customer: CUSTOMER, roleAssignmentId: a.roleAssignmentId })),
    after: gone((a, { admin }) => data(admin.roleAssignments.get({ customer: CUSTOMER, roleAssignmentId: a.roleAssignmentId }))) },
  admin_delete_mobile_device: { destructive: D,
    describe: (a) => ({ target: a.resourceId, summary: `Remove the mobile device ${a.resourceId} from the Workspace` }),
    before: (a, { admin }) => data(admin.mobiledevices.get({ customerId: CUSTOMER, resourceId: a.resourceId })).then((d) => pick(d, ['model', 'os', 'email', 'status'])),
    after: gone((a, { admin }) => data(admin.mobiledevices.get({ customerId: CUSTOMER, resourceId: a.resourceId }))) },
  admin_action_mobile_device: { destructive: D,
    describe: (a) => ({ target: a.resourceId, summary: `Run "${a.action}" on the mobile device ${a.resourceId} (a wipe cannot be undone)` }),
    before: (a, { admin }) => data(admin.mobiledevices.get({ customerId: CUSTOMER, resourceId: a.resourceId })).then((d) => pick(d, ['model', 'os', 'email', 'status'])),
    after: (a, { admin }) => data(admin.mobiledevices.get({ customerId: CUSTOMER, resourceId: a.resourceId })).then((d) => pick(d, ['model', 'email', 'status'])) },
  admin_action_chrome_device: { destructive: D,
    describe: (a) => ({ target: a.deviceId, summary: `Run "${a.action}" on the Chrome device ${a.deviceId}` }),
    before: (a, { admin }) => data(admin.chromeosdevices.get({ customerId: CUSTOMER, deviceId: a.deviceId })).then((d) => pick(d, ['model', 'status', 'annotatedUser', 'orgUnitPath'])),
    after: (a, { admin }) => data(admin.chromeosdevices.get({ customerId: CUSTOMER, deviceId: a.deviceId })).then((d) => pick(d, ['model', 'status', 'orgUnitPath'])) },
  admin_delete_building: { destructive: D,
    describe: (a) => ({ target: a.buildingId, summary: `Delete the building ${a.buildingId}` }),
    before: (a, { admin }) => data(admin.resources.buildings.get({ customer: CUSTOMER, buildingId: a.buildingId })),
    after: gone((a, { admin }) => data(admin.resources.buildings.get({ customer: CUSTOMER, buildingId: a.buildingId }))) },
  admin_delete_feature: { destructive: D,
    describe: (a) => ({ target: a.name, summary: `Delete the room feature ${a.name}` }),
    before: (a, { admin }) => data(admin.resources.features.get({ customer: CUSTOMER, featureKey: a.name })),
    after: gone((a, { admin }) => data(admin.resources.features.get({ customer: CUSTOMER, featureKey: a.name }))) },
  admin_delete_calendar_resource: { destructive: D,
    describe: (a) => ({ target: a.resourceId, summary: `Delete the bookable calendar resource ${a.resourceId}` }),
    before: (a, { admin }) => data(admin.resources.calendars.get({ customer: CUSTOMER, calendarResourceId: a.resourceId })).then((r) => pick(r, ['resourceName', 'resourceType', 'buildingId'])),
    after: gone((a, { admin }) => data(admin.resources.calendars.get({ customer: CUSTOMER, calendarResourceId: a.resourceId }))) },
  admin_delete_schema: { destructive: D,
    describe: (a) => ({ target: a.schemaKey, summary: `Delete the custom user field schema ${a.schemaKey} and the values stored in it` }),
    before: (a, { admin }) => data(admin.schemas.get({ customerId: CUSTOMER, schemaKey: a.schemaKey })).then((s) => pick(s, ['schemaName', 'displayName'])),
    after: gone((a, { admin }) => data(admin.schemas.get({ customerId: CUSTOMER, schemaKey: a.schemaKey }))) },
  admin_delete_asp: { destructive: D,
    describe: (a) => ({ target: `${a.codeId} for ${a.userKey}`, summary: `Revoke the app password ${a.codeId} of ${a.userKey}` }),
    before: (a, { admin }) => data(admin.asps.get({ userKey: a.userKey, codeId: a.codeId })).then((x) => pick(x, ['name', 'creationTime', 'lastTimeUsed'])),
    after: gone((a, { admin }) => data(admin.asps.get({ userKey: a.userKey, codeId: a.codeId }))) },
  admin_delete_token: { destructive: D,
    describe: (a) => ({ target: `${a.clientId} for ${a.userKey}`, summary: `Revoke the third-party app access ${a.clientId} of ${a.userKey}` }),
    before: (a, { admin }) => data(admin.tokens.get({ userKey: a.userKey, clientId: a.clientId })).then((t) => pick(t, ['displayText', 'clientId', 'scopes'])),
    after: gone((a, { admin }) => data(admin.tokens.get({ userKey: a.userKey, clientId: a.clientId }))) },
  admin_delete_alert: { destructive: D,
    describe: (a) => ({ target: a.alertId, summary: `Delete the security alert ${a.alertId}` }),
    before: (a, { alertcenter }) => data(alertcenter.alerts.get({ alertId: a.alertId })).then((x) => pick(x, ['type', 'source', 'createTime'])),
    after: gone((a, { alertcenter }) => data(alertcenter.alerts.get({ alertId: a.alertId }))) },

  // ---------- Licenses and offboarding ----------
  licensing_remove_license: { destructive: D,
    describe: (a) => ({ target: `${a.skuId} for ${a.userId}`, summary: `Remove the license ${a.skuId} from ${a.userId}` }),
    before: (a, { licensing }) => data(licensing.licenseAssignments.get({ productId: a.productId || 'Google-Apps', skuId: a.skuId, userId: a.userId })),
    after: gone((a, { licensing }) => data(licensing.licenseAssignments.get({ productId: a.productId || 'Google-Apps', skuId: a.skuId, userId: a.userId }))) },
  workflow_offboard_employee: { destructive: D,
    // The old handler records each step's failure inside the result instead of throwing; any failed step means the offboarding is not complete.
    verify: (a, before, after, details) => !(details?.steps || []).some((st) => st.status === 'failed') && (a.deleteAccount || !!after?.suspended === true),
    describe: (a) => ({ target: a.userKey, summary: `OFFBOARD ${a.userKey}: suspend, sign out everywhere, revoke app access and app passwords${a.transferDriveAndCalendarTo ? `, transfer their Drive and Calendar to ${a.transferDriveAndCalendarTo}` : ''}${a.deleteAccount ? ', then PERMANENTLY DELETE the account' : ''}` }),
    before: async (a, { admin }) => {
      const user = await data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,suspended,isAdmin,orgUnitPath' }));
      const tokens = await data(admin.tokens.list({ userKey: a.userKey })).catch(() => ({}));
      const asps = await data(admin.asps.list({ userKey: a.userKey })).catch(() => ({}));
      return { ...user, thirdPartyApps: (tokens.items || []).length, appPasswords: (asps.items || []).length };
    },
    after: async (a, { admin }) => {
      try {
        const user = await data(admin.users.get({ userKey: a.userKey, fields: 'primaryEmail,suspended' }));
        return { ...user, exists: !!a.deleteAccount }; // still there is only a failure if we were asked to delete
      } catch (err) {
        if (Number(err?.response?.status || err?.code) === 404) return { exists: false };
        throw err;
      }
    } },

  // ---------- Gmail ----------
  gmail_delete_message: { destructive: D,
    describe: (a) => ({ target: a.messageId, summary: `PERMANENTLY delete the email ${a.messageId} (it skips the trash)` }),
    before: (a, { gmail }) => data(gmail.users.messages.get({ userId: 'me', id: a.messageId, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] })).then((m) => ({ id: m.id, snippet: m.snippet, headers: m.payload?.headers })),
    after: gone((a, { gmail }) => data(gmail.users.messages.get({ userId: 'me', id: a.messageId, format: 'minimal' }))) },
  gmail_batch_delete: { destructive: D,
    describe: (a) => ({ target: `${(a.messageIds || []).length} emails`, summary: `PERMANENTLY delete ${(a.messageIds || []).length} emails (they skip the trash)` }),
    before: async (a) => ({ count: (a.messageIds || []).length, firstIds: (a.messageIds || []).slice(0, 5) }),
    after: async (a, { gmail }) => {
      const sample = (a.messageIds || []).slice(0, 5);
      const left = [];
      for (const id of sample) {
        try { await gmail.users.messages.get({ userId: 'me', id, format: 'minimal' }); left.push(id); } catch (err) { if (Number(err?.response?.status || err?.code) !== 404) throw err; }
      }
      return { checked: sample.length, stillThere: left, ...(left.length ? { exists: true } : { exists: false }) };
    } },
  gmail_delete_thread: { destructive: D,
    describe: (a) => ({ target: a.threadId, summary: `PERMANENTLY delete the whole email thread ${a.threadId}` }),
    before: (a, { gmail }) => data(gmail.users.threads.get({ userId: 'me', id: a.threadId, format: 'minimal' })).then((t) => ({ id: t.id, messages: (t.messages || []).length, snippet: t.snippet })),
    after: gone((a, { gmail }) => data(gmail.users.threads.get({ userId: 'me', id: a.threadId, format: 'minimal' }))) },
  gmail_delete_label: { destructive: D,
    describe: (a) => ({ target: a.labelId, summary: `Delete the Gmail label ${a.labelId} (the emails stay, they just lose the label)` }),
    before: (a, { gmail }) => data(gmail.users.labels.get({ userId: 'me', id: a.labelId })).then((l) => pick(l, ['id', 'name', 'messagesTotal'])),
    after: gone((a, { gmail }) => data(gmail.users.labels.get({ userId: 'me', id: a.labelId }))) },
  gmail_delete_draft: { destructive: D,
    describe: (a) => ({ target: a.draftId, summary: `Delete the draft ${a.draftId}` }),
    before: (a, { gmail }) => data(gmail.users.drafts.get({ userId: 'me', id: a.draftId, format: 'metadata' })).then((d) => ({ id: d.id, headers: d.message?.payload?.headers })),
    after: gone((a, { gmail }) => data(gmail.users.drafts.get({ userId: 'me', id: a.draftId, format: 'minimal' }))) },
  gmail_delete_filter: { destructive: D,
    describe: (a) => ({ target: a.filterId, summary: `Delete the Gmail filter ${a.filterId}` }),
    before: (a, { gmail }) => data(gmail.users.settings.filters.get({ userId: 'me', id: a.filterId })),
    after: gone((a, { gmail }) => data(gmail.users.settings.filters.get({ userId: 'me', id: a.filterId }))) },
  gmail_delete_send_as: { destructive: D,
    describe: (a) => ({ target: a.sendAsEmail, summary: `Remove the "send mail as" address ${a.sendAsEmail}` }),
    before: (a, { gmail }) => data(gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: a.sendAsEmail })).then((s) => pick(s, ['sendAsEmail', 'displayName', 'isDefault', 'verificationStatus'])),
    after: gone((a, { gmail }) => data(gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: a.sendAsEmail }))) },
  gmail_update_forwarding_settings: { destructive: D, verify: (a, b, after) => !!after?.enabled === !!a.enabled,
    describe: (a) => ({ target: 'auto-forwarding', summary: `${a.enabled ? `Forward ALL new mail to ${a.emailAddress || '(address not given)'}` : 'Turn off automatic forwarding'}` }),
    before: (a, { gmail }) => data(gmail.users.settings.getAutoForwarding({ userId: 'me' })),
    after: (a, { gmail }) => data(gmail.users.settings.getAutoForwarding({ userId: 'me' })) },
  gmail_update_vacation_settings: { destructive: D, verify: (a, b, after) => !!after?.enableAutoReply === !!a.enableAutoReply,
    describe: (a) => ({ target: 'vacation responder', summary: `${a.enableAutoReply ? 'Turn ON the automatic reply' : 'Turn OFF the automatic reply'}${a.responseSubject ? ` ("${a.responseSubject}")` : ''}` }),
    before: (a, { gmail }) => data(gmail.users.settings.getVacation({ userId: 'me' })).then((v) => pick(v, ['enableAutoReply', 'responseSubject', 'startTime', 'endTime', 'restrictToContacts', 'restrictToDomain'])),
    after: (a, { gmail }) => data(gmail.users.settings.getVacation({ userId: 'me' })).then((v) => pick(v, ['enableAutoReply', 'responseSubject', 'startTime', 'endTime', 'restrictToContacts', 'restrictToDomain'])) },
  gmail_update_send_as: { destructive: false, verify: (a, b, after) => ['displayName', 'isDefault'].every((k) => a[k] === undefined || same(after?.[k], a[k])),
    describe: (a) => ({ target: a.sendAsEmail, summary: `Change the "send mail as" address ${a.sendAsEmail}: ${Object.keys(a).filter((k) => k !== 'sendAsEmail').join(', ') || 'nothing given'}` }),
    before: (a, { gmail }) => data(gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: a.sendAsEmail })).then((s) => ({ ...pick(s, ['sendAsEmail', 'displayName', 'isDefault', 'verificationStatus']), hasSignature: !!s.signature })),
    after: (a, { gmail }) => data(gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: a.sendAsEmail })).then((s) => ({ ...pick(s, ['sendAsEmail', 'displayName', 'isDefault', 'verificationStatus']), hasSignature: !!s.signature })) },
  gmail_create_filter: { destructive: false, confirmWhen: (a) => !!a.forward || (a.addLabelIds || []).some((l) => /^(TRASH|SPAM)$/i.test(l)) || (a.removeLabelIds || []).some((l) => /^INBOX$/i.test(l)),
    describe: (a) => ({ target: 'new Gmail filter', summary: `Create a Gmail filter (${[a.from && `from ${a.from}`, a.to && `to ${a.to}`, a.subject && `subject "${a.subject}"`, a.query && `matching "${a.query}"`].filter(Boolean).join(', ') || 'any mail'})${a.forward ? ` that FORWARDS to ${a.forward}` : ''}` }),
    after: (a, { gmail }, details) => (details?.id ? data(gmail.users.settings.filters.get({ userId: 'me', id: details.id })) : { note: 'Google did not return the new filter\'s id.' }) },

  // ---------- Drive ----------
  drive_delete_file: { destructive: D,
    describe: (a) => ({ target: a.fileId, summary: `PERMANENTLY delete the Drive file ${a.fileId} (it skips the trash)` }),
    before: (a, { drive }) => data(drive.files.get({ fileId: a.fileId, fields: 'id,name,mimeType,trashed,owners(emailAddress),modifiedTime', supportsAllDrives: true })),
    after: gone((a, { drive }) => data(drive.files.get({ fileId: a.fileId, fields: 'id,name,trashed', supportsAllDrives: true }))) },
  drive_delete_revision: { destructive: D,
    describe: (a) => ({ target: `${a.revisionId} of ${a.fileId}`, summary: `Delete version ${a.revisionId} of the Drive file ${a.fileId}` }),
    before: (a, { drive }) => data(drive.revisions.get({ fileId: a.fileId, revisionId: a.revisionId, fields: 'id,modifiedTime,lastModifyingUser(emailAddress)' })),
    after: gone((a, { drive }) => data(drive.revisions.get({ fileId: a.fileId, revisionId: a.revisionId, fields: 'id' }))) },
  drive_empty_trash: { destructive: D, verify: (a, b, after) => after?.filesInTrash === 0,
    describe: () => ({ target: 'Drive trash', summary: 'PERMANENTLY empty the Drive trash (every file in it is lost for good)' }),
    before: async (a, { drive }) => { const r = await data(drive.files.list({ q: 'trashed = true', pageSize: 100, fields: 'files(id,name)' })); return { filesInTrash: (r.files || []).length, hasMore: !!r.nextPageToken, sample: (r.files || []).slice(0, 10).map((f) => f.name) }; },
    after: async (a, { drive }) => { const r = await data(drive.files.list({ q: 'trashed = true', pageSize: 10, fields: 'files(id)' })); return { filesInTrash: (r.files || []).length }; } },
  drive_share_file: { destructive: false, confirmWhen: (a) => a.type === 'anyone' || a.type === 'domain',
    describe: (a) => ({ target: a.fileId, summary: `Share the Drive file ${a.fileId} with ${a.type === 'anyone' ? 'ANYONE with the link' : (a.emailAddress || a.type || 'user')} as ${a.role}` }),
    before: async (a, { drive }) => ({ permissions: (await data(drive.permissions.list({ fileId: a.fileId, fields: 'permissions(id,type,role,emailAddress)', supportsAllDrives: true }))).permissions }),
    after: (a, { drive }, details) => (details?.id
      ? data(drive.permissions.get({ fileId: a.fileId, permissionId: details.id, fields: 'id,type,role,emailAddress', supportsAllDrives: true }))
      : data(drive.permissions.list({ fileId: a.fileId, fields: 'permissions(id,type,role,emailAddress)', supportsAllDrives: true }))) },

  // ---------- Calendar ----------
  calendar_delete_calendar: { destructive: D,
    describe: (a) => ({ target: a.calendarId, summary: `PERMANENTLY delete the calendar ${a.calendarId} and all its events` }),
    before: (a, { calendar }) => data(calendar.calendars.get({ calendarId: a.calendarId })).then((c) => pick(c, ['id', 'summary', 'timeZone'])),
    after: gone((a, { calendar }) => data(calendar.calendars.get({ calendarId: a.calendarId }))) },
  calendar_delete_event: { destructive: D,
    describe: (a) => ({ target: a.eventId, summary: `Delete the calendar event ${a.eventId}${(a.sendUpdates || 'all') !== 'none' ? ' (guests are told)' : ''}` }),
    before: (a, { calendar }) => data(calendar.events.get({ calendarId: a.calendarId || 'primary', eventId: a.eventId })).then((e) => pick(e, ['summary', 'start', 'end', 'status'])),
    after: gone((a, { calendar }) => data(calendar.events.get({ calendarId: a.calendarId || 'primary', eventId: a.eventId }))) },
  calendar_create_event: { destructive: false,
    describe: (a) => ({ target: a.summary, summary: `Create the calendar event "${a.summary}" from ${a.start} to ${a.end}${(a.attendees || []).length ? `, inviting ${(a.attendees || []).join(', ')}` : ''}` }),
    after: (a, { calendar }, details) => (details?.id ? data(calendar.events.get({ calendarId: a.calendarId || 'primary', eventId: details.id })).then((e) => pick(e, ['id', 'summary', 'start', 'end', 'status', 'htmlLink'])) : { note: 'Google did not return the new event\'s id.' }) },

  // ---------- Chat, contacts, tasks ----------
  chat_delete_message: { destructive: D,
    describe: (a) => ({ target: a.messageName, summary: `Delete the Chat message ${a.messageName}` }),
    before: (a, { chat }) => data(chat.spaces.messages.get({ name: a.messageName })).then((m) => pick(m, ['name', 'text', 'createTime'])),
    after: gone((a, { chat }) => data(chat.spaces.messages.get({ name: a.messageName }))) },
  contacts_delete: { destructive: D,
    describe: (a) => ({ target: a.resourceName, summary: `Delete the contact ${a.resourceName}` }),
    before: (a, { people }) => data(people.people.get({ resourceName: a.resourceName, personFields: 'names,emailAddresses' })).then((p) => pick(p, ['resourceName', 'names', 'emailAddresses'])),
    after: gone((a, { people }) => data(people.people.get({ resourceName: a.resourceName, personFields: 'names' }))) },
  tasks_delete_tasklist: { destructive: D,
    describe: (a) => ({ target: a.tasklistId, summary: `Delete the task list ${a.tasklistId} and every task in it` }),
    before: (a, { tasks }) => data(tasks.tasklists.get({ tasklist: a.tasklistId })).then((t) => pick(t, ['id', 'title'])),
    after: gone((a, { tasks }) => data(tasks.tasklists.get({ tasklist: a.tasklistId }))) },
  tasks_delete_task: { destructive: D,
    describe: (a) => ({ target: a.taskId, summary: `Delete the task ${a.taskId}` }),
    before: (a, { tasks }) => data(tasks.tasks.get({ tasklist: a.tasklistId || '@default', task: a.taskId })).then((t) => pick(t, ['id', 'title', 'status', 'due'])),
    after: async (a, { tasks }) => {
      try { const t = await data(tasks.tasks.get({ tasklist: a.tasklistId || '@default', task: a.taskId })); return t.deleted ? { exists: false } : { exists: true, stillThere: pick(t, ['id', 'title']) }; }
      catch (err) { if (Number(err?.response?.status || err?.code) === 404) return { exists: false }; throw err; }
    } },

  // ---------- Docs, Sheets, Slides (content inside a file) ----------
  docs_delete_content: { destructive: D, verify: (a, before, after) => !(Number.isFinite(before?.lengthBefore) && Number.isFinite(after?.lengthAfter)) || after.lengthAfter < before.lengthBefore,
    describe: (a) => ({ target: a.documentId, summary: `Delete characters ${a.startIndex} to ${a.endIndex} of the document ${a.documentId}` }),
    before: async (a, { docs }) => { const d = await data(docs.documents.get({ documentId: a.documentId, fields: 'title,body(content(endIndex))' })); return { title: d.title, lengthBefore: d.body?.content?.at(-1)?.endIndex }; },
    after: async (a, { docs }) => { const d = await data(docs.documents.get({ documentId: a.documentId, fields: 'title,body(content(endIndex))' })); return { title: d.title, lengthAfter: d.body?.content?.at(-1)?.endIndex }; } },
  sheets_delete_sheet: { destructive: D,
    describe: (a) => ({ target: `sheet ${a.sheetId} in ${a.spreadsheetId}`, summary: `PERMANENTLY delete the sheet (tab) ${a.sheetId} and its data from the spreadsheet ${a.spreadsheetId}` }),
    before: async (a, { sheets }) => { const s = await data(sheets.spreadsheets.get({ spreadsheetId: a.spreadsheetId, fields: 'sheets(properties(sheetId,title,gridProperties))' })); return { thisSheet: (s.sheets || []).find((x) => x.properties?.sheetId === a.sheetId)?.properties, sheetCount: (s.sheets || []).length }; },
    after: async (a, { sheets }) => { const s = await data(sheets.spreadsheets.get({ spreadsheetId: a.spreadsheetId, fields: 'sheets(properties(sheetId,title))' })); return { exists: (s.sheets || []).some((x) => x.properties?.sheetId === a.sheetId), sheetCount: (s.sheets || []).length }; } },
  slides_delete_slide: { destructive: D,
    describe: (a) => ({ target: a.pageObjectId, summary: `Delete the slide/object ${a.pageObjectId} from the presentation ${a.presentationId}` }),
    before: async (a, { slides }) => { const p = await data(slides.presentations.get({ presentationId: a.presentationId, fields: 'slides(objectId)' })); return { slideCount: (p.slides || []).length, isASlide: (p.slides || []).some((s) => s.objectId === a.pageObjectId) }; },
    after: async (a, { slides }) => { const p = await data(slides.presentations.get({ presentationId: a.presentationId, fields: 'slides(objectId)' })); return { slideCount: (p.slides || []).length, exists: (p.slides || []).some((s) => s.objectId === a.pageObjectId) }; } },
  slides_delete_text: { destructive: D, verify: (a, b, after) => after?.textLength === 0 || after?.note !== undefined,
    describe: (a) => ({ target: a.objectId, summary: `Clear ALL the text in the shape ${a.objectId} of the presentation ${a.presentationId}` }),
    before: (a, { slides }) => slideText(slides, a),
    after: (a, { slides }) => slideText(slides, a) },

  // ---------- More tools that take something away or hand it over ----------
  admin_remove_group_member: { destructive: D,
    describe: (a) => ({ target: `${a.memberEmail} in ${a.groupKey}`, summary: `Remove ${a.memberEmail} from the group ${a.groupKey} (they stop getting its mail and access)` }),
    before: (a, { admin }) => data(admin.members.get({ groupKey: a.groupKey, memberKey: a.memberEmail })).then((m) => pick(m, ['email', 'role', 'status'])),
    after: gone((a, { admin }) => data(admin.members.get({ groupKey: a.groupKey, memberKey: a.memberEmail }))) },
  calendar_share_calendar: { destructive: false, confirmWhen: (a) => a.scopeType === 'default' || a.scopeType === 'domain',
    describe: (a) => ({ target: a.calendarId, summary: `Share the calendar ${a.calendarId} with ${a.scopeType === 'default' ? 'ANYONE (public)' : a.scopeType === 'domain' ? 'the WHOLE domain' : (a.scopeValue || 'a user')} as ${a.role}` }),
    before: async (a, { calendar }) => ({ rules: ((await data(calendar.acl.list({ calendarId: a.calendarId }))).items || []).map((r) => pick(r, ['id', 'role', 'scope'])) }),
    after: async (a, { calendar }, details) => (details?.id ? pick(await data(calendar.acl.get({ calendarId: a.calendarId, ruleId: details.id })), ['id', 'role', 'scope']) : { note: 'Google did not return the new rule\'s id.' }) },
  drive_remove_permission: { destructive: D,
    describe: (a) => ({ target: `${a.permissionId} on ${a.fileId}`, summary: `Stop sharing the Drive file ${a.fileId} with permission ${a.permissionId}` }),
    before: (a, { drive }) => data(drive.permissions.get({ fileId: a.fileId, permissionId: a.permissionId, fields: 'id,type,role,emailAddress', supportsAllDrives: true })),
    after: gone((a, { drive }) => data(drive.permissions.get({ fileId: a.fileId, permissionId: a.permissionId, fields: 'id', supportsAllDrives: true }))) },
  drive_transfer_ownership: { destructive: D,
    describe: (a) => ({ target: a.fileId, summary: `Make ${a.newOwnerEmail} the OWNER of the Drive file ${a.fileId}` }),
    before: (a, { drive }) => data(drive.files.get({ fileId: a.fileId, fields: 'id,name,owners(emailAddress)', supportsAllDrives: true })),
    after: (a, { drive }) => data(drive.files.get({ fileId: a.fileId, fields: 'id,name,owners(emailAddress)', supportsAllDrives: true })),
    verify: (a, b, after) => (after?.owners || []).some((o) => String(o.emailAddress).toLowerCase() === String(a.newOwnerEmail).toLowerCase()) },
  calendar_unshare_calendar: { destructive: D,
    describe: (a) => ({ target: `${a.ruleId} on ${a.calendarId}`, summary: `Stop sharing the calendar ${a.calendarId} (access rule ${a.ruleId})` }),
    before: (a, { calendar }) => data(calendar.acl.get({ calendarId: a.calendarId, ruleId: a.ruleId })),
    after: gone((a, { calendar }) => data(calendar.acl.get({ calendarId: a.calendarId, ruleId: a.ruleId }))) },
  gmail_remove_delegate: { destructive: D,
    describe: (a) => ({ target: a.delegateEmail, summary: `Remove ${a.delegateEmail} as a delegate (they lose access to this mailbox)` }),
    before: (a, { gmail }) => data(gmail.users.settings.delegates.get({ userId: 'me', delegateEmail: a.delegateEmail })),
    after: gone((a, { gmail }) => data(gmail.users.settings.delegates.get({ userId: 'me', delegateEmail: a.delegateEmail }))) },
  vault_remove_hold: { destructive: D,
    describe: (a) => ({ target: `${a.holdId} in ${a.matterId}`, summary: `Remove the legal hold ${a.holdId}: the data it was preserving can then be deleted` }),
    before: (a, { vault }) => data(vault.matters.holds.get({ matterId: a.matterId, holdId: a.holdId })).then((h) => pick(h, ['holdId', 'name', 'corpus'])),
    after: gone((a, { vault }) => data(vault.matters.holds.get({ matterId: a.matterId, holdId: a.holdId }))) },
  tasks_clear_completed: { destructive: D,
    describe: (a) => ({ target: a.tasklistId || '@default', summary: `Hide every completed task in the list ${a.tasklistId || '(default)'}` }),
    before: async (a, { tasks }) => ({ completedTasks: ((await data(tasks.tasks.list({ tasklist: a.tasklistId || '@default', showCompleted: true, showHidden: false, maxResults: 100 }))).items || []).filter((t) => t.status === 'completed').length }),
    after: async (a, { tasks }) => ({ completedTasks: ((await data(tasks.tasks.list({ tasklist: a.tasklistId || '@default', showCompleted: true, showHidden: false, maxResults: 100 }))).items || []).filter((t) => t.status === 'completed').length }),
    verify: (a, b, after) => after?.completedTasks === 0 },
  sheets_clear_values: { destructive: D,
    describe: (a) => ({ target: `${a.range} in ${a.spreadsheetId}`, summary: `Erase every value in ${a.range} of the spreadsheet ${a.spreadsheetId}` }),
    before: async (a, { sheets }) => { const v = (await data(sheets.spreadsheets.values.get({ spreadsheetId: a.spreadsheetId, range: a.range }))).values || []; return { rows: v.length, firstRow: v[0]?.slice(0, 10) }; },
    after: async (a, { sheets }) => ({ rows: ((await data(sheets.spreadsheets.values.get({ spreadsheetId: a.spreadsheetId, range: a.range }))).values || []).length }),
    verify: (a, b, after) => after?.rows === 0 },
  datatransfer_start_transfer: { destructive: D,
    describe: (a) => ({ target: `${a.fromUserId} -> ${a.toUserId}`, summary: `Move ownership of ${a.fromUserId}'s data to ${a.toUserId} (${(a.applications || []).length} application(s))` }),
    before: async (a, { admin }) => pick(await data(admin.users.get({ userKey: a.fromUserId, fields: 'primaryEmail,suspended' })), ['primaryEmail', 'suspended']),
    after: async (a, clients, details) => ({ note: 'Google runs transfers in the background. Use datatransfer_get_transfer_status to follow it.', transferId: details?.id }) },

  // ---------- Bulk editors: deleting through them needs the same confirm as the single-purpose delete tools ----------
  docs_batch_update: { destructive: false, confirmWhen: (a) => DELETING_REQUEST(a.requests),
    describe: (a) => ({ target: a.documentId, summary: `Apply ${(a.requests || []).length} edit(s) to the document ${a.documentId}${DELETING_REQUEST(a.requests) ? ' (includes deleting content)' : ''}` }) },
  sheets_batch_update: { destructive: false, confirmWhen: (a) => DELETING_REQUEST(a.requests),
    describe: (a) => ({ target: a.spreadsheetId, summary: `Apply ${(a.requests || []).length} edit(s) to the spreadsheet ${a.spreadsheetId}${DELETING_REQUEST(a.requests) ? ' (includes deleting rows, columns or sheets)' : ''}` }) },
  slides_batch_update: { destructive: false, confirmWhen: (a) => DELETING_REQUEST(a.requests),
    describe: (a) => ({ target: a.presentationId, summary: `Apply ${(a.requests || []).length} edit(s) to the presentation ${a.presentationId}${DELETING_REQUEST(a.requests) ? ' (includes deleting slides or content)' : ''}` }) },
  forms_batch_update: { destructive: false, confirmWhen: (a) => DELETING_REQUEST(a.requests),
    describe: (a) => ({ target: a.formId, summary: `Apply ${(a.requests || []).length} edit(s) to the form ${a.formId}${DELETING_REQUEST(a.requests) ? ' (includes deleting questions)' : ''}` }) },

  // ---------- This server's own sign-ins ----------
  workspace_remove_account: { destructive: D,
    describe: (a) => ({ target: a.email, summary: `Forget the saved Google sign-in for ${a.email}: every Claude connection using it stops working until it is connected again` }),
    before: async (a) => { const { listGoogleAccounts } = await import('../db.js'); return (await listGoogleAccounts()).find((x) => x.email === String(a.email || '').trim().toLowerCase()) || { note: 'No such account is connected.' }; },
    after: async (a) => { const { listGoogleAccounts } = await import('../db.js'); return { exists: (await listGoogleAccounts()).some((x) => x.email === String(a.email || '').trim().toLowerCase()) }; } }
};

async function slideText(slides, a) {
  const p = await data(slides.presentations.get({ presentationId: a.presentationId }));
  const find = (elements) => (elements || []).find((e) => e.objectId === a.objectId);
  const el = (p.slides || []).map((s) => find(s.pageElements)).find(Boolean);
  const text = (el?.shape?.text?.textElements || []).map((t) => t.textRun?.content || '').join('');
  return el ? { objectId: a.objectId, textLength: text.length, text: text.slice(0, 200) } : { note: 'That object was not found on any slide.' };
}

/** Replace the plain tools in `registry` with their guarded versions. Called once from index.js. */
export function applyGuards(registry) {
  for (const [name, spec] of Object.entries(GUARDS)) {
    const i = registry.tools.findIndex((t) => t.name === name);
    if (i === -1) throw new Error(`guards.js has an entry for ${name}, but no such tool exists.`);
    const built = guard(registry.tools[i], registry.handlers[name], spec);
    registry.tools[i] = built.tool;
    registry.handlers[name] = built.handler;
  }
  return registry;
}
