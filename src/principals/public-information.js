// P10-6 public information: no owner mailbox/database/session lookups.
import {validEmail} from './security.js';
import {PRODUCT_DISPLAY_NAME} from '../branding.js';
import {brandPage,esc} from '../brand/brand.js';
export function supportContact(env=process.env){
  const address=String(env.PUBLIC_SUPPORT_EMAIL||'').trim();
  return validEmail(address)&&!/[<>"']/.test(address)?address:null;
}
// BRAND-1 (2026-11-09): every public page uses the one brand shell. Owner
// ruling: plain words for the public, outcome first, nothing internal.
export function pageHtml(title,content){
  return brandPage(title,(title===PRODUCT_DISPLAY_NAME?'':'<h1>'+esc(title)+'</h1>')+content,
    {wide:title===PRODUCT_DISPLAY_NAME});
}
export function sendPage(req,res,title,content){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.setHeader('Allow','GET, HEAD');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    return res.status(405).send('Method not allowed');
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.method==='HEAD')return res.status(200).end();
  return res.status(200).send(pageHtml(title,typeof content==='function'?content():content));
}
function mcpAddress(env=process.env){
  try{const u=new URL(env.PUBLIC_BASE_URL);
    if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)return u.origin+'/api/mcp';}catch{}
  return null;
}
// The home page: what it does, how it stays safe, then how to connect each app.
export function homeInfo(env=process.env){
  const address=mcpAddress(env);
  const addr=address?'<code class="addr" id="address">'+esc(address)+'</code>':
    '<p>Use this site’s address followed by <code>/api/mcp</code>.</p>';
  return [
  '<h1>Let your AI assistant work with your Google Workspace, safely</h1>',
  '<p>Workspace Unleashed connects Claude, ChatGPT, Muse and other AI apps to your own Google account: ',
  'Gmail, Drive, Docs, Sheets, Calendar, Tasks and contacts, and, if you administer a Google Workspace ',
  'organisation, its admin settings.</p>',
  '<ul><li>You sign in with your own Google account. Google shows you what you are allowing, ',
  'and your assistant can only ever do what your own account can.</li>',
  '<li>Connect more than one Google account (work, business, personal) and pick which one each request uses.</li>',
  '<li>Choose how much each app may do: look only, everyday changes, or everything. Change it whenever you like.</li>',
  '<li>Changes are shown to you first, and everything your assistant changes is written to a log you can read.</li>',
  '<li>You can disconnect an app, or remove your data, at any time.</li></ul>',
  '<p><a class="button" href="/api/account">My Workspace connections</a></p>',
  '<section id="connect"><h2>Connect your AI app</h2>',
  '<p>Paste this address into your AI app when it asks for a server or connector address:</p>',addr,
  '<h3>Claude (web, desktop and phone app)</h3><ol><li>Go to <b>Customize</b>, then <b>Connectors</b>, then <b>Add custom connector</b>, and paste the address.</li>',
  '<li>Leave the Client ID and Client Secret blank.</li><li>Choose <b>Add</b>, then <b>Connect</b>, and sign in with Google.</li></ol>',
  '<h3>ChatGPT</h3><ol><li>On the web, go to <b>Plugins</b>, then the plus button, then <b>Add custom MCP server</b>.</li>',
  '<li>Paste the address and choose <b>OAuth</b>. Leave the Client ID and Secret blank.</li><li>Install it and sign in with Google.</li></ol>',
  // D-006 MC-8: the one Muse sentence every fleet server uses.
  '<h3>Muse</h3><p>Open <b>Settings</b>, then <b>Connectors</b>, then <b>Add custom connector</b>, and paste the address. ',
  'If Muse asks for a Client ID, type <code id="muse-client-id">muse</code> (the same for everyone, and nothing secret). ',
  '<strong>Client Secret: leave blank.</strong></p>',
  '<h3>Claude Code</h3><code class="addr">claude mcp add --transport http workspace-unleashed '+esc(address||'https://YOUR-ADDRESS/api/mcp')+'</code>',
  '<p class="hint">Then type /mcp inside Claude Code and sign in.</p></section>',
  '<section><h2>Before you connect</h2><p>Read how your data is handled: ',
  '<a href="/api/privacy">privacy and data use</a>, <a href="/api/support">support</a> and ',
  '<a href="/api/data-deletion">disconnecting and deleting</a>. Only connect an AI app you trust ',
  'with what you let it see.</p></section>'
  ].join('');
}
export const privacyInfo=[
  '<h2>What this service can see</h2>',
  '<p>Signing in gives us your Google identity: your name, email address and picture. ',
  'When you allow it, Google also lets this service work with the parts of your account you choose: ',
  'mail and its settings, Drive files and sharing, Calendar, Tasks, contacts, and, for administrators, ',
  'your organisation’s settings. What it can actually reach is decided by your Google account and what you allowed.</p>',
  '<h2>How it is used</h2>',
  '<p>Only to do what your AI app asks, and to send the results back to that app. ',
  'Your AI app has its own privacy rules for what it keeps. Changes you ask for go straight to Google. ',
  'Nobody else’s account can ever be reached through yours, and an email address alone never grants access.</p>',
  '<h2>What is stored</h2>',
  '<p>Your account details, your Google permissions (encrypted), your app connections (only as one-way codes, ',
  'never the keys themselves), the access level you chose for each app, a log of changes made, and, ',
  'for a short time, large results your app is reading page by page. ',
  'A secure browser cookie keeps you signed in on this site.</p>',
  '<h2>Your controls</h2>',
  '<p>On <a href="/api/account">My Workspace connections</a> you can disconnect any app or Google account, ',
  'and ask for your data to be removed through a <strong>recoverable deletion</strong> request (you can cancel it). ',
  'Disconnecting here does not by itself remove this service from your Google account; you can also do that in ',
  'your Google Account’s security settings. See <a href="/api/data-deletion">disconnecting and deleting</a>.</p>',
  '<h2>Questions</h2><p>See <a href="/api/support">support</a>.</p>'
].join('');
export function supportInfo(env=process.env){
  const address=supportContact(env);
  return '<p>Robinson AI Systems runs Workspace Unleashed. For help with signing in, your connections, privacy or deletion:</p>'+
    (address?'<p>Email: <a href="mailto:'+encodeURIComponent(address)+'">'+esc(address)+'</a>.</p>':
      '<p>Contact us through <a href="https://www.robinsonaisystems.com" rel="noopener noreferrer">robinsonaisystems.com</a>. '+
      '(A support email address is not configured on this server yet.)</p>')+
    '<p>Never send passwords, Google codes or secret keys in a message. We will never ask for them.</p>';
}
export const deletionInfo=[
  '<p>Sign in to <a href="/api/account">My Workspace connections</a> to disconnect an app, ',
  'or disconnect a Google account together with every app connected through it. Nobody else is affected.</p>',
  '<p>Disconnecting here is not verified Google-wide revocation: to be sure, also remove Workspace Unleashed ',
  'from your Google Account’s third-party access page. Disconnecting cannot undo a change your assistant ',
  'already made in Google, or remove anything your AI app saved itself.</p>',
  '<p>The same page can show you what is stored for you, and start or cancel a ',
  '<strong>recoverable deletion request</strong>. Permanent erasure of every record and backup is not ',
  'offered yet; ask <a href="/api/support">support</a> about anything further. ',
  'Never include passwords or keys in a request.</p>'
].join('');
