import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadConfig, assertOAuthConfigured, assertServiceAccountConfigured } from './config.js';
import { ALL_SCOPES } from './scopes.js';
import { buildDataTransferClient } from './datatransfer-client.js';

let cachedClient = null;

/**
 * Returns a ready-to-use, authenticated Google auth client. Cached for the
 * life of the process. Works in two modes:
 *
 *  - "oauth" (default): a normal user OAuth2 client using the refresh token
 *    saved by `npm run authorize`. This is what most people should use --
 *    if the account you authorize as is a Workspace super admin, this also
 *    unlocks every Admin SDK tool (users, groups, domains, aliases, etc).
 *
 *  - "service_account": a JWT client using domain-wide delegation, acting
 *    as `impersonateUser`. Use this only if you need the server to act
 *    automatically as a specific user without a human ever clicking
 *    "Allow" (e.g. unattended automation, or acting as many different
 *    mailboxes on demand).
 */
export async function getAuthClient() {
  if (cachedClient) return cachedClient;

  const config = loadConfig();

  if (config.authMode === 'service_account') {
    assertServiceAccountConfigured(config);
    const keyFile = JSON.parse(readFileSync(config.serviceAccountKeyFile, 'utf8'));
    const jwt = new google.auth.JWT({
      email: keyFile.client_email,
      key: keyFile.private_key,
      scopes: ALL_SCOPES,
      subject: config.impersonateUser || undefined
    });
    await jwt.authorize();
    cachedClient = jwt;
    return cachedClient;
  }

  // OAuth mode
  assertOAuthConfigured(config);
  if (!existsSync(config.tokenPath)) {
    throw new Error(
      `No saved Google authorization found at ${config.tokenPath}. Run "npm run authorize" once first ` +
      `(this opens a Google sign-in link, you approve access, and it saves the resulting token here).`
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    config.oauthClientId,
    config.oauthClientSecret,
    config.oauthRedirectUri
  );

  const savedToken = JSON.parse(readFileSync(config.tokenPath, 'utf8'));
  oauth2Client.setCredentials(savedToken);

  // Persist refreshed tokens so the server keeps working across restarts
  // without ever needing you to log in again.
  oauth2Client.on('tokens', (tokens) => {
    try {
      const merged = { ...savedToken, ...tokens };
      writeFileSync(config.tokenPath, JSON.stringify(merged, null, 2));
    } catch {
      // Non-fatal: worst case, re-authorize later.
    }
  });

  cachedClient = oauth2Client;
  return cachedClient;
}

/**
 * Builds every Google API client this server can dispatch to, all sharing
 * one auth client. Each tool module receives this bag of clients.
 */
export async function buildApiClients() {
  const auth = await getAuthClient();
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
