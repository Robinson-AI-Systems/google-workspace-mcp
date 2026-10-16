// P5-2 protected operator inspection in the existing key-bearing runtime.
// Owner-authenticated inspection, existing-grant refresh and explicit retirement.
import {refreshConnectedAccountForReadiness} from '../../src/auth/google-auth-hosted.js';
import {parseBody} from '../../src/oauth/helpers.js';
import {initSchema,inspectGoogleTokenRetirement,activateGoogleTokenRetirement,recordLoginAttempt,
 countRecentFailedLogins,markLoginAttemptSucceeded} from '../../src/db.js';
import {evaluateLogin,clientIp,LOCKOUT_WINDOW_MINUTES} from '../../src/oauth/login-guard.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function reply(res,status,body,form=false){
 res.setHeader('Cache-Control','no-store, no-cache, max-age=0');
 res.setHeader('Pragma','no-cache');
 res.setHeader('Referrer-Policy',form?'same-origin':'no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.status(status).send('<!doctype html><meta charset="utf-8"><title>Token encryption readiness</title><main style="font:16px sans-serif;max-width:700px;margin:3rem auto">'+body+'</main>');
}
function canonical(){
 try{const u=new URL(process.env.PUBLIC_BASE_URL||'');
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:null;
 }catch{return null;}
}
function sanitized(report){
 const bool=x=>typeof x==='boolean',count=x=>Number.isSafeInteger(x)&&x>=0;
 const numeric=['missingCopy','corruptOrStale','unverifiedBackfill','refreshNotObserved'];
 const flags=['missingKey','noAccounts'];
 if(!report||!bool(report.encryptedOnly)||!count(report.accountsChecked)||!count(report.plaintextAccounts)||report.plaintextAccounts>report.accountsChecked||!bool(report.ready)||
  !report.problems||numeric.some(k=>!count(report.problems[k]))||flags.some(k=>!bool(report.problems[k]))||
  report.notBefore!==null)
  throw Error('Invalid inspection result');
 return {encryptedOnly:report.encryptedOnly,accountsChecked:report.accountsChecked,plaintextAccounts:report.plaintextAccounts,ready:report.ready,
  problems:Object.fromEntries([...flags,...numeric].map(k=>[k,report.problems[k]])),notBefore:report.notBefore};
}
export default async function handler(req,res){
 const origin=canonical();
 if(!origin){reply(res,503,'<h1>Service configuration required</h1>');return;}
 if(!['GET','POST'].includes(req.method)){reply(res,405,'<h1>Method not allowed</h1>');return;}
 if(req.method==='GET'){
  if(req.headers?.host&&String(req.headers.host).toLowerCase()!==new URL(origin).host.toLowerCase()){
   res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
   res.writeHead(303,{Location:origin+'/api/owner/token-readiness'});res.end();return;
  }
  reply(res,200,'<h1>Inspect token encryption readiness</h1><p>Read-only inspection of all connected accounts. This returns counts and readiness conditions only. It does not refresh accounts or retire plaintext tokens.</p><form method="POST"><label>Admin passphrase <input name="passphrase" type="password" autocomplete="current-password" required></label><p><button type="submit">Inspect readiness</button></p></form><hr><h2>Refresh one existing account</h2><p>Uses only its saved Google grant, verifies the mailbox and saves the refreshed credential. No new scopes or consent.</p><form id="refresh-form" method="POST"><input type="hidden" name="action" value="refresh"><p><label>Connected account email <input name="account" type="email" required></label></p><p><label>Repeat account email <input name="confirm_account" type="email" required></label></p><label>Admin passphrase <input name="passphrase" type="password" autocomplete="current-password" required></label><p><button type="submit">Refresh existing account</button></p></form><hr><h2>Activate encrypted-only storage</h2><p>Run only after the checked encryption-aware release is serving, incompatible deployments have drained, and encrypted recovery or account reconnection has been reviewed. All accounts must pass fresh readiness. Plaintext clears on each account’s next refresh.</p><form id="retire-form" method="POST"><input type="hidden" name="action" value="retire"><p><label><input type="checkbox" name="deployments_drained" value="confirmed" required> Incompatible deployments have drained</label></p><p><label><input type="checkbox" name="recovery_reviewed" value="confirmed" required> Encrypted recovery or reconnection reviewed</label></p><p><label>Type RETIRE PLAINTEXT <input name="confirmation" required></label></p><label>Admin passphrase <input name="passphrase" type="password" autocomplete="current-password" required></label><p><button type="submit">Activate encrypted-only storage</button></p></form>',true);return;
 }
 if(req.headers?.origin!==origin){reply(res,403,'<h1>Wrong website address</h1>');return;}
 if(!process.env.ADMIN_PASSPHRASE){reply(res,503,'<h1>Owner authentication unavailable</h1>');return;}
 let body,refresh=false,retire=false;
 try{body=req.body&&typeof req.body==='object'?req.body:await parseBody(req);
  if(!body||Array.isArray(body))throw Error();
  refresh=body.action==='refresh';retire=body.action==='retire';
  const allowed=refresh?['passphrase','action','account','confirm_account']:retire?['passphrase','action','confirmation','deployments_drained','recovery_reviewed']:['passphrase'];
  if(Object.keys(body).some(k=>!allowed.includes(k))||typeof body.passphrase!=='string'||body.passphrase.length>1024)throw Error();
  if(retire&&(body.confirmation!=='RETIRE PLAINTEXT'||body.deployments_drained!=='confirmed'||body.recovery_reviewed!=='confirmed'))throw Error();
  if(refresh){
   if(typeof body.account!=='string'||typeof body.confirm_account!=='string')throw Error();
   body.account=body.account.trim().toLowerCase();
   if(body.account.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.account)||
    body.confirm_account.trim().toLowerCase()!==body.account)throw Error();
  }
 }catch{reply(res,400,'<h1>Invalid inspection request</h1>');return;}
 try{
  await initSchema();
  const verdict=await evaluateLogin({ip:clientIp(req),supplied:body.passphrase,expected:process.env.ADMIN_PASSPHRASE,
   store:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}});
  if(verdict.status!=='ok'){
   if(verdict.status==='locked')res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
   reply(res,verdict.status==='locked'?429:401,'<h1>Unauthorized</h1>');return;
  }
  if(refresh)await refreshConnectedAccountForReadiness(body.account);
  if(retire)await activateGoogleTokenRetirement({ownerConfirmed:true});
  const report=sanitized(await inspectGoogleTokenRetirement());
  reply(res,200,'<h1>Token readiness inspection</h1><p>'+(retire?'Encrypted-only storage is active. Plaintext clears on each account’s next refresh.':refresh?'Existing account refreshed and mailbox verified. No scopes or storage mode changed.':'No credentials, settings or storage mode changed.')+'</p><pre>'+escape(JSON.stringify(report,null,2))+'</pre>');
 }catch{reply(res,503,'<h1>Inspection unavailable</h1><p>No successful result is confirmed. Inspect readiness before retrying.</p>');}
}
