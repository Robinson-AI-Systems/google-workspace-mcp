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

function renderLoginPage({ error, hidden, accounts, selected, profile }) {
  const selectedProfile = ['read_only','everyday','full'].includes(profile) ? profile : 'read_only';
  const hiddenInputs = Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v || '')}">`).join('\n');
  const accountField = accounts.length === 0
    ? `<p class="note">No Google account is connected yet. Open <code>/api/google/authorize</code> first, then come back.</p>`
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
    <label for="passphrase">Admin passphrase</label>
    <input type="password" name="passphrase" id="passphrase" autofocus required>
    ${hiddenInputs}
    <button type="submit"${accounts.length === 0 ? ' disabled' : ''}>Authorize Claude</button>
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
  const hidden = { client_id, redirect_uri, state, code_challenge, code_challenge_method };

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

  const accounts = await listGoogleAccounts();

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(renderLoginPage({ hidden, accounts, profile: params.profile }));
    return;
  }

  // POST: check passphrase, then check the chosen account is one we know.
  if (!process.env.ADMIN_PASSPHRASE) {
    res.status(500).send('Server misconfigured: ADMIN_PASSPHRASE is not set.');
    return;
  }
  const keptAccount = String(params.google_account || '').trim().toLowerCase();
  const verdict = await evaluateLogin({
    ip: clientIp(req),
    supplied: params.passphrase,
    expected: process.env.ADMIN_PASSPHRASE,
    store: { recordLoginAttempt, countRecentFailedLogins, markLoginAttemptSucceeded }
  });
  if (verdict.status === 'locked') {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Retry-After', String(LOCKOUT_WINDOW_MINUTES * 60));
    res.status(429).send(renderLoginPage({ error: `Too many wrong passphrases from this connection. Wait ${LOCKOUT_WINDOW_MINUTES} minutes before trying again.`, hidden, accounts, selected: keptAccount, profile: params.profile }));
    return;
  }
  if (verdict.status === 'wrong') {
    res.setHeader('Content-Type', 'text/html');
    // Keep the account they picked so a passphrase typo doesn't silently flip it back to the default.
    const left = verdict.attemptsLeft > 0 ? ` ${verdict.attemptsLeft} ${verdict.attemptsLeft === 1 ? 'try' : 'tries'} left before a ${LOCKOUT_WINDOW_MINUTES}-minute lockout.` : ` The next wrong try starts a ${LOCKOUT_WINDOW_MINUTES}-minute lockout.`;
    res.status(401).send(renderLoginPage({ error: `Incorrect passphrase. Your account choice was kept.${left}`, hidden, accounts, selected: keptAccount, profile: params.profile }));
    return;
  }
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
