// Dynamic Client Registration (RFC 7591), the piece Claude's remote-connector
// flow uses to register itself with your server the first time you add it.
import { randomToken } from '../../src/oauth/helpers.js';
import { createOAuthClient, initSchema } from '../../src/db.js';
import { applyCors } from '../../src/oauth/client-compat.js';

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
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
    // Honour the token endpoint auth method the client declares (RFC 7591).
    // 'none' is a public client: Muse's hosted connector flow declares it
    // and authenticates with S256 PKCE alone, the same shape as the built-in
    // secretless 'muse' client. Forcing a secret onto such a client makes
    // every later token call fail, because the token endpoint demands the
    // stored secret the public client never agreed to hold. Absent or other
    // values fall back to the RFC default 'client_secret_post', and the
    // response always names the method that was actually set up.
    const authMethod = body.token_endpoint_auth_method === 'none' ? 'none'
      : body.token_endpoint_auth_method === 'client_secret_basic' ? 'client_secret_basic' : 'client_secret_post';
    const clientId = randomToken(16);
    const clientSecret = authMethod === 'none' ? null : randomToken(32);
    await createOAuthClient({ clientId, clientSecret, redirectUris, clientName: body.client_name });
    const registration = {
      client_id: clientId,
      redirect_uris: redirectUris,
      client_name: body.client_name,
      token_endpoint_auth_method: authMethod,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    };
    if (clientSecret) registration.client_secret = clientSecret;
    res.status(201).json(registration);
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
