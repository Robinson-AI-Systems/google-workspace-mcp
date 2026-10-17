import {initSchema} from '../../src/db.js';
import {requireSession,requireCsrf,clearSession} from '../../src/principals/session.js';
import {headers} from '../../src/principals/security.js';
export default async function handler(req,res){
 headers(res);
 if(req.method!=='POST'){res.status(405).json({error:'method_not_allowed'});return;}
 try{
  await initSchema();
  const row=await requireSession(req);
  const body=req.body&&typeof req.body==='object'?req.body:{};
  requireCsrf(req,row,body);
  await clearSession(req,res);
  res.status(200).json({loggedOut:true,agentConnectionsRevoked:false});
 }catch{res.status(403).json({error:'invalid_session_or_csrf'});}
}
