import {applyCors} from '../../src/oauth/client-compat.js';
import {museClientDocument} from '../../src/oauth/client-documents.js';

// The Muse client document. Its client_id is this document's own address;
// getOAuthClient recognises that address at every sign-in door.
export default function handler(req, res) {
  if(applyCors(req,res,'GET, OPTIONS'))return;
  res.setHeader('Cache-Control','no-store');
  let doc;
  try{doc=museClientDocument();}
  catch{return res.status(503).json({error:'public_origin_required'});}
  res.status(200).json(doc);
}
