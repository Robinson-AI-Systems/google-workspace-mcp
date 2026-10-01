// Mailbox branding through domain-wide delegation. These are the ONLY tools
// that act inside another user's mailbox, and they can only touch Gmail
// settings (display name, signature, send-as identities) because the robot
// identity is granted nothing else; see src/auth/service-account.js.
import { google } from 'googleapis';
import { recordChange } from '../changelog.js';
import { ok } from './util.js';
import { buildDelegatedAuth, describeServiceAccount, isDelegationConfigured } from '../auth/service-account.js';

const norm = (e) => String(e || '').trim().toLowerCase();

function gmailFor(userEmail) {
  return google.gmail({ version: 'v1', auth: buildDelegatedAuth(userEmail) });
}

export const tools = [
  {
    name: 'workspace_delegation_status',
    description: "Is domain-wide delegation set up, so the server can brand other users' mailboxes? Returns the service account's email and client ID (what gets authorized in the Admin console), the exact permission list to authorize, and, if testUser is given, proves it works by reading that user's Gmail send-as settings.",
    inputSchema: { type: 'object', properties: { testUser: { type: 'string', description: 'A Workspace user email to test against (read-only check).' } } }
  },
  {
    name: 'workflow_brand_mailbox',
    description: "Brand one Workspace user's Gmail in a single call: sets the sender display name and HTML signature on their primary address, adds each listed alias as a 'send mail as' identity (creating it if missing) with its own display name and the same signature, and reads everything back. Needs domain-wide delegation (see workspace_delegation_status). Aliases must already exist on the user in the Workspace directory.",
    inputSchema: {
      type: 'object',
      properties: {
        userEmail: { type: 'string', description: 'The mailbox to brand, e.g. ops@yourbusiness.com' },
        displayName: { type: 'string', description: 'Sender name shown on mail from the primary address' },
        signatureHtml: { type: 'string', description: 'HTML signature applied to the primary address and every alias' },
        aliases: {
          type: 'array',
          description: 'Role addresses to make sendable from this mailbox',
          items: { type: 'object', properties: { email: { type: 'string' }, displayName: { type: 'string' }, replyTo: { type: 'string' } }, required: ['email'] }
        },
        makeDefault: { type: 'string', description: 'Optional: which address new messages should default to sending from' },
        avatarBase64: { type: 'string', description: 'Optional profile photo (PNG or JPEG, base64 or base64url). Set through the Directory; needs no delegation.' },
        labels: { type: 'array', description: 'Optional Gmail labels to create, each optionally with a filter that files mail sent to an address into it. Only possible when this connection acts as that same mailbox (the robot identity cannot create labels).', items: { type: 'object', properties: { name: { type: 'string' }, filterTo: { type: 'string', description: 'files mail addressed to this address under the label' } }, required: ['name'] } },
        vacation: { type: 'object', description: 'Optional auto-reply, passed to Gmail as is: { enableAutoReply, responseSubject, responseBodyPlainText, responseBodyHtml, restrictToContacts, restrictToDomain, startTime, endTime }' },
        dryRun: { type: 'boolean', description: 'Preview only: show what would change and change nothing.' }
      },
      required: ['userEmail']
    }
  }
];

const pickVacation = (v) => ({ enableAutoReply: !!v?.enableAutoReply, responseSubject: v?.responseSubject || '', hasBody: !!(v?.responseBodyPlainText || v?.responseBodyHtml), restrictToContacts: !!v?.restrictToContacts, restrictToDomain: !!v?.restrictToDomain });

/** Create each label (and its to:-filter) only if it is missing; report what exists afterwards. */
export async function ensureLabels(gmail, wanted) {
  const labels = (await gmail.users.labels.list({ userId: 'me' })).data.labels || [];
  const filters = (await gmail.users.settings.filters.list({ userId: 'me' })).data.filter || [];
  const out = [];
  for (const w of wanted) {
    const name = String(w.name || '').trim();
    if (!name) continue;
    let label = labels.find((l) => String(l.name).toLowerCase() === name.toLowerCase());
    let created = false;
    if (!label) { label = (await gmail.users.labels.create({ userId: 'me', requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } })).data; labels.push(label); created = true; }
    const row = { name: label.name, created };
    if (w.filterTo) {
      const to = norm(w.filterTo);
      const has = filters.some((f) => norm(f.criteria?.to) === to && Object.keys(f.criteria || {}).every((k) => k === 'to') && (f.action?.addLabelIds || []).includes(label.id));
      if (!has) {
        const made = (await gmail.users.settings.filters.create({ userId: 'me', requestBody: { criteria: { to }, action: { addLabelIds: [label.id] } } })).data;
        filters.push(made.id ? { ...made, criteria: made.criteria || { to }, action: made.action || { addLabelIds: [label.id] } } : { criteria: { to }, action: { addLabelIds: [label.id] } });
      }
      row.filterTo = to;
      row.filterCreated = !has;
    }
    out.push(row);
  }
  // Read back what Google holds now
  const nowLabels = (await gmail.users.labels.list({ userId: 'me' })).data.labels || [];
  const nowFilters = (await gmail.users.settings.filters.list({ userId: 'me' })).data.filter || [];
  const confirmed = out.every((r) => {
    const l = nowLabels.find((x) => String(x.name).toLowerCase() === String(r.name).toLowerCase());
    return l && (!r.filterTo || nowFilters.some((f) => norm(f.criteria?.to) === r.filterTo && (f.action?.addLabelIds || []).includes(l.id)));
  });
  return { done: confirmed, labels: out, confirmed };
}

