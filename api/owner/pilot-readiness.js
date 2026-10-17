// Existing owner passphrase + lockout protect this read-only, sanitized
// pre-pilot report. GET never returns config or reads the owner account table.
import {randomBytes} from 'node:crypto';
import {initSchema,recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded} from '../../src/db.js';
import {createTransaction} from '../../src/principals/store.js';
import {publicGoogleClient,providerUrl} from '../../src/principals/google.js';
import {mint,cookie} from '../../src/principals/security.js';
import {BROWSER_COOKIE} from '../../src/principals/session.js';
import {parseBody} from '../../src/oauth/helpers.js';
import {clientIp,evaluateLogin,LOCKOUT_WINDOW_MINUTES} from '../../src/oauth/login-guard.js';
import {publicResource,headers} from '../../src/principals/security.js';
import {legacyNewLoginEnabled} from '../../src/principals/owner-migration.js';
import {pilotReadiness} from '../../src/principals/pilot-readiness.js';

const form='<!doctype html><html lang="en"><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>Workspace pilot readiness (owner)</title>'+
 '<main style="font:16px/1.5 system-ui;max-width:42rem;margin:3rem auto">'+
 '<h1>Private pilot readiness check</h1>'+
 '<p>The existing owner passphrase is required. This page does not enroll a Google user, '+
 'change permissions, release code or display any secret or test subject.</p>'+
 '<form method="POST"><label>Owner passphrase <input type="password" name="passphrase" '+
 'autocomplete="current-password" required></label> '+
 '<button name="action" value="report" type="submit">Inspect sanitized prerequisites</button> '+
 '<button name="action" value="verify_pilot_subject" type="submit">Google-verify a pilot tester (no enrollment)</button></form>'+ 
 '<p>Tester verification only proves an OAuth subject; it creates no user, grant or agent connection. '+
 'Enter the verified subject ID into secure operator environment settings, never a chat.</p></main></html>';

export default async function handler(req,res){
  headers(res);
  res.setHeader('Vary','Cookie');
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(!['GET','POST'].includes(req.method)){
    res.setHeader('Allow','GET, POST');
    return res.status(405).send('Method not allowed');
  }
  let origin;
  try{origin=publicResource();}catch{return res.status(503).send('Canonical service origin unavailable.');}
  if(req.method==='GET'){
    // Browser navigation form POSTs with Referrer-Policy: no-referrer may
    // arrive with Origin: null; preserve strict same-origin authentication.
    res.setHeader('Referrer-Policy','same-origin');
    // Prevent alias-host form submissions from failing the strict Origin gate.
    if(req.headers?.host&&req.headers.host.toLowerCase()!==new URL(origin).host.toLowerCase()){
      res.writeHead(303,{Location:origin+'/api/owner/pilot-readiness'});res.end();return;
    }
    return res.status(200).send(form);
  }
  // A plain browser POST to this page must have the matching canonical Origin.
  // Never trust arbitrary forwarded headers to authorize a credential-bearing POST.
  if(req.headers?.origin!==origin)return res.status(403).json({error:'invalid_origin'});
  try{
    if(!legacyNewLoginEnabled())return res.status(403).json({error:'owner_passphrase_login_disabled'});
    if(!process.env.ADMIN_PASSPHRASE)return res.status(503).json({error:'owner_auth_unconfigured'});
    await initSchema();
    const input=req.body&&typeof req.body==='object'?req.body:await parseBody(req);
    const verdict=await evaluateLogin({ip:clientIp(req),supplied:input.passphrase,
      expected:process.env.ADMIN_PASSPHRASE,
      store:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}});
    if(verdict.status==='locked'){
      res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
      return res.status(429).json({error:'owner_login_locked'});
    }
    if(verdict.status!=='ok')return res.status(401).json({error:'owner_auth_failed'});
    if(input.action==='verify_pilot_subject'){
      // This passphrase-protected transaction works even when public sign-in
      // is OFF. It requests OIDC identity only, not Workspace grants.
      const client=publicGoogleClient();
      const state=mint('p10st_'),nonce=mint('p10n_'),browser=mint('p10b_');
      const verifier=randomBytes(48).toString('base64url');
      await createTransaction({state,nonce,browser,verifier,purpose:'login',
        policy:{pilotProbe:true}});
      const url=providerUrl({client,state,nonce,verifier,group:'identity'});
      res.setHeader('Set-Cookie',cookie(BROWSER_COOKIE,browser,'/api/auth/google',600));
      res.writeHead(302,{Location:url});res.end();return;
    }
    if(input.action&&input.action!=='report')
      return res.status(400).json({error:'unknown_action'});
    return res.status(200).json(pilotReadiness());
  }catch{return res.status(400).json({error:'pilot_readiness_unavailable'});}
}
