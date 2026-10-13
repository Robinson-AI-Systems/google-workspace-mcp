// Only the owner-started browser may finish a Google OAuth connection.
import { getGoogleAuthUrl } from '../../src/auth/google-auth-hosted.js';
import { startGoogleSetup } from '../../src/oauth/google-setup-state.js';
export default function handler(req,res) {
 if(req.method!=='GET'){res.status(405).send('Method not allowed');return;}
 try {
  const account=typeof req.query?.account==='string'?req.query.account.trim():'';
  const label=typeof req.query?.label==='string'?req.query.label.trim().slice(0,80):'';
  const {state,cookie}=startGoogleSetup(label);
  const url=getGoogleAuthUrl(state,account||undefined);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Set-Cookie',cookie);
  res.writeHead(302,{Location:url});
  res.end();
 } catch {
  res.status(503).send('Google connection setup is unavailable. Verify OAuth client and redirect configuration, then try again.');
 }
}
