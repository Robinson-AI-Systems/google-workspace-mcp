// The login gate. Claude sends the person here as part of connecting the
// custom connector; we show one password field (your ADMIN_PASSPHRASE env
// var) rather than a full user system, since this server only ever has one
// real user: you.
//
// Since 2026-09-30 the page also asks WHICH Google mailbox this particular
// Claude connection should act as. That choice is baked into the token
// Claude receives, so one Claude project can be "Appliance Rentals" and
// another "AI Systems" without either seeing the other's inbox.
import { randomToken, parseBody } from '../../src/oauth/helpers.js';
import {
  getOAuthClient, createAuthCode, initSchema, listGoogleAccounts,
  recordLoginAttempt, countRecentFailedLogins, markLoginAttemptSucceeded
} from '../../src/db.js';
import { clientIp, evaluateLogin, LOCKOUT_WINDOW_MINUTES } from '../../src/oauth/login-guard.js';
import { ensureMigrated } from '../../src/auth/google-auth-hosted.js';
import { RTC_AREAS } from '../../src/rtc/catalog.js';
import { selectedBillingPolicy } from '../../src/rtc/billing-authority.js';
import {getPrincipal,listAccounts,issuePrincipalCode} from '../../src/principals/store.js';
import {requireSession,requireCsrf} from '../../src/principals/session.js';
import {publicMode,publicResource,headers,readCookie,cookie} from '../../src/principals/security.js';
import {inspectOwnerLoginProof,consumeOwnerLoginProof,legacyNewLoginEnabled} from '../../src/principals/owner-migration.js';

