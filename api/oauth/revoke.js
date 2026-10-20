// OAuth token revocation (RFC 7009). This affects only a credential actually
// presented by the registered client. Never use the owner admin prefix-revoke
// helper here, and never expose another client's token presence.
import {parseBody} from '../../src/oauth/helpers.js';
import {getOAuthClient,initSchema,revokeClientOAuthToken} from '../../src/db.js';
import {revokeClientPrincipalToken} from '../../src/principals/store.js';

export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') {
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'method_not_allowed'});
 }
 let body;
 try {body=await parseBody(req);}
 catch {return res.status(400).json({error:'invalid_request'});}
 if(typeof body?.client_id!=='string'||!body.client_id) {
  return res.status(401).json({error:'invalid_client'});
 }
 await initSchema();
 const client=await getOAuthClient(body.client_id);
 if(!client||(client.client_secret&&client.client_secret!==body.client_secret)) {
  return res.status(401).json({error:'invalid_client'});
 }
 if(typeof body.token!=='string'||!body.token||body.token.length>256) {
  return res.status(400).json({error:'invalid_request'});
 }
 // Unknown tokens, foreign-client tokens, and already-revoked tokens must
 // produce the same response; only client-owned active token families mutate.
 if(body.token.startsWith('p10')) {
  await revokeClientPrincipalToken(body.token,body.client_id);
 } else {
  await revokeClientOAuthToken(body.token,body.client_id);
 }
 return res.status(200).json({});
}
