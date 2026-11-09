import {publicResource} from '../../src/principals/security.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  let base;
  try{base=publicResource();}
  catch{return res.status(503).json({error:'public_origin_required'});}
  res.status(200).json({
    client_id: `${base}/.well-known/muse-client.json`,
    client_name: 'Muse',
    grant_types: ['authorization_code','refresh_token'],
    redirect_uris: ['https://agent.meta.ai/api/hatch/oauth/callback'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none'
  });
}
