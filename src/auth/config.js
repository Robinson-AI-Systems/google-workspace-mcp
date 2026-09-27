import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
export const CONFIG_PATH = process.env.GWS_CONFIG_PATH || path.join(PROJECT_ROOT, 'config.json');
export const TOKEN_PATH = process.env.GWS_TOKEN_PATH || path.join(PROJECT_ROOT, 'token.json');

/**
 * Loads configuration from config.json (if present) and layers environment
 * variables on top, so this works both when you run it by hand and when
 * Claude launches it with an "env" block in its MCP server config.
 *
 * Required for OAuth mode:
 *   oauthClientId, oauthClientSecret
 * Required for service-account mode:
 *   serviceAccountKeyFile, impersonateUser
 */
export function loadConfig() {
  let fileConfig = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      throw new Error(`config.json exists but could not be parsed as JSON: ${err.message}`);
    }
  }

  const config = {
    authMode: process.env.GWS_AUTH_MODE || fileConfig.authMode || 'oauth',
    oauthClientId: process.env.GWS_OAUTH_CLIENT_ID || fileConfig.oauthClientId || null,
    oauthClientSecret: process.env.GWS_OAUTH_CLIENT_SECRET || fileConfig.oauthClientSecret || null,
    oauthRedirectUri: process.env.GWS_OAUTH_REDIRECT_URI || fileConfig.oauthRedirectUri || 'http://localhost:53682/oauth2callback',
    serviceAccountKeyFile: process.env.GWS_SERVICE_ACCOUNT_KEY_FILE || fileConfig.serviceAccountKeyFile || null,
    impersonateUser: process.env.GWS_IMPERSONATE_USER || fileConfig.impersonateUser || null,
    tokenPath: process.env.GWS_TOKEN_PATH || fileConfig.tokenPath || TOKEN_PATH
  };

  return config;
}

export function assertOAuthConfigured(config) {
  if (!config.oauthClientId || !config.oauthClientSecret) {
    throw new Error(
      'OAuth is not configured yet. Set oauthClientId and oauthClientSecret in config.json ' +
      '(from your Google Cloud OAuth client), then run: npm run authorize'
    );
  }
}

export function assertServiceAccountConfigured(config) {
  if (!config.serviceAccountKeyFile) {
    throw new Error(
      'Service account mode is selected but serviceAccountKeyFile is not set in config.json.'
    );
  }
}
