import {initSchema} from '../../src/db.js';
import {readSession,listAccounts} from '../../src/principals/store.js';
import {SESSION_COOKIE,CSRF_COOKIE} from '../../src/principals/session.js';
import {readCookie,digest,headers} from '../../src/principals/security.js';
export default async function handler(req,res){
 headers(res);
 if(req.method!=='GET'){res.status(405).json({error:'method_not_allowed'});return;}
 await initSchema();
 const row=await readSession(readCookie(req,SESSION_COOKIE));
 if(!row){res.status(401).json({authenticated:false});return;}
 const csrf=readCookie(req,CSRF_COOKIE);
 if(!csrf||digest(csrf)!==row.csrf_hash){res.status(401).json({authenticated:false});return;}
 const accounts=await listAccounts(row.principal_id);
 res.status(200).json({authenticated:true,principal:{id:row.principal_id,kind:row.kind},
   csrf,linkedAccounts:accounts});
}
