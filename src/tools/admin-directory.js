import { recordChange } from '../changelog.js';
import { ok } from './util.js';

const CUSTOMER = 'my_customer'; // Directory API shorthand for "your own Workspace customer"

export const tools = [
  // ---------- Users ----------
  { name: 'admin_list_users', description: 'List all users in the Workspace domain (or a specific domain if you manage several)', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, query: { type: 'string', description: "e.g. \"orgUnitPath='/Sales'\" or \"email:john*\"" }, maxResults: { type: 'number', default: 100 }, pageToken: { type: 'string' }, showDeleted: { type: 'boolean', default: false } } } },
  { name: 'admin_get_user', description: 'Get full profile of one Workspace user', inputSchema: { type: 'object', properties: { userKey: { type: 'string', description: 'email address, alias, or user ID' } }, required: ['userKey'] } },
  { name: 'admin_create_user', description: 'Create a brand-new Workspace user account', inputSchema: { type: 'object', properties: { primaryEmail: { type: 'string' }, firstName: { type: 'string' }, lastName: { type: 'string' }, password: { type: 'string', description: 'temporary password; leave blank to auto-generate a strong one' }, orgUnitPath: { type: 'string', default: '/' }, changePasswordAtNextLogin: { type: 'boolean', default: true }, recoveryEmail: { type: 'string' }, recoveryPhone: { type: 'string' } }, required: ['primaryEmail', 'firstName', 'lastName'] } },
  { name: 'admin_update_user', description: "Update any field on a user's profile (name, org unit, phone, custom schema fields, etc)", inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, updates: { type: 'object', description: 'Partial Directory API User resource, e.g. {"name":{"givenName":"New"},"orgUnitPath":"/Sales"}' } }, required: ['userKey', 'updates'] } },
  { name: 'admin_delete_user', description: 'Permanently delete a Workspace user account', inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_suspend_user', description: 'Suspend a user (blocks all sign-in, keeps data intact) — use for offboarding or a security incident', inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_unsuspend_user', description: 'Restore a suspended user', inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_reset_user_password', description: "Set a user's password (e.g. after they're locked out) and optionally force a change at next login", inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, newPassword: { type: 'string' }, changePasswordAtNextLogin: { type: 'boolean', default: true } }, required: ['userKey', 'newPassword'] } },
  { name: 'admin_move_user_orgunit', description: 'Move a user to a different organizational unit', inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, orgUnitPath: { type: 'string' } }, required: ['userKey', 'orgUnitPath'] } },
  { name: 'admin_sign_out_user', description: "Force sign-out everywhere: invalidates all of a user's active web/app/device sessions immediately (use for a compromised account)", inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_make_super_admin', description: 'Grant or revoke super admin privileges for a user', inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, isAdmin: { type: 'boolean' } }, required: ['userKey', 'isAdmin'] } },
  { name: 'admin_undelete_user', description: 'Restore a recently deleted user (within Google\'s recovery window, typically 20 days)', inputSchema: { type: 'object', properties: { userId: { type: 'string' }, orgUnitPath: { type: 'string', default: '/' } }, required: ['userId'] } },
  { name: 'admin_get_2sv_status', description: 'Check whether a user has 2-Step Verification enrolled and/or enforced', inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_set_2sv_enforcement', description: 'Ask Google to turn 2-Step Verification enforcement on/off for one user. Google treats this per-person field as read-only and may ignore it: check the read-back. The reliable way is the organizational-unit policy in Admin console > Security > 2-step verification.', inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, enforce: { type: 'boolean' } }, required: ['userKey', 'enforce'] } },
  { name: 'admin_get_user_photo', description: "Get a user's profile photo (base64)", inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_set_user_photo', description: "Set a user's profile photo from base64 image data", inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, base64Data: { type: 'string' } }, required: ['userKey', 'base64Data'] } },

  // ---------- User aliases ----------
  { name: 'admin_list_user_aliases', description: "List all email aliases for a user", inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_add_user_alias', description: 'Add an email alias to a user (they receive mail at both addresses)', inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, alias: { type: 'string' } }, required: ['userKey', 'alias'] } },
  { name: 'admin_delete_user_alias', description: 'Remove an email alias from a user', inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, alias: { type: 'string' } }, required: ['userKey', 'alias'] } },

  // ---------- Groups ----------
  { name: 'admin_list_groups', description: 'List all groups (mailing lists) in the domain', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, userKey: { type: 'string', description: 'filter to groups a specific user belongs to' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'admin_get_group', description: 'Get details of one group', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' } }, required: ['groupKey'] } },
  { name: 'admin_create_group', description: 'Create a new group', inputSchema: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } }, required: ['email', 'name'] } },
  { name: 'admin_update_group', description: 'Update a group (name/description)', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } }, required: ['groupKey'] } },
  { name: 'admin_delete_group', description: 'Delete a group', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' } }, required: ['groupKey'] } },
  { name: 'admin_list_group_members', description: 'List members of a group', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' }, maxResults: { type: 'number', default: 100 } }, required: ['groupKey'] } },
  { name: 'admin_add_group_member', description: 'Add a member (user, group, or external email) to a group', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' }, memberEmail: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'MANAGER', 'MEMBER'], default: 'MEMBER' } }, required: ['groupKey', 'memberEmail'] } },
  { name: 'admin_update_group_member_role', description: "Change a member's role within a group", inputSchema: { type: 'object', properties: { groupKey: { type: 'string' }, memberEmail: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'MANAGER', 'MEMBER'] } }, required: ['groupKey', 'memberEmail', 'role'] } },
  { name: 'admin_remove_group_member', description: 'Remove a member from a group', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' }, memberEmail: { type: 'string' } }, required: ['groupKey', 'memberEmail'] } },
  { name: 'admin_list_group_aliases', description: 'List email aliases for a group', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' } }, required: ['groupKey'] } },
  { name: 'admin_add_group_alias', description: 'Add an email alias to a group', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' }, alias: { type: 'string' } }, required: ['groupKey', 'alias'] } },
  { name: 'admin_delete_group_alias', description: 'Remove an email alias from a group', inputSchema: { type: 'object', properties: { groupKey: { type: 'string' }, alias: { type: 'string' } }, required: ['groupKey', 'alias'] } },
  { name: 'admin_get_group_settings', description: 'Get group posting/moderation/join settings (who can post, join, view — Groups Settings API)', inputSchema: { type: 'object', properties: { groupEmail: { type: 'string' } }, required: ['groupEmail'] } },
  { name: 'admin_update_group_settings', description: 'Update group posting/moderation/join permissions', inputSchema: { type: 'object', properties: { groupEmail: { type: 'string' }, whoCanJoin: { type: 'string' }, whoCanPostMessage: { type: 'string' }, whoCanViewMembership: { type: 'string' }, whoCanViewGroup: { type: 'string' }, allowExternalMembers: { type: 'boolean' }, isArchived: { type: 'boolean' } }, required: ['groupEmail'] } },

  // ---------- Org units ----------
  { name: 'admin_list_orgunits', description: 'List organizational units', inputSchema: { type: 'object', properties: { orgUnitPath: { type: 'string', default: '/' }, type: { type: 'string', enum: ['all', 'children'], default: 'all' } } } },
  { name: 'admin_get_orgunit', description: 'Get one organizational unit', inputSchema: { type: 'object', properties: { orgUnitPath: { type: 'string' } }, required: ['orgUnitPath'] } },
  { name: 'admin_create_orgunit', description: 'Create a new organizational unit', inputSchema: { type: 'object', properties: { name: { type: 'string' }, parentOrgUnitPath: { type: 'string', default: '/' }, description: { type: 'string' } }, required: ['name'] } },
  { name: 'admin_update_orgunit', description: 'Rename/move/redescribe an organizational unit', inputSchema: { type: 'object', properties: { orgUnitPath: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, parentOrgUnitPath: { type: 'string' } }, required: ['orgUnitPath'] } },
  { name: 'admin_delete_orgunit', description: 'Delete an organizational unit (must be empty)', inputSchema: { type: 'object', properties: { orgUnitPath: { type: 'string' } }, required: ['orgUnitPath'] } },

  // ---------- Domains & aliases (multi-domain support) ----------
  { name: 'admin_list_domains', description: 'List every domain and domain alias on this Workspace account', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_get_domain', description: 'Get details of one domain (verified status, primary/secondary)', inputSchema: { type: 'object', properties: { domainName: { type: 'string' } }, required: ['domainName'] } },
  { name: 'admin_add_domain', description: 'Add a new secondary domain to this Workspace account (you must verify it before it can send/receive mail — see workflow_add_domain_and_verify for the one-call version)', inputSchema: { type: 'object', properties: { domainName: { type: 'string' } }, required: ['domainName'] } },
  { name: 'admin_delete_domain', description: 'Remove a secondary domain from this Workspace account', inputSchema: { type: 'object', properties: { domainName: { type: 'string' } }, required: ['domainName'] } },
  { name: 'admin_list_domain_aliases', description: 'List domain aliases (an alias mirrors a real domain, e.g. mycompany.net -> mycompany.com)', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_add_domain_alias', description: 'Add a domain alias pointing at an existing verified primary/secondary domain', inputSchema: { type: 'object', properties: { domainAliasName: { type: 'string' }, parentDomainName: { type: 'string' } }, required: ['domainAliasName', 'parentDomainName'] } },
  { name: 'admin_delete_domain_alias', description: 'Remove a domain alias', inputSchema: { type: 'object', properties: { domainAliasName: { type: 'string' } }, required: ['domainAliasName'] } },

  // ---------- Roles & privileges ----------
  { name: 'admin_list_roles', description: 'List all admin roles (built-in and custom)', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_get_role', description: 'Get one admin role and its privileges', inputSchema: { type: 'object', properties: { roleId: { type: 'string' } }, required: ['roleId'] } },
  { name: 'admin_create_role', description: 'Create a custom admin role with a specific set of privileges', inputSchema: { type: 'object', properties: { roleName: { type: 'string' }, roleDescription: { type: 'string' }, privileges: { type: 'array', items: { type: 'object', properties: { privilegeName: { type: 'string' }, serviceId: { type: 'string' } } } } }, required: ['roleName', 'privileges'] } },
  { name: 'admin_update_role', description: 'Update a custom admin role', inputSchema: { type: 'object', properties: { roleId: { type: 'string' }, roleName: { type: 'string' }, privileges: { type: 'array', items: { type: 'object' } } }, required: ['roleId'] } },
  { name: 'admin_delete_role', description: 'Delete a custom admin role', inputSchema: { type: 'object', properties: { roleId: { type: 'string' } }, required: ['roleId'] } },
  { name: 'admin_list_role_assignments', description: 'List who has which admin role assigned', inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, roleId: { type: 'string' } } } },
  { name: 'admin_create_role_assignment', description: 'Grant an admin role to a user or group, optionally scoped to one org unit', inputSchema: { type: 'object', properties: { roleId: { type: 'string' }, assignedToUserKey: { type: 'string' }, scopeType: { type: 'string', enum: ['CUSTOMER', 'ORG_UNIT'], default: 'CUSTOMER' }, orgUnitId: { type: 'string' } }, required: ['roleId', 'assignedToUserKey'] } },
  { name: 'admin_delete_role_assignment', description: 'Revoke an admin role assignment', inputSchema: { type: 'object', properties: { roleAssignmentId: { type: 'string' } }, required: ['roleAssignmentId'] } },
  { name: 'admin_get_available_privileges', description: 'List every privilege that can be granted in a custom role (the full menu of admin permissions)', inputSchema: { type: 'object', properties: {} } },

  // ---------- Devices ----------
  { name: 'admin_list_mobile_devices', description: "List mobile devices enrolled in the domain's device management", inputSchema: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'admin_get_mobile_device', description: 'Get details of one mobile device', inputSchema: { type: 'object', properties: { resourceId: { type: 'string' } }, required: ['resourceId'] } },
  { name: 'admin_action_mobile_device', description: 'Act on a mobile device: admin_remote_wipe, admin_account_wipe, admin_approve, admin_block, or cancel_remote_wipe_then_activate', inputSchema: { type: 'object', properties: { resourceId: { type: 'string' }, action: { type: 'string', enum: ['admin_remote_wipe', 'admin_account_wipe', 'approve', 'block', 'cancel_remote_wipe_then_activate'] } }, required: ['resourceId', 'action'] } },
  { name: 'admin_delete_mobile_device', description: 'Remove (unenroll) a mobile device from management', inputSchema: { type: 'object', properties: { resourceId: { type: 'string' } }, required: ['resourceId'] } },
  { name: 'admin_list_chrome_devices', description: 'List Chrome OS devices in the domain', inputSchema: { type: 'object', properties: { query: { type: 'string' }, orgUnitPath: { type: 'string' }, maxResults: { type: 'number', default: 100 } } } },
  { name: 'admin_get_chrome_device', description: 'Get details of one Chrome OS device', inputSchema: { type: 'object', properties: { deviceId: { type: 'string' } }, required: ['deviceId'] } },
  { name: 'admin_update_chrome_device', description: 'Update a Chrome OS device (annotated user/location/notes, org unit)', inputSchema: { type: 'object', properties: { deviceId: { type: 'string' }, updates: { type: 'object' } }, required: ['deviceId', 'updates'] } },
  { name: 'admin_action_chrome_device', description: 'Act on a Chrome OS device: disable, reenable, deprovision, or full device wipe', inputSchema: { type: 'object', properties: { deviceId: { type: 'string' }, action: { type: 'string', enum: ['disable', 'reenable', 'deprovision', 'deprovision_same_model_replace', 'deprovision_different_model_replace', 'deprovision_retiring_device'] } }, required: ['deviceId', 'action'] } },
  { name: 'admin_move_chrome_devices_to_orgunit', description: 'Bulk-move Chrome OS devices to a different org unit', inputSchema: { type: 'object', properties: { deviceIds: { type: 'array', items: { type: 'string' } }, orgUnitPath: { type: 'string' } }, required: ['deviceIds', 'orgUnitPath'] } },

  // ---------- Buildings, features & calendar resources ----------
  { name: 'admin_list_buildings', description: 'List office buildings configured for room booking', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_get_building', description: 'Get one building', inputSchema: { type: 'object', properties: { buildingId: { type: 'string' } }, required: ['buildingId'] } },
  { name: 'admin_create_building', description: 'Create a new building', inputSchema: { type: 'object', properties: { buildingId: { type: 'string' }, buildingName: { type: 'string' }, address: { type: 'object' } }, required: ['buildingId', 'buildingName'] } },
  { name: 'admin_update_building', description: 'Update a building', inputSchema: { type: 'object', properties: { buildingId: { type: 'string' }, updates: { type: 'object' } }, required: ['buildingId', 'updates'] } },
  { name: 'admin_delete_building', description: 'Delete a building', inputSchema: { type: 'object', properties: { buildingId: { type: 'string' } }, required: ['buildingId'] } },
  { name: 'admin_list_features', description: 'List resource features (e.g. "Video Conference", "Wheelchair Accessible")', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_create_feature', description: 'Create a new resource feature tag', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'admin_delete_feature', description: 'Delete a resource feature tag', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'admin_list_calendar_resources', description: 'List bookable resources (conference rooms, equipment)', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_get_calendar_resource', description: 'Get one bookable resource', inputSchema: { type: 'object', properties: { resourceId: { type: 'string' } }, required: ['resourceId'] } },
  { name: 'admin_create_calendar_resource', description: 'Create a new bookable resource (conference room, equipment)', inputSchema: { type: 'object', properties: { resourceId: { type: 'string' }, resourceName: { type: 'string' }, resourceType: { type: 'string' }, capacity: { type: 'number' }, buildingId: { type: 'string' }, floorName: { type: 'string' } }, required: ['resourceId', 'resourceName'] } },
  { name: 'admin_update_calendar_resource', description: 'Update a bookable resource', inputSchema: { type: 'object', properties: { resourceId: { type: 'string' }, updates: { type: 'object' } }, required: ['resourceId', 'updates'] } },
  { name: 'admin_delete_calendar_resource', description: 'Delete a bookable resource', inputSchema: { type: 'object', properties: { resourceId: { type: 'string' } }, required: ['resourceId'] } },

  // ---------- Custom user schemas ----------
  { name: 'admin_list_schemas', description: 'List custom user profile fields (schemas) defined for the domain', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_get_schema', description: 'Get one custom schema', inputSchema: { type: 'object', properties: { schemaKey: { type: 'string' } }, required: ['schemaKey'] } },
  { name: 'admin_create_schema', description: 'Create a custom user profile field (e.g. "Employee ID", "T-Shirt Size")', inputSchema: { type: 'object', properties: { schemaName: { type: 'string' }, fields: { type: 'array', items: { type: 'object', properties: { fieldName: { type: 'string' }, fieldType: { type: 'string', enum: ['STRING', 'INT64', 'BOOL', 'DOUBLE', 'EMAIL', 'PHONE', 'DATE'] }, multiValued: { type: 'boolean', default: false } } } } }, required: ['schemaName', 'fields'] } },
  { name: 'admin_update_schema', description: 'Update a custom schema', inputSchema: { type: 'object', properties: { schemaKey: { type: 'string' }, fields: { type: 'array', items: { type: 'object' } } }, required: ['schemaKey', 'fields'] } },
  { name: 'admin_delete_schema', description: 'Delete a custom schema', inputSchema: { type: 'object', properties: { schemaKey: { type: 'string' } }, required: ['schemaKey'] } },

  // ---------- Customer / account-wide ----------
  { name: 'admin_get_customer_info', description: 'Get account-wide Workspace customer info (customer ID, primary domain, address, language, admin contact)', inputSchema: { type: 'object', properties: {} } },
  { name: 'admin_update_customer_info', description: 'Update account-wide customer info (address, language, admin secondary email)', inputSchema: { type: 'object', properties: { updates: { type: 'object' } }, required: ['updates'] } },

  // ---------- App-specific passwords & OAuth tokens (security visibility) ----------
  { name: 'admin_list_asp', description: "List a user's app-specific passwords (legacy app access)", inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_delete_asp', description: "Revoke one of a user's app-specific passwords", inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, codeId: { type: 'string' } }, required: ['userKey', 'codeId'] } },
  { name: 'admin_list_tokens', description: 'List third-party apps a user has granted OAuth access to their account/data', inputSchema: { type: 'object', properties: { userKey: { type: 'string' } }, required: ['userKey'] } },
  { name: 'admin_get_token', description: 'Get details of one OAuth grant', inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, clientId: { type: 'string' } }, required: ['userKey', 'clientId'] } },
  { name: 'admin_delete_token', description: "Revoke a third-party app's OAuth access to a user's account (use this to cut off a suspicious or unwanted app)", inputSchema: { type: 'object', properties: { userKey: { type: 'string' }, clientId: { type: 'string' } }, required: ['userKey', 'clientId'] } },

  // ---------- Alerts & notifications ----------
  { name: 'admin_list_alerts', description: "List Google's security/health alerts for this Workspace account (suspicious logins, phishing, malware, etc)", inputSchema: { type: 'object', properties: { pageSize: { type: 'number', default: 20 }, filter: { type: 'string' } } } },
  { name: 'admin_get_alert', description: 'Get details of one alert', inputSchema: { type: 'object', properties: { alertId: { type: 'string' } }, required: ['alertId'] } },
  { name: 'admin_delete_alert', description: 'Dismiss/delete an alert', inputSchema: { type: 'object', properties: { alertId: { type: 'string' } }, required: ['alertId'] } },
  { name: 'admin_list_admin_console_notifications', description: "List Google's own notifications shown in the Admin Console (product news, action items)", inputSchema: { type: 'object', properties: {} } }
];

export const handlers = {
  // Users
  admin_list_users: async (args, { admin }) => {
    const res = await admin.users.list({ domain: args.domain, customer: args.domain ? undefined : CUSTOMER, query: args.query, maxResults: args.maxResults || 100, pageToken: args.pageToken, showDeleted: args.showDeleted ? 'true' : undefined });
    return ok(res.data);
  },
  admin_get_user: async (args, { admin }) => {
    const res = await admin.users.get({ userKey: args.userKey, projection: 'full' });
    return ok(res.data);
  },
  admin_create_user: async (args, { admin }) => {
    const password = args.password || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!9';
    const res = await admin.users.insert({
      requestBody: {
        primaryEmail: args.primaryEmail,
        name: { givenName: args.firstName, familyName: args.lastName },
        password,
        orgUnitPath: args.orgUnitPath || '/',
        changePasswordAtNextLogin: args.changePasswordAtNextLogin !== false,
        recoveryEmail: args.recoveryEmail,
        recoveryPhone: args.recoveryPhone
      }
    });
    return ok({ ...res.data, temporaryPassword: args.password ? undefined : password });
  },
  admin_update_user: async (args, { admin }) => {
    const res = await admin.users.update({ userKey: args.userKey, requestBody: args.updates });
    return ok(res.data);
  },
  admin_delete_user: async (args, { admin }) => {
    await admin.users.delete({ userKey: args.userKey });
    return ok({ deleted: args.userKey });
  },
  admin_suspend_user: async (args, { admin }) => {
    const res = await admin.users.update({ userKey: args.userKey, requestBody: { suspended: true } });
    return ok(res.data);
  },
  admin_unsuspend_user: async (args, { admin }) => {
    const res = await admin.users.update({ userKey: args.userKey, requestBody: { suspended: false } });
    return ok(res.data);
  },
  admin_reset_user_password: async (args, { admin }) => {
    const res = await admin.users.update({ userKey: args.userKey, requestBody: { password: args.newPassword, changePasswordAtNextLogin: args.changePasswordAtNextLogin !== false } });
    return ok({ userKey: args.userKey, status: 'password updated' });
  },
  admin_move_user_orgunit: async (args, clients) => {
    const { admin } = clients;
    const before = (await admin.users.get({ userKey: args.userKey, fields: 'primaryEmail,orgUnitPath' })).data;
    const res = await admin.users.update({ userKey: args.userKey, requestBody: { orgUnitPath: args.orgUnitPath } });
    if (args[Symbol.for('gws.writeGuarded')] !== true) await recordChange(clients, { tool: 'admin_move_user_orgunit', target: before.primaryEmail || args.userKey, summary: `Moved ${before.primaryEmail || args.userKey} from ${before.orgUnitPath} to ${res.data.orgUnitPath}`, before: { orgUnitPath: before.orgUnitPath }, after: { orgUnitPath: res.data.orgUnitPath } });
    return ok(res.data);
  },
  admin_sign_out_user: async (args, { admin }) => {
    await admin.users.signOut({ userKey: args.userKey });
    return ok({ userKey: args.userKey, status: 'all sessions signed out' });
  },
  // Before/after reading and the change-log entry come from the safety wrapper (src/tools/guards.js).
  admin_make_super_admin: async (args, { admin }) => {
    await admin.users.makeAdmin({ userKey: args.userKey, requestBody: { status: args.isAdmin } });
    return ok({ userKey: args.userKey, requested: !!args.isAdmin });
  },
  admin_undelete_user: async (args, { admin }) => {
    await admin.users.undelete({ userKey: args.userId, requestBody: { orgUnitPath: args.orgUnitPath || '/' } });
    return ok({ restored: args.userId });
  },
  admin_get_2sv_status: async (args, { admin }) => {
    const res = await admin.users.get({ userKey: args.userKey, projection: 'full', fields: 'isEnrolledIn2Sv,isEnforcedIn2Sv,primaryEmail' });
    return ok(res.data);
  },
  admin_set_2sv_enforcement: async (args, clients) => {
    const { admin } = clients;
    const before = (await admin.users.get({ userKey: args.userKey, projection: 'full', fields: 'primaryEmail,isEnforcedIn2Sv' })).data;
    const res = await admin.users.update({ userKey: args.userKey, requestBody: { isEnforcedIn2Sv: args.enforce } });
    if (args[Symbol.for('gws.writeGuarded')] !== true) await recordChange(clients, { tool: 'admin_set_2sv_enforcement', target: before.primaryEmail || args.userKey, summary: `2-Step Verification enforcement for ${before.primaryEmail || args.userKey}: ${before.isEnforcedIn2Sv ? 'on' : 'off'} -> ${res.data.isEnforcedIn2Sv ? 'on' : 'off'}`, before: { isEnforcedIn2Sv: !!before.isEnforcedIn2Sv }, after: { isEnforcedIn2Sv: !!res.data.isEnforcedIn2Sv } });
    return ok(res.data);
  },
  admin_get_user_photo: async (args, { admin }) => {
    const res = await admin.users.photos.get({ userKey: args.userKey });
    return ok(res.data);
  },
  admin_set_user_photo: async (args, clients) => {
    const { admin } = clients;
    let before = null;
    try { const b = (await admin.users.photos.get({ userKey: args.userKey })).data; before = { mimeType: b.mimeType, width: b.width, height: b.height }; } catch { /* no photo yet */ }
    const res = await admin.users.photos.update({ userKey: args.userKey, requestBody: { photoData: Buffer.from(args.base64Data, 'base64').toString('base64url') } });
    if (args[Symbol.for('gws.writeGuarded')] !== true) await recordChange(clients, { tool: 'admin_set_user_photo', target: args.userKey, summary: `Changed the profile photo of ${args.userKey}`, before, after: { mimeType: res.data.mimeType, width: res.data.width, height: res.data.height } });
    return ok(res.data);
  },

  // User aliases
  admin_list_user_aliases: async (args, { admin }) => {
    const res = await admin.users.aliases.list({ userKey: args.userKey });
    return ok(res.data.aliases || []);
  },
  admin_add_user_alias: async (args, { admin }) => {
    const res = await admin.users.aliases.insert({ userKey: args.userKey, requestBody: { alias: args.alias } });
    return ok(res.data);
  },
  admin_delete_user_alias: async (args, { admin }) => {
    await admin.users.aliases.delete({ userKey: args.userKey, alias: args.alias });
    return ok({ deleted: args.alias });
  },

  // Groups
  admin_list_groups: async (args, { admin }) => {
    const res = await admin.groups.list({ domain: args.domain, customer: args.domain ? undefined : CUSTOMER, userKey: args.userKey, maxResults: args.maxResults || 100 });
    return ok(res.data);
  },
  admin_get_group: async (args, { admin }) => {
    const res = await admin.groups.get({ groupKey: args.groupKey });
    return ok(res.data);
  },
  admin_create_group: async (args, { admin }) => {
    const res = await admin.groups.insert({ requestBody: { email: args.email, name: args.name, description: args.description } });
    return ok(res.data);
  },
  admin_update_group: async (args, { admin }) => {
    const res = await admin.groups.update({ groupKey: args.groupKey, requestBody: { name: args.name, description: args.description } });
    return ok(res.data);
  },
  admin_delete_group: async (args, { admin }) => {
    await admin.groups.delete({ groupKey: args.groupKey });
    return ok({ deleted: args.groupKey });
  },
  admin_list_group_members: async (args, { admin }) => {
    const res = await admin.members.list({ groupKey: args.groupKey, maxResults: args.maxResults || 100 });
    return ok(res.data.members || []);
  },
  admin_add_group_member: async (args, { admin }) => {
    const res = await admin.members.insert({ groupKey: args.groupKey, requestBody: { email: args.memberEmail, role: args.role || 'MEMBER' } });
    return ok(res.data);
  },
  admin_update_group_member_role: async (args, { admin }) => {
    const res = await admin.members.update({ groupKey: args.groupKey, memberKey: args.memberEmail, requestBody: { role: args.role } });
    return ok(res.data);
  },
  admin_remove_group_member: async (args, { admin }) => {
    await admin.members.delete({ groupKey: args.groupKey, memberKey: args.memberEmail });
    return ok({ removed: args.memberEmail });
  },
  admin_list_group_aliases: async (args, { admin }) => {
    const res = await admin.groups.aliases.list({ groupKey: args.groupKey });
    return ok(res.data.aliases || []);
  },
  admin_add_group_alias: async (args, { admin }) => {
    const res = await admin.groups.aliases.insert({ groupKey: args.groupKey, requestBody: { alias: args.alias } });
    return ok(res.data);
  },
  admin_delete_group_alias: async (args, { admin }) => {
    await admin.groups.aliases.delete({ groupKey: args.groupKey, alias: args.alias });
    return ok({ deleted: args.alias });
  },
  admin_get_group_settings: async (args, { groupssettings }) => {
    const res = await groupssettings.groups.get({ groupUniqueId: args.groupEmail });
    return ok(res.data);
  },
  admin_update_group_settings: async (args, { groupssettings }) => {
    const { groupEmail, ...rest } = args;
    const requestBody = {};
    if (rest.whoCanJoin) requestBody.whoCanJoin = rest.whoCanJoin;
    if (rest.whoCanPostMessage) requestBody.whoCanPostMessage = rest.whoCanPostMessage;
    if (rest.whoCanViewMembership) requestBody.whoCanViewMembership = rest.whoCanViewMembership;
    if (rest.whoCanViewGroup) requestBody.whoCanViewGroup = rest.whoCanViewGroup;
    if (typeof rest.allowExternalMembers === 'boolean') requestBody.allowExternalMembers = String(rest.allowExternalMembers);
    if (typeof rest.isArchived === 'boolean') requestBody.isArchived = String(rest.isArchived);
    const res = await groupssettings.groups.patch({ groupUniqueId: groupEmail, requestBody });
    return ok(res.data);
  },

  // Org units
  admin_list_orgunits: async (args, { admin }) => {
    const res = await admin.orgunits.list({ customerId: CUSTOMER, orgUnitPath: args.orgUnitPath || '/', type: args.type || 'all' });
    return ok(res.data.organizationUnits || []);
  },
  admin_get_orgunit: async (args, { admin }) => {
    const res = await admin.orgunits.get({ customerId: CUSTOMER, orgUnitPath: args.orgUnitPath.replace(/^\//, '') });
    return ok(res.data);
  },
  admin_create_orgunit: async (args, { admin }) => {
    const res = await admin.orgunits.insert({ customerId: CUSTOMER, requestBody: { name: args.name, parentOrgUnitPath: args.parentOrgUnitPath || '/', description: args.description } });
    return ok(res.data);
  },
  admin_update_orgunit: async (args, { admin }) => {
    const res = await admin.orgunits.update({ customerId: CUSTOMER, orgUnitPath: args.orgUnitPath.replace(/^\//, ''), requestBody: { name: args.name, description: args.description, parentOrgUnitPath: args.parentOrgUnitPath } });
    return ok(res.data);
  },
  admin_delete_orgunit: async (args, { admin }) => {
    await admin.orgunits.delete({ customerId: CUSTOMER, orgUnitPath: args.orgUnitPath.replace(/^\//, '') });
    return ok({ deleted: args.orgUnitPath });
  },

  // Domains
  admin_list_domains: async (_args, { admin }) => {
    const res = await admin.domains.list({ customer: CUSTOMER });
    return ok(res.data.domains || []);
  },
  admin_get_domain: async (args, { admin }) => {
    const res = await admin.domains.get({ customer: CUSTOMER, domainName: args.domainName });
    return ok(res.data);
  },
  admin_add_domain: async (args, { admin }) => {
    const res = await admin.domains.insert({ customer: CUSTOMER, requestBody: { domainName: args.domainName } });
    return ok(res.data);
  },
  admin_delete_domain: async (args, { admin }) => {
    await admin.domains.delete({ customer: CUSTOMER, domainName: args.domainName });
    return ok({ deleted: args.domainName });
  },
  admin_list_domain_aliases: async (_args, { admin }) => {
    const res = await admin.domainAliases.list({ customer: CUSTOMER });
    return ok(res.data.domainAliases || []);
  },
  admin_add_domain_alias: async (args, { admin }) => {
    const res = await admin.domainAliases.insert({ customer: CUSTOMER, requestBody: { domainAliasName: args.domainAliasName, parentDomainName: args.parentDomainName } });
    return ok(res.data);
  },
  admin_delete_domain_alias: async (args, { admin }) => {
    await admin.domainAliases.delete({ customer: CUSTOMER, domainAliasName: args.domainAliasName });
    return ok({ deleted: args.domainAliasName });
  },

  // Roles
  admin_list_roles: async (_args, { admin }) => {
    const res = await admin.roles.list({ customer: CUSTOMER, maxResults: 100 });
    return ok(res.data.items || []);
  },
  admin_get_role: async (args, { admin }) => {
    const res = await admin.roles.get({ customer: CUSTOMER, roleId: args.roleId });
    return ok(res.data);
  },
  admin_create_role: async (args, { admin }) => {
    const res = await admin.roles.insert({ customer: CUSTOMER, requestBody: { roleName: args.roleName, roleDescription: args.roleDescription, rolePrivileges: args.privileges } });
    return ok(res.data);
  },
  admin_update_role: async (args, { admin }) => {
    const res = await admin.roles.patch({ customer: CUSTOMER, roleId: args.roleId, requestBody: { roleName: args.roleName, rolePrivileges: args.privileges } });
    return ok(res.data);
  },
  admin_delete_role: async (args, { admin }) => {
    await admin.roles.delete({ customer: CUSTOMER, roleId: args.roleId });
    return ok({ deleted: args.roleId });
  },
  admin_list_role_assignments: async (args, { admin }) => {
    const res = await admin.roleAssignments.list({ customer: CUSTOMER, userKey: args.userKey, roleId: args.roleId });
    return ok(res.data.items || []);
  },
  admin_create_role_assignment: async (args, { admin }) => {
    const res = await admin.roleAssignments.insert({ customer: CUSTOMER, requestBody: { roleId: args.roleId, assignedTo: args.assignedToUserKey, scopeType: args.scopeType || 'CUSTOMER', orgUnitId: args.orgUnitId } });
    return ok(res.data);
  },
  admin_delete_role_assignment: async (args, { admin }) => {
    await admin.roleAssignments.delete({ customer: CUSTOMER, roleAssignmentId: args.roleAssignmentId });
    return ok({ deleted: args.roleAssignmentId });
  },
  admin_get_available_privileges: async (_args, { admin }) => {
    const res = await admin.privileges.list({ customer: CUSTOMER });
    return ok(res.data.items || []);
  },

  // Devices
  admin_list_mobile_devices: async (args, { admin }) => {
    const res = await admin.mobiledevices.list({ customerId: CUSTOMER, query: args.query, maxResults: args.maxResults || 100 });
    return ok(res.data.mobiledevices || []);
  },
  admin_get_mobile_device: async (args, { admin }) => {
    const res = await admin.mobiledevices.get({ customerId: CUSTOMER, resourceId: args.resourceId });
    return ok(res.data);
  },
  admin_action_mobile_device: async (args, { admin }) => {
    await admin.mobiledevices.action({ customerId: CUSTOMER, resourceId: args.resourceId, requestBody: { action: args.action } });
    return ok({ resourceId: args.resourceId, action: args.action, status: 'submitted' });
  },
  admin_delete_mobile_device: async (args, { admin }) => {
    await admin.mobiledevices.delete({ customerId: CUSTOMER, resourceId: args.resourceId });
    return ok({ deleted: args.resourceId });
  },
  admin_list_chrome_devices: async (args, { admin }) => {
    const res = await admin.chromeosdevices.list({ customerId: CUSTOMER, query: args.query, orgUnitPath: args.orgUnitPath, maxResults: args.maxResults || 100 });
    return ok(res.data.chromeosdevices || []);
  },
  admin_get_chrome_device: async (args, { admin }) => {
    const res = await admin.chromeosdevices.get({ customerId: CUSTOMER, deviceId: args.deviceId });
    return ok(res.data);
  },
  admin_update_chrome_device: async (args, { admin }) => {
    const res = await admin.chromeosdevices.update({ customerId: CUSTOMER, deviceId: args.deviceId, requestBody: args.updates });
    return ok(res.data);
  },
  admin_action_chrome_device: async (args, { admin }) => {
    await admin.chromeosdevices.action({ customerId: CUSTOMER, resourceId: args.deviceId, requestBody: { action: args.action } });
    return ok({ deviceId: args.deviceId, action: args.action, status: 'submitted' });
  },
  admin_move_chrome_devices_to_orgunit: async (args, { admin }) => {
    await admin.chromeosdevices.moveDevicesToOu({ customerId: CUSTOMER, orgUnitPath: args.orgUnitPath, requestBody: { deviceIds: args.deviceIds } });
    return ok({ moved: args.deviceIds, orgUnitPath: args.orgUnitPath });
  },

  // Buildings / features / resources
  admin_list_buildings: async (_args, { admin }) => {
    const res = await admin.resources.buildings.list({ customer: CUSTOMER });
    return ok(res.data.buildings || []);
  },
  admin_get_building: async (args, { admin }) => {
    const res = await admin.resources.buildings.get({ customer: CUSTOMER, buildingId: args.buildingId });
    return ok(res.data);
  },
  admin_create_building: async (args, { admin }) => {
    const res = await admin.resources.buildings.insert({ customer: CUSTOMER, requestBody: { buildingId: args.buildingId, buildingName: args.buildingName, address: args.address } });
    return ok(res.data);
  },
  admin_update_building: async (args, { admin }) => {
    const res = await admin.resources.buildings.update({ customer: CUSTOMER, buildingId: args.buildingId, requestBody: args.updates });
    return ok(res.data);
  },
  admin_delete_building: async (args, { admin }) => {
    await admin.resources.buildings.delete({ customer: CUSTOMER, buildingId: args.buildingId });
    return ok({ deleted: args.buildingId });
  },
  admin_list_features: async (_args, { admin }) => {
    const res = await admin.resources.features.list({ customer: CUSTOMER });
    return ok(res.data.features || []);
  },
  admin_create_feature: async (args, { admin }) => {
    const res = await admin.resources.features.insert({ customer: CUSTOMER, requestBody: { name: args.name } });
    return ok(res.data);
  },
  admin_delete_feature: async (args, { admin }) => {
    await admin.resources.features.delete({ customer: CUSTOMER, featureKey: args.name });
    return ok({ deleted: args.name });
  },
  admin_list_calendar_resources: async (_args, { admin }) => {
    const res = await admin.resources.calendars.list({ customer: CUSTOMER });
    return ok(res.data.items || []);
  },
  admin_get_calendar_resource: async (args, { admin }) => {
    const res = await admin.resources.calendars.get({ customer: CUSTOMER, calendarResourceId: args.resourceId });
    return ok(res.data);
  },
  admin_create_calendar_resource: async (args, { admin }) => {
    const res = await admin.resources.calendars.insert({ customer: CUSTOMER, requestBody: { resourceId: args.resourceId, resourceName: args.resourceName, resourceType: args.resourceType, capacity: args.capacity, buildingId: args.buildingId, floorName: args.floorName } });
    return ok(res.data);
  },
  admin_update_calendar_resource: async (args, { admin }) => {
    const res = await admin.resources.calendars.update({ customer: CUSTOMER, calendarResourceId: args.resourceId, requestBody: args.updates });
    return ok(res.data);
  },
  admin_delete_calendar_resource: async (args, { admin }) => {
    await admin.resources.calendars.delete({ customer: CUSTOMER, calendarResourceId: args.resourceId });
    return ok({ deleted: args.resourceId });
  },

  // Schemas
  admin_list_schemas: async (_args, { admin }) => {
    const res = await admin.schemas.list({ customerId: CUSTOMER });
    return ok(res.data.schemas || []);
  },
  admin_get_schema: async (args, { admin }) => {
    const res = await admin.schemas.get({ customerId: CUSTOMER, schemaKey: args.schemaKey });
    return ok(res.data);
  },
  admin_create_schema: async (args, { admin }) => {
    const res = await admin.schemas.insert({ customerId: CUSTOMER, requestBody: { schemaName: args.schemaName, fields: args.fields } });
    return ok(res.data);
  },
  admin_update_schema: async (args, { admin }) => {
    const res = await admin.schemas.update({ customerId: CUSTOMER, schemaKey: args.schemaKey, requestBody: { fields: args.fields } });
    return ok(res.data);
  },
  admin_delete_schema: async (args, { admin }) => {
    await admin.schemas.delete({ customerId: CUSTOMER, schemaKey: args.schemaKey });
    return ok({ deleted: args.schemaKey });
  },

  // Customer
  admin_get_customer_info: async (_args, { admin }) => {
    const res = await admin.customers.get({ customerKey: CUSTOMER });
    return ok(res.data);
  },
  admin_update_customer_info: async (args, { admin }) => {
    const res = await admin.customers.update({ customerKey: CUSTOMER, requestBody: args.updates });
    return ok(res.data);
  },

  // ASPs & tokens
  admin_list_asp: async (args, { admin }) => {
    const res = await admin.asps.list({ userKey: args.userKey });
    return ok(res.data.items || []);
  },
  admin_delete_asp: async (args, { admin }) => {
    await admin.asps.delete({ userKey: args.userKey, codeId: args.codeId });
    return ok({ deleted: args.codeId });
  },
  admin_list_tokens: async (args, { admin }) => {
    const res = await admin.tokens.list({ userKey: args.userKey });
    return ok(res.data.items || []);
  },
  admin_get_token: async (args, { admin }) => {
    const res = await admin.tokens.get({ userKey: args.userKey, clientId: args.clientId });
    return ok(res.data);
  },
  admin_delete_token: async (args, { admin }) => {
    await admin.tokens.delete({ userKey: args.userKey, clientId: args.clientId });
    return ok({ revoked: args.clientId, forUser: args.userKey });
  },

  // Alerts
  admin_list_alerts: async (args, { alertcenter }) => {
    const res = await alertcenter.alerts.list({ pageSize: args.pageSize || 20, filter: args.filter });
    return ok(res.data.alerts || []);
  },
  admin_get_alert: async (args, { alertcenter }) => {
    const res = await alertcenter.alerts.get({ alertId: args.alertId });
    return ok(res.data);
  },
  admin_delete_alert: async (args, { alertcenter }) => {
    await alertcenter.alerts.delete({ alertId: args.alertId });
    return ok({ deleted: args.alertId });
  },
  admin_list_admin_console_notifications: async (_args, { admin }) => {
    const res = await admin.notifications.list({ customer: CUSTOMER });
    return ok(res.data.items || []);
  }
};
