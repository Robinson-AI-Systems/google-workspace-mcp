// workflow_set_up_business: the one-sentence version of everything done by hand for Appliance Rentals.
// Domain, organizational unit, owner account, role addresses (support@, billing@, ...), Gmail labels and
// filters, a business calendar, the standard Drive folder set, mailbox branding, and an email health check.
// Every step looks first and changes only what is missing, so running it twice changes nothing the second time.
import { ok } from './util.js';
import { defineWrite, isNotFound } from './write.js';
import { handlers as brandHandlers, ensureLabels } from './mailbox-branding.js';
import { emailHealth } from './email-health.js';
import { validZone } from './ops.js';
import { STANDARD_FOLDERS } from '../businesses.js';
import { domainOfEmail } from '../domains.js';
import { norm, tempPassword, runStep, getUser, listAliases, ensureAliases, ensureCalendarAccess, ensureDriveAccess, ensureFolder, reasonOf } from './provision.js';

const name = 'workflow_set_up_business';
const CUSTOMER = 'my_customer';
const NO_INBOUND = /^(no-?reply|noreply|donotreply)$/i; // nobody writes to these, so they get no label

const clean = (args) => {
  const domain = norm(args.domain).replace(/^@/, '');
  const aliasNames = [...new Set((args.roleAliases || []).map((a) => norm(a).split('@')[0]).filter(Boolean))];
  return { domain, businessName: String(args.businessName || '').trim(), owner: norm(args.ownerEmail), aliasNames, aliasEmails: aliasNames.map((a) => `${a}@${domain}`), ouName: String(args.businessName || '').replace(/[\\/]/g, ' ').trim() };
};

function check(args) {
  const c = clean(args);
  if (!c.businessName) return 'businessName is required.';
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(c.domain)) return `"${args.domain}" does not look like a domain name (for example mybusiness.com).`;
  if (domainOfEmail(c.owner) !== c.domain) return `${args.ownerEmail} is not a ${c.domain} address. The owner's account must be on the new domain. Nothing was changed.`;
  const strays = (args.roleAliases || []).filter((a) => String(a).includes('@') && domainOfEmail(a) !== c.domain);
  if (strays.length) return `These role addresses are not on ${c.domain}: ${strays.join(', ')}. Give just the name part (support) or a ${c.domain} address. Nothing was changed.`;
  if (!validZone(args.timeZone)) return `"${args.timeZone}" is not a time zone name I recognise. Use an IANA name like America/Denver, America/New_York or Europe/London.`;
  return null;
}

async function find(fn) { try { return (await fn()).data || null; } catch (err) { if (isNotFound(err)) return null; throw err; } }

/** What exists now. Read-only. */
async function inspect(args, clients) {
  const c = clean(args);
  const { admin, calendar, drive } = clients;
  const out = {};
  const dom = await find(() => admin.domains.get({ customer: CUSTOMER, domainName: c.domain }));
  out.domain = dom && dom.domainName ? { exists: true, verified: dom.verified === true } : { exists: false, verified: false };
  const ou = await find(() => admin.orgunits.get({ customerId: CUSTOMER, orgUnitPath: c.ouName }));
  out.orgUnit = { exists: !!(ou && (ou.orgUnitPath || ou.name)), path: `/${c.ouName}` };
  const user = await getUser(admin, c.owner);
  out.owner = { exists: !!user, orgUnitPath: user?.orgUnitPath, aliases: user ? await listAliases(admin, c.owner) : [] };
  const summary = args.calendarName || `${c.businessName} Calendar`;
  const cal = ((await calendar.calendarList.list({})).data.items || []).find((x) => x.summary === summary);
  out.calendar = { exists: !!cal, name: summary, id: cal?.id, timeZone: cal?.timeZone };
  const root = (await drive.files.list({ q: `name = '${c.businessName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`, fields: 'files(id,name)', supportsAllDrives: true, includeItemsFromAllDrives: true })).data.files || [];
  out.driveFolder = { exists: root.length > 0, id: root[0]?.id };
  return out;
}

function summarize(args) {
  const c = clean(args);
  const folders = args.folders?.length ? args.folders : STANDARD_FOLDERS;
  return `Set up ${c.businessName} on ${c.domain}: make sure the domain is on your Workspace and verified (if not, add it and give you the DNS record, then STOP until it is verified); create the organizational unit /${c.ouName}; create or move ${c.owner} into it; add ${c.aliasEmails.length ? c.aliasEmails.join(', ') : 'no role addresses'}; Gmail labels and filters for the inbound ones; a "${args.calendarName || `${c.businessName} Calendar`}" calendar in ${args.timeZone} shared with the owner; a "${c.businessName}" Drive folder with ${folders.length} standard subfolders shared with the owner; ${args.brand ? 'brand the owner mailbox' : 'no mailbox branding (none given)'}; then check the domain's email health.`;
}

