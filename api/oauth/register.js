// Dynamic Client Registration (RFC 7591), the piece Claude's remote-connector
// flow uses to register itself with your server the first time you add it.
import { randomToken } from '../../src/oauth/helpers.js';
import { createOAuthClient, initSchema } from '../../src/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    await initSchema();
    const body = req.body && Object.keys(req.body).length ? req.body : JSON.parse(await readRawBody(req));
    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
      return;
    }
    const clientId = randomToken(16);
    const clientSecret = randomToken(32);
    await createOAuthClient({ clientId, clientSecret, redirectUris, clientName: body.client_name });
    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: redirectUris,
      client_name: body.client_name,
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', error_description: err.message });
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data || '{}'));
    req.on('error', reject);
  });
}
