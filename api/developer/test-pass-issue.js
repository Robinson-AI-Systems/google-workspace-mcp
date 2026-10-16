import {neon} from '@neondatabase/serverless';
import {createTestPassIssuance} from '../../src/developer/test-pass-issuance.js';
import {testPassIssuanceStore} from '../../src/developer/test-pass-issuance-store.js';
import {HANDOFF_SCHEMA,HANDOFF_LIMIT_SCHEMA} from '../../src/developer/handoff-store.js';
import {getOAuthClient,initSchema,recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded} from '../../src/db.js';
import {clientIp} from '../../src/oauth/login-guard.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'method_not_allowed'});}
  if(req.method==='POST'){
   if(req.headers['content-length']&&Number(req.headers['content-length'])>4096)return res.status(413).json({error:'request_too_large'});
   if(!req.body||typeof req.body!=='object'){
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)return res.status(413).json({error:'request_too_large'});}
    req.body=(req.headers['content-type']||'').startsWith('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw));
   }
   if(Buffer.byteLength(JSON.stringify(req.body))>4096)return res.status(413).json({error:'request_too_large'});
  }
  const sql=neon(process.env.DATABASE_URL),query=(text,values)=>typeof sql.query==='function'?sql.query(text,values):sql(text,values);
  await initSchema();await query(HANDOFF_SCHEMA);await query(HANDOFF_LIMIT_SCHEMA);
  return await createTestPassIssuance({store:testPassIssuanceStore(query),origin:process.env.PUBLIC_BASE_URL,getClient:getOAuthClient,clientIp,ownerPassphrase:process.env.ADMIN_PASSPHRASE,loginStore:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}})(req,res);
 }catch{return res.status(503).json({error:'test_issuance_unavailable'});}
}
