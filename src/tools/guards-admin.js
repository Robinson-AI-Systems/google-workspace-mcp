// Safety table, part: Admin directory, licensing, Chrome, Vault, workflows and this server's own settings.
// Same entry shape as guards.js (describe / before / after / destructive / confirmWhen / verify); see write.js.
//
// Rules used here:
//   destructive: true  -> anything that widens access, spends money, changes security or domains, or is hard to undo.
//   everything else    -> preview + read-back, with confirmWhen for the specific arguments that are risky.
//   before() for a create looks for the item first (a 404 means "not there yet"); after() asks Google what it holds now.
//   Passwords are never put in a summary or in before/after.
import { isNotFound } from './write.js';
import { CUSTOMER, pick, data, orgPath, D, same, SCALARS } from './guard-helpers.js';
import { normalizeDomains, domainOfEmail } from '../domains.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const normOU = (p) => { const s = `/${String(p ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '')}`; return s; };
const ouJoin = (parent, name) => `${normOU(parent ?? '/') === '/' ? '' : normOU(parent)}/${name}`;
const sameSet = (x, y) => x.length === y.length && x.every((v) => y.includes(v));

/** The item, or { exists: false } when Google says it is not there (used before a create). */
async function absent(get) {
  try { return await get(); } catch (err) { if (isNotFound(err)) return { exists: false }; throw err; }
}

/** True when everything asked for in `wanted` shows up in `got` (scalars compared loosely for booleans, objects field by field). */
function covers(got, wanted) {
  if (wanted === undefined) return true;
  if (isObj(wanted)) return isObj(got) && Object.entries(wanted).every(([k, v]) => covers(got[k], v));
  if (Array.isArray(wanted)) return Array.isArray(got) && wanted.every((w) => got.some((g) => covers(g, w)));
  if (SCALARS.has(typeof wanted)) return same(got, wanted);
  return true;
}

/** Marks the arguments so a handler that also writes its own change-log row knows the safety wrapper is doing it. Not copied by spreads. */
const GUARDED = Symbol.for('gws.writeGuarded');
const markGuarded = (a) => { try { Object.defineProperty(a, GUARDED, { value: true }); } catch { /* frozen: the old handler just logs too */ } };

const USER_FIELDS = 'primaryEmail,name(givenName,familyName),orgUnitPath,suspended,isEnforcedIn2Sv,changePasswordAtNextLogin';
const getUser = (a, { admin }, key, fields) => data(admin.users.get({ userKey: key, fields }));
const ouGet = (clients, path) => data(clients.admin.orgunits.get({ customerId: CUSTOMER, orgUnitPath: path }));
const OU_FIELDS = ['name', 'orgUnitPath', 'orgUnitId', 'parentOrgUnitPath', 'description'];
const memberFields = ['email', 'role', 'status', 'type'];
const memberGet = (a, { admin }) => data(admin.members.get({ groupKey: a.groupKey, memberKey: a.memberEmail })).then((m) => pick(m, memberFields));
const GROUP_FIELDS = ['email', 'name', 'description', 'directMembersCount'];
const groupGet = (key, { admin }) => data(admin.groups.get({ groupKey: key })).then((g) => pick(g, GROUP_FIELDS));
const aliasList = async (a, { admin }) => ({ aliases: (await data(admin.groups.aliases.list({ groupKey: a.groupKey }))).aliases?.map((x) => x.alias) || [] });
const sku = (a) => ({ productId: a.productId || 'Google-Apps', skuId: a.skuId, userId: a.userId });
const privs = (rolePrivileges) => list(rolePrivileges).map((p) => `${p?.serviceId}:${p?.privilegeName}`).sort();
const roleView = (r) => ({ ...pick(r, ['roleId', 'roleName', 'roleDescription', 'isSystemRole']), privileges: privs(r?.rolePrivileges) });
const SETTING_KEYS = ['whoCanJoin', 'whoCanPostMessage', 'whoCanViewMembership', 'whoCanViewGroup', 'allowExternalMembers', 'isArchived'];
const settingsView = (s) => pick(s, SETTING_KEYS);
const ELEVATED_ROLE = (role) => /^(OWNER|MANAGER)$/i.test(String(role || ''));
// A member from another domain than the group's own is "external". If the group is given by ID we cannot tell, so we ask.
const outsideGroupDomain = (a) => { const m = domainOfEmail(a.memberEmail); if (!m) return false; const g = domainOfEmail(a.groupKey); return !g || g !== m; };
const OPEN_TO_ANYONE = (v) => /^ANYONE/i.test(String(v || ''));
const RESOURCE_FIELDS = ['resourceId', 'resourceName', 'resourceType', 'capacity', 'buildingId', 'floorName', 'resourceEmail'];
const matchingConnections = async (prefix) => {
  const { listConnections } = await import('../db.js');
  const p = String(prefix || '').slice(0, 8); // never keep more of a token than its first 8 characters
  return (await listConnections()).filter((c) => p && String(c.token_prefix || '').startsWith(p)).map((c) => pick(c, ['token_prefix', 'connection_id', 'client_name', 'google_account', 'last_used_at', 'revoked_at']));
};

