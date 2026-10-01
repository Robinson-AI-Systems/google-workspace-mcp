// workflow_add_staff_member: one sentence adds a person to a business the way Chris does it by hand.
// Creates the account, adds role addresses, shares the business calendar and Drive folder at the level
// the job needs, brands the mailbox, and (only if asked, and only after confirm) emails login details.
// Every step looks first and changes only what is missing, so a second run changes nothing.
import { ok } from './util.js';
import { defineWrite } from './write.js';
import { handlers as brandHandlers, brandingMatches } from './mailbox-branding.js';
import { BUSINESSES, ROLES } from '../businesses.js';
import { domainOfEmail } from '../domains.js';
import { norm, tempPassword, runStep, getUser, listAliases, ensureAliases, calendarRole, ensureCalendarAccess, drivePermission, ensureDriveAccess, sendPlainEmail, reasonOf } from './provision.js';

const name = 'workflow_add_staff_member';

function check(args) {
  const biz = BUSINESSES[args.business];
  if (!biz) return `Unknown business "${args.business}". Use one of: ${Object.keys(BUSINESSES).join(', ')}.`;
  const role = ROLES[args.role];
  if (!role) return `Unknown role "${args.role}". Use one of: ${Object.keys(ROLES).join(', ')}.`;
  if (domainOfEmail(args.email) !== biz.domain) return `${args.email} is not a ${biz.domain} address, so it cannot be added to ${biz.label}. Nothing was changed.`;
  const strays = (args.aliases || []).filter((a) => domainOfEmail(a) !== biz.domain);
  if (strays.length) return `These aliases are not ${biz.domain} addresses: ${strays.join(', ')}. Nothing was changed.`;
  if (args.sendWelcome === true && !args.personalEmail) return 'sendWelcome needs personalEmail (where to send the welcome note; a brand-new work mailbox cannot be read yet). Nothing was changed.';
  return null;
}

/** What Google holds now about this person in this business. */
async function inspect(args, clients) {
  const biz = BUSINESSES[args.business];
  const email = norm(args.email);
  const user = await getUser(clients.admin, email);
  const out = { accountExists: !!user, orgUnitPath: user?.orgUnitPath, suspended: user?.suspended, enrolledIn2Sv: user?.isEnrolledIn2Sv, enforcedIn2Sv: user?.isEnforcedIn2Sv, aliases: [] };
  if (user) out.aliases = await listAliases(clients.admin, email);
  if (biz.calendarId) { try { out.calendarRole = (await calendarRole(clients.calendar, biz.calendarId, email))?.role || null; } catch (err) { out.calendarRole = { unreadable: reasonOf(err) }; } }
  if (biz.driveFolderId) { try { out.driveRole = (await drivePermission(clients.drive, biz.driveFolderId, email))?.role || null; } catch (err) { out.driveRole = { unreadable: reasonOf(err) }; } }
  return out;
}

function summarize(args) {
  const biz = BUSINESSES[args.business];
  const role = ROLES[args.role];
  const parts = [`create the account ${norm(args.email)} (one-time password, must change it at first sign-in) unless it already exists`];
  if ((args.aliases || []).length) parts.push(`add the address(es) ${args.aliases.map(norm).join(', ')}`);
  parts.push(biz.calendarId ? `share "${biz.calendarName}" as ${role.calendar === 'owner' ? 'owner (make changes and manage sharing)' : 'editor (see and edit events)'}` : 'skip the calendar (none is set up for this business)');
  parts.push(!role.drive ? `give no Drive folder access (${args.role}s do not need it)` : biz.driveFolderId ? `share the "${biz.driveFolderName}" folder as ${role.drive === 'writer' ? 'editor' : 'viewer'}` : 'skip the Drive folder (none is set up for this business)');
  parts.push(args.signatureHtml || args.displayName ? 'brand the mailbox (name, signature, role addresses)' : 'leave the mailbox unbranded (no name or signature given)');
  parts.push('report their 2-Step Verification status (it can only be required per organizational unit, in Admin console > Security)');
  if (args.emailLoginDetailsTo) parts.push(`EMAIL the login details to ${args.emailLoginDetailsTo}`);
  if (args.sendWelcome === true) parts.push(`EMAIL a welcome note with the login details to ${args.personalEmail}`);
  return `Add ${args.firstName} ${args.lastName} (${norm(args.email)}) to ${biz.label} as ${args.role} (${role.blurb}): ${parts.join('; ')}.`;
}

