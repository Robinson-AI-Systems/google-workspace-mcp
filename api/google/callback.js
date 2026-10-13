// Google will only return a mailbox to the owner browser that started
// a fresh passphrase-protected setup. Never exchange unsolicited OAuth codes.
import {handleGoogleCallback} from '../../src/auth/google-auth-hosted.js';
import {initSchema} from '../../src/db.js';
import {verifyGoogleSetup,clearGoogleSetupCookie} from '../../src/oauth/google-setup-state.js';
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function handler(req,res){
 if(req.method!=='GET'){res.status(405).send('Method not allowed');return;}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 const verified=verifyGoogleSetup(req.query?.state,req.headers?.cookie);
 if(!verified){
  res.status(400).send('The Google connection did not start in this browser or has expired. Open /api/google/authorize and approve the owner step again.');
  return;
 }
 // Consume the browser nonce even for denied or failed callbacks; do not
 // allow it to be reused after a successful token exchange.
 res.setHeader('Set-Cookie',clearGoogleSetupCookie());
 if(req.query?.error){
  res.status(400).send('Google did not approve the connection. Restart from /api/google/authorize to try again.');
  return;
 }
 if(typeof req.query?.code!=='string'||!req.query.code.trim()){
  res.status(400).send('Google did not provide an authorization code. Restart from /api/google/authorize.');
  return;
 }
 try{
  await initSchema();
  const email=await handleGoogleCallback(req.query.code,{label:verified.label||undefined});
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><html><body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem"><h2>Connected: ${escapeHtml(email)}</h2><p>This custom Google Workspace MCP can now act as that mailbox with its granted permissions.</p><p>You can close this tab. Future developer tests should prefer the Appliance Rentals account.</p></body></html>`);
 }catch{
  res.status(503).send('Google authorization could not be verified and saved. Check OAuth configuration or the Google consent error, then restart account setup.');
 }
}
