// Owner-reviewed issuance to a registered RSA-owning runner; never browser plaintext.
import {createHash,randomBytes} from 'node:crypto';
import {validateStart} from './handoff.js';
import {issuanceOptions,issuancePrefix} from './test-pass-issuance-store.js';
import {evaluateLogin,LOCKOUT_WINDOW_MINUTES} from '../oauth/login-guard.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const pattern=/^[A-Za-z0-9_-]{43}$/;
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const issuancePath='/api/developer/test-pass-issue';
export function createTestPassIssuance({store,origin,getClient,loginStore,clientIp,ownerPassphrase,now=()=>Date.now()}){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.origin!==origin||base.username||base.password)throw Error('invalid_origin');
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  const json=(n,v)=>res.status(n).json(v);
  const page=(n,v)=>{res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(n).send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Encrypted TEST pass</title><main>'+v+'</main></html>');};
  try{
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(405,{error:'method_not_allowed'});}
   if(req.method==='POST'&&(req.headers['content-type']||'').split(';')[0]==='application/json'){
    const p=req.body;let valid,options;
    try{
     if(!p||Array.isArray(p)||Object.keys(p).some(k=>!['client_id','public_key','poll_hash','account','areas'].includes(k)))throw Error();
     valid=validateStart({client_id:p.client_id,public_key:p.public_key,poll_hash:p.poll_hash,challenge:'a'.repeat(43),profile:'read_only'});
     options=issuanceOptions(p.account,p.areas);
    }catch{return json(400,{error:'invalid_request'});}
    const client=await getClient(p.client_id);
    if(!client?.redirect_uris?.includes(origin+'/api/developer/connect'))return json(400,{error:'invalid_client'});
    const state=randomBytes(32).toString('base64url'),expires=new Date(now()+600000);
    if(!await store.start({...valid,client_id:issuancePrefix+p.client_id,challenge:JSON.stringify(options),state,expires,ip:hash(String(clientIp(req)))}))return json(429,{error:'request_unavailable'});
    return json(201,{request_id:state,authorization_url:origin+issuancePath+'?state='+state,expires_at:expires.toISOString()});
   }
   const p=req.method==='GET'?req.query:req.body;
   if(!p||!pattern.test(p.state||'')||Object.keys(p).some(k=>!['state',...(req.method==='POST'?['passphrase']:[])].includes(k)))return json(400,{error:'invalid_request'});
   const row=await store.find(p.state);
   if(!row||!row.client_id.startsWith(issuancePrefix)||!(new Date(row.expires_at).getTime()>now()))return json(410,{error:'request_unavailable'});
   const options=JSON.parse(row.challenge);
   if(JSON.stringify(issuanceOptions(options.account,options.areas))!==row.challenge)return json(410,{error:'request_unavailable'});
   if(req.method==='GET'&&req.headers.authorization!==undefined){
    const secret=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization)?.[1];
    if(!secret)return json(401,{error:'unauthorized'});
    const result=await store.poll(p.state,hash(secret));
    if(!result)return json(410,{error:'request_unavailable'});
    if(result.status==='pending')return json(202,{status:'authorization_pending'});
    if(result.status!=='authorized')return json(403,{error:'access_denied'});
    return json(200,{status:'authorized',sealed_pass:result.sealed_code});
   }
   if(req.method==='GET'){
    if(req.headers.host!==base.host){res.writeHead(303,{Location:origin+issuancePath+'?state='+p.state});return res.end();}
    if(row.status!=='pending')return page(200,'<h1>Request already handled</h1><p>Return to your chat. No additional pass will be created.</p>');
    res.setHeader('Referrer-Policy','same-origin');
    return page(200,'<h1>Create encrypted read-only TEST pass</h1><p>Mailbox: '+escape(options.account)+'</p><p>Allowed areas: '+escape(options.areas.join(', '))+'</p><p>24 hours; read-only; no Toolkit access or writes. Creates one new pass. The requesting runner alone can decrypt it. Existing passes stay unchanged. Approve only a request your agent prepared.</p><form method="POST" action="'+issuancePath+'" autocomplete="off"><input type="hidden" name="state" value="'+escape(p.state)+'"><label>Service owner passphrase<input type="password" name="passphrase" autocomplete="off" required></label><button type="submit">Create 24-hour read-only TEST pass</button></form>');
   }
   if(req.headers.origin!==origin)return json(403,{error:'origin_refused'});
   if((req.headers['content-type']||'').split(';')[0]!=='application/x-www-form-urlencoded')return json(415,{error:'invalid_content_type'});
   if(row.status!=='pending')return json(409,{error:'request_already_handled'});
   if(!ownerPassphrase)return json(503,{error:'owner_not_configured'});
   const verdict=await evaluateLogin({ip:clientIp(req),supplied:p.passphrase,expected:ownerPassphrase,store:loginStore});
   if(verdict.status!=='ok'){
    if(verdict.status==='locked')res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
    return json(verdict.status==='locked'?429:401,{error:'owner_verification_refused'});
   }
   if(!await store.issue(row))return json(409,{error:'request_unavailable_no_replay'});
   return page(200,'<h1>Encrypted TEST pass created</h1><p>The requesting test runner can now retrieve its encrypted credential. Return to your chat; there is no key to select or copy.</p>');
  }catch{return json(503,{error:'test_issuance_unavailable'});}
 };
}
