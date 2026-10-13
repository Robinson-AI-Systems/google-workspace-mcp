import { handleGoogleCallback } from '../../src/auth/google-auth-hosted.js';
import { initSchema } from '../../src/db.js';
import { verifyGoogleSetup,clearGoogleSetupCookie } from '../../src/oauth/google-setup-state.js';
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function handler(req,res) {
 if(req.method!=='GET'){res.status(405).send('Method not allowed');return;}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Referrer-Policy','no-referrer');
 const verified=verifyGoogleSetup(req.query?.state,req.headers?.cookie);
 if(!verified){res.status(400).send('Google connection was not started in this browser, or it expired. Reopen /api/google/authorize in the same browser and try again.');return;}
 // Always consume browser state on a verified callback, including provider
 // refusal, so the original link cannot be replayed from this browser.
 res.setHeader('Set-Cookie',clearGoogleSetupCookie());
 if(req.query?.error){res.status(400).send('Google declined the requested connection. Return to the setup page and try again.');return;}
 if(typeof req.query?.code!=='string'||!req.query.code.trim()){res.status(400).send('Google did not return an authorization code. Restart connection setup.');return;}
 try {
  await initSchema();
  const email=await handleGoogleCallback(req.query.code,{label:verified.label||undefined});
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.status(200).send(`<!doctype html><html><body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem"><h2>Connected: ${escapeHtml(email)}</h2><p>Your Google account is now connected to this custom Workspace MCP.</p><p>Close this tab, or return to the owner setup page to issue a restricted TEST pass.</p></body></html>`);
 } catch {
  res.status(503).send('Google connection could not be verified or stored. Confirm Google OAuth redirect and service credentials, then restart /api/google/authorize.');
 }
}
