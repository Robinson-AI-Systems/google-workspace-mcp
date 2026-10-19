import {publicResource} from '../../src/principals/security.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  let base;
  try{base=publicResource();}
  catch{return res.status(503).json({error:'public_origin_required'});}
  res.status(200).json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base]
  });
}
