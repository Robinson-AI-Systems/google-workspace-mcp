// The login gate. Claude sends the person here as part of connecting the
// custom connector; we show one password field (your ADMIN_PASSPHRASE env
// var) rather than a full user system, since this server only ever has one
// real user: you.
import { randomToken, parseBody } from '../../src/oauth/helpers.js';
import { getOAuthClient, createAuthCode, initSchema } from '../../src/db.js';

function renderLoginPage({ error, hidden }) {
  const hiddenInputs = Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v || '')}">`).join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Sign in</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  form { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); width: 320px; }
  h1 { font-size: 1.1rem; margin: 0 0 1rem; }
  input[type=password] { width: 100%; padding: 0.6rem; box-sizing: border-box; margin-bottom: 1rem; border: 1px solid #ccc; border-radius: 6px; }
  button { width: 100%; padding: 0.6rem; background: #111; color: white; border: none; border-radius: 6px; cursor: pointer; }
  .error { color: #c00; font-size: 0.85rem; margin-bottom: 1rem; }
</style></head>
<body>
  <form method="POST">
    <h1>Robinson Google Workspace MCP</h1>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <input type="password" name="passphrase" placeholder="Admin passphrase" autofocus required>
    ${hiddenInputs}
    <button type="submit">Authorize Claude</button>
  </form>
</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
  await initSchema();
  const params = req.method === 'GET' ? req.query : await parseBody(req);
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = params;

  if (response_type && response_type !== 'code') {
    res.status(400).send('Only response_type=code is supported.');
    return;
  }

  const client = await getOAuthClient(client_id);
  if (!client) {
    res.status(400).send('Unknown client_id. This connector needs to register first (this normally happens automatically).');
    return;
  }
  if (!client.redirect_uris.includes(redirect_uri)) {
    res.status(400).send('redirect_uri does not match what this client registered.');
    return;
  }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(renderLoginPage({ hidden: { client_id, redirect_uri, state, code_challenge, code_challenge_method } }));
    return;
  }

  // POST: check passphrase
  if (!process.env.ADMIN_PASSPHRASE) {
    res.status(500).send('Server misconfigured: ADMIN_PASSPHRASE is not set.');
    return;
  }
  if (params.passphrase !== process.env.ADMIN_PASSPHRASE) {
    res.setHeader('Content-Type', 'text/html');
    res.status(401).send(renderLoginPage({ error: 'Incorrect passphrase.', hidden: { client_id, redirect_uri, state, code_challenge, code_challenge_method } }));
    return;
  }

  const code = randomToken(24);
  await createAuthCode({ code, clientId: client_id, redirectUri: redirect_uri, codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method });

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);
  res.writeHead(302, { Location: redirectUrl.toString() });
  res.end();
}
