// Same job as google-auth.js, but for the hosted (Vercel) deployment: reads
// and persists Google tokens from Postgres (Neon) instead of a local file,
// since serverless functions don't keep a filesystem between invocations.
//
// Since 2026-09-30 the server can hold a sign-in for MORE THAN ONE Google
// mailbox (for example one per business on the same Workspace). Every
// function here takes the account email to act as; a Claude connection's
// account is chosen once, on the connector login page, and rides along on
// its bearer token (see api/oauth/authorize.js and api/mcp.js).
import { google } from 'googleapis';
import {
  getGoogleTokensFor,
  saveGoogleTokensFor,
  getDefaultGoogleAccount,
  migrateLegacyGoogleAuth
} from '../db.js';
import { ALL_SCOPES } from './scopes.js';
import { buildDataTransferClient } from './datatransfer-client.js';

export function getOAuthRedirectUri() {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) throw new Error('PUBLIC_BASE_URL is not set (should be your Vercel deployment URL, e.g. https://your-app.vercel.app)');
  return `${base.replace(/\/$/, '')}/api/google/callback`;
}

export function buildGoogleOAuthClient() {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set.');
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    getOAuthRedirectUri()
  );
}

/**
 * The Google sign-in link. `loginHint` pre-selects the mailbox on Google's
 * account chooser so you don't accidentally connect the wrong business.
 */
export function getGoogleAuthUrl(state, loginHint) {
  const client = buildGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ALL_SCOPES,
    state,
    login_hint: loginHint || undefined
  });
}

/** Ask Gmail which mailbox a set of tokens belongs to. */
async function whichMailbox(tokens) {
  const client = buildGoogleOAuthClient();
  client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress;
}

/**
 * Finish a Google sign-in. We never trust the browser to tell us which
 * account was used; we ask Google, then file the tokens under that email.
 * Returns the email that was connected.
 */
export async function handleGoogleCallback(code, { label } = {}) {
  const client = buildGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  const email = await whichMailbox(tokens);
  await saveGoogleTokensFor(email, tokens, { label });
  return email;
}

/**
 * Upgrade a pre-multi-account deployment in place. Runs on every request
 * and costs one cheap query once the legacy row is gone.
 */
export async function ensureMigrated() {
  return migrateLegacyGoogleAuth(whichMailbox);
}

/**
 * Work out which account a request should act as: the one on its connector
 * token if set, otherwise the server's default account.
 */
export async function resolveAccount(requested) {
  if (requested) return String(requested).trim().toLowerCase();
  const fallback = await getDefaultGoogleAccount();
  if (!fallback) {
    throw new Error('Google Workspace is not connected yet. Visit /api/google/authorize once to sign in.');
  }
  return fallback;
}

/** Returns an authenticated Google auth client for one account, refreshing + persisting as needed. Fresh per request (serverless-safe). */
export async function getHostedAuthClient(account) {
  const email = await resolveAccount(account);
  const saved = await getGoogleTokensFor(email);
  if (!saved) {
    throw new Error(`Google account ${email} is not connected. Visit /api/google/authorize?account=${encodeURIComponent(email)} signed in as that mailbox.`);
  }
  const client = buildGoogleOAuthClient();
  client.setCredentials(saved);
  client.on('tokens', (tokens) => {
    // Fire and forget; failures here shouldn't break the current request.
    saveGoogleTokensFor(email, { ...saved, ...tokens }).catch(() => {});
  });
  client.actingAs = email; // handy for the whoami tool and error messages
  return client;
}

export async function buildHostedApiClients(account) {
  const auth = await getHostedAuthClient(account);
  return {
    auth,
    actingAs: auth.actingAs,
    gmail: google.gmail({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
    calendar: google.calendar({ version: 'v3', auth }),
    sheets: google.sheets({ version: 'v4', auth }),
    docs: google.docs({ version: 'v1', auth }),
    slides: google.slides({ version: 'v1', auth }),
    forms: google.forms({ version: 'v1', auth }),
    tasks: google.tasks({ version: 'v1', auth }),
    people: google.people({ version: 'v1', auth }),
    chat: google.chat({ version: 'v1', auth }),
    classroom: google.classroom({ version: 'v1', auth }),
    admin: google.admin({ version: 'directory_v1', auth }),
    adminReports: google.admin({ version: 'reports_v1', auth }),
    groupssettings: google.groupssettings({ version: 'v1', auth }),
    licensing: google.licensing({ version: 'v1', auth }),
    datatransfer: buildDataTransferClient(auth),
    alertcenter: google.alertcenter({ version: 'v1beta1', auth }),
    chromepolicy: google.chromepolicy({ version: 'v1', auth }),
    cloudidentity: google.cloudidentity({ version: 'v1', auth }),
    siteVerification: google.siteVerification({ version: 'v1', auth }),
    vault: google.vault({ version: 'v1', auth })
  };
}
