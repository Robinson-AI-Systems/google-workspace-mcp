import {clientIp} from '../../src/oauth/login-guard.js';
// Machine protocol, not an MCP tool: OAuth secrets never enter tool results.
import {neon} from '@neondatabase/serverless';
import {createHandoff} from '../../src/developer/handoff.js';
import {handoffStore,HANDOFF_SCHEMA,HANDOFF_LIMIT_SCHEMA} from '../../src/developer/handoff-store.js';
import {getOAuthClient} from '../../src/db.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'method_not_allowed'});}
    if(req.method==='POST'&&(!req.body||Buffer.byteLength(JSON.stringify(req.body))>4096))return res.status(413).json({error:'request_too_large'});
    const origin=new URL(process.env.PUBLIC_BASE_URL).origin;
    if(origin!==process.env.PUBLIC_BASE_URL)throw Error('Invalid public origin');
    const sql=neon(process.env.DATABASE_URL);
    const query=(text,values)=>typeof sql.query==='function'?sql.query(text,values):sql(text,values);
    await query(HANDOFF_SCHEMA);await query(HANDOFF_LIMIT_SCHEMA);

    return await createHandoff({store:handoffStore(query,{google:true}),origin,clientIp,getClient:getOAuthClient})(req,res);
  }catch{return res.status(503).json({error:'developer_connection_unavailable'});}
}
