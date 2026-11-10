// The login gate. Claude sends the person here as part of connecting the
// custom connector; we show one password field (your ADMIN_PASSPHRASE env
// var) rather than a full user system, since this server only ever has one
// real user: you.
//
// Since 2026-09-30 the page also asks WHICH Google mailbox this particular
// Claude connection should act as. That choice is baked into the token
// Claude receives, so one Claude project can be "Appliance Rentals" and
// another "AI Systems" without either seeing the other's inbox.
import { isMuseClient } from '../../src/oauth/client-documents.js';
import { randomToken, parseBody } from '../../src/oauth/helpers.js';
import { PRODUCT_DISPLAY_NAME, PROVIDER_DISCLOSURE } from '../../src/branding.js';
import { BRAND, BRAND_CSS, BRAND_CSP, brandHeader, brandFooter } from '../../src/brand/brand.js';
import { ACCESS_LEVELS } from '../../src/brand/access-levels.js';
import {
  getOAuthClient, createAuthCode, initSchema, listGoogleAccounts,
  recordLoginAttempt, countRecentFailedLogins, markLoginAttemptSucceeded
} from '../../src/db.js';
import { clientIp, evaluateLogin, LOCKOUT_WINDOW_MINUTES } from '../../src/oauth/login-guard.js';
import { ensureMigrated } from '../../src/auth/google-auth-hosted.js';
import { RTC_AREAS } from '../../src/rtc/catalog.js';
import { selectedBillingPolicy } from '../../src/rtc/billing-authority.js';
import {getPrincipal,listAccounts,issuePrincipalCode,readConnectHandle,consumeConnectHandle,principalSignInEmail,getLatestLinkDenial} from '../../src/principals/store.js';
import {requireSession,requireCsrf} from '../../src/principals/session.js';
import {publicMode,publicResource,headers,readCookie,readCookies,cookie,digest} from '../../src/principals/security.js';
import {inspectOwnerLoginProof,consumeOwnerLoginProof,legacyNewLoginEnabled} from '../../src/principals/owner-migration.js';

function publicSignInAvailable(){
 try{return publicMode()!=='off';}catch{return false;} // bad public config cannot lock out legacy owner
}
// BRAND-1 (2026-11-09): the sign-in pages use the one Workspace Unleashed
// shell (company tokens, Violet accent). The Robinson Appliance Rentals kit
// that had been used here (Manrope, evergreen/ivory) is gone: wrong business.
const LOGIN_CSS = '.note{margin:0 0 10px}.alt{font-size:15px;margin:12px 0 0}.divider{text-align:center;font-size:14px;color:var(--muted);margin:18px 0 0}'+
  '.advanced{margin-top:12px;font-size:15px}.fineprint{font-size:13px;color:var(--muted);margin:18px 0 0}.devonly{border:1px dashed var(--accent);border-radius:12px;padding:10px 12px;color:var(--accent);font-size:14px}';
function loginHead() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Sign in — '+escapeHtml(BRAND.productShort)+'</title><link rel="icon" type="image/png" href="/brand/icon-256.png">'+
    '<style>'+BRAND_CSS+LOGIN_CSS+'</style></head><body><main>'+brandHeader();
}
function loginTail() {
  return brandFooter()+'</main></body></html>';
}

// RAS MCP Standard D-006 MC-7: a browser that has just come back from Google
// (the callback adds returned=1) but arrives without the sign-in it was
// given never gets sent round again silently. It gets this page, which says
// what happened and what to do. Retrying would loop the same way.
function renderReturnProblemPage(kind) {
  const what = kind === 'owner'
    ? 'Google confirmed your account, but your browser did not keep the short-lived sign-in it was handed on the way back here.'
    : 'Google signed you in, but your browser did not keep the sign-in on the way back here.';
  return `${loginHead()}
    <p class="note"><strong>Sign-in did not stick.</strong></p>
    <p class="note">${what}</p>
    <p class="note">This page stops here so you are not sent round in a loop.</p>
    <p class="hint">Go back to your app and start connecting again. If it happens again, open this connection in your phone's normal browser, or allow cookies for this site, then try once more.</p>
    ${loginTail()}`;
}