const built = defineWrite({
  name,
  description: "Add a person to one of Chris's businesses in one call: creates their Google account in the right place with a one-time password, adds any extra addresses, shares the business calendar and Drive folder at the level their job needs (driver/technician: see and edit the calendar, NO Drive folder access; office/admin: manage the calendar, edit the folder), brands their mailbox, and reports their 2-Step Verification status (Google only lets 2-Step be required for a whole organizational unit, in Admin console > Security, so this tool cannot switch it on for one person). Safe to run twice. Nobody is emailed unless you ask: emailLoginDetailsTo sends the login to that address, sendWelcome sends it to the person's personalEmail; both need confirm: true. The one-time password is shown once in the result and never stored in the change log.",
  inputSchema: {
    type: 'object',
    properties: {
      email: { type: 'string', description: 'Their new work address, e.g. sam@robinsonappliancerentals.com. Must be on the business domain.' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      business: { type: 'string', enum: Object.keys(BUSINESSES) },
      role: { type: 'string', enum: Object.keys(ROLES) },
      phone: { type: 'string', description: 'Optional work phone' },
      aliases: { type: 'array', items: { type: 'string' }, description: 'Optional extra addresses on the same domain, e.g. dispatch@...' },
      orgUnitPath: { type: 'string', description: "Optional organizational unit, e.g. /Drivers. Default: the top level '/'." },
      displayName: { type: 'string', description: 'Sender name for their email. Default: first and last name.' },
      signatureHtml: { type: 'string', description: 'HTML signature for their email. Without it the mailbox is left unbranded.' },
      emailLoginDetailsTo: { type: 'string', description: 'Optional: email the login details to this address (for example Chris). Needs confirm: true.' },
      sendWelcome: { type: 'boolean', description: "Optional: email the login details to the person's personalEmail. Needs confirm: true." },
      personalEmail: { type: 'string', description: 'Where a welcome note goes (required with sendWelcome).' },
      confirm: { type: 'boolean', description: 'Needed only when an email is going out (emailLoginDetailsTo or sendWelcome).' }
    },
    required: ['email', 'firstName', 'lastName', 'business', 'role']
  },
  confirmWhen: (a) => a.sendWelcome === true || !!a.emailLoginDetailsTo,
  plan: (args, clients) => ({ summary: summarize(args), target: norm(args.email), readBefore: () => inspect(args, clients) }),
  async apply(args, clients) {
    const { admin, calendar, drive } = clients;
    const biz = BUSINESSES[args.business];
    const role = ROLES[args.role];
    const email = norm(args.email);
    const steps = [];
    let password = null;

    await runStep(steps, 'create_account', async () => {
      if (await getUser(admin, email)) return { changed: false, note: 'The account already exists; its password was not touched.' };
      password = tempPassword();
      await admin.users.insert({ requestBody: {
        primaryEmail: email, name: { givenName: args.firstName, familyName: args.lastName }, password, changePasswordAtNextLogin: true,
        orgUnitPath: args.orgUnitPath || '/', ...(args.phone ? { phones: [{ value: args.phone, type: 'work' }] } : {})
      } });
      return { changed: true, orgUnitPath: args.orgUnitPath || '/' };
    });
    const created = steps[0].status === 'ok';
    const accountReady = steps[0].status !== 'failed';

    await runStep(steps, 'add_aliases', async () => {
      if (!(args.aliases || []).length) return { skipped: 'No extra addresses asked for.' };
      if (!accountReady) return { skipped: 'The account does not exist, so nothing to attach them to.' };
      return ensureAliases(admin, email, args.aliases);
    });

    await runStep(steps, 'share_calendar', async () => {
      if (!biz.calendarId) return { skipped: `${biz.label} has no business calendar set up.` };
      if (!accountReady) return { skipped: 'The account does not exist.' };
      return { calendar: biz.calendarName, ...(await ensureCalendarAccess(calendar, biz.calendarId, email, role.calendar)) };
    });

    await runStep(steps, 'share_drive_folder', async () => {
      if (!role.drive) {
        if (biz.driveFolderId && accountReady) {
          const existing = await drivePermission(drive, biz.driveFolderId, email);
          if (existing) throw new Error(`${email} already has direct Drive access to "${biz.driveFolderName}" (${existing.role}), which a ${args.role} should not have. Nothing was removed: take it off in Drive, or with drive_remove_permission.`);
        }
        return { skipped: `A ${args.role} gets no Drive folder access.` };
      }
      if (!biz.driveFolderId) return { skipped: `${biz.label} has no business Drive folder set up.` };
      if (!accountReady) return { skipped: 'The account does not exist.' };
      return { folder: biz.driveFolderName, ...(await ensureDriveAccess(drive, biz.driveFolderId, email, role.drive)) };
    });

    await runStep(steps, 'brand_mailbox', async () => {
      if (!args.signatureHtml && !args.displayName) return { skipped: 'No name or signature given, so the mailbox was left unbranded.' };
      if (!accountReady) return { skipped: 'The account does not exist.' };
      const brand = clients.brandMailbox || brandHandlers.workflow_brand_mailbox;
      const wantName = args.displayName || `${args.firstName} ${args.lastName}`;
      if (await brandingMatches(clients, { email, displayName: wantName, signatureHtml: args.signatureHtml, aliases: args.aliases || [] })) return { changed: false, note: 'The mailbox already shows this name and signature; left as it is.' };
      const res = JSON.parse((await brand({ userEmail: email, displayName: wantName, signatureHtml: args.signatureHtml, aliases: (args.aliases || []).map((a) => ({ email: a })) }, clients)).content[0].text);
      if (res.done !== true) throw new Error(`${res.reason || 'Branding did not complete.'} A brand-new mailbox can take a few minutes to appear: run workflow_brand_mailbox for them shortly.`);
      return { changed: true, primary: res.primary, aliases: res.aliases };
    });

    await runStep(steps, 'check_2sv', async () => {
      if (!accountReady) return { skipped: 'The account does not exist.' };
      const u = await getUser(admin, email);
      return { changed: false, enrolled: u?.isEnrolledIn2Sv === true, requiredByPolicy: u?.isEnforcedIn2Sv === true, note: u?.isEnforcedIn2Sv === true ? '2-Step Verification is required for them.' : '2-Step Verification is NOT required for them yet. Google only lets you require it for a whole organizational unit: Admin console > Security > 2-step verification, then pick their organizational unit.' };
    });

    if (args.emailLoginDetailsTo || args.sendWelcome === true) {
      const text = (to) => `Login for ${args.firstName} ${args.lastName}\r\n\r\nAddress: ${email}\r\nOne-time password: ${password}\r\n\r\nSign in at https://mail.google.com. You will be asked to choose a new password and set up 2-Step Verification.`;
      const send = async (stepName, to) => runStep(steps, stepName, async () => {
        if (!password) return { skipped: created ? 'No password to send.' : 'The account already existed, so there is no new password to send.' };
        const r = await sendPlainEmail(clients.gmail, { to, subject: `Your new ${biz.label} account`, text: text(to) });
        return { changed: true, to, messageId: r.id };
      });
      if (args.emailLoginDetailsTo) await send('email_login_details', args.emailLoginDetailsTo);
      if (args.sendWelcome === true) await send('send_welcome', args.personalEmail);
    }

    const failed = steps.filter((s) => s.status === 'failed');
    return ok({
      user: email, steps,
      ...(password ? { temporaryPassword: password, passwordNote: 'Shown once. Give it to the person securely; they must change it at first sign-in.' } : {}),
      ...(steps.some((x) => x.status === 'skipped' && x.step !== 'add_aliases') ? { skipped: steps.filter((x) => x.status === 'skipped').map((x) => ({ step: x.step, why: x.note })) } : {}),
      ...(failed.length ? { warning: `${failed.length} step(s) failed: ${failed.map((s) => s.step).join(', ')}. Run it again once fixed: finished steps are not repeated.` } : {})
    });
  },
  readAfter: (args, clients) => inspect(args, clients),
  verify(args, _before, after, details) {
    const biz = BUSINESSES[args.business];
    const role = ROLES[args.role];
    if (!after.accountExists) return false;
    if ((details?.steps || []).some((x) => x.status === 'failed')) return false; // a step that failed is not "confirmed"
    if (biz.driveFolderId && !role.drive && after.driveRole) return false;
    if (!(args.aliases || []).map(norm).every((a) => after.aliases.includes(a))) return false;
    if (biz.calendarId && after.calendarRole !== role.calendar) return false;
    if (biz.driveFolderId && role.drive && after.driveRole !== role.drive) return false;
    return true;
  }
});

export const tools = [built.tool];
export const handlers = {
  [name]: async (args = {}, clients) => {
    const problem = check(args);
    if (problem) return ok({ done: false, refused: problem });
    return built.handler(args, clients);
  }
};
