// Owner-only RTC TEST pass issuance. The secret is rendered once as HTML,
// never returned by MCP or stored in plaintext.
import { parseBody } from '../../src/oauth/helpers.js';
import { initSchema, createRtcPass, recordLoginAttempt, countRecentFailedLogins, markLoginAttemptSucceeded } from '../../src/db.js';
import { evaluateLogin, clientIp, LOCKOUT_WINDOW_MINUTES } from '../../src/oauth/login-guard.js';
import { RTC_AREAS } from '../../src/rtc/catalog.js';
const escape = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function respond(res,code,body){
 res.setHeader('Cache-Control','no-store, no-cache, max-age=0');
 res.setHeader('Pragma','no-cache');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.status(code).send('<!doctype html><meta charset="utf-8"><title>RTC TEST pass</title><main style="font:16px sans-serif;max-width:680px;margin:3rem auto">'+body+'</main>');
}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method)){res.status(405).json({error:'method_not_allowed'});return;}
 await initSchema();
 if(req.method==='GET'){
  respond(res,200,'<h1>Create one-time TEST pass</h1><p>Read only, non-production. The secret appears only once after confirmation. Save it in the agent protected environment, never chat.</p><form method="POST"><label>Admin passphrase <input name="passphrase" type="password" required></label><p><label>Connected account email <input type="email" name="google_account" required></label></p><p><label>Allowed areas (optional, comma separated) <input name="areas"></label></p><p><label>Hours (1–720) <input type="number" name="hours" value="24" min="1" max="720"></label></p><p><label>Calls/minute (1–600) <input type="number" name="rate_limit" value="120" min="1" max="600"></label></p><button type="submit">Create read-only TEST pass</button></form>');
  return;
 }
 let expected;try{expected=new URL(process.env.PUBLIC_BASE_URL).origin;}catch{respond(res,503,'<h1>Service configuration required</h1><p>Set PUBLIC_BASE_URL to the HTTPS server origin.</p>');return;}
 if(req.headers.origin!==expected){respond(res,403,'<h1>Forbidden origin</h1>');return;}
 if(!process.env.ADMIN_PASSPHRASE){respond(res,503,'<h1>Admin passphrase is not configured</h1>');return;}
 const body=await parseBody(req);
 const verdict=await evaluateLogin({ip:clientIp(req),supplied:body.passphrase,expected:process.env.ADMIN_PASSPHRASE,
  store:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}});
 if(verdict.status!=='ok'){
   if(verdict.status==='locked')res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
   respond(res,verdict.status==='locked'?429:401,'<h1>Unauthorized</h1><p>Incorrect passphrase or locked login. No pass created.</p>');return;
 }
 const requested=String(body.areas||'').trim();
 const areas=requested?[...new Set(requested.split(',').map(x=>x.trim().toLowerCase()))]:null;
 if(areas&&(areas.length>RTC_AREAS.length||areas.some(x=>!RTC_AREAS.includes(x)))){respond(res,400,'<h1>Invalid areas</h1>');return;}
 try {
   const result=await createRtcPass({googleAccount:body.google_account,areas,hours:Number(body.hours||24),rateLimit:Number(body.rate_limit||120)});
   respond(res,200,'<h1>Pass created</h1><p>TEST / read_only only. This secret will not be shown again. Revoke by its identifier using workspace_revoke_connection.</p><p>Identifier: <code>'+escape(result.id)+'</code></p><pre style="overflow-wrap:anywhere">'+escape(result.token)+'</pre>');
 }catch(err){respond(res,400,'<h1>Pass not created</h1><p>'+escape(err.message)+'</p>');}
}
