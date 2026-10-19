// P10-6 public information: no owner mailbox/database/session lookups.
import {validEmail} from './security.js';
import {PRODUCT_DISPLAY_NAME,PROVIDER_DISCLOSURE} from '../branding.js';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function supportContact(env=process.env){
  const address=String(env.PUBLIC_SUPPORT_EMAIL||'').trim();
  return validEmail(address)&&!/[<>"']/.test(address)?address:null;
}
const nav='<nav aria-label="Site"><a href="/">Home</a> · <a href="/api/privacy">Privacy and data use</a> · '+
  '<a href="/api/support">Support</a> · <a href="/api/data-deletion">Disconnect and deletion</a></nav>';
export function pageHtml(title,content){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(title===PRODUCT_DISPLAY_NAME?title:title+' — '+PRODUCT_DISPLAY_NAME)+'</title>'+
    '<style>body{font:16px/1.65 system-ui,-apple-system,sans-serif;max-width:48rem;margin:3rem auto;'+
    'padding:0 1.25rem;color:#222}h1{font-size:1.65rem;line-height:1.2}'+
    'h2{font-size:1.2rem;margin-top:2rem}a{color:#1252aa}'+
    'nav{border-bottom:1px solid #ddd;padding-bottom:1rem}'+
    'footer{border-top:1px solid #ddd;margin-top:2rem;padding-top:1rem}'+
    'code{background:#f4f4f4;padding:.12rem .3rem;border-radius:.2rem}</style>'+
    '</head><body>'+nav+'<main><h1>'+esc(title)+'</h1>'+content+
    '</main><footer>Robinson AI Systems · Public information; sign-in not required</footer></body></html>';
}
export function sendPage(req,res,title,content){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.setHeader('Allow','GET, HEAD');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    return res.status(405).send('Method not allowed');
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.method==='HEAD')return res.status(200).end();
  return res.status(200).send(pageHtml(title,content));
}
export const homeInfo=[
  '<p>'+esc(PROVIDER_DISCLOSURE)+'</p>',
  '<p>This standalone service lets you connect supported MCP agents to Google Workspace. ',
  'With permissions you select, your agent can read and manage Gmail, Drive, Calendar, ',
  'Tasks, contacts and applicable Workspace administrative settings.</p>',
  '<h2>How authorization works</h2>',
  '<p>Google sign-in checks your identity. You separately link a Google account and grant ',
  'relevant Google permissions for mail, files, calendars, tasks, contacts or administrator ',
  'verification when needed. You select each agent connection’s permissions; Google and ',
  'your administrator still control which operations are available. Some actions ',
  'are destructive or can incur charges and have additional safeguards.</p>',
  '<p>Authorized tool results can be sent to the MCP client you choose. ',
  'Do not connect an agent you do not trust with that information. ',
  'No tool grants Google administrator privileges or bypasses provider authorization.</p>',
  '<p><a href="/api/account">Manage your linked accounts and agents</a> (sign-in required). ',
  'Other people’s accounts and private mailbox details are never listed here.</p>',
  '<p>Custom MCP endpoint: <code>/api/mcp</code>.</p>',
  '<p>Read our <a href="/api/privacy">data-use disclosure</a>, ',
  '<a href="/api/support">support information</a> and ',
  '<a href="/api/data-deletion">disconnect and deletion details</a> before connecting.</p>'
].join('');
export const privacyInfo=[
  '<p>This is a prelaunch description of this service’s actual data handling. ',
  'The operator must review final privacy, retention and verification disclosures ',
  'before general public publication. This page is not evidence of Google approval.</p>',
  '<h2>Data accessed</h2>',
  '<p>Basic Google sign-in requests verified identity, email and profile. ',
  'Optional account linking requests additional permissions for mail and settings, ',
  'Drive files and sharing, Calendar, Tasks, contacts or administrator verification. ',
  'Actual access depends on the connected account’s granted scopes and entitlements.</p>',
  '<h2>Use and sharing</h2>',
  '<p>Google data is used to execute actions and return reports requested by your ',
  'authorized MCP client. Results travel to that selected agent client, which ',
  'has its own privacy practices. Authorized changes go to the relevant Google API. ',
  'An email or domain suffix by itself cannot grant access to another account.</p>',
  '<h2>Data stored</h2>',
  '<p>The service stores verified identity/account metadata, encrypted Google ',
  'authorization grants, hashed rotating agent tokens, selected connection policy, ',
  'change/activity records and, when needed, temporary paged tool results. ',
  'Secure, HttpOnly, SameSite cookies maintain your browser session. ',
  'Neither account credentials nor other users’ mailboxes appear on public pages.</p>',
  '<h2>Control, deletion and retention limits</h2>',
  '<p>From <a href="/api/account">your account portal</a> you can revoke agent access ',
  'or disconnect a linked Google account locally. This does not itself prove ',
  'provider-side Google grant revocation. You can independently remove Google’s ',
  'authorization in your Google Account security settings. A recoverable deletion ',
  'request is available, but an irreversible deletion or particular retention ',
  'deadline is not yet promised. Audit/recovery records may require separate handling. ',
  'See <a href="/api/data-deletion">deletion details</a>.</p>',
  '<h2>Questions</h2><p>See <a href="/api/support">support</a> for the operator contact. ',
  'Final retention periods and the public policy need operator review before launch.</p>'
].join('');
export function supportInfo(env=process.env){
  const address=supportContact(env);
  return '<p>'+esc(PROVIDER_DISCLOSURE)+'</p><p>Robinson AI Systems operates this Workspace MCP integration. '+
    'For sign-in, account, privacy or deletion questions, contact the service operator.</p>'+
    (address?'<p>Email: <a href="mailto:'+encodeURIComponent(address)+'">'+esc(address)+'</a>.</p>':
      '<p><strong>Public support contact is not configured.</strong> An invited pilot user '+
      'should contact the organization that invited them. The operator must configure '+
      'PUBLIC_SUPPORT_EMAIL before a general launch.</p>')+
    '<p>Never email OAuth client secrets, Google tokens or passphrases.</p>';
}
export const deletionInfo=[
  '<p>Sign in to <a href="/api/account">your account portal</a> to revoke ',
  'an agent connection or disconnect an account and its local agent connections. ',
  'This does not affect other users.</p>',
  '<p>Local disconnection is not verified Google-wide revocation. ',
  'Check Google Account third-party access separately. It cannot undo a change ',
  'your agent already made in Google or remove data saved by an MCP client.</p>',
  '<p>The portal can preview relevant account records and start or cancel a ',
  '<strong>recoverable deletion request</strong>. It does not yet perform ',
  'irreversible erasure of all grants, audit records or backups. Contact ',
  '<a href="/api/support">support</a> about retention or deletion follow-up. ',
  'Never share credentials in a request.</p>'
].join('');