function publicSignInAvailable(){
 try{return publicMode()!=='off';}catch{return false;} // bad public config cannot lock out legacy owner
}
function renderLoginPage({ error, hidden, accounts, selected, profile, verifiedOwner=false, legacyEnabled=true }) {
  const selectedProfile = ['read_only','everyday','full'].includes(profile) ? profile : 'read_only';
  const hiddenInputs = Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v || '')}">`).join('\n');
  const accountField = accounts.length === 0
    ? `<label for="google_account">Connected owner mailbox address</label><input type="email" name="google_account" id="google_account" value="${escapeHtml(selected||'')}" required><p class="note">The owner passphrase is required before any connected mailbox is disclosed.</p>`
    : accounts.length === 1
      ? `<input type="hidden" name="google_account" value="${escapeHtml(accounts[0].email)}">
         <p class="note">This connection will act as <strong>${escapeHtml(accounts[0].label || accounts[0].email)}</strong>.</p>`
      : `<label for="google_account">Act as which Google account?</label>
         <select name="google_account" id="google_account" required>
           ${accounts.map((a) => `<option value="${escapeHtml(a.email)}"${a.email === selected ? ' selected' : ''}>${escapeHtml(a.label ? `${a.label} (${a.email})` : a.email)}${a.is_default ? ' — default' : ''}</option>`).join('\n')}
         </select>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Sign in</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  form { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); width: 340px; }
  h1 { font-size: 1.1rem; margin: 0 0 1rem; }
  label { display: block; font-size: 0.85rem; color: #333; margin-bottom: 0.35rem; }
  input[type=password], select { width: 100%; padding: 0.6rem; box-sizing: border-box; margin-bottom: 1rem; border: 1px solid #ccc; border-radius: 6px; font-size: 0.95rem; background: white; }
  button { width: 100%; padding: 0.6rem; background: #111; color: white; border: none; border-radius: 6px; cursor: pointer; }
  .error { color: #c00; font-size: 0.85rem; margin-bottom: 1rem; }
  .note { font-size: 0.85rem; color: #444; margin: 0 0 1rem; }
  code { font-size: 0.8rem; }
</style></head>
<body>
  <form method="POST">
    <h1>Robinson Google Workspace MCP</h1>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    ${publicSignInAvailable()?'<p><a href="/api/oauth/authorize?'+new URLSearchParams({...hidden,auth_method:'google'}).toString()+'" style="color:#075fca">Sign in with a separate Google account</a></p>':''}
    ${!verifiedOwner?'<p><a href="/api/oauth/authorize?'+new URLSearchParams({...hidden,auth_method:'owner_google'}).toString()+'">Use my already-linked owner Google sign-in</a></p>':''}
    ${accountField}
    <label for="profile">Permission level</label>
    <select name="profile" id="profile">${['read_only','everyday','full'].map(value=>`<option value="${value}"${selectedProfile===value ? ' selected' : ''}>${({read_only:'Read only',everyday:'Everyday',full:'Full'})[value]}</option>`).join('')}</select>
    <label for="listing">Tool listing</label>
    <select name="listing" id="listing"><option value="compact">Compact</option><option value="catalog">All tools</option></select>
    <label for="areas">Optional allowed areas (comma separated; leave blank for all)</label>
    <input type="text" name="areas" id="areas" placeholder="mail,files,calendar">
    <label for="cost_consent">Licensing and possible charges</label>
    <p class="note">Assigning or changing license SKUs may incur unknown or unbounded charges. Full is a permission profile, NOT automatic billing approval. Ordinary operations remain available according to Google's actual permissions.</p>
    <select name="cost_consent" id="cost_consent">
      <option value="per_action">Request my approval for each exact billable operation</option>
      <option value="deny">Disallow bulk licensing charges</option>
      <option value="standing_assign">Standing approval to assign licenses</option>
      <option value="standing_change">Standing approval to change licenses</option>
      <option value="standing_both">Standing approval for both license operations</option>
    </select>
    <label><input type="checkbox" name="ack_unknown_charges" value="yes"> I accept unknown account-specific charges for my selected standing authorization</label>
    ${verifiedOwner?'<p class="note">Your linked owner Google identity was verified for this authorization. Existing Google mailbox grants and billing approvals remain unchanged.</p>':legacyEnabled?'<label for="passphrase">Admin passphrase</label><input type="password" name="passphrase" id="passphrase" autofocus required>':'<p class="note">New passphrase sign-in is disabled by owner choice. Existing issued connections remain valid.</p>'}
    ${hiddenInputs}
    <button type="submit">Authorize as existing owner</button>
  </form>
</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
  await initSchema();
  await ensureMigrated().catch(() => {}); // best effort; the page still renders if Google is unreachable
  const params = req.method === 'GET' ? req.query : await parseBody(req);
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = params;
  const hidden = { client_id, redirect_uri, state, code_challenge, code_challenge_method, resource: params.resource,
    ...(params.auth_method==='owner_google'?{auth_method:'owner_google'}:{}) };

  if (response_type && response_type !== 'code') {
    res.status(400).send('Only response_type=code is supported.');
    return;
  }

  const client = await getOAuthClient(client_id);
  if (!client) {
    res.status(400).send('Unknown client_id. This connector needs to register first (this normally happens automatically).');
    return;
  }
  if (!client.redirect_uris.includes(redirect_uri)) {
    res.status(400).send('redirect_uri does not match what this client registered.');
    return;
  }

  // New Google sign-in is a separate auth path. Never enumerate the original
  // owner's mailboxes before passphrase authentication or to a V2 principal.
  if(params.auth_method==='google'){
    let resource;
    try{resource=publicResource()+'/api/mcp';}catch{return res.status(503).send('MCP origin unavailable.');}
    if(params.resource!==resource||params.code_challenge_method!=='S256'||
      !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge||''))
      return res.status(400).send('V2 requires exact MCP resource and S256 PKCE.');
    headers(res);
    let session;
    try{session=await requireSession(req);}catch{session=null;}
    if(!session){
      if(req.method!=='GET')return res.status(401).send('Sign in before authorizing this client.');
      if(publicMode()==='off')return res.status(503).send('New public sign-in is currently disabled.');
      const next=new URL('/api/auth/google/start',publicResource());
      for(const key of ['client_id','redirect_uri','resource','code_challenge','state'])
        next.searchParams.set(key,params[key]);
      next.searchParams.set('purpose','mcp_authorize');
      return res.status(200).send('<!doctype html><h1>Google sign-in</h1><p>Authorize this registered MCP client using your Google account.</p><a href="'+escapeHtml(next.toString())+'">Continue securely with Google</a>');
    }
    const accounts=await listAccounts(session.principal_id);
    if(req.method==='GET'){
      const csrfCookie=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('p10_csrf='));
      const csrf=csrfCookie?decodeURIComponent(csrfCookie.split('=').slice(1).join('=')):'';
      const inputs=['client_id','redirect_uri','state','code_challenge','code_challenge_method','resource']
        .map(key=>'<input type="hidden" name="'+key+'" value="'+escapeHtml(params[key]||'')+'">').join('');
      return res.status(200).send('<!doctype html><meta charset="utf-8"><h1>Authorize this agent</h1>'+
        '<p>Only your own linked Google accounts and selected permissions are available. Agent access is issued but tool dispatch remains disabled pending cross-principal acceptance.</p>'+
        (accounts.length?'<form method="POST">'+inputs+'<input type="hidden" name="auth_method" value="google">'+
          '<input type="hidden" name="csrf" value="'+escapeHtml(csrf)+'">'+
          '<select name="account_id">'+accounts.map(a=>'<option value="'+escapeHtml(a.id)+'">'+escapeHtml(a.label||a.email)+'</option>').join('')+'</select>'+
          '<select name="profile"><option value="read_only">Read only</option><option value="everyday">Everyday</option><option value="full">Full</option></select>'+
          '<button type="submit">Authorize selected account</button></form>':
          '<p>No linked Google account. Open /api/account in this browser to add your own verified Google grant.</p>'));
    }
    try{
      requireCsrf(req,session,params);
      const selected=accounts.find(a=>a.id===params.account_id);
      if(!selected)throw Error('outside_scope');
      const code=await issuePrincipalCode({
        principalId:session.principal_id,accountId:selected.id,clientId:client_id,
        redirectUri:redirect_uri,resource,codeChallenge:params.code_challenge,
        profile:['read_only','everyday','full'].includes(params.profile)?params.profile:'read_only',
        listing:'compact',areas:null,costPolicy:{mode:'per_action'}
      });
      const redirect=new URL(redirect_uri);redirect.searchParams.set('code',code);
      if(state)redirect.searchParams.set('state',state);
      res.writeHead(302,{Location:redirect.toString()});res.end();return;
    }catch{return res.status(403).send('Authorization rejected for this principal/account.');}
  }
  // Existing bearer/refresh tokens are never changed by this branch.
  // A linked Google owner proof is one-use and protocol/client/PKCE-bound.
  let accounts=[]; // No owner mailbox query before either authentication.
  const ownerGoogle=params.auth_method==='owner_google';
  const ownerMeta={clientId:client_id,redirectUri:redirect_uri,
    resource:params.resource||'',codeChallenge:code_challenge||'',
    clientState:state||''};
  const ownerProof=ownerGoogle?readCookie(req,'p10_owner_proof'):null;
  if(ownerGoogle){
    if(params.resource!==publicResource()+'/api/mcp'||params.code_challenge_method!=='S256'||
       !/^[A-Za-z0-9_-]{43}$/.test(code_challenge||''))
      return res.status(400).send('Linked owner sign-in requires exact resource and S256 PKCE.');
    if(!ownerProof&&req.method==='GET'){
      const next=new URL('/api/auth/google/start',publicResource());
      for(const key of ['client_id','redirect_uri','resource','code_challenge','state'])
        if(params[key])next.searchParams.set(key,params[key]);
      next.searchParams.set('purpose','owner_login');
      res.writeHead(302,{Location:next.toString()});res.end();return;
    }
    if(!await inspectOwnerLoginProof(ownerProof,ownerMeta))
      return res.status(403).send('Owner Google proof is missing, expired or does not match this connection.');
    if(req.method==='POST'){
      if(!await consumeOwnerLoginProof(ownerProof,ownerMeta))
        return res.status(403).send('Owner Google proof already consumed.');
      res.setHeader('Set-Cookie',cookie('p10_owner_proof','','/api/oauth/authorize',0));
    }
  }
  const legacyEnabled=legacyNewLoginEnabled();
  if (req.method === 'GET') {
    if(ownerGoogle)accounts=await listGoogleAccounts();
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(renderLoginPage({hidden,accounts,profile:params.profile,
      verifiedOwner:ownerGoogle,legacyEnabled}));
    return;
  }
  if(req.method!=='POST')return res.status(405).send('Method not allowed');
  const keptAccount=String(params.google_account||'').trim().toLowerCase();
  if(!ownerGoogle){
    if(!legacyEnabled)return res.status(403).send('New passphrase sign-in is disabled. Existing bearer connections remain valid.');
    if(!process.env.ADMIN_PASSPHRASE)return res.status(503).send('Owner passphrase is not configured.');
    const verdict=await evaluateLogin({
      ip:clientIp(req),supplied:params.passphrase,expected:process.env.ADMIN_PASSPHRASE,
      store:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}
    });
    if(verdict.status==='locked'){
      res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
      return res.status(429).send(renderLoginPage({error:'Too many wrong passphrases. Try again after the lockout window.',
        hidden,accounts:[],selected:keptAccount,profile:params.profile}));
    }
    if(verdict.status!=='ok')return res.status(401).send(renderLoginPage({
      error:'Incorrect owner passphrase.',hidden,accounts:[],selected:keptAccount,profile:params.profile}));
  }
  accounts=await listGoogleAccounts(); // Only after verified Google owner proof or passphrase.
  const chosen = keptAccount;
  if (!accounts.some((a) => a.email === chosen)) {
    // (passphrase check below happens first in practice; this guards a tampered form)
    res.setHeader('Content-Type', 'text/html');
    res.status(400).send(renderLoginPage({ error: 'Pick one of the connected Google accounts.', hidden, accounts, selected: chosen, profile: params.profile }));
    return;
  }

  const profile = ['read_only','everyday','full'].includes(params.profile) ? params.profile : 'read_only';
  const listing = ['catalog','compact'].includes(params.listing) ? params.listing : 'compact';
  const requestedAreas = String(params.areas || '').trim();
  const areas = requestedAreas ? [...new Set(requestedAreas.split(',').map(x=>x.trim().toLowerCase()))] : null;
  if (areas && (areas.length > RTC_AREAS.length || areas.some(x=>!RTC_AREAS.includes(x)))) {
    res.status(400).send('Invalid area list. Use only: ' + RTC_AREAS.join(', ')); return;
  }
  let costPolicy;
  try {
    costPolicy=selectedBillingPolicy(params.cost_consent,chosen,{
      acceptedUnknown:params.ack_unknown_charges==='yes'
    });
    if(costPolicy.mode==='standing'&&(profile!=='full'||
       (areas!==null&&!areas.includes('admin'))))
      throw Error('Standing licensing authority requires the Full profile and the admin area.');
  }catch {
    res.status(400).send('The selected billing authorization is invalid. Standing permission requires Full access and explicit acknowledgement of unknown charges.'); return;
  }
  const code = randomToken(24);
  await createAuthCode({ code, clientId: client_id, redirectUri: redirect_uri, codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method, googleAccount: chosen, profile, listing, areas, mode:'live', costPolicy });

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);
  res.writeHead(302, { Location: redirectUrl.toString() });
  res.end();
}