// The public connect pages (owner ruling 2026-11-09): anyone with a Google
// account they control signs in, with no roster; a second or third account
// is added from the Approve page itself with the same Google sign-in.
const DENIAL_WORDS={
  grant_scope_missing:'Google did not grant any of the permissions requested.',
  identity_owned_elsewhere:'That Google account is already connected to a different person here.',
  reserved_identity:"That Google account belongs to this server's owner connection.",
  consent_declined:'The Google sign-in was cancelled.',
  legacy_pilot_identity_only:'This sign-in is a test identity that cannot add accounts.'
};
function hostOf(uri){try{return new URL(uri).host;}catch{return 'your app';}}
function renderGoogleStartPage(href,client){
  const app=client?.client_name?escapeHtml(client.client_name):'Your app';
  return `${loginHead()}
    <p class="note">${app} wants to connect to your Google account.</p>
    <a class="button" href="${escapeHtml(href)}">Continue with Google</a>
    <p class="hint">Use any Google account you control. You can add more accounts on the next page.</p>
    ${loginTail()}`;
}
// A refusal names what happened and the next step in plain words (D-001
// Public sign-in); the technical reason follows in small print for support.
function renderRefusal(message,technical){
  return `${loginHead()}<p class="note"><strong>This connection could not start.</strong></p><p class="note">${escapeHtml(message)}</p><p class="hint">For support: ${escapeHtml(technical)}</p>${loginTail()}`;
}
function renderApproveProblem(message){
  return `${loginHead()}<p class="note">${escapeHtml(message)}</p>${loginTail()}`;
}
function renderApprovePage({params,resourceParam,client,accounts,signedInAs,connectHandle,csrf,denial}){
  const app=client?.client_name?escapeHtml(client.client_name):'This app';
  const keep=['client_id','redirect_uri','state','code_challenge','code_challenge_method']
    .map(k=>'<input type="hidden" name="'+k+'" value="'+escapeHtml(params[k]||'')+'">').join('')+
    '<input type="hidden" name="resource" value="'+escapeHtml(resourceParam||'')+'">'+
    '<input type="hidden" name="auth_method" value="google">'+
    (connectHandle?'<input type="hidden" name="connect" value="'+escapeHtml(connectHandle)+'">':
      '<input type="hidden" name="csrf" value="'+escapeHtml(csrf)+'">');
  const pick=accounts.find(a=>a.is_default)||accounts[0];
  const list=accounts.map(a=>'<label class="choice">'+
    '<input type="radio" name="account_id" value="'+escapeHtml(a.id)+'"'+(a===pick?' checked':'')+'><div><b>'+
    escapeHtml(a.label||a.email)+'</b>'+(a.label?'<span>'+escapeHtml(a.email)+'</span>':'')+'</div></label>').join('');
  const reason=denial?(DENIAL_WORDS[denial.code]||'Google did not confirm that account.'):null;
  // Adding an account: the same Google sign-in, from this page, coming back
  // to this page. Without a handle (an ordinary signed-in browser) the
  // account page's session form does the same job.
  const addForm=connectHandle
    ? '<form method="POST" action="/api/auth/google/start"><input type="hidden" name="purpose" value="link">'+
      '<input type="hidden" name="connect" value="'+escapeHtml(connectHandle)+'">'+
      '<button type="submit" class="secondary">'+
      (accounts.length?'Add another Google account':'Connect a Google account')+'</button></form>'
    : '<p class="alt"><a href="/api/account">'+(accounts.length?'Add another Google account':'Connect a Google account')+'</a></p>';
  return `${loginHead()}
    ${signedInAs?'<p class="note">Signed in with Google as <strong>'+escapeHtml(signedInAs)+'</strong>.</p>':''}
    <p class="note"><strong>${app}</strong> is asking for access. It will be sent to <strong>${escapeHtml(hostOf(params.redirect_uri))}</strong>.</p>
    ${reason?'<p class="error">That account was not added: '+escapeHtml(reason)+'</p>':''}
    ${accounts.length?`<form method="POST">${keep}
      <p class="note"><strong>Which Google account?</strong> ${app} can use every Google account you have connected here. Pick the one it uses when you don't name one:</p>
      ${list}
      <p class="note"><strong>What may it do?</strong></p>
      ${ACCESS_LEVELS.map(l=>'<label class="choice"><input type="radio" name="profile" value="'+l.id+'"'+(l.id==='full'?' checked':'')+'><div><b>'+escapeHtml(l.label)+'</b><span>'+escapeHtml(l.says)+'</span></div></label>').join('')}
      <p class="hint">You can change this later on My Workspace connections.</p>
      <button type="submit">Approve</button></form>`:
      '<p class="note">No Google account is connected yet. Connect one to continue.</p>'}
    ${addForm}
    <p class="hint">Nothing is shared with ${app} until you tap Approve. Each account only ever shows its own data.</p>
    ${loginTail()}`;
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
  // ONE-DOOR (owner ruling 2026-11-09): people, the owner included, connect
  // through the public sign-in. This owner page stays for development and
  // testing only, says so, and nothing public links here.
  const head = loginHead()+'<p class="devonly"><strong>Development and testing only.</strong> To connect an app, use the normal Google sign-in.</p>';
  const tail = loginTail();
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
  const resourceParam = isMuseClient(client_id) && !params.resource ? publicResource() + '/api/mcp' : params.resource;
  const hidden = { client_id, redirect_uri, state, code_challenge, code_challenge_method, resource: resourceParam,
    auth_method: params.auth_method==='owner_google'?'owner_google':'owner' };

  if (response_type && response_type !== 'code') {
    res.status(400).send(renderRefusal('Your app asked to connect in a way this service does not support.','Only response_type=code is supported.'));
    return;
  }

  const client = await getOAuthClient(client_id);
  if (!client) {
    res.status(400).send(renderRefusal('This service does not recognise your app. Remove the connector in your app and add it again; if your app asks for a Client ID, use muse for Muse and leave it blank everywhere else.','Unknown client_id. This connector needs to register first (this normally happens automatically).'));
    return;
  }
  if (!client.redirect_uris.includes(redirect_uri)) {
    res.status(400).send(renderRefusal('Your app tried to send the sign-in somewhere it did not register. Remove the connector in your app and add it again.','redirect_uri does not match what this client registered.'));
    return;
  }

  // Both existing-owner and V2 authorizations require S256 PKCE. Do not
  // advertise a weaker option that this issuer will silently accept.
  // Already-issued access and refresh tokens remain valid and unchanged.
  if (code_challenge_method !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(code_challenge || '')) {
    res.status(400).send(renderRefusal('Your app started the sign-in without the safety check this service requires. Update the app, or remove the connector and add it again.','This connector requires S256 PKCE with a valid code challenge.'));
    return;
  }

  // New Google sign-in is a separate auth path. Never enumerate the original
  // owner's mailboxes before passphrase authentication or to a V2 principal.
  // ONE-DOOR: the public Google sign-in is the default door for every app
  // and every person. The owner pages answer only when asked for by name
  // (auth_method=owner / owner_google), for development and testing, or
  // when new sign-ups are switched off on this server.
  const ownerDoor=params.auth_method==='owner'||params.auth_method==='owner_google'||!publicSignInAvailable();
  if(!ownerDoor){
    let resource;
    try{resource=publicResource()+'/api/mcp';}catch{return res.status(503).send('MCP origin unavailable.');}
    if(resourceParam!==resource||params.code_challenge_method!=='S256'||
      !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge||''))
      return res.status(400).send(renderRefusal('Your app asked to connect to a different address than this service. Check the connector address ends in /api/mcp, then try again.','V2 requires exact MCP resource and S256 PKCE.'));
    headers(res);
    // D-006 MC-7.0: after Google, the Approve page is reached with a one-use
    // connect handle in the address (no cookie). It must match this exact
    // client, redirect, resource and PKCE challenge, or it counts as absent.
    const expect={clientId:client_id,redirectUri:redirect_uri,resource,codeChallenge:params.code_challenge};
    const connectHandle=typeof params.connect==='string'&&params.connect?params.connect:null;
    let connect=null;
    if(connectHandle){try{connect=await readConnectHandle(connectHandle,expect);}catch{connect=null;}}
    let session=null;
    if(!connect){try{session=await requireSession(req);}catch{session=null;}}
    if(!connect&&!session){
      if(req.method!=='GET')return res.status(401).send(renderApproveProblem('Your approval step expired or was already used. Go back to your app and connect again.'));
      if(params.returned==='1'||connectHandle){
        console.warn('mc7_return_without_carried_value',{door:'authorize',kind:connectHandle?'connect':'google'});
        res.setHeader('Content-Type','text/html; charset=utf-8');
        return res.status(400).send(renderReturnProblemPage('google'));
      }
      if(publicMode()==='off')return res.status(503).send(renderApproveProblem('New sign-ups are switched off on this server right now.'));
      const next=new URL('/api/auth/google/start',publicResource());
      for(const key of ['client_id','redirect_uri','resource','code_challenge','state'])
        next.searchParams.set(key,key==='resource'?resourceParam:params[key]);
      next.searchParams.set('purpose','mcp_authorize');
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.status(200).send(renderGoogleStartPage(next.toString(),client));
    }
    const principalId=connect?connect.principal_id:session.principal_id;
    const accounts=await listAccounts(principalId);
    if(req.method==='GET'){
      // MC-7.3: with duplicate cookies, use the copy that belongs to this session.
      let csrf='';
      if(!connect){
        const csrfCandidates=readCookies(req,'p10_csrf');
        csrf=csrfCandidates.find(c=>digest(c)===session.csrf_hash)||csrfCandidates[0]||'';
      }
      const signedInAs=await principalSignInEmail(principalId).catch(()=>null);
      const denial=params.link_refused==='1'?await getLatestLinkDenial(principalId).catch(()=>null):null;
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Referrer-Policy','no-referrer');
      return res.status(200).send(renderApprovePage({params,resourceParam,client,accounts,signedInAs,
        connectHandle:connect?connectHandle:null,csrf,denial}));
    }
    try{
      if(connect){
        // The handle is spent by this tap; it cannot approve twice.
        const spent=await consumeConnectHandle(connectHandle,expect);
        if(!spent)throw Error('outside_scope');
      }else requireCsrf(req,session,params);
      const selected=accounts.find(a=>a.id===params.account_id);
      if(!selected)throw Error('outside_scope');
      const code=await issuePrincipalCode({
        principalId,accountId:selected.id,clientId:client_id,
        redirectUri:redirect_uri,resource,codeChallenge:params.code_challenge,
        profile:['read_only','everyday','full'].includes(params.profile)?params.profile:'read_only',
        listing:'compact',areas:null,costPolicy:{mode:'per_action'}
      });
      const redirect=new URL(redirect_uri);redirect.searchParams.set('code',code);
      const clientState=connect?connect.client_state:state;
      if(clientState)redirect.searchParams.set('state',clientState);
      res.writeHead(302,{Location:redirect.toString()});res.end();return;
    }catch{return res.status(403).send(renderApproveProblem('This approval could not be completed. Go back to your app and connect again.'));}
  }
  // Existing bearer/refresh tokens are never changed by this branch.
  // A linked Google owner proof is one-use and protocol/client/PKCE-bound.
  let accounts=[]; // No owner mailbox query before either authentication.
  const ownerGoogle=params.auth_method==='owner_google';
  const ownerMeta={clientId:client_id,redirectUri:redirect_uri,
    resource:resourceParam||'',codeChallenge:code_challenge||'',
    clientState:state||''};
  // D-006 MC-7.3: try each owner-proof cookie the browser sent and keep the
  // one that matches this connection.
  let ownerProof=null;
  if(ownerGoogle){for(const candidate of readCookies(req,'p10_owner_proof')){
    if(await inspectOwnerLoginProof(candidate,ownerMeta)){ownerProof=candidate;break;}
    ownerProof=ownerProof||candidate;
  }}
  if(ownerGoogle){
    if(resourceParam!==publicResource()+'/api/mcp'||params.code_challenge_method!=='S256'||
       !/^[A-Za-z0-9_-]{43}$/.test(code_challenge||''))
      return res.status(400).send('Linked owner sign-in requires exact resource and S256 PKCE.');
    if(!ownerProof&&req.method==='GET'&&params.returned==='1'){
      console.warn('mc7_return_without_carried_value',{door:'authorize',kind:'owner_google'});
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.status(400).send(renderReturnProblemPage('owner'));
    }
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
