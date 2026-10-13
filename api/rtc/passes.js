// Owner-only RTC TEST pass issuance. Secrets display exactly once.
import { parseBody } from '../../src/oauth/helpers.js';
import { initSchema, createRtcPass, recordLoginAttempt, countRecentFailedLogins, markLoginAttemptSucceeded } from '../../src/db.js';
import { evaluateLogin, clientIp, LOCKOUT_WINDOW_MINUTES } from '../../src/oauth/login-guard.js';
import { RTC_AREAS } from '../../src/rtc/catalog.js';
import { ownerFormAllowed,ownerFormOriginWarning } from '../../src/oauth/owner-form-origin.js';
const escape = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allowlistReady=()=>String(process.env.RTC_TEST_ACCOUNT_EMAILS||'').split(',').some(x=>x.trim());
function respond(res,code,body){
 res.setHeader('Cache-Control','no-store, no-cache, max-age=0');
 res.setHeader('Pragma','no-cache');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.status(code).send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google MCP · Owner TEST setup</title><main style="font:16px/1.55 system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem">'+body+'</main></html>');
}
const missing=()=>!process.env.ADMIN_PASSPHRASE?'Owner passphrase is not configured for this deployment.':!allowlistReady()?'TEST account allowlist is not configured for this deployment. Set RTC_TEST_ACCOUNT_EMAILS to the approved connected test mailbox before the next scheduled release.':null;
function page(req){
 const issue=missing();
 const warning=ownerFormOriginWarning(req,process.env.PUBLIC_BASE_URL)?
 '<p role="status"><strong>Configuration warning:</strong> the public OAuth base URL differs from this Vercel site. Same-origin owner forms are supported here; check configured OAuth redirects separately before changing PUBLIC_BASE_URL.</p>':'';
 return `<h1>Robinson Google Workspace MCP — Owner TEST setup</h1>
 <p>This page creates temporary <strong>service-issued</strong> credentials for the custom Google Workspace MCP, not ChatGPT's standard Google connector. A pass does not add Google permissions.</p>
 ${warning}
 ${issue?'<p role="alert"><strong>Setup incomplete:</strong> '+escape(issue)+'</p>':'<p role="status">Owner passphrase and TEST allowlist are configured. The selected mailbox must also be connected through Google OAuth.</p>'}
 <form method="POST" action="/api/rtc/passes" autocomplete="off">
 <p><label>Owner passphrase <input name="passphrase" type="password" required autocomplete="off"></label></p>
 <p><label>Already-connected, explicitly approved TEST mailbox <input name="google_account" type="email" required autocomplete="off"></label></p>
 <p><label>Allowed areas, comma-separated <input name="areas" value="mail" required></label>
 <small>Read-only mail pass: <code>mail</code>. Authorized fixture write pass: <code>workspace,files,calendar,mail</code>.</small></p>
 <p><label>Hours valid <input name="hours" type="number" value="1" min="1" max="8760" required></label>
 <small>Ordinary TEST: 1–720 hours (30 days); TEST writes: 1–24 hours. Toolkit-only read-only: 1–8760 hours (365 days). Use 1 hour for acceptance.</small></p>
 <p><label>Calls per minute <input name="rate_limit" type="number" value="120" min="1" max="600" required></label></p>
 <fieldset><legend>Optional long-term Toolkit integration</legend>
 <label><input type="checkbox" name="for_hub" value="yes"> Robinson's Toolkit read-only connection (up to 365 days)</label>
 <p><small>Leave unchecked for acceptance tests. Toolkit passes cannot permit writes.</small></p></fieldset>
 <fieldset><legend>Optional owner-authorized TEST writes</legend>
 <label><input type="checkbox" name="allow_writes" value="yes"> Enable TEST fixture writes only, not normal production changes</label>
 <p><label>Repeat the exact approved mailbox <input name="confirmed_account" type="email" autocomplete="off"></label></p>
 <small>Requires explicit areas and expires in 24 hours or less. Does not enable writes on Toolkit passes.</small></fieldset>
 <p><button type="submit" ${issue?'disabled':''}>Create one-time TEST pass</button></p></form>
 <p><small>The one-time secret appears only after successful issuance. Save it directly to a protected local runner, never chat, a URL, a log or GitHub. Revoke by the returned non-secret pass identifier after cleanup.</small></p>`;
}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method)){respond(res,405,'<h1>Method not allowed</h1>');return;}
 if(req.method==='GET'){respond(res,200,page(req));return;}
 // A foreign page cannot submit a secret-bearing owner form even if the
 // caller knows or guesses the passphrase. Do not trust x-forwarded-host.
 if(!ownerFormAllowed(req)){respond(res,403,'<h1>Forbidden origin</h1><p>Open the owner setup page at the exact HTTPS address shown in your browser and submit it there. Cross-site requests are refused.</p>');return;}
 if(missing()){respond(res,503,'<h1>Setup incomplete</h1><p>'+escape(missing())+'</p>');return;}
 if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/x-www-form-urlencoded')){
  respond(res,415,'<h1>Unsupported form type</h1>');return;
 }
 await initSchema();
 let body;
 try{body=await parseBody(req);}
 catch{respond(res,400,'<h1>Invalid form</h1><p>Refresh the setup page and submit again.</p>');return;}
 if(!body||typeof body!=='object'||Array.isArray(body)){respond(res,400,'<h1>Invalid form</h1>');return;}
 const verdict=await evaluateLogin({ip:clientIp(req),supplied:body.passphrase,expected:process.env.ADMIN_PASSPHRASE,
  store:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}});
 if(verdict.status!=='ok'){
  if(verdict.status==='locked')res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
  respond(res,verdict.status==='locked'?429:401,'<h1>Unauthorized</h1><p>Incorrect owner passphrase or temporarily locked login. No pass created.</p>');return;
 }
 const requested=String(body.areas||'').trim();
 const areas=requested?[...new Set(requested.split(',').map(x=>x.trim().toLowerCase()))]:null;
 if(areas&&(areas.length>RTC_AREAS.length||areas.some(x=>!RTC_AREAS.includes(x)))){respond(res,400,'<h1>Invalid areas</h1><p>Use only supported areas: '+escape(RTC_AREAS.join(', '))+'</p>');return;}
 try{
  const result=await createRtcPass({googleAccount:body.google_account,areas,hours:Number(body.hours||1),rateLimit:Number(body.rate_limit||120),forHub:body.for_hub==='yes',allowWrites:body.allow_writes==='yes',confirmedAccount:String(body.confirmed_account||'').trim().toLowerCase()});
  respond(res,200,'<h1>Pass created</h1><p>TEST / '+(body.allow_writes==='yes'?'explicit fixture writes enabled':'read_only')+'. <strong>The credential appears only once.</strong> Revoke its identifier after testing.</p><p>Non-secret identifier: <code>'+escape(result.id)+'</code></p><pre style="overflow-wrap:anywhere">'+escape(result.token)+'</pre>');
 }catch(err){respond(res,400,'<h1>Pass not created</h1><p>'+escape(err.message)+'</p><p><a href="/api/rtc/passes">Review setup and try again</a>.</p>');}
}
