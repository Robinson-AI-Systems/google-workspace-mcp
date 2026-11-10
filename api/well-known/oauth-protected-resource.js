import {applyCors} from '../../src/oauth/client-compat.js';
import {publicResource} from '../../src/principals/security.js';
import {connectorNameFrom} from '../../src/oauth/connector-address.js';

export default function handler(req, res) {
  if(applyCors(req,res,'GET, OPTIONS'))return;
  res.setHeader('Cache-Control','no-store');
  let base;
  try{base=publicResource();}
  catch{return res.status(503).json({error:'public_origin_required'});}
  res.status(200).json({
    // A named connector address describes itself (/api/mcp/<name>).
    resource: `${base}/api/mcp${connectorNameFrom(req)?'/'+connectorNameFrom(req):''}`,
    authorization_servers: [base]
  });
}
