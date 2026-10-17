// Optional P10-7 owner migration: authenticate the existing passphrase before
// showing even aggregate owner counts or beginning a FRESH, browser-bound
// Google identity proof. No account, bearer, grant or credential is copied.
import {randomBytes} from 'node:crypto';
import {initSchema,recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded} from '../../src/db.js';
import {clientIp,evaluateLogin,LOCKOUT_WINDOW_MINUTES} from '../../src/oauth/login-guard.js';
import {parseBody} from '../../src/oauth/helpers.js';
import {createTransaction} from '../../src/principals/store.js';
import {ownerMigrationSnapshot,legacyNewLoginEnabled} from '../../src/principals/owner-migration.js';
import {publicGoogleClient,providerUrl} from '../../src/principals/google.js';
import {mint,cookie,headers} from '../../src/principals/security.js';
import {BROWSER_COOKIE} from '../../src/principals/session.js';

const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const form=()=>`<!doctype html><meta charset="utf-8"><h1>Owner Google login recovery</h1>
<p>This will not change existing mailbox grants, accounts, agent access, or the owner passphrase.
Google identity linking is optional. New public enrollment remains separate and disabled unless approved.</p>
<form method="POST">
<label>Existing owner passphrase <input type="password" name="passphrase" required autocomplete="current-password"></label>
<button name="action" value="preview">Preview affected records</button>
<label><input type="checkbox" name="confirm" value="yes"> I explicitly authorize linking my freshly verified Google identity as an additional owner login.</label>
<button name="action" value="link">Verify with Google and link my owner login</button>
</form>`;

export default async function handler(req,res){
 headers(res);res.setHeader('Vary','Cookie');
 if(req.method==='GET')return res.status(200).send(form());
 if(req.method!=='POST')return res.status(405).send('Method not allowed');
 try{
  if(!legacyNewLoginEnabled())return res.status(403).json({error:'owner_passphrase_enrollment_disabled'});
  if(!process.env.ADMIN_PASSPHRASE)return res.status(503).json({error:'owner_auth_unconfigured'});
  await initSchema();
  const p=req.body&&typeof req.body==='object'?req.body:await parseBody(req);
  const verdict=await evaluateLogin({ip:clientIp(req),supplied:p.passphrase,
   expected:process.env.ADMIN_PASSPHRASE,
   store:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}});
  if(verdict.status==='locked'){
   res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
   return res.status(429).json({error:'owner_login_locked'});
  }
  if(verdict.status!=='ok')return res.status(401).json({error:'owner_auth_failed'});
  const snapshot=await ownerMigrationSnapshot();
  if(p.action==='preview')return res.status(200).json(snapshot);
  if(p.action!=='link'||p.confirm!=='yes')return res.status(400).json({error:'explicit_owner_confirmation_required'});
  const client=publicGoogleClient(); // a distinct public Google app, never owner credentials
  const state=mint('p10st_'),nonce=mint('p10n_'),browser=mint('p10b_');
  const verifier=randomBytes(48).toString('base64url');
  await createTransaction({state,nonce,browser,verifier,purpose:'login',
   policy:{ownerProof:'link'}});
  const url=providerUrl({client,state,nonce,verifier});
  res.setHeader('Set-Cookie',cookie(BROWSER_COOKIE,browser,'/api/auth/google',600));
  res.writeHead(302,{Location:url});res.end();
 }catch{
  return res.status(400).json({error:'owner_migration_unavailable'});
 }
}
