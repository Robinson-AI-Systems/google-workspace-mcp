// Anonymous homepage: never enumerate any installation owner account/connection.
// Authentication and scoped account selection live behind the registered MCP
// OAuth flow and the authenticated /api/account portal, not this public route.
const HTML = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <meta name="viewport" content="width=device-width,initial-scale=1">',
  '  <title>Robinson Google Workspace MCP</title>',
  '  <style>',
  '    body{font-family:system-ui,-apple-system,sans-serif;line-height:1.6;max-width:44rem;margin:4rem auto;padding:0 1.25rem;color:#222}',
  '    h1{font-size:1.7rem;line-height:1.2}',
  '    a{color:#1252aa}',
  '    code{background:#f4f4f4;padding:.15rem .35rem;border-radius:.2rem}',
  '  </style>',
  '</head>',
  '<body>',
  '  <main>',
  '    <h1>Robinson Google Workspace MCP</h1>',
  '    <p>Connect Google Workspace tools to a supported MCP client using its secure authorization flow.</p>',
  '    <p>Each agent connection is authorized separately. Connected mailboxes, permissions and agent sessions are private and are not listed on this public page.</p>',
  '    <p>Server endpoint: <code>/api/mcp</code>. Start authorization from your MCP client rather than opening an unbound login URL.</p>',
  '    <p><a href="/api/account">Manage your own linked accounts and connections</a> (sign-in required).</p>',
  '  </main>',
  '</body>',
  '</html>'
].join('\n');

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(405).send('Method not allowed');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(HTML);
}
