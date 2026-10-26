import { randomToken, verifyPkce, parseBody } from '../../src/oauth/helpers.js';
import { getOAuthClient, consumeAuthCode, createAccessToken, getTokenByRefreshToken, initSchema } from '../../src/db.js';
import { connectionPolicyToDb } from '../../src/oauth/connection-settings.js';
import {consumePrincipalCode,issuePrincipalConnection,rotatePrincipalRefresh} from '../../src/principals/store.js';
import {publicResource} from '../../src/principals/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  await initSchema();
  const body = await parseBody(req);

  // V2 codes and refresh grants have distinguishable prefixes and are never
  // submitted to legacy owner tables. Original issued owner tokens are unchanged.
  if(body.grant_type==='authorization_code'&&typeof body.code==='string'&&body.code.startsWith('p10c_')){
    let resource;
    try{resource=publicResource()+'/api/mcp';}catch{return res.status(503).json({error:'temporarily_unavailable'});}
    if(body.resource!==resource && !(body.client_id==='muse' && !body.resource))return res.status(400).json({error:'invalid_target'});
    const client=await getOAuthClient(body.client_id);
    if(!client||client.client_secret&&client.client_secret!==body.client_secret)
      return res.status(401).json({error:'invalid_client'});
    const grant=await consumePrincipalCode({code:body.code,clientId:body.client_id,
      redirectUri:body.redirect_uri,resource,verifier:body.code_verifier});
    if(!grant)return res.status(400).json({error:'invalid_grant'});
    try {
      const issued=await issuePrincipalConnection(grant);
      return res.status(200).json({access_token:issued.accessToken,
        refresh_token:issued.refreshToken,token_type:'Bearer',expires_in:2592000});
    }catch{return res.status(400).json({error:'invalid_grant'});}
  }
  if(body.grant_type==='refresh_token'&&typeof body.refresh_token==='string'&&body.refresh_token.startsWith('p10r_')){
    let resource;try{resource=publicResource()+'/api/mcp';}catch{return res.status(503).json({error:'temporarily_unavailable'});}
    if(body.resource!==resource && !(body.client_id==='muse' && !body.resource))return res.status(400).json({error:'invalid_target'});
    const client=await getOAuthClient(body.client_id);
    if(!client||client.client_secret&&client.client_secret!==body.client_secret)
      return res.status(401).json({error:'invalid_client'});
    const rotated=await rotatePrincipalRefresh(body.refresh_token,{clientId:body.client_id,resource});
    if(!rotated)return res.status(400).json({error:'invalid_grant'});
    return res.status(200).json({access_token:rotated.accessToken,
      refresh_token:rotated.refreshToken,token_type:'Bearer',expires_in:2592000});
  }

  if (body.grant_type === 'authorization_code') {
    // Reject an unrelated/unregistered client before touching a one-time code.
    const client = await getOAuthClient(body.client_id);
    if (!client || (client.client_secret && client.client_secret !== body.client_secret)) {
      res.status(401).json({error:'invalid_client'});
      return;
    }
    const record = await consumeAuthCode(body.code,{
      clientId:body.client_id,redirectUri:body.redirect_uri,verifier:body.code_verifier
    });
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
    // A concurrent client revocation can happen after the refresh lookup.
    // The DB tombstone prevents a stale refresh from reissuing working access.
    try {
      await createAccessToken({ accessToken, refreshToken: body.refresh_token,
        clientId: body.client_id, googleAccount: issued.google_account || null, ...settings });
    } catch (error) {
      if(error?.message==='refresh_family_revoked')
        return res.status(400).json({error:'invalid_grant'});
      throw error;
    }
    res.status(200).json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 * 24 * 30 });
    return;
  }

  res.status(400).json({ error: 'unsupported_grant_type' });
}
