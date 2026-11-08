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
import { PRODUCT_DISPLAY_NAME, PROVIDER_DISCLOSURE } from '../../src/branding.js';
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
  // The pre-picked access level is Full: the owner's own connections are
  // full-access, and a quieter default silently downgraded every new
  // connection. A profile the client asked for, or the owner already
  // picked, is still pre-filled exactly as requested. (A hand-built POST
  // that omits the field entirely keeps the handler's read-only
  // fail-safe; the rendered form always submits this select.)
  const selectedProfile = ['read_only','everyday','full'].includes(profile) ? profile : 'full';
  const hiddenInputs = Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v || '')}">`).join('\n');
  const ownerGoogleHref = '/api/oauth/authorize?'+escapeHtml(new URLSearchParams({...hidden,auth_method:'owner_google'}).toString());
  const separateGoogleHref = '/api/oauth/authorize?'+escapeHtml(new URLSearchParams({...hidden,auth_method:'google'}).toString());
  const googleChoices = `${!verifiedOwner?`<a class="button" href="${ownerGoogleHref}">Sign in with Google</a>
    <p class="hint">Use the Google account you already linked to this service.</p>`:''}${publicSignInAvailable()?`<p class="alt"><a href="${separateGoogleHref}">Sign in with a separate Google account</a> — first time here, or linking a different account.</p>`:''}`;
  const accountField = accounts.length === 0
    ? `<label for="google_account">Mailbox address</label><input type="email" name="google_account" id="google_account" value="${escapeHtml(selected||'')}" required><p class="hint">Type the address of a mailbox you have already linked to this service. Linked mailboxes are not listed here, for security.</p>`
    : accounts.length === 1
      ? `<input type="hidden" name="google_account" value="${escapeHtml(accounts[0].email)}">
         <p class="note">This connection will act as <strong>${escapeHtml(accounts[0].label || accounts[0].email)}</strong>.</p>`
      : `<label for="google_account">Which mailbox should this connection act as?</label>
         <select name="google_account" id="google_account" required>
           ${accounts.map((a) => `<option value="${escapeHtml(a.email)}"${a.email === selected ? ' selected' : ''}>${escapeHtml(a.label ? `${a.label} (${a.email})` : a.email)}${a.is_default ? ' — default' : ''}</option>`).join('\n')}
         </select>`;
  const profileField = `<label for="profile">Access level</label>
    <select name="profile" id="profile">${['full','everyday','read_only'].map(value=>`<option value="${value}"${selectedProfile===value ? ' selected' : ''}>${({full:'Full',everyday:'Everyday',read_only:'Read only'})[value]}</option>`).join('')}</select>
    <p class="hint">Your own connections normally use Full.</p>`;
  const advancedFold = `<details class="advanced"><summary>Advanced options</summary>
    <label for="listing">Tool listing</label>
    <select name="listing" id="listing"><option value="compact">Compact</option><option value="catalog">All tools</option></select>
    <label for="areas">Limit to certain areas (optional; leave blank for all)</label>
    <input type="text" name="areas" id="areas" placeholder="mail, files, calendar">
  </details>`;
  const head = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  body { font-family: Manrope, -apple-system, 'Segoe UI', sans-serif; background: #F7F5EC; color: #17251E; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; }
  .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(23,37,30,0.10); width: 380px; max-width: 100%; box-sizing: border-box; }
  h1 { font-size: 1.15rem; margin: 0 0 0.5rem; color: #123C2D; }
  label { display: block; font-size: 0.85rem; color: #333; margin: 1rem 0 0.35rem; }
  input[type=email], input[type=password], input[type=text], select { width: 100%; padding: 0.6rem; box-sizing: border-box; border: 1px solid #ccc; border-radius: 6px; font-size: 0.95rem; background: white; font-family: inherit; }
  button { width: 100%; padding: 0.65rem; background: #123C2D; color: #F7F5EC; border: none; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600; margin-top: 1.25rem; }
  a.button { display: block; text-align: center; background: #123C2D; color: #F7F5EC; padding: 0.65rem; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 1rem 0 0.25rem; }
  a { color: #123C2D; }
  .error { color: #c00; font-size: 0.85rem; margin-bottom: 1rem; }
  .note { font-size: 0.9rem; color: #444; margin: 0 0 0.5rem; }
  .hint { font-size: 0.85rem; color: #666; margin: 0.35rem 0 0; }
  .alt { font-size: 0.9rem; margin: 0.75rem 0 0; }
  .divider { text-align: center; font-size: 0.8rem; color: #888; margin: 1.25rem 0 0; }
  .advanced { margin-top: 1rem; font-size: 0.9rem; }
  .advanced summary { cursor: pointer; color: #123C2D; font-weight: 600; }
  .fineprint { font-size: 0.72rem; color: #888; margin: 1.5rem 0 0; }
</style></head>
<body>
  <div class="card">
    <h1>${escapeHtml(PRODUCT_DISPLAY_NAME)}</h1>`;
  const tail = `<p class="fineprint">${escapeHtml(PROVIDER_DISCLOSURE)}</p>
  </div>
</body></html>`;
  if (!verifiedOwner && !legacyEnabled) {
    // Passphrase sign-in is off (a server setting, not something to
    // explain on the page): the one thing this page asks for is the
    // Google sign-in the owner already linked. No form, no dead ends.
    return `${head}
    <p class="note">Connect this app to one of your linked Google mailboxes.</p>
    ${googleChoices}
    ${tail}`;
  }
  const intro = verifiedOwner
    ? `<p class="note">You are signed in as the owner. Choose what this connection can do, then continue.</p>`
    : `<p class="note">Connect this app to one of your linked Google mailboxes.</p>`;
  const buttonLabel = verifiedOwner
    ? (accounts.length === 1 ? `Continue as ${escapeHtml(accounts[0].label || accounts[0].email)}` : accounts.length > 1 ? 'Continue with the selected mailbox' : 'Continue')
    : 'Sign in and authorize';
  return `${head}
    ${intro}
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    ${!verifiedOwner ? `${googleChoices}
    <p class="divider">or use your passphrase</p>` : ''}
  <form method="POST">
    ${accountField}
    ${verifiedOwner ? '' : '<label for="passphrase">Admin passphrase</label><input type="password" name="passphrase" id="passphrase" autofocus required>'}
    ${profileField}
    ${advancedFold}
    ${hiddenInputs}
    <button type="submit">${buttonLabel}</button>
  </form>
    ${tail}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
  await initSchema();
  await ensureMigrated().catch(() => {}); // best effort; the page still renders if Google is unreachable
  const params = req.method === 'GET' ? req.query : await parseBody(req);
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = params;
  const resourceParam = client_id === 'muse' && !params.resource ? publicResource() + '/api/mcp' : params.resource;
  const hidden = { client_id, redirect_uri, state, code_challenge, code_challenge_method, resource: resourceParam,
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

  // Both existing-owner and V2 authorizations require S256 PKCE. Do not
  // advertise a weaker option that this issuer will silently accept.
  // Already-issued access and refresh tokens remain valid and unchanged.
  if (code_challenge_method !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(code_challenge || '')) {
    res.status(400).send('This connector requires S256 PKCE with a valid code challenge.');
    return;
  }

  // New Google sign-in is a separate auth path. Never enumerate the original
  // owner's mailboxes before passphrase authentication or to a V2 principal.
  if(params.auth_method==='google'){
    let resource;
    try{resource=publicResource()+'/api/mcp';}catch{return res.status(503).send('MCP origin unavailable.');}
    if(resourceParam!==resource||params.code_challenge_method!=='S256'||
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
        next.searchParams.set(key,key==='resource'?resourceParam:params[key]);
      next.searchParams.set('purpose','mcp_authorize');
      return res.status(200).send('<!doctype html><h1>Google sign-in</h1><p>Authorize this registered MCP client using your Google account.</p><a href="'+escapeHtml(next.toString())+'">Continue securely with Google</a>');
    }
    const accounts=await listAccounts(session.principal_id);
    if(req.method==='GET'){
      const csrfCookie=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('p10_csrf='));
      const csrf=csrfCookie?decodeURIComponent(csrfCookie.split('=').slice(1).join('=')):'';
      const inputs=['client_id','redirect_uri','state','code_challenge','code_challenge_method','resource']
        .map(key=>'<input type="hidden" name="'+key+'" value="'+escapeHtml(key==='resource'?resourceParam:params[key]||'')+'">').join('');
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
    resource:resourceParam||'',codeChallenge:code_challenge||'',
    clientState:state||''};
  const ownerProof=ownerGoogle?readCookie(req,'p10_owner_proof'):null;
  if(ownerGoogle){
    if(resourceParam!==publicResource()+'/api/mcp'||params.code_challenge_method!=='S256'||
       !/^[A-Za-z0-9_-]{43}$/.test(code_challenge||''))
      return res.status(400).send('Linked owner sign-in requires exact resource and S256 PKCE.');
    if(!ownerProof&&req.method==='GET'){
      const next=new URL('/api/auth/google/start',publicResource());
      for(const key of ['client_id','redirect_uri','resource','code_challenge','state'])
        if((key==='resource'?resourceParam:params[key]))next.searchParams.set(key,key==='resource'?resourceParam:params[key]);
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
    if(!process.env.ADMIN_PASSPHRASE)
      return res.status(500).send('Server misconfigured: ADMIN_PASSPHRASE is not set.');
    const verdict=await evaluateLogin({
      ip:clientIp(req),supplied:params.passphrase,expected:process.env.ADMIN_PASSPHRASE,
      store:{recordLoginAttempt,countRecentFailedLogins,markLoginAttemptSucceeded}
    });
    if(verdict.status==='locked'){
      res.setHeader('Retry-After',String(LOCKOUT_WINDOW_MINUTES*60));
      return res.status(429).send(renderLoginPage({
        error:`Too many wrong passphrases from this connection. Wait ${LOCKOUT_WINDOW_MINUTES} minutes before trying again.`,
        hidden,accounts:[],selected:keptAccount,profile:params.profile}));
    }
    if(verdict.status==='wrong'){
      const left=verdict.attemptsLeft>0
        ?` ${verdict.attemptsLeft} ${verdict.attemptsLeft===1?'try':'tries'} left before a ${LOCKOUT_WINDOW_MINUTES}-minute lockout.`
        :` The next wrong try starts a ${LOCKOUT_WINDOW_MINUTES}-minute lockout.`;
      return res.status(401).send(renderLoginPage({
        error:`Incorrect passphrase. Your account choice was kept.${left}`,
        hidden,accounts:[],selected:keptAccount,profile:params.profile}));
    }
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
