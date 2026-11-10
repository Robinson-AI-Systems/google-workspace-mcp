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
  const A=esc(address||'https://YOUR-ADDRESS/api/mcp');
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
  '<section id="start"><h2>How connecting works</h2>',
  '<ol><li><a href="#connect">Add the address below</a> to your AI app.</li>',
  '<li>Your app opens a Google sign-in. Pick a Google account <b>you</b> control and read what Google shows before you agree. ',
  'We never see or ask for your Google password.</li>',
  '<li>On the last page, choose how much the app may do (look only, everyday changes, or everything), ',
  'and add any other Google accounts you want it to reach: work, business, personal.</li></ol>',
  '<p class="hint">Later, <a href="/api/account">My Workspace connections</a> is where you add or remove accounts, ',
  'change what each app may do, make everything read-only with one tap, or disconnect. ',
  'You can also <a href="/api/auth/google/start?purpose=login">sign in there first</a> if you prefer.</p></section>',
  '<section id="connect"><h2>Connect your AI app</h2>',
  '<p>Your connector address:</p>',addr,
  '<p class="hint">Leave any Client ID and Client Secret boxes blank (Muse is the one exception, below). ',
  'Want more than one connector, for example one per Google account? Add a short name to the end of the address, ',
  'like <code>/api/mcp/work</code> or <code>/api/mcp/personal</code> (lowercase letters, numbers and dashes). ',
  'Every name reaches the same service; each connector signs in on its own.</p>',
  '<h3>Claude (web, desktop and phone)</h3><ol><li>Open <b>Settings</b> (called <b>Customize</b> in some versions), then <b>Connectors</b>. ',
  'On a phone, open <a href="https://claude.ai/settings/connectors" rel="noopener noreferrer">claude.ai/settings/connectors</a> in your browser.</li>',
  '<li>Choose <b>+</b> or <b>Add</b>, then <b>Add custom connector</b>. Give it a name and paste the address.</li>',
  '<li>Choose <b>Add</b>, then <b>Connect</b>, and sign in with Google. It then works in the Claude phone app too.</li></ol>',
  '<h3>ChatGPT</h3><ol><li>On chatgpt.com, open <b>Plugins</b>, choose the <b>+</b> button, then <b>Add custom MCP server</b>.</li>',
  '<li>Paste the address, choose <b>OAuth</b>, then <b>Create</b> and install it, and sign in with Google.</li></ol>',
  '<p class="hint">Needs a paid ChatGPT plan. If you do not see that option, turn on <b>Developer mode</b> under Settings, Apps &amp; Connectors, Advanced; on a work plan your admin may need to allow it.</p>',
  // D-006 MC-8: the one Muse sentence every fleet server uses.
  '<h3>Muse</h3><p>Open <b>Settings</b>, then <b>Connectors</b>, then <b>Add custom connector</b>, and paste the address. ',
  'If Muse asks for a Client ID, type <code id="muse-client-id">muse</code> (the same for everyone, and nothing secret). ',
  '<strong>Client Secret: leave blank.</strong></p>',
  '<h3>Claude Code</h3><code class="addr">claude mcp add --transport http workspace-unleashed '+A+'</code>',
  '<p class="hint">Then type <code>/mcp</code> inside Claude Code and sign in.</p>',
  '<h3>OpenAI Codex (and the ChatGPT desktop app)</h3><code class="addr">codex mcp add workspace-unleashed --url '+A+'</code>',
  '<code class="addr">codex mcp login workspace-unleashed</code>',
  '<p class="hint">In the desktop app instead: <b>Settings</b>, <b>MCP servers</b>, <b>Add server</b>, choose <b>Streamable HTTP</b>, paste the address, save, then <b>Authenticate</b>.</p>',
  '<h3>Cursor</h3><ol><li>Open <b>Cursor Settings</b>, then <b>MCP</b> (Tools &amp; Integrations), then <b>New MCP Server</b>.</li>',
  '<li>In the file that opens, add:</li></ol><code class="addr">{"mcpServers":{"workspace-unleashed":{"url":"'+A+'"}}}</code>',
  '<p class="hint">Save, then choose <b>Connect</b> next to it in Cursor Settings and sign in with Google.</p>',
  '<h3>VS Code (GitHub Copilot)</h3><ol><li>Open the Command Palette (Ctrl+Shift+P, or Cmd+Shift+P on a Mac) and run <b>MCP: Add Server</b>.</li>',
  '<li>Choose <b>HTTP</b>, paste the address, and name it <code>workspace-unleashed</code>.</li>',
  '<li>When VS Code asks, sign in with Google.</li></ol>',
  '<h3>Gemini CLI</h3><code class="addr">gemini mcp add --transport http --scope user workspace-unleashed '+A+'</code>',
  '<p class="hint">Then start <code>gemini</code> and type <code>/mcp auth workspace-unleashed</code> to sign in.</p>',
  '<h3>Windsurf</h3><ol><li>Open <b>Windsurf Settings</b>, then <b>Cascade</b>, then <b>MCP servers</b>, and choose <b>View raw config</b> (or <b>Add custom server</b>).</li>',
  '<li>Add:</li></ol><code class="addr">{"mcpServers":{"workspace-unleashed":{"serverUrl":"'+A+'"}}}</code>',
  '<p class="hint">Save and refresh; Windsurf opens the Google sign-in.</p>',
  '<h3>Any other app</h3><p>Any app that can add a remote MCP server with sign-in (OAuth) works: paste the address and sign in with Google. ',
  'Apps that only accept a pasted API key cannot connect.</p></section>',
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
