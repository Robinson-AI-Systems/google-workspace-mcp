import { ok, errorResult } from './util.js';
import { delegatedGmail, delegationReady } from './delegated.js';

// Compound tools: each one does the multi-step job a human admin would do by
// clicking through several admin console screens, in a single call.

export const tools = [
  {
    name: 'workflow_onboard_employee',
    description: 'Full new-hire setup in one call: creates the account, sets org unit, adds them to groups, assigns a license, creates their personal Drive folder shared with their manager, and (optionally) emails them their login info.',
    inputSchema: {
      type: 'object',
      properties: {
        primaryEmail: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        orgUnitPath: { type: 'string', default: '/' },
        groupEmails: { type: 'array', items: { type: 'string' } },
        licenseSkuId: { type: 'string', description: 'omit to skip license assignment' },
        managerEmail: { type: 'string', description: 'if set, a personal Drive folder is created and shared with this manager' },
        sendWelcomeEmail: { type: 'boolean', default: false, description: 'sends a welcome email FROM the admin account (requires managerEmail or a separate "to" not needed here — email goes to primaryEmail)' }
      },
      required: ['primaryEmail', 'firstName', 'lastName']
    }
  },
  {
    name: 'workflow_offboard_employee',
    description: "Full departure checklist in one call: suspends the account, signs them out of every session, revokes all OAuth app grants and app-specific passwords, removes their send-as aliases, sets an out-of-office auto-reply, transfers their Drive files to their manager, removes them from all groups, and (optionally) schedules deletion.",
    inputSchema: {
      type: 'object',
      properties: {
        userKey: { type: 'string' },
        transferDriveAndCalendarTo: { type: 'string', description: 'email of the person who should inherit their files/calendar' },
        outOfOfficeMessage: { type: 'string', default: 'This person is no longer with the company.' },
        removeSendAsAliases: { type: 'boolean', default: true, description: 'remove the "send mail as" addresses (role addresses such as support@) from the mailbox; the primary address stays' },
        deleteAccount: { type: 'boolean', default: false, description: 'if true, permanently deletes the account after the other steps' }
      },
      required: ['userKey']
    }
  },
  {
    name: 'workflow_add_domain_and_start_verification',
    description: 'Adds a new domain to your Workspace account and gets the DNS TXT record you need to add to prove you own it. After you add that DNS record, call domain_confirm_verification to finish.',
    inputSchema: { type: 'object', properties: { domainName: { type: 'string' } }, required: ['domainName'] }
  },
  {
    name: 'workflow_audit_external_sharing',
    description: "Scans recent Drive files for anything shared outside your domain or publicly on the web — the thing you'd otherwise have to dig for in the admin console's sharing reports.",
    inputSchema: { type: 'object', properties: { maxFilesToScan: { type: 'number', default: 100 } } }
  },
  {
    name: 'workflow_security_snapshot',
    description: 'One-shot security overview: how many users have 2-Step Verification off, who has super admin, recent suspicious-login alerts, and any third-party apps with broad access.',
    inputSchema: { type: 'object', properties: {} }
  }
];

/** The primary email address for a user key that may be an address, alias or ID. */
const mailboxOf = async (admin, userKey) => (String(userKey).includes('@') ? String(userKey).trim().toLowerCase() : (await admin.users.get({ userKey, fields: 'primaryEmail' })).data.primaryEmail);

