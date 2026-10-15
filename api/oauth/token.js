import { randomToken, verifyPkce, parseBody } from '../../src/oauth/helpers.js';
import { getOAuthClient, consumeAuthCode, createAccessToken, getTokenByRefreshToken, initSchema } from '../../src/db.js';
import { connectionPolicyToDb } from '../../src/oauth/connection-settings.js';

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
    if (!client) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }
    if (client.client_secret && client.client_secret !== body.client_secret) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }

    let settings;
    try { settings=connectionPolicyToDb(record,{grant:'authorization_code'}); }
    catch {
      res.status(400).json({error:'invalid_grant',error_description:'Connection policy could not be validated.'});
      return;
    }
    const accessToken = randomToken(32);
    const refreshToken = randomToken(32);
    // Preserve the selected account and every declared policy setting.
    await createAccessToken({ accessToken, refreshToken, clientId: body.client_id,
      googleAccount: record.google_account, ...settings });
    res.status(200).json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 * 24 * 30, refresh_token: refreshToken });
    return;
  }

  if (body.grant_type === 'refresh_token') {
    // A refresh token is only honored if WE issued it, to THIS client. Without
    // this check anyone who knew the server's address could mint a working
    // access token by sending any string here.
    const issued = await getTokenByRefreshToken(body.refresh_token);
    if (!issued || issued.client_id !== body.client_id) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Unknown refresh token.' });
      return;
    }
    const client = await getOAuthClient(body.client_id);
    if (!client) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }
    if (client.client_secret && client.client_secret !== body.client_secret) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }
    let settings;
    try { settings=connectionPolicyToDb(issued,{grant:'refresh_token'}); }
    catch {
      // A refresh must fail closed instead of changing an unreadable profile
      // to the database's default full privileges.
      res.status(400).json({error:'invalid_grant',error_description:'Stored connection policy is invalid.'});
      return;
    }
    const accessToken = randomToken(32);
    await createAccessToken({ accessToken, refreshToken: body.refresh_token,
      clientId: body.client_id, googleAccount: issued.google_account || null, ...settings });
    res.status(200).json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 * 24 * 30 });
    return;
  }

  res.status(400).json({ error: 'unsupported_grant_type' });
}
