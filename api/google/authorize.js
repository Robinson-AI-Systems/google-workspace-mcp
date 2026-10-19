// Google provider account enrollment is an OWNER operation, separate from
// ordinary MCP/agent developer authorization. Nobody may enroll a mailbox
// just by opening a publicly reachable Google consent URL.
import {getGoogleAuthUrl} from '../../src/auth/google-auth-hosted.js';
import {PRODUCT_DISPLAY_NAME,PROVIDER_DISCLOSURE} from '../../src/branding.js';
import {startGoogleSetup} from '../../src/oauth/google-setup-state.js';
import {parseBody} from '../../src/oauth/helpers.js';
import {initSchema,recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded} from '../../src/db.js';
import {evaluateLogin,clientIp,LOCKOUT_WINDOW_MINUTES} from '../../src/oauth/login-guard.js';
const escape=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function canonical(){
 try{
  const u=new URL(process.env.PUBLIC_BASE_URL||'');
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&
   (u.pathname==='/'||u.pathname==='')?u.origin:null;
 }catch{return null;}
}
function send(res,status,html,{isForm=false}={}){
 res.setHeader('Cache-Control','no-store');
 // A no-referrer form can produce Origin:null in Chromium. Keep the
 // canonical same-origin POST verifiable without leaking to Google.
 res.setHeader('Referrer-Policy',isForm?'same-origin':'no-referrer');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.status(status).send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Google account</title><main style="font:16px/1.5 system-ui,sans-serif;max-width:650px;margin:2rem auto;padding:0 1rem">'+html+'</main></html>');
}
function form(account='',label='',purpose='standard'){
 return '<h1>Connect a Google account to '+escape(PRODUCT_DISPLAY_NAME)+'</h1><p>'+escape(PROVIDER_DISCLOSURE)+'</p>'+
 '<p>Only the owner may add or reconnect Google mailboxes. Enter your service owner passphrase first; Google will then ask for consent. This is not a TEST pass or a Toolkit connection.</p>'+
 (purpose==='postmaster_v2_read'?'<p>Postmaster v2: request the two replacement permissions approved by the owner: read traffic metrics (postmaster.traffic.readonly), and view AND manage registered domains (postmaster.domain). Google bundles domain listing with management capability; this server exposes only reads. No domain registration, deletion, verification, user changes, DNS edits or email sending is authorized. Request the existing Tasks read-only and Site Verification permissions together to retain completion access. Site Verification also permits verifying new sites; tests remain metadata/token reads only. Google is asked to retain all existing grants. Verify the mailbox and all four permissions after consent and refresh. Standard enrollment is unchanged.</p>':purpose==='completion_read'?'<p>Restore the three previously approved completion permissions together: Tasks read-only, Postmaster read-only, and Site Verification. Google requires a Site Verification scope that also permits verifying new sites. Approved tests only read owned-domain metadata and obtain a verification token; no DNS, verification submission, ownership change, or new write permission is authorized. Google is asked to retain existing grants; all three permissions must be verified afterward. Standard enrollment is unchanged.</p>':purpose==='siteverification_read'?'<p>Site Verification reads: request the owner-approved Site Verification permission for the existing test mailbox. Google requires a scope that also permits verifying new sites. Approved tests only read verification metadata or obtain a verification token; they do not edit DNS, submit verification or change site ownership. Google keeps existing grants.</p>':purpose==='postmaster_read'?'<p>Postmaster reads: request only the already-approved Postmaster read-only permission for the existing test mailbox. Google keeps existing grants. No new write permission, domain verification, or test email sending is requested.</p>':purpose==='tasks_read'?'<p>Tasks reads: request only read-only access to Tasks for the existing test mailbox. Google keeps existing grants; no additional write permission is requested.</p>':purpose==='policy_read'?'<p>Organization policy audit: request only the additional Cloud Identity policies read-only permission. Google keeps existing grants; no additional write permission is requested. Use the existing Super Admin mailbox.</p>':purpose==='acceptance_read'?'<p>Acceptance reads: request read-only access to Tasks, your Google profile/email and Vault. Google keeps existing grants; no additional write permission is requested. Vault permission can view eDiscovery data; approved tests read only matter/hold metadata. Use the existing test mailbox. Google may still require an eligible edition or administrator role.</p>':purpose==='catalog_read'?'<p>Catalog reads: request read-only access to Cloud Identity groups and member emails, Chrome management policies, and Google Chat memberships. Google keeps existing grants; no additional write permission is requested. Use the existing test mailbox. These permissions do not override Google edition or administrator-role requirements.</p>':'')+
 '<form method="POST" action="/api/google/authorize" autocomplete="off">'+
 '<input type="hidden" name="purpose" value="'+purpose+'">'+
 '<p><label>'+(purpose==='standard'?'Mailbox to suggest to Google (optional)':'Existing mailbox (required)')+
 '<input type="email" name="account" value="'+escape(account)+'"'+(purpose==='standard'?'':' required')+'></label></p>'+
 '<p><label>Friendly account label (optional)<input name="label" maxlength="80" value="'+escape(label)+'"></label></p>'+
 '<p><label>Service owner passphrase<input type="password" name="passphrase" autocomplete="off" required></label></p>'+
 '<button type="submit">Verify owner and continue to Google</button></form>';
}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');send(res,405,'<h1>Method not allowed</h1>');return;}
 const origin=canonical();
 if(!origin){send(res,503,'<h1>Google connection unavailable</h1><p>Configure the canonical PUBLIC_BASE_URL first.</p>');return;}
 if(req.method==='GET'){
  const purpose=req.query?.purpose??'standard';
  if(!['standard','policy_read','acceptance_read','catalog_read','tasks_read','postmaster_read','siteverification_read','completion_read','postmaster_v2_read'].includes(purpose)){send(res,400,'<h1>Unknown Google consent purpose</h1>');return;}
  const host=req.headers?.host;
  if(typeof host==='string'&&host.trim()&&host.toLowerCase()!==new URL(origin).host.toLowerCase()){
   const u=new URL('/api/google/authorize',origin);
   for(const k of ['account','label'])if(typeof req.query?.[k]==='string')u.searchParams.set(k,req.query[k].slice(0,320));
   if(purpose!=='standard')u.searchParams.set('purpose',purpose);
   res.setHeader('Cache-Control','no-store');
   res.writeHead(303,{Location:u.toString()});res.end();return;
  }
  send(res,200,form(typeof req.query?.account==='string'?req.query.account.slice(0,320):'',
                    typeof req.query?.label==='string'?req.query.label.slice(0,80):'',purpose),{isForm:true});
  return;
 }
 // The owner passphrase never goes through an attacker-controlled origin.
 if(req.headers?.origin!==origin){send(res,403,'<h1>Wrong website address</h1><p>Open the owner setup page at <a href="'+escape(origin)+'/api/google/authorize">the canonical service address</a> and try again.</p>');return;}
 if(!process.env.ADMIN_PASSPHRASE){send(res,503,'<h1>Owner authentication is not configured</h1>');return;}
 let p;
 try{p=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:await parseBody(req);}
 catch{send(res,400,'<h1>Invalid form</h1>');return;}
 if(!p||typeof p!=='object'||Array.isArray(p)){send(res,400,'<h1>Invalid form</h1>');return;}
 const purpose=p.purpose??'standard';
 if(!['standard','policy_read','acceptance_read','catalog_read','tasks_read','postmaster_read','siteverification_read','completion_read','postmaster_v2_read'].includes(purpose)){send(res,400,'<h1>Unknown Google consent purpose</h1>');return;}
 if(purpose!=='standard'&&(typeof p.account!=='string'||!/^\S+@\S+\.\S+$/.test(p.account.trim()))){send(res,400,'<h1>Existing mailbox required</h1>');return;}
 try{
  await initSchema();
  const result=await evaluateLogin({ip:clientIp(req),supplied:p.passphrase,expected:process.env.ADMIN_PASSPHRASE,
   store:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}});
  if(result.status!=='ok'){
   if(result.status==='locked')res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
   send(res,result.status==='locked'?429:401,'<h1>Owner authorization refused</h1><p>Incorrect passphrase or temporary lockout. No Google consent started.</p>');return;
  }
  const account=typeof p.account==='string'?p.account.trim().slice(0,320):'';
  const label=typeof p.label==='string'?p.label.trim().slice(0,80):'';
  const {state,cookie}=startGoogleSetup(label);
  const url=getGoogleAuthUrl(state,account||undefined,purpose);
  res.setHeader('Set-Cookie',cookie);
  // Chromium applies the initiating form's self-only CSP to redirects too.
  // A fresh page and ordinary link keep the passphrase POST on this origin
  // without broadening form-action to Google or forwarding a form body.
  send(res,200,'<h1>Owner verified</h1><p>No Google permission has been granted yet.</p>'+
   '<p><a href="'+escape(url)+'" rel="noreferrer">Continue to Google</a></p>');
 }catch{
  send(res,503,'<h1>Google connection unavailable</h1><p>Check the service OAuth configuration and database, then retry.</p>');
 }
}
