// Domain-wide delegation: lets this server act INSIDE any user's mailbox on
// the Workspace (set their signature, add send-as identities, read a shared
// inbox) without that person ever signing in.
//
// How it works, in plain terms: a Google Cloud "service account" is a robot
// identity. A Workspace super admin tells the Workspace, once, "trust this
// robot to act as any of my users for these permissions." After that the
// server signs a request as the robot, names the user it wants to act as,
// and Google hands back a token for that user's mailbox.
//
// Setup (one time, see DEPLOY.md "Part 5"): create the service account, make
// a JSON key, authorize its client ID in the Admin console for the scopes below
// (DELEGATED_SCOPES only), then put the key in the GOOGLE_SERVICE_ACCOUNT_JSON
// env var (raw JSON or base64 of it). Until that var exists, everything here reports
// "not configured" and the rest of the server works exactly as before.
import { google } from 'googleapis';

let cached; // parsed key, so we don't re-parse on every call

export function loadServiceAccount() {
  if (cached !== undefined) return cached;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) { cached = null; return cached; }
  let text = raw.trim();
  if (!text.startsWith('{')) {
    // Allow base64 so the key can be pasted into Vercel as one line.
    text = Buffer.from(text, 'base64').toString('utf8');
  }
  const key = JSON.parse(text);
  if (!key.client_email || !key.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is set but is not a service-account key (needs client_email and private_key).');
  }
  cached = key;
  return cached;
}

export function isDelegationConfigured() {
  try { return !!loadServiceAccount(); } catch { return false; }
}

/**
 * The only permissions the robot identity is ever asked for: Gmail settings
 * (signature, display name, send-as identities). Deliberately NOT the full
 * ALL_SCOPES list. Widen this on purpose, one scope at a time, if a future
 * tool genuinely needs more, and authorize the same list in the Admin console.
 */
export const DELEGATED_SCOPES = [
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing'
];

/** Non-secret facts about the service account, for status tools and setup pages. */
export function describeServiceAccount() {
  const key = loadServiceAccount();
  if (!key) return { configured: false, scopesToAuthorize: DELEGATED_SCOPES };
  return {
    configured: true,
    serviceAccountEmail: key.client_email,
    clientId: key.client_id || null, // this is what gets pasted into the Admin console
    projectId: key.project_id || null,
    scopesToAuthorize: DELEGATED_SCOPES
  };
}

/**
 * An auth client that acts as `userEmail`, limited to DELEGATED_SCOPES.
 * Throws a plain-English error when delegation isn't set up, so tools can
 * surface it instead of a bare 403.
 */
export function buildDelegatedAuth(userEmail) {
  const key = loadServiceAccount();
  if (!key) {
    throw new Error('Acting inside another mailbox needs domain-wide delegation, which is not set up yet (GOOGLE_SERVICE_ACCOUNT_JSON is missing). See DEPLOY.md, Part 5.');
  }
  const subject = String(userEmail || '').trim().toLowerCase();
  if (!subject.includes('@')) throw new Error(`userEmail must be a full email address, got "${userEmail}".`);
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: DELEGATED_SCOPES,
    subject
  });
}
