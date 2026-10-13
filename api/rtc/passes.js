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

// Keep the CSRF guard strict: POST only accepts the configured canonical
// origin. Redirect a GET from Vercel's other assigned aliases to the same
// canonical site BEFORE displaying the form, so the browser submits from
// the one origin accepted by the guard. Never trust forwarding headers for
// authorization or silently accept a foreign POST.
function canonicalOrigin() {
 try {
  const u=new URL(process.env.PUBLIC_BASE_URL||'');
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   (u.pathname==='/'||u.pathname==='')&&!u.search&&!u.hash?u.origin:null;
 } catch {return null;}
}
function directToCanonical(req,res,origin) {
 const host=req.headers?.host;
 if(!origin||typeof host!=='string'||!host.trim()||
    host.toLowerCase()===new URL(origin).host.toLowerCase())return false;
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Referrer-Policy','no-referrer');
 res.writeHead(303,{Location:origin+'/api/rtc/passes'});
 res.end();
 return true;
}

export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method)){res.status(405).json({error:'method_not_allowed'});return;}
 const origin=canonicalOrigin();
 if(!origin){respond(res,503,'<h1>Service configuration required</h1><p>Configure a canonical HTTPS PUBLIC_BASE_URL.</p>');return;}
 if(req.method==='GET'&&directToCanonical(req,res,origin))return;
 await initSchema();
 if(req.method==='GET'){
  respond(res,200,'<h1>Create one-time TEST pass</h1><p>Non-production; read only by default. The secret appears only once after confirmation. Save it in the agent protected environment, never chat.</p><form method="POST"><label>Admin passphrase <input name="passphrase" type="password" required></label><p><label>Connected account email <input type="email" name="google_account" required></label></p><p><label>Allowed areas (optional, comma separated) <input name="areas"></label></p><p><label>Hours (1–720) <input type="number" name="hours" value="1" min="1" max="8760"></label></p><p><label>Calls/minute (1–600) <input type="number" name="rate_limit" value="120" min="1" max="600"></label></p><p><label><input type="checkbox" name="for_hub" value="yes"> For Robinson’s Toolkit (up to 365 days, read-only)</label></p><fieldset><legend>Optional TEST writes</legend><p>Only temporary isolated resources in the approved mailbox. Existing confirmation, domain and cleanup guards still apply. Writes expire within 24 hours and require explicit areas.</p><label><input type="checkbox" name="allow_writes" value="yes"> I authorize TEST writes in the selected areas</label><p><label>Repeat the exact account email to confirm TEST writes <input name="confirmed_account" type="email"></label></p></fieldset><button type="submit">Create TEST pass</button></form>');
  return;
 }
 const expected=origin;
 if(req.headers.origin!==expected){respond(res,403,'<h1>Wrong website address</h1><p>This form can only be submitted from its canonical service address. <a href="'+escape(origin)+'/api/rtc/passes">Open the correct owner setup page</a> and try again.</p>');return;}
 if(!process.env.ADMIN_PASSPHRASE){respond(res,503,'<h1>Admin passphrase is not configured</h1>');return;}
 if(!String(process.env.RTC_TEST_ACCOUNT_EMAILS||'').trim()){respond(res,503,'<h1>TEST account setup is incomplete</h1><p>Configure the approved RTC_TEST_ACCOUNT_EMAILS allowlist on this deployment. No pass created.</p>');return;}
 let body;
 try {
  body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:await parseBody(req);
 } catch {respond(res,400,'<h1>Invalid form data</h1><p>Reopen the setup page and submit again.</p>');return;}
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
   const result=await createRtcPass({googleAccount:body.google_account,areas,hours:Number(body.hours||24),rateLimit:Number(body.rate_limit||120),forHub:body.for_hub==='yes',allowWrites:body.allow_writes==='yes',confirmedAccount:String(body.confirmed_account||'').trim().toLowerCase()});
   respond(res,200,'<h1>Pass created</h1><p>TEST / '+(body.allow_writes==='yes'?'explicit writes enabled':'read_only')+'. This secret will not be shown again. Revoke by its identifier using workspace_revoke_connection.</p><p>Identifier: <code>'+escape(result.id)+'</code></p><pre style="overflow-wrap:anywhere">'+escape(result.token)+'</pre>');
 }catch(err){respond(res,400,'<h1>Pass not created</h1><p>'+escape(err.message)+'</p>');}
}
