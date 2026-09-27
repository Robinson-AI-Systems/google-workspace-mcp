// Same job as google-auth.js, but for the hosted (Vercel) deployment: reads
// and persists the Google token from Postgres (Neon) instead of a local file,
// since serverless functions don't keep a filesystem between invocations.
import { google } from 'googleapis';
import { getGoogleTokens, saveGoogleTokens } from '../db.js';
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

export function getGoogleAuthUrl(state) {
  const client = buildGoogleOAuthClient();
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ALL_SCOPES, state });
}

export async function handleGoogleCallback(code) {
  const client = buildGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  const existing = (await getGoogleTokens()) || {};
  const merged = { ...existing, ...tokens };
  await saveGoogleTokens(merged);
  return merged;
}

/** Returns an authenticated Google auth client, refreshing + persisting as needed. Fresh per request (serverless-safe). */
export async function getHostedAuthClient() {
  const saved = await getGoogleTokens();
  if (!saved) {
    throw new Error('Google Workspace is not connected yet. Visit /api/google/authorize once to sign in as your admin account.');
  }
  const client = buildGoogleOAuthClient();
  client.setCredentials(saved);
  client.on('tokens', (tokens) => {
    // Fire and forget; failures here shouldn't break the current request.
    saveGoogleTokens({ ...saved, ...tokens }).catch(() => {});
  });
  return client;
}

export async function buildHostedApiClients() {
  const auth = await getHostedAuthClient();
  return {
    auth,
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
