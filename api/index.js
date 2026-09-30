import { initSchema, listGoogleAccounts } from '../src/db.js';
import { ensureMigrated } from '../src/auth/google-auth-hosted.js';
import { registry } from '../src/tools/index.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
  await initSchema();
  let accounts = [];
  try {
    await ensureMigrated();
    accounts = await listGoogleAccounts();
  } catch {
    accounts = [];
  }
  const list = accounts.length
    ? `<ul>${accounts.map((a) => `<li><strong>${escapeHtml(a.label || a.email)}</strong>${a.label ? ` &mdash; ${escapeHtml(a.email)}` : ''}${a.is_default ? ' <em>(default)</em>' : ''}</li>`).join('')}</ul>`
    : '<p><em>None yet.</em></p>';
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!doctype html><html><body style="font-family:-apple-system,sans-serif;max-width:640px;margin:4rem auto;line-height:1.5">
    <h1>Robinson Google Workspace MCP</h1>
    <p>${registry.tools.length} tools loaded.</p>
    <h2 style="font-size:1rem">Connected Google accounts</h2>
    ${list}
    <p><a href="/api/google/authorize">Connect another Google account &rarr;</a><br>
    <small>Sign in as the mailbox you want to add. Each Claude connection picks one of these accounts on its login page.</small></p>
    <p>MCP endpoint for Claude: <code>${escapeHtml(process.env.PUBLIC_BASE_URL || '')}/api/mcp</code></p>
  </body></html>`);
}