export const handlers = {
  async workspace_delegation_status(args) {
    const info = describeServiceAccount();
    if (!info.configured) {
      return ok({
        ...info,
        nextStep: 'Create a service account key in Google Cloud, authorize its client ID in Admin console > Security > API controls > Domain-wide delegation with the scopes listed, then set GOOGLE_SERVICE_ACCOUNT_JSON in Vercel. DEPLOY.md Part 5 has the clicks.'
      });
    }
    if (!args.testUser) return ok({ ...info, test: 'Pass testUser to prove it works end to end.' });
    try {
      const res = await gmailFor(args.testUser).users.settings.sendAs.list({ userId: 'me' });
      return ok({ ...info, test: { user: norm(args.testUser), works: true, sendAsCount: res.data.sendAs?.length || 0 } });
    } catch (err) {
      const message = err?.response?.data?.error?.message || err?.message || String(err);
      const hint = /unauthorized_client|Not Authorized|invalid_grant/i.test(message)
        ? 'Google rejected the robot identity. Usually the client ID or the scope list in Admin console > Domain-wide delegation does not match exactly, or it was saved less than a few minutes ago (Google takes time to apply it).'
        : undefined;
      return ok({ ...info, test: { user: norm(args.testUser), works: false, error: message, hint } });
    }
  },

  async workflow_brand_mailbox(args, clients) {
    if (!isDelegationConfigured()) {
      return ok({ done: false, reason: 'Domain-wide delegation is not set up. Run workspace_delegation_status for the steps.' });
    }
    const user = norm(args.userEmail);
    const gmail = gmailFor(user);
    const report = { user, primary: null, aliases: [], skipped: [], defaultSender: null };

    // What the mailbox looks like before we touch it (for the change log). Alias existence is not affected by the
    // primary-address patch below, so the same list also tells step 2 which aliases are missing.
    const existing = (await gmail.users.settings.sendAs.list({ userId: 'me' })).data.sendAs || [];
    const summarize = (s) => ({ email: s.sendAsEmail, displayName: s.displayName || '', hasSignature: !!s.signature, isDefault: !!s.isDefault, isPrimary: !!s.isPrimary });

    const wanted = [args.displayName !== undefined && 'display name', args.signatureHtml !== undefined && 'signature', (args.aliases || []).length && `${args.aliases.length} alias(es)`, args.makeDefault && 'default sender', args.avatarBase64 && 'profile photo', (args.labels || []).length && `${args.labels.length} label(s)`, args.vacation && 'auto-reply'].filter(Boolean);
    if (args.dryRun === true) {
      const plan = {
        done: false, dryRun: true, user,
        wouldChange: wanted,
        aliasesToCreate: (args.aliases || []).map((a) => norm(a.email)).filter((e) => e && e !== user && !existing.some((s) => norm(s.sendAsEmail) === e)),
        aliasesAlreadyThere: (args.aliases || []).map((a) => norm(a.email)).filter((e) => existing.some((s) => norm(s.sendAsEmail) === e)),
        labelsNote: (args.labels || []).length && user !== norm(clients.actingAs) ? 'Labels would be skipped: this connection does not act as that mailbox.' : undefined,
        current: existing.map(summarize),
        note: 'Nothing was changed.'
      };
      const logged = await recordChange(clients, { tool: 'workflow_brand_mailbox', target: user, summary: `PREVIEW: brand ${user}: ${wanted.join(', ') || 'no changes requested'}`, before: existing.map(summarize), dryRun: true });
      return ok({ ...plan, logged: logged.logged });
    }

    // Steps 1-3 change the mailbox. If one fails part-way, the earlier ones have already happened, so say so in the log.
    try {
      // 1. Primary address: name + signature
      const primaryPatch = {};
      if (args.displayName !== undefined) primaryPatch.displayName = args.displayName;
      if (args.signatureHtml !== undefined) primaryPatch.signature = args.signatureHtml;
      if (Object.keys(primaryPatch).length) {
        await gmail.users.settings.sendAs.patch({ userId: 'me', sendAsEmail: user, requestBody: primaryPatch });
      }

      // 2. Each alias: create if missing, then name + signature
      for (const alias of args.aliases || []) {
        const email = norm(alias.email);
        if (!email || email === user) { report.skipped.push({ email, why: 'same as the primary address or empty' }); continue; }
        const already = existing.find((s) => norm(s.sendAsEmail) === email);
        if (!already) {
          await gmail.users.settings.sendAs.create({
            userId: 'me',
            requestBody: { sendAsEmail: email, displayName: alias.displayName || args.displayName || '', replyToAddress: alias.replyTo || '', treatAsAlias: true }
          });
        }
        const patch = { treatAsAlias: true };
        if (alias.displayName || args.displayName) patch.displayName = alias.displayName || args.displayName;
        if (args.signatureHtml !== undefined) patch.signature = args.signatureHtml;
        if (alias.replyTo) patch.replyToAddress = alias.replyTo;
        await gmail.users.settings.sendAs.patch({ userId: 'me', sendAsEmail: email, requestBody: patch });
      }

      // 3. Optional default sender
      if (args.makeDefault) {
        await gmail.users.settings.sendAs.patch({ userId: 'me', sendAsEmail: norm(args.makeDefault), requestBody: { isDefault: true } });
      }

      // 3b. Optional auto-reply (a Gmail setting, so the robot identity can do it)
      if (args.vacation) {
        await gmail.users.settings.updateVacation({ userId: 'me', requestBody: args.vacation });
      }
    } catch (err) {
      const why = String(err?.response?.data?.error?.message || err?.message || err).slice(0, 200);
      await recordChange(clients, { tool: 'workflow_brand_mailbox', target: user, summary: `Branding ${user} stopped part-way and may be partly applied (${why})`, before: existing.map(summarize), after: null });
      throw err;
    }

    // 3c. Profile photo, through the Directory (the connection's own admin permission, no delegation)
    if (args.avatarBase64) {
      try {
        const photoData = String(args.avatarBase64).replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        await clients.admin.users.photos.update({ userKey: user, requestBody: { photoData } });
        const back = (await clients.admin.users.photos.get({ userKey: user })).data;
        report.photo = { set: Boolean(back?.photoData || back?.mimeType), mimeType: back?.mimeType, width: back?.width, height: back?.height };
      } catch (err) {
        report.photo = { set: false, error: String(err?.response?.data?.error?.message || err?.message || err).slice(0, 200) };
      }
    }

    // 3d. Labels and the filters that fill them. Creating a label needs more than the robot identity may do, so this only
    // runs when the connection IS that mailbox.
    if ((args.labels || []).length) {
      if (user !== norm(clients.actingAs)) {
        report.labels = { done: false, why: `Labels can only be created while this connection acts as ${user} itself (it acts as ${clients.actingAs}). The robot identity is not allowed to create labels.` };
      } else {
        try { report.labels = await ensureLabels(clients.gmail, args.labels); }
        catch (err) { report.labels = { done: false, why: String(err?.response?.data?.error?.message || err?.message || err).slice(0, 200) }; }
      }
    }

    // 4. Read back so the caller sees what Google now holds, not what we sent
    const after = (await gmail.users.settings.sendAs.list({ userId: 'me' })).data.sendAs || [];
    for (const s of after) {
      const row = {
        email: s.sendAsEmail,
        displayName: s.displayName || '',
        hasSignature: !!s.signature,
        isDefault: !!s.isDefault,
        verificationStatus: s.verificationStatus || 'n/a'
      };
      if (s.isPrimary) report.primary = row; else report.aliases.push(row);
      if (s.isDefault) report.defaultSender = s.sendAsEmail;
    }
    report.done = report.photo?.set !== false && !(report.labels?.done === false);
    if (args.vacation) {
      try {
        report.vacation = pickVacation((await gmail.users.settings.getVacation({ userId: 'me' })).data);
        if (args.vacation.enableAutoReply !== undefined && report.vacation.enableAutoReply !== !!args.vacation.enableAutoReply) report.done = false; // Google does not show what was asked for
      } catch (err) {
        report.vacation = { error: `Could not read the auto-reply back: ${String(err?.response?.data?.error?.message || err?.message || err).slice(0, 160)}` };
        report.done = false;
      }
    }
    await recordChange(clients, {
      tool: 'workflow_brand_mailbox', target: user,
      summary: `Branded ${user}: ${wanted.join(', ') || 'no changes requested'}${report.done ? '' : ' (not everything could be applied: see the result)'}`,
      before: existing.map(summarize), after: after.map(summarize)
    });
    return ok(report);
  }
};