const built = defineWrite({
  name,
  description: "Set up a whole new business in one call: puts its domain on your Workspace (or tells you the DNS record to add to prove you own it, and stops until that is done), creates its organizational unit, creates or moves the owner's account into it, adds role addresses such as support@ and billing@ with their Gmail labels and filters, creates a business calendar in the right time zone, creates the standard Drive folder set, brands the owner's mailbox, and finishes with an email health check. Safe to run twice: it only does what is missing. A new domain is outside what a connection normally manages, so the call needs crossDomain: true. It also needs confirm: true because it adds a domain and a paid account. Use dryRun: true first to see the full plan.",
  inputSchema: {
    type: 'object',
    properties: {
      businessName: { type: 'string', description: 'e.g. Evergreen Hauling' },
      domain: { type: 'string', description: 'e.g. evergreenhauling.com' },
      ownerEmail: { type: 'string', description: "The owner's work address on that domain, e.g. ops@evergreenhauling.com" },
      roleAliases: { type: 'array', items: { type: 'string' }, description: "Role addresses to add to the owner, e.g. ['support','billing','leads','no-reply']" },
      timeZone: { type: 'string', description: 'IANA name, e.g. America/Denver' },
      calendarName: { type: 'string', description: 'Optional. Default: "<businessName> Calendar".' },
      folders: { type: 'array', items: { type: 'string' }, description: 'Optional. Replace the standard folder set (01 Brand Kit ... 09 Taxes & Accounting Exports).' },
      brand: {
        type: 'object', description: "Optional mailbox branding for the owner: { displayName, signatureHtml, avatarBase64Url }",
        properties: { displayName: { type: 'string' }, signatureHtml: { type: 'string' }, avatarBase64Url: { type: 'string' } }
      },
      confirm: { type: 'boolean', description: 'Must be true to go ahead (ask the person first).' }
    },
    required: ['businessName', 'domain', 'ownerEmail', 'timeZone']
  },
  confirmWhen: () => true,
  plan: (args, clients) => ({ summary: summarize(args), target: clean(args).domain, readBefore: () => inspect(args, clients) }),
  async apply(args, clients) {
    const c = clean(args);
    const { admin, calendar, drive } = clients;
    const steps = [];
    let password = null;
    let blocked = null;

    await runStep(steps, 'domain', async () => {
      const dom = await find(() => admin.domains.get({ customer: CUSTOMER, domainName: c.domain }));
      const exists = !!(dom && dom.domainName);
      if (exists && dom.verified === true) return { changed: false, verified: true };
      if (!exists) await admin.domains.insert({ customer: CUSTOMER, requestBody: { domainName: c.domain } });
      const token = await clients.siteVerification.webResource.getToken({ requestBody: { site: { type: 'INET_DOMAIN', identifier: c.domain }, verificationMethod: 'DNS_TXT' } });
      blocked = `${c.domain} is not verified yet. Add the DNS TXT record below, wait for it to take effect, then confirm with domain_confirm_verification and run this again.`;
      return { changed: !exists, verified: false, dnsTxtRecordToAdd: token.data?.token, note: blocked };
    });
    const stop = () => blocked ? { skipped: 'Waiting for the domain to be verified (see the domain step).' } : null;

    await runStep(steps, 'org_unit', async () => {
      if (stop()) return stop();
      const existing = await find(() => admin.orgunits.get({ customerId: CUSTOMER, orgUnitPath: c.ouName }));
      if (existing && (existing.orgUnitPath || existing.name)) return { changed: false, path: `/${c.ouName}` };
      await admin.orgunits.insert({ customerId: CUSTOMER, requestBody: { name: c.ouName, parentOrgUnitPath: '/' } });
      return { changed: true, path: `/${c.ouName}` };
    });
    const ouReady = steps.at(-1).status === 'ok' || steps.at(-1).status === 'unchanged';

    await runStep(steps, 'owner_account', async () => {
      if (stop()) return stop();
      if (!ouReady) return { skipped: 'The organizational unit could not be set up.' };
      const user = await getUser(admin, c.owner);
      if (!user) {
        password = tempPassword();
        await admin.users.insert({ requestBody: { primaryEmail: c.owner, name: { givenName: args.ownerFirstName || c.businessName, familyName: args.ownerLastName || 'Owner' }, password, changePasswordAtNextLogin: true, orgUnitPath: `/${c.ouName}` } });
        return { changed: true, created: true, orgUnitPath: `/${c.ouName}` };
      }
      if (user.orgUnitPath === `/${c.ouName}`) return { changed: false, note: 'The account already exists there; its password was not touched.' };
      const from = user.orgUnitPath;
      await admin.users.update({ userKey: c.owner, requestBody: { orgUnitPath: `/${c.ouName}` } });
      return { changed: true, moved: true, from, to: `/${c.ouName}` };
    });
    const ownerReady = ['ok', 'unchanged'].includes(steps.at(-1).status);

    await runStep(steps, 'role_addresses', async () => {
      if (stop()) return stop();
      if (!c.aliasEmails.length) return { skipped: 'No role addresses asked for.' };
      if (!ownerReady) return { skipped: 'The owner account is not ready.' };
      return ensureAliases(admin, c.owner, c.aliasEmails);
    });
    const aliasesReady = ['ok', 'unchanged'].includes(steps.at(-1).status);

    await runStep(steps, 'labels_and_filters', async () => {
      if (stop()) return stop();
      const inbound = c.aliasNames.filter((a) => !NO_INBOUND.test(a));
      if (!inbound.length) return { skipped: 'No inbound role addresses to label.' };
      if (!aliasesReady) return { skipped: 'The role addresses are not in place yet.' };
      if (norm(clients.actingAs) !== c.owner) return { skipped: `Labels can only be created while this connection acts as ${c.owner} itself (it acts as ${clients.actingAs}). Connect as the owner and run this again; finished steps are not repeated.` };
      const res = await ensureLabels(clients.gmail, inbound.map((a) => ({ name: a.charAt(0).toUpperCase() + a.slice(1), filterTo: `${a}@${c.domain}` })));
      if (res.confirmed !== true) throw new Error('Google does not show every label and filter afterwards.');
      return { changed: res.labels.some((l) => l.created || l.filterCreated), labels: res.labels };
    });

    const calName = args.calendarName || `${c.businessName} Calendar`;
    await runStep(steps, 'calendar', async () => {
      if (stop()) return stop();
      let cal = ((await calendar.calendarList.list({})).data.items || []).find((x) => x.summary === calName);
      let created = false;
      if (!cal) { cal = (await calendar.calendars.insert({ requestBody: { summary: calName, timeZone: args.timeZone } })).data; created = true; }
      let share = { changed: false };
      if (ownerReady && norm(clients.actingAs) !== c.owner) share = await ensureCalendarAccess(calendar, cal.id, c.owner, 'owner');
      const zoneNote = !created && cal.timeZone && cal.timeZone !== args.timeZone ? `The calendar already exists in ${cal.timeZone}; its time zone was not changed (use calendar_update_calendar).` : undefined;
      return { changed: created || share.changed, calendarId: cal.id, created, ownerAccess: share.role || (norm(clients.actingAs) === c.owner ? 'owner (it is their own calendar)' : 'not shared'), ...(zoneNote ? { note: zoneNote } : {}) };
    });

    await runStep(steps, 'drive_folders', async () => {
      if (stop()) return stop();
      const root = await ensureFolder(drive, c.businessName);
      const made = [];
      for (const f of args.folders?.length ? args.folders : STANDARD_FOLDERS) {
        const r = await ensureFolder(drive, f, root.id);
        if (r.created) made.push(f);
      }
      let share = { changed: false };
      if (ownerReady && norm(clients.actingAs) !== c.owner) share = await ensureDriveAccess(drive, root.id, c.owner, 'writer');
      return { changed: root.created || made.length > 0 || share.changed, folderId: root.id, rootCreated: root.created, subfoldersCreated: made, sharedWithOwner: ownerReady && norm(clients.actingAs) !== c.owner ? 'writer' : 'no (it is their own Drive)' };
    });

    await runStep(steps, 'brand_mailbox', async () => {
      if (stop()) return stop();
      if (!args.brand) return { skipped: 'No branding given.' };
      if (!aliasesReady && c.aliasEmails.length) return { skipped: 'The role addresses are not in place yet.' };
      const brand = clients.brandMailbox || brandHandlers.workflow_brand_mailbox;
      const res = JSON.parse((await brand({ userEmail: c.owner, displayName: args.brand.displayName, signatureHtml: args.brand.signatureHtml, avatarBase64: args.brand.avatarBase64Url, aliases: c.aliasEmails.map((e) => ({ email: e })) }, clients)).content[0].text);
      if (res.done !== true) throw new Error(`${res.reason || 'Branding did not complete.'} A brand-new mailbox can take a few minutes to appear: run workflow_brand_mailbox shortly.`);
      return { changed: true, primary: res.primary, aliases: res.aliases };
    });

    let emailHealthReport;
    try {
      const h = await emailHealth(c.domain, clients, clients.dnsResolver ? { resolver: clients.dnsResolver } : undefined);
      emailHealthReport = { summary: h.summary, report: h.report };
      steps.push({ step: 'email_health', status: 'ok', ...h.summary });
    } catch (err) { steps.push({ step: 'email_health', status: 'failed', error: reasonOf(err) }); }

    const failed = steps.filter((s) => s.status === 'failed');
    return ok({
      business: c.businessName, domain: c.domain, steps,
      ...(blocked ? { stoppedEarly: blocked } : {}),
      ...(password ? { ownerTemporaryPassword: password, passwordNote: 'Shown once. Give it to the owner securely; they must change it at first sign-in.' } : {}),
      emailHealth: emailHealthReport,
      ...(failed.length ? { warning: `${failed.length} step(s) failed: ${failed.map((s) => s.step).join(', ')}. Fix the cause and run it again: finished steps are not repeated.` } : {})
    });
  },
  readAfter: (args, clients) => inspect(args, clients),
  verify(args, _b, after) {
    const c = clean(args);
    if (!after.domain.exists) return false;
    if (!after.domain.verified) return true; // stopping at the DNS step is the expected result, not a mismatch
    return after.orgUnit.exists && after.owner.exists && c.aliasEmails.every((a) => after.owner.aliases.includes(a)) && after.calendar.exists && after.driveFolder.exists;
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
