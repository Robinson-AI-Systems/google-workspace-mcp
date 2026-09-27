#!/usr/bin/env node
// One-time setup: opens a Google sign-in link, you approve access as your
// Workspace admin account, and this saves the resulting token to disk so
// the MCP server can use it every time Claude calls it.
import { google } from 'googleapis';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { loadConfig, assertOAuthConfigured } from './config.js';
import { ALL_SCOPES } from './scopes.js';

async function main() {
  const config = loadConfig();
  assertOAuthConfigured(config);

  const redirectUrl = new URL(config.oauthRedirectUri);
  const port = Number(redirectUrl.port || 80);

  const oauth2Client = new google.auth.OAuth2(
    config.oauthClientId,
    config.oauthClientSecret,
    config.oauthRedirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token every time, even on re-auth
    scope: ALL_SCOPES
  });

  console.log('\n=== Google Workspace MCP — Authorization ===\n');
  console.log('1. Open this URL in a browser, signed in as the Google account');
  console.log('   you want Claude to act as (use your admin account for full access):\n');
  console.log(authUrl);
  console.log('\n2. Approve access. You will be redirected back automatically.\n');
  console.log(`Waiting for the redirect on ${config.oauthRedirectUri} ...\n`);

  const code = await waitForAuthCode(port, redirectUrl.pathname);

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.warn(
      '\nWarning: no refresh_token was returned. This usually means this Google account already\n' +
      'granted this app access before. Go to https://myaccount.google.com/permissions , remove\n' +
      '"Robinson Google Workspace MCP", and run "npm run authorize" again.\n'
    );
  }

  writeFileSync(config.tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`\nSuccess. Token saved to: ${config.tokenPath}`);
  console.log('You can now start the MCP server (or restart Claude so it picks it up).\n');
  process.exit(0);
}

function waitForAuthCode(port, expectedPath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname !== expectedPath) {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (error) {
        res.end(`<html><body><h2>Authorization failed: ${error}</h2>You can close this tab.</body></html>`);
        server.close();
        reject(new Error(`Google returned an error: ${error}`));
        return;
      }
      res.end('<html><body><h2>Authorized. You can close this tab and return to the terminal.</h2></body></html>');
      server.close();
      resolve(code);
    });
    server.listen(port);
    server.on('error', reject);
  });
}

main().catch((err) => {
  console.error('\nAuthorization failed:', err.message);
  process.exit(1);
});
