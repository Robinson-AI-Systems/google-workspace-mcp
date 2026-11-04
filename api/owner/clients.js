// Owner client-registry administration (capability-completeness fix,
// 2026-11-04).
//
// Client registration is public by design (dynamic client registration), so
// the registry accumulates throwaway and test registrations. Until this page
// existed there was no way to see them or retire one: registration had a
// create verb and no list or delete. This page closes that lifecycle: list
// every registration (never a secret value) and revoke one by client id,
// which also deletes its outstanding codes and tokens.
//
// Gate: the admin passphrase plus the shared owner login lockout — the
// developer-only backend route, exactly like the migration ceremony. It is
// deliberately NOT governed by the legacy sign-in switch: revoking a
// registration is a security control and must stay available while new
// sign-ins are off, which is precisely when an operator reaches for it.
// It also carries no Origin-header requirement, again like the migration
// ceremony: the passphrase is the credential, an Origin check adds nothing
// against an attacker who would already need it, and the fleet's operator
// automation submits forms without an Origin header — the 2026-11-04 live
// acceptance attempt failed on exactly that mismatch while the ceremony
// on the same posture completed. The sign-in family keeps its Origin
// gates; this administration surface follows the ceremony.
// The seeded stable client 'muse' (the documented Muse Android manual
// entry) is refused here so this page can never break that stable name.
import {parseBody} from '../../src/oauth/helpers.js';
import {
  initSchema,
  listOAuthClients,
  deleteOAuthClient,
  recordLoginAttempt,
  countRecentFailedLogins,
  markLoginAttemptSucceeded,
} from '../../src/db.js';
import {clientIp, evaluateLogin, LOCKOUT_WINDOW_MINUTES} from '../../src/oauth/login-guard.js';

const PROTECTED_CLIENT_IDS = new Set(['muse']);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function canonicalOrigin() {
  try {
    const url = new URL(process.env.PUBLIC_BASE_URL || '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

function pageShell(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;line-height:1.45}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.35rem .5rem;text-align:left;vertical-align:top}code{word-break:break-all}input,button{font:inherit}button{margin-top:.75rem;padding:.5rem .9rem}</style></head><body><main>${inner}</main></body></html>`;
}

function reply(response, status, body) {
  response.setHeader('Cache-Control', 'no-store, no-cache, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.status(status).send(body);
}

function page(response, status, title, message) {
  reply(response, status, pageShell(title,
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`));
}

function requestUrl(request, origin) {
  try { return new URL(request.url || '', origin); } catch { return null; }
}

function renderClients(rows) {
  if (!rows.length) return '<p>No client registrations are stored.</p>';
  const body = rows.map((row) => '<tr>'
    + `<td><code>${escapeHtml(row.client_id)}</code></td>`
    + `<td>${escapeHtml(row.client_name || '')}</td>`
    + `<td>${escapeHtml(Array.isArray(row.redirect_uris) ? row.redirect_uris.join(', ') : '')}</td>`
    + `<td>${row.has_secret ? 'stored' : 'none (public client)'}</td>`
    + `<td>${escapeHtml(row.token_count ?? 0)}</td>`
    + `<td>${escapeHtml(row.created_at ? new Date(row.created_at).toISOString() : '')}</td>`
    + '</tr>').join('');
  return '<table><thead><tr><th>Client id</th><th>Name</th><th>Redirect addresses</th><th>Secret</th><th>Live tokens</th><th>Registered</th></tr></thead>'
    + `<tbody>${body}</tbody></table>`;
}

function homePage(message = '') {
  return pageShell('Client registrations', `
    <h1>Client registrations</h1>
    ${message ? `<p>${escapeHtml(message)}</p>` : ''}
    <p>Registration is public, so this list includes throwaway and test registrations. Revoking a registration also deletes its outstanding authorization codes and tokens. Secret values are never shown.</p>
    <form method="POST" action="/api/owner/clients">
      <input type="hidden" name="action" value="list">
      <p><label>Admin passphrase <input name="passphrase" type="password" autocomplete="current-password" required></label></p>
      <p><button type="submit">List registrations</button></p>
    </form>
    <hr>
    <h2>Revoke one registration</h2>
    <form method="POST" action="/api/owner/clients">
      <input type="hidden" name="action" value="revoke">
      <p><label>Client id <input name="client_id" type="text" required maxlength="256"></label></p>
      <p><label>Type REVOKE to confirm <input name="confirmation" type="text" required></label></p>
      <p><label>Admin passphrase <input name="passphrase" type="password" autocomplete="current-password" required></label></p>
      <p><button type="submit">Revoke registration</button></p>
    </form>`);
}

