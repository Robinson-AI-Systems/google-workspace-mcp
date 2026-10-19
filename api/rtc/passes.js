// Owner-authenticated RTC TEST and live pass issuance. The secret is rendered once as HTML,
// never returned by MCP or stored in plaintext.
import { parseBody } from '../../src/oauth/helpers.js';
import {PRODUCT_DISPLAY_NAME,PROVIDER_DISCLOSURE} from '../../src/branding.js';
import { initSchema, createRtcPass, recordLoginAttempt, countRecentFailedLogins, markLoginAttemptSucceeded } from '../../src/db.js';
import { evaluateLogin, clientIp, LOCKOUT_WINDOW_MINUTES } from '../../src/oauth/login-guard.js';
import { RTC_AREAS } from '../../src/rtc/catalog.js';
import { selectedBillingPolicy } from '../../src/rtc/billing-authority.js';
const escape = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function respond(res,code,body,{isForm=false}={}){
 res.setHeader('Cache-Control','no-store, no-cache, max-age=0');
 res.setHeader('Pragma','no-cache');
 // A navigation POST under no-referrer sends Origin: null (Fetch §3.2).
 // Only the credential-entry form retains its same-origin referrer. Never
 // disclose referrers cross-origin or from the one-time-secret result page.
 res.setHeader('Referrer-Policy',isForm?'same-origin':'no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.status(code).send('<!doctype html><meta charset="utf-8"><title>'+escape(PRODUCT_DISPLAY_NAME)+' — RTC connection pass</title><main style="font:16px sans-serif;max-width:680px;margin:3rem auto">'+body+'</main>');
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
  respond(res,200,'<h1>Create one-time TEST pass or authorized live pass</h1><p>'+escape(PROVIDER_DISCLOSURE)+'</p><p>TEST is limited to enrolled development accounts. Live is for an already connected account whose owner deliberately delegates ordinary Google actions. Save the one-time pass only in a protected agent connection, never a chat or URL.</p><form method="POST"><label>Admin passphrase <input name="passphrase" type="password" required></label><p><label>Connected account email <input type="email" name="google_account" required></label></p><p><label>Pass mode <select name="mode"><option value="test">TEST (default, development-only)</option><option value="live">Live, user-authorized</option></select></label></p><p><label>Profile for live mode <select name="profile"><option value="read_only">Read only</option><option value="everyday">Everyday</option><option value="full">Full (includes guarded admin and billing actions)</option></select></label></p><p><label>Allowed areas (optional for TEST, required for live; comma separated) <input name="areas"></label></p><p><label>Hours (up to 720 normal, 8760 for read-only Hub) <input type="number" name="hours" value="1" min="1" max="8760"></label></p><p><label>Calls/minute (1–600) <input type="number" name="rate_limit" value="120" min="1" max="600"></label></p><p><label><input type="checkbox" name="for_hub" value="yes"> For Robinson’s Toolkit (Hub is not required; TEST Hub grants remain read-only)</label></p><fieldset><legend>Write authorization for selected profile</legend><p>TEST writes are restricted to approved isolated fixtures and 24 hours. LIVE writes may affect real mail, files, users, licenses and security settings: your delegated agent can execute them under Google scopes, this selected profile, guards and audit logs. For live everyday/full, enable writes explicitly and confirm the account.</p><label><input type="checkbox" name="allow_writes" value="yes"> Authorize writes in selected areas</label><p><label>Repeat exact account to confirm writes <input name="confirmed_account" type="email"></label></p></fieldset><fieldset><legend>LIVE licensing charges (Full required)</legend><p>Google license assignment or SKU changes may incur UNKNOWN or unbounded charges. Profile Full does not grant spending consent by itself. A per-action policy requests confirmation for each exact request.</p><label>Billing authorization <select name="cost_consent"><option value="per_action">Approve each billable request</option><option value="deny">Do not allow billable bulk operations</option><option value="standing_assign">Standing authorization: assign licenses</option><option value="standing_change">Standing authorization: change license SKU</option><option value="standing_both">Standing authorization: both operations</option></select></label><p><label><input type="checkbox" name="ack_unknown_charges" value="yes"> I accept unknown/unbounded account-specific charges for my selected standing authorization</label></p></fieldset><button type="submit">Create one-time pass</button></form>',{isForm:true});
  return;
 }
 const expected=origin;
 if(req.headers.origin!==expected){respond(res,403,'<h1>Wrong website address</h1><p>This form can only be submitted from its canonical service address. <a href="'+escape(origin)+'/api/rtc/passes">Open the correct owner setup page</a> and try again.</p>');return;}
 if(!process.env.ADMIN_PASSPHRASE){respond(res,503,'<h1>Admin passphrase is not configured</h1>');return;}
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
 const mode=body.mode===undefined?'test':body.mode;
 if(!['test','live'].includes(mode)){respond(res,400,'<h1>Invalid mode</h1>');return;}
 if(mode==='test'&&!String(process.env.RTC_TEST_ACCOUNT_EMAILS||'').trim()){
   respond(res,503,'<h1>TEST account setup is incomplete</h1><p>Configure the approved RTC_TEST_ACCOUNT_EMAILS allowlist on this deployment. No pass created.</p>');return;
 }
 const requested=String(body.areas||'').trim();
 const areas=requested?[...new Set(requested.split(',').map(x=>x.trim().toLowerCase()))]:null;
 if(areas&&(areas.length>RTC_AREAS.length||areas.some(x=>!RTC_AREAS.includes(x)))){respond(res,400,'<h1>Invalid areas</h1>');return;}
 try {
   if(mode==='test'&&(body.cost_consent && body.cost_consent!=='per_action'||body.ack_unknown_charges==='yes'))
     throw Error('Standing cost authorization is only available on live passes.');
   const selection=mode==='test'?'deny':body.cost_consent;
   const costPolicy=mode==='test'?{mode:'deny'}:
     selectedBillingPolicy(selection,String(body.google_account||'').trim().toLowerCase(),{acceptedUnknown:body.ack_unknown_charges==='yes'});
   if(costPolicy.mode==='standing'&&(body.profile!=='full'||body.allow_writes!=='yes'||
      !areas?.includes('admin')))throw Error('Standing license authorization requires Full writes and the admin area.');
   const result=await createRtcPass({mode,profile:mode==='live'?body.profile:undefined,
     costPolicy,googleAccount:body.google_account,areas,hours:Number(body.hours||24),
     rateLimit:Number(body.rate_limit||120),forHub:body.for_hub==='yes',
     allowWrites:body.allow_writes==='yes',confirmedAccount:String(body.confirmed_account||'').trim().toLowerCase()});
   respond(res,200,'<h1>Pass created</h1><p>'+escape(mode)+' / '+escape(mode==='test'?(body.allow_writes==='yes'?'explicit TEST writes enabled':'read_only'):body.profile)+'. Only the selected permissions were granted. This secret will not be shown again. Revoke by its identifier using workspace_revoke_connection.</p><p>Identifier: <code>'+escape(result.id)+'</code></p><pre style="overflow-wrap:anywhere">'+escape(result.token)+'</pre>');
 }catch(err){respond(res,400,'<h1>Pass not created</h1><p>'+escape(err.message)+'</p>');}
}
