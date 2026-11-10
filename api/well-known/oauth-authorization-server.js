import {applyCors} from '../../src/oauth/client-compat.js';
import {publicResource} from '../../src/principals/security.js';

export default function handler(req, res) {
  if(applyCors(req,res,'GET, OPTIONS'))return;
  res.setHeader('Cache-Control','no-store');
  let base;
  try{base=publicResource();}
  catch{return res.status(503).json({error:'public_origin_required'});}
  res.status(200).json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    revocation_endpoint: `${base}/api/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    // D-006 MC-3: a client may identify itself by the URL of its own client
    // metadata document (Claude, VS Code); dynamic registration stays too.
    client_id_metadata_document_supported: true
  });
}