export default async function handler(request, response) {
  const origin = canonicalOrigin();
  if (!origin) { page(response, 503, 'Service configuration required', 'The public address is not configured.'); return; }
  const url = requestUrl(request, origin);
  if (!url || url.origin !== origin || url.pathname !== '/api/owner/clients') {
    page(response, 404, 'Not found', 'This address is not available.'); return;
  }
  if (request.headers?.host && String(request.headers.host).toLowerCase() !== url.host.toLowerCase()) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.writeHead(303, {Location: `${origin}/api/owner/clients`});
    response.end(); return;
  }
  if (!['GET', 'POST'].includes(request.method)) { page(response, 405, 'Method not allowed', 'Use the form.'); return; }
  if (request.method === 'GET') { reply(response, 200, homePage()); return; }
  if (!process.env.ADMIN_PASSPHRASE) { page(response, 503, 'Owner authentication unavailable', 'The server owner passphrase is not configured.'); return; }

  let body;
  try {
    body = request.body && typeof request.body === 'object' ? request.body : await parseBody(request);
    if (!body || Array.isArray(body)) throw Error('invalid');
    const revoke = body.action === 'revoke';
    const allowed = revoke ? ['passphrase', 'action', 'client_id', 'confirmation'] : ['passphrase', 'action'];
    if (body.action !== undefined && !['list', 'revoke'].includes(body.action)) throw Error('invalid');
    if (Object.keys(body).some((key) => !allowed.includes(key))) throw Error('invalid');
    if (typeof body.passphrase !== 'string' || body.passphrase.length > 1024) throw Error('invalid');
    if (revoke) {
      if (typeof body.client_id !== 'string' || !body.client_id.trim() || body.client_id.length > 256) throw Error('invalid');
      if (body.confirmation !== 'REVOKE') throw Error('invalid');
      body.client_id = body.client_id.trim();
    }
  } catch { page(response, 400, 'Invalid request', 'Check the form and try again. To revoke, type REVOKE exactly.'); return; }

  try {
    await initSchema();
    const verdict = await evaluateLogin({
      ip: clientIp(request),
      supplied: body.passphrase,
      expected: process.env.ADMIN_PASSPHRASE,
      store: {recordLoginAttempt, countRecentFailedLogins, markLoginAttemptSucceeded},
    });
    if (verdict.status !== 'ok') {
      if (verdict.status === 'locked') response.setHeader('Retry-After', String(LOCKOUT_WINDOW_MINUTES * 60));
      page(response, verdict.status === 'locked' ? 429 : 401, 'Unauthorized',
        verdict.status === 'locked' ? 'Owner login is temporarily locked.' : 'The admin passphrase was not accepted.');
      return;
    }
    if (body.action === 'revoke') {
      if (PROTECTED_CLIENT_IDS.has(body.client_id)) {
        reply(response, 200, pageShell('Revoke refused',
          `<h1>Revoke refused</h1><p>The registration <code>${escapeHtml(body.client_id)}</code> is a protected stable registration and cannot be revoked from this page.</p>`));
        return;
      }
      const result = await deleteOAuthClient(body.client_id);
      if (!result.deleted) {
        reply(response, 200, pageShell('Nothing revoked',
          `<h1>Nothing revoked</h1><p>No registration with client id <code>${escapeHtml(body.client_id)}</code> exists.</p>`));
        return;
      }
      const rows = await listOAuthClients();
      reply(response, 200, pageShell('Registration revoked',
        `<h1>Registration revoked</h1><p>Revoked <code>${escapeHtml(body.client_id)}</code>: ${escapeHtml(result.tokensRemoved)} token(s) and ${escapeHtml(result.codesRemoved)} outstanding code(s) were deleted with it.</p><h2>Remaining registrations</h2>${renderClients(rows)}`));
      return;
    }
    const rows = await listOAuthClients();
    reply(response, 200, pageShell('Client registrations',
      `<h1>Client registrations</h1><p>${rows.length} registration(s) stored. Secret values are never shown.</p>${renderClients(rows)}`));
  } catch {
    page(response, 503, 'Client administration unavailable', 'No successful result is confirmed. Inspect state before retrying.');
  }
}
