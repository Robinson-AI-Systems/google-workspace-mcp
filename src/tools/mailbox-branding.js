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
        makeDefault: { type: 'string', description: 'Optional: which address new messages should default to sending from' }
      },
      required: ['userEmail']
    }
  }
];

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
    } catch (err) {
      const why = String(err?.response?.data?.error?.message || err?.message || err).slice(0, 200);
      await recordChange(clients, { tool: 'workflow_brand_mailbox', target: user, summary: `Branding ${user} stopped part-way and may be partly applied (${why})`, before: existing.map(summarize), after: null });
      throw err;
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
    report.done = true;
    await recordChange(clients, {
      tool: 'workflow_brand_mailbox', target: user,
      summary: `Branded ${user}: ${[args.displayName !== undefined && 'display name', args.signatureHtml !== undefined && 'signature', (args.aliases || []).length && `${args.aliases.length} alias(es)`, args.makeDefault && 'default sender'].filter(Boolean).join(', ') || 'no changes requested'}`,
      before: existing.map(summarize), after: after.map(summarize)
    });
    return ok(report);
  }
};