export const GUARDS_ADMIN = {
  // ---------- Users ----------
  admin_create_user: { destructive: D,
    // Mirrors a real login that can be billed for; the temporary password is returned once by the tool itself and is never logged here.
    verify: (a, b, after) => lower(after?.primaryEmail) === lower(a.primaryEmail) && normOU(after?.orgUnitPath) === normOU(a.orgUnitPath || '/') && same(after?.name?.givenName, a.firstName) && same(after?.name?.familyName, a.lastName),
    describe: (a) => ({ target: a.primaryEmail, summary: `Create the Workspace user ${a.primaryEmail} (${a.firstName} ${a.lastName}) in ${a.orgUnitPath || '/'}: a new sign-in that may use a paid license${a.password ? ' (with the password you gave, which is not shown)' : ' (with a generated temporary password, shown once in the result)'}` }),
    before: (a, c) => absent(() => getUser(a, c, a.primaryEmail, 'primaryEmail,suspended')),
    after: (a, c) => getUser(a, c, a.primaryEmail, USER_FIELDS) },
  admin_unsuspend_user: { destructive: D, verify: (a, b, after) => !!after?.suspended === false,
    describe: (a) => ({ target: a.userKey, summary: `Unsuspend ${a.userKey}: they can sign in again` }),
    before: (a, c) => getUser(a, c, a.userKey, 'primaryEmail,suspended,lastLoginTime'),
    after: (a, c) => getUser(a, c, a.userKey, 'primaryEmail,suspended') },
  admin_undelete_user: { destructive: D, verify: (a, b, after) => !!after?.primaryEmail && !after.deletionTime && normOU(after.orgUnitPath) === normOU(a.orgUnitPath || '/'),
    describe: (a) => ({ target: a.userId, summary: `Restore the deleted user ${a.userId} into ${a.orgUnitPath || '/'}: their account and sign-in come back` }),
    before: (a, c) => absent(() => getUser(a, c, a.userId, 'primaryEmail,suspended,orgUnitPath,deletionTime')),
    after: (a, c) => getUser(a, c, a.userId, 'primaryEmail,suspended,orgUnitPath,deletionTime') },
  admin_set_2sv_enforcement: { destructive: D, verify: (a, b, after) => !!after?.isEnforcedIn2Sv === !!a.enforce,
    describe: (a) => (markGuarded(a), { target: a.userKey, summary: `Turn 2-Step Verification enforcement ${a.enforce ? 'ON' : 'OFF'} for ${a.userKey} (Google may ignore this per-person field; the read-back says)` }),
    before: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, projection: 'full', fields: 'primaryEmail,isEnrolledIn2Sv,isEnforcedIn2Sv' })),
    after: (a, { admin }) => data(admin.users.get({ userKey: a.userKey, projection: 'full', fields: 'primaryEmail,isEnrolledIn2Sv,isEnforcedIn2Sv' })) },
  admin_set_user_photo: { destructive: false,
    verify: (a, before, after) => !!after?.mimeType && (!before?.etag || !after.etag || before.etag !== after.etag),
    describe: (a) => (markGuarded(a), { target: a.userKey, summary: `Change the profile photo of ${a.userKey}` }),
    before: (a, { admin }) => absent(() => data(admin.users.photos.get({ userKey: a.userKey })).then((p) => pick(p, ['mimeType', 'width', 'height', 'etag']))),
    after: (a, { admin }) => data(admin.users.photos.get({ userKey: a.userKey })).then((p) => pick(p, ['mimeType', 'width', 'height', 'etag'])) },
  admin_move_user_orgunit: { destructive: false, verify: (a, b, after) => normOU(after?.orgUnitPath) === normOU(a.orgUnitPath),
    describe: (a) => (markGuarded(a), { target: a.userKey, summary: `Move ${a.userKey} to the org unit ${a.orgUnitPath}` }),
    before: (a, c) => getUser(a, c, a.userKey, 'primaryEmail,orgUnitPath'),
    after: (a, c) => getUser(a, c, a.userKey, 'primaryEmail,orgUnitPath') },

  // ---------- Groups ----------
  admin_create_group: { destructive: false,
    verify: (a, b, after) => lower(after?.email) === lower(a.email) && same(after?.name, a.name) && (a.description === undefined || same(after?.description, a.description)),
    describe: (a) => ({ target: a.email, summary: `Create the group ${a.email} ("${a.name}")` }),
    before: (a, c) => absent(() => groupGet(a.email, c)),
    after: (a, c) => groupGet(a.email, c) },
  admin_update_group: { destructive: false,
    verify: (a, b, after) => ['name', 'description'].every((k) => a[k] === undefined || same(after?.[k], a[k])),
    describe: (a) => ({ target: a.groupKey, summary: `Update the group ${a.groupKey}: ${['name', 'description'].filter((k) => a[k] !== undefined).join(', ') || 'nothing given'}` }),
    before: (a, c) => groupGet(a.groupKey, c),
    after: (a, c) => groupGet(a.groupKey, c) },
  admin_add_group_member: { destructive: false, confirmWhen: (a) => ELEVATED_ROLE(a.role) || outsideGroupDomain(a),
    verify: (a, b, after) => lower(after?.email) === lower(a.memberEmail) && same(after?.role, a.role || 'MEMBER'),
    describe: (a) => ({ target: `${a.memberEmail} in ${a.groupKey}`, summary: `Add ${a.memberEmail} to the group ${a.groupKey} as ${a.role || 'MEMBER'}${ELEVATED_ROLE(a.role) ? ' (can manage the group)' : ''}${outsideGroupDomain(a) ? ' (an address outside the group\'s own domain: they get the group\'s mail and access)' : ''}` }),
    before: (a, c) => absent(() => memberGet(a, c)),
    after: (a, c) => memberGet(a, c) },
  admin_update_group_member_role: { destructive: false, confirmWhen: (a) => ELEVATED_ROLE(a.role),
    verify: (a, b, after) => same(after?.role, a.role),
    describe: (a) => ({ target: `${a.memberEmail} in ${a.groupKey}`, summary: `Change ${a.memberEmail} in ${a.groupKey} to ${a.role}${ELEVATED_ROLE(a.role) ? ' (can manage the group)' : ''}` }),
    before: (a, c) => memberGet(a, c),
    after: (a, c) => memberGet(a, c) },
  admin_add_group_alias: { destructive: false, verify: (a, b, after) => list(after?.aliases).map(lower).includes(lower(a.alias)),
    describe: (a) => ({ target: `${a.alias} on ${a.groupKey}`, summary: `Add the alias ${a.alias} to the group ${a.groupKey} (mail to it reaches the group)` }),
    before: (a, c) => aliasList(a, c),
    after: (a, c) => aliasList(a, c) },
  admin_update_group_settings: { destructive: false,
    // Opening a group to anyone on the internet or to outside members changes who can read or send into it.
    confirmWhen: (a) => a.allowExternalMembers === true || OPEN_TO_ANYONE(a.whoCanJoin) || OPEN_TO_ANYONE(a.whoCanPostMessage) || OPEN_TO_ANYONE(a.whoCanViewGroup),
    verify: (a, b, after) => SETTING_KEYS.every((k) => !a[k] && typeof a[k] !== 'boolean' ? true : String(after?.[k]) === String(a[k])),
    describe: (a) => ({ target: a.groupEmail, summary: `Change the settings of the group ${a.groupEmail}: ${SETTING_KEYS.filter((k) => a[k] !== undefined && a[k] !== '').map((k) => `${k} = ${a[k]}`).join(', ') || 'nothing given'}` }),
    before: (a, { groupssettings }) => data(groupssettings.groups.get({ groupUniqueId: a.groupEmail })).then(settingsView),
    after: (a, { groupssettings }) => data(groupssettings.groups.get({ groupUniqueId: a.groupEmail })).then(settingsView) },

  // ---------- Org units ----------
  admin_create_orgunit: { destructive: false,
    verify: (a, b, after) => same(after?.name, a.name) && normOU(after?.parentOrgUnitPath) === normOU(a.parentOrgUnitPath || '/') && (a.description === undefined || same(after?.description, a.description)),
    describe: (a) => ({ target: ouJoin(a.parentOrgUnitPath, a.name), summary: `Create the organizational unit ${ouJoin(a.parentOrgUnitPath, a.name)}` }),
    before: (a, c) => absent(() => ouGet(c, orgPath(ouJoin(a.parentOrgUnitPath, a.name))).then((o) => pick(o, OU_FIELDS))),
    after: (a, c, details) => ouGet(c, details?.orgUnitId || orgPath(ouJoin(a.parentOrgUnitPath, a.name))).then((o) => pick(o, OU_FIELDS)) },
  admin_update_orgunit: { destructive: false,
    // Moving an org unit under another parent changes which settings and policies everything inside it inherits.
    confirmWhen: (a) => a.parentOrgUnitPath !== undefined,
    verify: (a, b, after) => ['name', 'description'].every((k) => a[k] === undefined || same(after?.[k], a[k])) && (a.parentOrgUnitPath === undefined || normOU(after?.parentOrgUnitPath) === normOU(a.parentOrgUnitPath)),
    describe: (a) => ({ target: a.orgUnitPath, summary: `Change the organizational unit ${a.orgUnitPath}: ${['name', 'description', 'parentOrgUnitPath'].filter((k) => a[k] !== undefined).join(', ') || 'nothing given'}${a.parentOrgUnitPath !== undefined ? ` (moves it under ${a.parentOrgUnitPath}, so everything inside inherits that unit's settings)` : ''}` }),
    before: (a, c) => ouGet(c, orgPath(a.orgUnitPath)).then((o) => pick(o, OU_FIELDS)),
    after: (a, c, details) => ouGet(c, details?.orgUnitId || orgPath(a.orgUnitPath)).then((o) => pick(o, OU_FIELDS)) },

  // ---------- Domains ----------
  admin_add_domain: { destructive: D, verify: (a, b, after) => lower(after?.domainName) === lower(a.domainName),
    describe: (a) => ({ target: a.domainName, summary: `Add the domain ${a.domainName} to this Workspace (it must then be verified before mail works)` }),
    before: (a, { admin }) => absent(() => data(admin.domains.get({ customer: CUSTOMER, domainName: a.domainName })).then((d) => pick(d, ['domainName', 'isPrimary', 'verified']))),
    after: (a, { admin }) => data(admin.domains.get({ customer: CUSTOMER, domainName: a.domainName })).then((d) => pick(d, ['domainName', 'isPrimary', 'verified'])) },
  admin_add_domain_alias: { destructive: D,
    verify: (a, b, after) => lower(after?.domainAliasName) === lower(a.domainAliasName) && lower(after?.parentDomainName) === lower(a.parentDomainName),
    describe: (a) => ({ target: a.domainAliasName, summary: `Add ${a.domainAliasName} as a domain alias of ${a.parentDomainName}: every address on ${a.parentDomainName} also receives mail at the alias` }),
    before: (a, { admin }) => absent(() => data(admin.domainAliases.get({ customer: CUSTOMER, domainAliasName: a.domainAliasName }))),
    after: (a, { admin }) => data(admin.domainAliases.get({ customer: CUSTOMER, domainAliasName: a.domainAliasName })).then((d) => pick(d, ['domainAliasName', 'parentDomainName', 'verified'])) },

  // ---------- Roles ----------
  admin_create_role: { destructive: D,
    verify: (a, b, after) => same(after?.roleName, a.roleName) && sameSet(after?.privileges || [], privs(a.privileges)),
    describe: (a) => ({ target: a.roleName, summary: `Create the admin role "${a.roleName}" with ${list(a.privileges).length} privilege(s): anyone given it gets those admin rights` }),
    before: async (a, { admin }) => ({ rolesWithThatName: ((await data(admin.roles.list({ customer: CUSTOMER, maxResults: 100 }))).items || []).filter((r) => r.roleName === a.roleName).map((r) => r.roleId) }),
    after: async (a, { admin }, details) => (details?.roleId ? roleView(await data(admin.roles.get({ customer: CUSTOMER, roleId: details.roleId }))) : { note: 'Google did not return the new role\'s id.' }) },
  admin_update_role: { destructive: D,
    verify: (a, b, after) => (a.roleName === undefined || same(after?.roleName, a.roleName)) && (a.privileges === undefined || sameSet(after?.privileges || [], privs(a.privileges))),
    describe: (a) => ({ target: a.roleId, summary: `Change the admin role ${a.roleId}${a.roleName ? ` (rename to "${a.roleName}")` : ''}${a.privileges ? `, set its privileges to ${list(a.privileges).length} listed` : ''}: everyone holding it gets the new rights` }),
    before: (a, { admin }) => data(admin.roles.get({ customer: CUSTOMER, roleId: a.roleId })).then(roleView),
    after: (a, { admin }) => data(admin.roles.get({ customer: CUSTOMER, roleId: a.roleId })).then(roleView) },
  admin_create_role_assignment: { destructive: D,
    verify: (a, b, after) => String(after?.roleId) === String(a.roleId) && same(after?.scopeType, a.scopeType || 'CUSTOMER') && (!a.orgUnitId || String(after?.orgUnitId) === String(a.orgUnitId)),
    describe: (a) => ({ target: `${a.roleId} -> ${a.assignedToUserKey}`, summary: `GIVE ${a.assignedToUserKey} the admin role ${a.roleId} (${(a.scopeType || 'CUSTOMER') === 'ORG_UNIT' ? `only for org unit ${a.orgUnitId || '(not given)'}` : 'across the whole Workspace'})` }),
    before: async (a, { admin }) => ({ assignments: ((await data(admin.roleAssignments.list({ customer: CUSTOMER, userKey: a.assignedToUserKey }))).items || []).map((r) => pick(r, ['roleAssignmentId', 'roleId', 'scopeType', 'orgUnitId'])) }),
    after: async (a, { admin }, details) => (details?.roleAssignmentId ? pick(await data(admin.roleAssignments.get({ customer: CUSTOMER, roleAssignmentId: details.roleAssignmentId })), ['roleAssignmentId', 'roleId', 'scopeType', 'orgUnitId']) : { note: 'Google did not return the new assignment\'s id.' }) },

  // ---------- Chrome devices ----------
  admin_update_chrome_device: { destructive: false,
    // Changing the org unit changes which Chrome policies the device follows.
    confirmWhen: (a) => isObj(a.updates) && a.updates.orgUnitPath !== undefined,
    verify: (a, b, after) => covers(after, a.updates),
    describe: (a) => ({ target: a.deviceId, summary: `Update the Chrome device ${a.deviceId}: ${Object.keys(isObj(a.updates) ? a.updates : {}).join(', ') || 'nothing given'}` }),
    before: async (a, { admin }) => pick(await data(admin.chromeosdevices.get({ customerId: CUSTOMER, deviceId: a.deviceId })), ['model', 'status', 'annotatedUser', 'annotatedLocation', 'annotatedAssetId', 'notes', 'orgUnitPath']),
    after: async (a, { admin }) => pick(await data(admin.chromeosdevices.get({ customerId: CUSTOMER, deviceId: a.deviceId })), ['model', 'status', 'annotatedUser', 'annotatedLocation', 'annotatedAssetId', 'notes', 'orgUnitPath']) },
  admin_move_chrome_devices_to_orgunit: { destructive: D,
    verify: (a, b, after) => after?.checked === list(a.deviceIds).length && list(after?.notInTarget).length === 0 && list(after?.unreadable).length === 0,
    describe: (a) => ({ target: a.orgUnitPath, summary: `Move ${list(a.deviceIds).length} Chrome device(s) to ${a.orgUnitPath}: they follow that unit's policies from then on` }),
    before: async (a, { admin }) => ({ count: list(a.deviceIds).length, sample: await Promise.all(list(a.deviceIds).slice(0, 10).map(async (id) => ({ deviceId: id, orgUnitPath: (await data(admin.chromeosdevices.get({ customerId: CUSTOMER, deviceId: id, fields: 'orgUnitPath' })).catch(() => ({}))).orgUnitPath }))) }),
    after: async (a, { admin }) => {
      const notInTarget = []; const unreadable = []; let checked = 0;
      for (const id of list(a.deviceIds)) {
        try { const d = await data(admin.chromeosdevices.get({ customerId: CUSTOMER, deviceId: id, fields: 'orgUnitPath' })); checked++; if (normOU(d.orgUnitPath) !== normOU(a.orgUnitPath)) notInTarget.push({ deviceId: id, orgUnitPath: d.orgUnitPath }); }
        catch { unreadable.push(id); }
      }
      return { checked, notInTarget, unreadable };
    } },

  // ---------- Buildings, features, bookable resources ----------
  admin_create_building: { destructive: false, verify: (a, b, after) => same(after?.buildingName, a.buildingName),
    describe: (a) => ({ target: a.buildingId, summary: `Create the building ${a.buildingId} ("${a.buildingName}")` }),
    before: (a, { admin }) => absent(() => data(admin.resources.buildings.get({ customer: CUSTOMER, buildingId: a.buildingId }))),
    after: (a, { admin }) => data(admin.resources.buildings.get({ customer: CUSTOMER, buildingId: a.buildingId })) },
  admin_update_building: { destructive: false, verify: (a, b, after) => covers(after, a.updates),
    describe: (a) => ({ target: a.buildingId, summary: `Update the building ${a.buildingId}: ${Object.keys(isObj(a.updates) ? a.updates : {}).join(', ') || 'nothing given'}` }),
    before: (a, { admin }) => data(admin.resources.buildings.get({ customer: CUSTOMER, buildingId: a.buildingId })),
    after: (a, { admin }) => data(admin.resources.buildings.get({ customer: CUSTOMER, buildingId: a.buildingId })) },
  admin_create_feature: { destructive: false, verify: (a, b, after) => same(after?.name, a.name),
    describe: (a) => ({ target: a.name, summary: `Create the room feature ${a.name}` }),
    before: (a, { admin }) => absent(() => data(admin.resources.features.get({ customer: CUSTOMER, featureKey: a.name }))),
    after: (a, { admin }) => data(admin.resources.features.get({ customer: CUSTOMER, featureKey: a.name })) },
  admin_create_calendar_resource: { destructive: false,
    verify: (a, b, after) => ['resourceName', 'resourceType', 'capacity', 'buildingId', 'floorName'].every((k) => a[k] === undefined || same(after?.[k], a[k])),
    describe: (a) => ({ target: a.resourceId, summary: `Create the bookable resource ${a.resourceId} ("${a.resourceName}")` }),
    before: (a, { admin }) => absent(() => data(admin.resources.calendars.get({ customer: CUSTOMER, calendarResourceId: a.resourceId })).then((r) => pick(r, RESOURCE_FIELDS))),
    after: (a, { admin }) => data(admin.resources.calendars.get({ customer: CUSTOMER, calendarResourceId: a.resourceId })).then((r) => pick(r, RESOURCE_FIELDS)) },
  admin_update_calendar_resource: { destructive: false, verify: (a, b, after) => covers(after, a.updates),
    describe: (a) => ({ target: a.resourceId, summary: `Update the bookable resource ${a.resourceId}: ${Object.keys(isObj(a.updates) ? a.updates : {}).join(', ') || 'nothing given'}` }),
    before: (a, { admin }) => data(admin.resources.calendars.get({ customer: CUSTOMER, calendarResourceId: a.resourceId })),
    after: (a, { admin }) => data(admin.resources.calendars.get({ customer: CUSTOMER, calendarResourceId: a.resourceId })) },

  // ---------- Custom user fields ----------
  admin_create_schema: { destructive: false,
    verify: (a, b, after) => sameSet(after?.fieldNames || [], list(a.fields).map((f) => f?.fieldName).filter(Boolean)),
    describe: (a) => ({ target: a.schemaName, summary: `Create the custom user field schema ${a.schemaName} with ${list(a.fields).length} field(s)` }),
    before: (a, { admin }) => absent(() => data(admin.schemas.get({ customerId: CUSTOMER, schemaKey: a.schemaName })).then((s) => pick(s, ['schemaName', 'schemaId']))),
    after: (a, { admin }, details) => data(admin.schemas.get({ customerId: CUSTOMER, schemaKey: details?.schemaId || a.schemaName })).then((s) => ({ ...pick(s, ['schemaId', 'schemaName']), fieldNames: list(s.fields).map((f) => f.fieldName) })) },
  admin_update_schema: { destructive: false,
    verify: (a, b, after) => list(a.fields).map((f) => f?.fieldName).filter(Boolean).every((n) => list(after?.fieldNames).includes(n)),
    describe: (a) => ({ target: a.schemaKey, summary: `Replace the field list of the custom user field schema ${a.schemaKey} with ${list(a.fields).length} field(s) (fields left out of the list may be removed with their values; compare with "before")` }),
    before: (a, { admin }) => data(admin.schemas.get({ customerId: CUSTOMER, schemaKey: a.schemaKey })).then((s) => ({ ...pick(s, ['schemaId', 'schemaName']), fieldNames: list(s.fields).map((f) => f.fieldName) })),
    after: (a, { admin }) => data(admin.schemas.get({ customerId: CUSTOMER, schemaKey: a.schemaKey })).then((s) => ({ ...pick(s, ['schemaId', 'schemaName']), fieldNames: list(s.fields).map((f) => f.fieldName) })) },

  // ---------- Account-wide ----------
  admin_update_customer_info: { destructive: D, verify: (a, b, after) => covers(after, a.updates),
    describe: (a) => ({ target: 'customer account', summary: `Change the account-wide customer info: ${Object.keys(isObj(a.updates) ? a.updates : {}).join(', ') || 'nothing given'} (affects the whole Workspace)` }),
    before: (a, { admin }) => data(admin.customers.get({ customerKey: CUSTOMER })).then((c) => pick(c, ['customerDomain', 'postalAddress', 'language', 'alternateEmail', 'phoneNumber'])),
    after: (a, { admin }) => data(admin.customers.get({ customerKey: CUSTOMER })).then((c) => pick(c, ['customerDomain', 'postalAddress', 'language', 'alternateEmail', 'phoneNumber'])) },

  // ---------- Licenses (cost money) ----------
  licensing_assign_license: { destructive: D, verify: (a, b, after) => same(after?.skuId, a.skuId),
    describe: (a) => ({ target: `${a.skuId} for ${a.userId}`, summary: `Assign the license ${a.skuId} to ${a.userId} (this can add to the Workspace bill)` }),
    before: (a, { licensing }) => absent(() => data(licensing.licenseAssignments.get(sku(a))).then((l) => pick(l, ['productId', 'skuId', 'userId']))),
    after: (a, { licensing }) => data(licensing.licenseAssignments.get(sku(a))).then((l) => pick(l, ['productId', 'skuId', 'skuName', 'userId'])) },
  licensing_update_assignment: { destructive: D, verify: (a, b, after) => same(after?.skuId, a.newSkuId),
    describe: (a) => ({ target: `${a.userId}: ${a.skuId} -> ${a.newSkuId}`, summary: `Change the license of ${a.userId} from ${a.skuId} to ${a.newSkuId} (the price can change)` }),
    before: (a, { licensing }) => data(licensing.licenseAssignments.get(sku(a))).then((l) => pick(l, ['productId', 'skuId', 'skuName', 'userId'])),
    after: (a, { licensing }) => data(licensing.licenseAssignments.get({ ...sku(a), skuId: a.newSkuId })).then((l) => pick(l, ['productId', 'skuId', 'skuName', 'userId'])) },

  // ---------- Chrome policy ----------
  // No before(): the only way to read a policy (policies.resolve) is a POST that test/unit/guards.test.js does not recognise as a read.
  chrome_set_policy: { destructive: D,
    verify: (a, b, after) => after?.found === true && covers(after.value, a.policyValue),
    describe: (a) => ({ target: `${a.policySchema} on ${a.orgUnitPath}`, summary: `Push the Chrome policy ${a.policySchema} (${Object.keys(isObj(a.policyValue) ? a.policyValue : {}).join(', ') || 'no settings'}) to the org unit ${a.orgUnitPath}: every browser and device in it follows it` }),
    after: async (a, { chromepolicy }) => {
      const res = await data(chromepolicy.customers.policies.resolve({ customer: 'customers/my_customer', requestBody: { policySchemaFilter: a.policySchema, policyTargetKey: { targetResource: `orgunits/${a.orgUnitPath}` } } }));
      const hit = list(res.resolvedPolicies).find((p) => p?.value?.policySchema === a.policySchema);
      return hit ? { found: true, value: hit.value.value } : { found: false, note: 'Google does not list that policy for the org unit.' };
    } },

  // ---------- Vault ----------
  vault_create_matter: { destructive: false,
    verify: (a, b, after) => same(after?.name, a.name) && (a.description === undefined || same(after?.description, a.description)),
    describe: (a) => ({ target: a.name, summary: `Create the Vault matter "${a.name}"` }),
    after: async (a, { vault }, details) => (details?.matterId ? pick(await data(vault.matters.get({ matterId: details.matterId })), ['matterId', 'name', 'description', 'state']) : { note: 'Google did not return the new matter\'s id.' }) },
  vault_create_hold: { destructive: D,
    verify: (a, b, after) => same(after?.corpus, a.corpus) && same(after?.name, a.name) && list(a.accountEmails).every((e) => list(after?.accounts).map(lower).includes(lower(e))),
    describe: (a) => ({ target: `${a.name} in ${a.matterId}`, summary: `Put a legal hold "${a.name}" on the ${a.corpus} of ${list(a.accountEmails).length} account(s) (${list(a.accountEmails).join(', ')}): nothing they hold can be deleted, even by them` }),
    before: (a, { vault }) => data(vault.matters.get({ matterId: a.matterId })).then((m) => pick(m, ['matterId', 'name', 'state'])),
    after: async (a, { vault }, details) => {
      if (!details?.holdId) return { note: 'Google did not return the new hold\'s id.' };
      const h = await data(vault.matters.holds.get({ matterId: a.matterId, holdId: details.holdId, view: 'FULL_HOLD' }));
      return { ...pick(h, ['holdId', 'name', 'corpus']), accounts: list(h.accounts).map((x) => x.email).filter(Boolean) };
    } },

  // ---------- Compound workflows ----------
  // The old handlers record each step's failure inside the result (or return an error result) instead of throwing, so verify() reads the steps.
  workflow_onboard_employee: { destructive: D,
    verify: (a, b, after, details) => !!details?.user && !list(details?.steps).some((st) => st.status === 'failed') && lower(after?.primaryEmail) === lower(a.primaryEmail) && normOU(after?.orgUnitPath) === normOU(a.orgUnitPath || '/'),
    describe: (a) => ({ target: a.primaryEmail, summary: `ONBOARD ${a.primaryEmail} (${a.firstName} ${a.lastName}): create the account in ${a.orgUnitPath || '/'} with a generated temporary password (shown once in the result)${list(a.groupEmails).length ? `, add to ${list(a.groupEmails).join(', ')}` : ''}${a.licenseSkuId ? `, assign the license ${a.licenseSkuId} (costs money)` : ''}${a.managerEmail ? `, create a Drive folder shared with ${a.managerEmail}` : ''}` }),
    before: (a, c) => absent(() => getUser(a, c, a.primaryEmail, 'primaryEmail,suspended')),
    after: (a, c) => getUser(a, c, a.primaryEmail, 'primaryEmail,orgUnitPath,suspended') },
  workflow_add_domain_and_start_verification: { destructive: D,
    verify: (a, b, after, details) => !!details?.dnsTxtRecordToAdd && lower(after?.domainName) === lower(a.domainName),
    describe: (a) => ({ target: a.domainName, summary: `Add the domain ${a.domainName} to this Workspace and fetch the DNS TXT record that proves you own it` }),
    before: (a, { admin }) => absent(() => data(admin.domains.get({ customer: CUSTOMER, domainName: a.domainName })).then((d) => pick(d, ['domainName', 'isPrimary', 'verified']))),
    after: (a, { admin }) => data(admin.domains.get({ customer: CUSTOMER, domainName: a.domainName })).then((d) => pick(d, ['domainName', 'isPrimary', 'verified'])) },

  // ---------- This server's own settings (read from the database, not Google) ----------
  workspace_set_default_account: { destructive: false, verify: (a, b, after) => after?.defaultAccount === lower(a.email),
    describe: (a) => ({ target: a.email, summary: `Make ${a.email} the default Google account (used by older connections that never picked one)` }),
    before: async () => { const { listGoogleAccounts } = await import('../db.js'); return { defaultAccount: (await listGoogleAccounts()).find((x) => x.is_default)?.email || null }; },
    after: async () => { const { listGoogleAccounts } = await import('../db.js'); return { defaultAccount: (await listGoogleAccounts()).find((x) => x.is_default)?.email || null }; } },
  workspace_set_allowed_domains: { destructive: D,
    verify: (a, b, after) => { const wanted = normalizeDomains(a.domains || []); return sameSet(list(after?.allowedDomains), wanted.length ? wanted : [domainOfEmail(a.email)]); },
    describe: (a) => {
      markGuarded(a); // the handler would also write its own change-log row; the wrapper's row is the one that stays
      let wanted;
      try { wanted = normalizeDomains(a.domains || []); } catch (err) { wanted = `not valid (${err.message})`; }
      return { target: lower(a.email), summary: `Change the domains the connections of ${lower(a.email)} may manage with the admin tools to ${Array.isArray(wanted) ? (wanted.length ? wanted.join(', ') : 'its own domain only') : wanted}` };
    },
    before: async (a) => { const { getAllowedDomains } = await import('../db.js'); return { allowedDomains: await getAllowedDomains(lower(a.email)) }; },
    after: async (a) => { const { getAllowedDomains } = await import('../db.js'); return { allowedDomains: await getAllowedDomains(lower(a.email)) }; } },
  workspace_revoke_connection: { destructive: D,
    // The handler answers a short, unknown or ambiguous prefix with a plain sentence instead of revoking anything; that is not "confirmed".
    verify: (a, b, after, details) => typeof details === 'object' && details?.revoked > 0 && list(after?.connections).length > 0 && list(after.connections).every((c) => !!c.revoked_at),
    describe: (a) => ({ target: `${String(a.tokenPrefix || '').slice(0, 8)}...`, summary: `Switch off the Claude connection starting ${String(a.tokenPrefix || '').slice(0, 8)}: it stops working at once and cannot renew itself` }),
    before: async (a) => ({ connections: await matchingConnections(a.tokenPrefix) }),
    after: async (a) => ({ connections: await matchingConnections(a.tokenPrefix) }) }
};
