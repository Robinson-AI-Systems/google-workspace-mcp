// Google provider account enrollment is an OWNER operation, separate from
// ordinary MCP/agent developer authorization. Nobody may enroll a mailbox
// just by opening a publicly reachable Google consent URL.
import {getGoogleAuthUrl} from '../../src/auth/google-auth-hosted.js';
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
function send(res,status,html){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.status(status).send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Google account</title><main style="font:16px/1.5 system-ui,sans-serif;max-width:650px;margin:2rem auto;padding:0 1rem">'+html+'</main></html>');
}
function form(account='',label='',purpose='standard'){
 return '<h1>Connect a Google account to Robinson Workspace MCP</h1>'+
 '<p>Only the owner may add or reconnect Google mailboxes. Enter your service owner passphrase first; Google will then ask for consent. This is not a TEST pass or a Toolkit connection.</p>'+
 (purpose==='policy_read'?'<p>Organization policy audit: request only the additional Cloud Identity policies read-only permission. Google keeps existing grants; no additional write permission is requested. Use the existing Super Admin mailbox.</p>':'')+
 '<form method="POST" action="/api/google/authorize" autocomplete="off">'+
 '<input type="hidden" name="purpose" value="'+purpose+'">'+
 '<p><label>Mailbox to suggest to Google (optional)<input type="email" name="account" value="'+escape(account)+'"></label></p>'+
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
  if(!['standard','policy_read'].includes(purpose)){send(res,400,'<h1>Unknown Google consent purpose</h1>');return;}
  const host=req.headers?.host;
  if(typeof host==='string'&&host.trim()&&host.toLowerCase()!==new URL(origin).host.toLowerCase()){
   const u=new URL('/api/google/authorize',origin);
   for(const k of ['account','label'])if(typeof req.query?.[k]==='string')u.searchParams.set(k,req.query[k].slice(0,320));
   if(purpose==='policy_read')u.searchParams.set('purpose',purpose);
   res.setHeader('Cache-Control','no-store');
   res.writeHead(303,{Location:u.toString()});res.end();return;
  }
  send(res,200,form(typeof req.query?.account==='string'?req.query.account.slice(0,320):'',
                    typeof req.query?.label==='string'?req.query.label.slice(0,80):'',purpose));
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
 if(!['standard','policy_read'].includes(purpose)){send(res,400,'<h1>Unknown Google consent purpose</h1>');return;}
 if(purpose==='policy_read'&&(typeof p.account!=='string'||!/^\S+@\S+\.\S+$/.test(p.account.trim()))){send(res,400,'<h1>Existing Super Admin mailbox required</h1>');return;}
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
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Set-Cookie',cookie);
  res.writeHead(302,{Location:url});res.end();
 }catch{
  send(res,503,'<h1>Google connection unavailable</h1><p>Check the service OAuth configuration and database, then retry.</p>');
 }
}
