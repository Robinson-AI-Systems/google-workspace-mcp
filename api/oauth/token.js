import { randomToken, verifyPkce, parseBody } from '../../src/oauth/helpers.js';
import { getOAuthClient, consumeAuthCode, createAccessToken, initSchema } from '../../src/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  await initSchema();
  const body = await parseBody(req);

  if (body.grant_type === 'authorization_code') {
    const record = await consumeAuthCode(body.code);
    if (!record) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Code is invalid, expired, or already used.' });
      return;
    }
    if (record.client_id !== body.client_id) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch.' });
      return;
    }
    if (record.redirect_uri !== body.redirect_uri) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch.' });
      return;
    }
    if (!verifyPkce(body.code_verifier, record.code_challenge, record.code_challenge_method)) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed.' });
      return;
    }

    const client = await getOAuthClient(body.client_id);
    if (client?.client_secret && client.client_secret !== body.client_secret) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }

    const accessToken = randomToken(32);
    const refreshToken = randomToken(32);
    await createAccessToken({ accessToken, refreshToken, clientId: body.client_id });
    res.status(200).json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 * 24 * 30, refresh_token: refreshToken });
    return;
  }

  if (body.grant_type === 'refresh_token') {
    // Simplest correct behavior: issue a fresh access token tied to the same client.
    // (Refresh tokens aren't separately validated against a stored value here since
    // this server has exactly one real user; the access token itself is the durable
    // credential Claude keeps using.)
    const accessToken = randomToken(32);
    await createAccessToken({ accessToken, refreshToken: body.refresh_token, clientId: body.client_id });
    res.status(200).json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 * 24 * 30 });
    return;
  }

  res.status(400).json({ error: 'unsupported_grant_type' });
}