export const handlers = {
  workflow_onboard_employee: async (args, clients) => {
    const { admin, drive, licensing } = clients;
    const steps = [];
    try {
      const password = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!7';
      const created = await admin.users.insert({
        requestBody: {
          primaryEmail: args.primaryEmail,
          name: { givenName: args.firstName, familyName: args.lastName },
          password,
          orgUnitPath: args.orgUnitPath || '/',
          changePasswordAtNextLogin: true
        }
      });
      steps.push({ step: 'create_user', status: 'ok', temporaryPassword: password });

      for (const groupEmail of args.groupEmails || []) {
        try {
          await admin.members.insert({ groupKey: groupEmail, requestBody: { email: args.primaryEmail, role: 'MEMBER' } });
          steps.push({ step: `add_to_group:${groupEmail}`, status: 'ok' });
        } catch (err) {
          steps.push({ step: `add_to_group:${groupEmail}`, status: 'failed', error: err.message });
        }
      }

      if (args.licenseSkuId) {
        try {
          await licensing.licenseAssignments.insert({ productId: 'Google-Apps', skuId: args.licenseSkuId, requestBody: { userId: args.primaryEmail } });
          steps.push({ step: 'assign_license', status: 'ok' });
        } catch (err) {
          steps.push({ step: 'assign_license', status: 'failed', error: err.message });
        }
      }

      if (args.managerEmail) {
        try {
          const folder = await drive.files.create({ requestBody: { name: `${args.firstName} ${args.lastName} - Onboarding` } });
          await drive.permissions.create({ fileId: folder.data.id, sendNotificationEmail: true, requestBody: { type: 'user', role: 'writer', emailAddress: args.managerEmail } });
          await drive.permissions.create({ fileId: folder.data.id, sendNotificationEmail: false, requestBody: { type: 'user', role: 'writer', emailAddress: args.primaryEmail } });
          steps.push({ step: 'create_shared_folder', status: 'ok', folderId: folder.data.id });
        } catch (err) {
          steps.push({ step: 'create_shared_folder', status: 'failed', error: err.message });
        }
      }

      return ok({ user: created.data.primaryEmail, steps });
    } catch (err) {
      return errorResult(err);
    }
  },

  workflow_offboard_employee: async (args, clients) => {
    const { admin, gmail, datatransfer } = clients;
    const steps = [];

    // Mailbox steps come first because a suspended mailbox cannot be opened: put up the out-of-office reply, and remove
    // the "send mail as" addresses so the mailbox can no longer send as the company's role addresses (the primary stays).
    const ready = delegationReady(clients);
    if (!ready) {
      steps.push({ step: 'set_out_of_office', status: 'skipped', note: 'Domain-wide delegation is not set up, so the mailbox could not be opened. See DEPLOY.md Part 5.' });
    } else {
      try {
        const email = await mailboxOf(admin, args.userKey);
        const g = delegatedGmail(clients, email);
        const message = args.outOfOfficeMessage || 'This person is no longer with the company.';
        await g.users.settings.updateVacation({ userId: 'me', requestBody: { enableAutoReply: true, responseSubject: 'No longer with the company', responseBodyPlainText: message, restrictToContacts: false, restrictToDomain: false } });
        const back = (await g.users.settings.getVacation({ userId: 'me' })).data;
        steps.push({ step: 'set_out_of_office', status: back.enableAutoReply === true ? 'ok' : 'failed', ...(back.enableAutoReply === true ? {} : { error: 'Google does not show the auto-reply as on afterwards.' }) });
      } catch (err) { steps.push({ step: 'set_out_of_office', status: 'failed', error: err.message }); }
    }
    if (args.removeSendAsAliases !== false) {
      if (!ready) {
        steps.push({ step: 'remove_send_as_aliases', status: 'skipped', note: 'Domain-wide delegation is not set up, so the mailbox could not be opened. See DEPLOY.md Part 5.' });
      } else {
        try {
          const g = delegatedGmail(clients, await mailboxOf(admin, args.userKey));
          const aliases = ((await g.users.settings.sendAs.list({ userId: 'me' })).data.sendAs || []).filter((x) => !x.isPrimary);
          for (const a of aliases) await g.users.settings.sendAs.delete({ userId: 'me', sendAsEmail: a.sendAsEmail });
          steps.push({ step: 'remove_send_as_aliases', status: 'ok', count: aliases.length, removed: aliases.map((a) => a.sendAsEmail) });
        } catch (err) { steps.push({ step: 'remove_send_as_aliases', status: 'failed', error: err.message }); }
      }
    }

    try {
      await admin.users.update({ userKey: args.userKey, requestBody: { suspended: true } });
      steps.push({ step: 'suspend', status: 'ok' });
    } catch (err) { steps.push({ step: 'suspend', status: 'failed', error: err.message }); }

    try {
      await admin.users.signOut({ userKey: args.userKey });
      steps.push({ step: 'sign_out_everywhere', status: 'ok' });
    } catch (err) { steps.push({ step: 'sign_out_everywhere', status: 'failed', error: err.message }); }

    try {
      const tokens = await admin.tokens.list({ userKey: args.userKey });
      for (const t of tokens.data.items || []) {
        await admin.tokens.delete({ userKey: args.userKey, clientId: t.clientId });
      }
      steps.push({ step: 'revoke_oauth_tokens', status: 'ok', count: (tokens.data.items || []).length });
    } catch (err) { steps.push({ step: 'revoke_oauth_tokens', status: 'failed', error: err.message }); }

    try {
      const asps = await admin.asps.list({ userKey: args.userKey });
      for (const a of asps.data.items || []) {
        await admin.asps.delete({ userKey: args.userKey, codeId: a.codeId });
      }
      steps.push({ step: 'revoke_app_passwords', status: 'ok', count: (asps.data.items || []).length });
    } catch (err) { steps.push({ step: 'revoke_app_passwords', status: 'failed', error: err.message }); }

    if (args.transferDriveAndCalendarTo) {
      try {
        const appsList = await datatransfer.applications.list({ customerId: 'my_customer' });
        const apps = (appsList.data.applications || []).filter(a => ['Drive and Docs', 'Calendar'].includes(a.name));
        const transfer = await datatransfer.transfers.insert({
          requestBody: { oldOwnerUserId: args.userKey, newOwnerUserId: args.transferDriveAndCalendarTo, applicationDataTransfers: apps.map(a => ({ applicationId: a.id })) }
        });
        steps.push({ step: 'transfer_drive_and_calendar', status: 'ok', transferId: transfer.data.id });
      } catch (err) { steps.push({ step: 'transfer_drive_and_calendar', status: 'failed', error: err.message }); }
    }

    try {
      const groups = await admin.groups.list({ userKey: args.userKey, customer: 'my_customer' });
      for (const g of groups.data.groups || []) {
        await admin.members.delete({ groupKey: g.email, memberKey: args.userKey });
      }
      steps.push({ step: 'remove_from_groups', status: 'ok', count: (groups.data.groups || []).length });
    } catch (err) { steps.push({ step: 'remove_from_groups', status: 'failed', error: err.message }); }

    if (args.deleteAccount) {
      try {
        await admin.users.delete({ userKey: args.userKey });
        steps.push({ step: 'delete_account', status: 'ok' });
      } catch (err) { steps.push({ step: 'delete_account', status: 'failed', error: err.message }); }
    }

    return ok({ userKey: args.userKey, steps });
  },

  workflow_add_domain_and_start_verification: async (args, clients) => {
    const { admin, siteVerification } = clients;
    try {
      const domain = await admin.domains.insert({ customer: 'my_customer', requestBody: { domainName: args.domainName } });
      const token = await siteVerification.webResource.getToken({ requestBody: { site: { type: 'INET_DOMAIN', identifier: args.domainName }, verificationMethod: 'DNS_TXT' } });
      return ok({
        domain: domain.data,
        nextStep: `Add this as a TXT record on ${args.domainName}'s DNS, then call domain_confirm_verification once it's live (DNS changes can take a few minutes to a few hours to propagate).`,
        dnsTxtRecordToAdd: token.data.token
      });
    } catch (err) {
      return errorResult(err);
    }
  },

  workflow_audit_external_sharing: async (args, { drive }) => {
    const res = await drive.files.list({ pageSize: args.maxFilesToScan || 100, fields: 'files(id, name, webViewLink, permissions)', orderBy: 'modifiedTime desc' });
    const risky = [];
    for (const file of res.data.files || []) {
      const perms = await drive.permissions.list({ fileId: file.id, fields: 'permissions(type, role, emailAddress, domain)' }).catch(() => ({ data: { permissions: [] } }));
      const external = (perms.data.permissions || []).filter(p => p.type === 'anyone' || (p.type === 'domain' && p.domain && !p.domain.endsWith(process.env.GWS_PRIMARY_DOMAIN || '')));
      if (external.length > 0) {
        risky.push({ fileId: file.id, name: file.name, link: file.webViewLink, exposedTo: external });
      }
    }
    return ok({ scanned: (res.data.files || []).length, filesWithExternalOrPublicSharing: risky });
  },

  workflow_security_snapshot: async (_args, { admin, alertcenter }) => {
    const users = await admin.users.list({ customer: 'my_customer', maxResults: 500, fields: 'users(primaryEmail,isEnrolledIn2Sv,isEnforcedIn2Sv,isAdmin,suspended)' });
    const allUsers = users.data.users || [];
    const without2sv = allUsers.filter(u => !u.isEnrolledIn2Sv && !u.suspended).map(u => u.primaryEmail);
    const admins = allUsers.filter(u => u.isAdmin).map(u => u.primaryEmail);

    let alerts = [];
    try {
      const alertRes = await alertcenter.alerts.list({ pageSize: 10 });
      alerts = alertRes.data.alerts || [];
    } catch {
      // Alert Center may be unavailable depending on edition; not fatal.
    }

    return ok({
      totalUsers: allUsers.length,
      usersWithout2StepVerification: without2sv,
      superAdmins: admins,
      recentAlerts: alerts.map(a => ({ type: a.type, createTime: a.createTime, source: a.source }))
    });
  }
};
