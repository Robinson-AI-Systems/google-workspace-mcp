import { getGoogleTokens, initSchema } from '../src/db.js';
import { registry } from '../src/tools/index.js';

export default async function handler(req, res) {
  await initSchema();
  let connected = false;
  try {
    connected = !!(await getGoogleTokens());
  } catch {
    connected = false;
  }
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!doctype html><html><body style="font-family:-apple-system,sans-serif;max-width:640px;margin:4rem auto;line-height:1.5">
    <h1>Robinson Google Workspace MCP</h1>
    <p>${registry.tools.length} tools loaded.</p>
    <p>Google Workspace: <strong>${connected ? 'Connected' : 'Not connected yet'}</strong></p>
    ${connected ? '' : '<p><a href="/api/google/authorize">Connect your Google Workspace account &rarr;</a></p>'}
    <p>MCP endpoint for Claude: <code>${process.env.PUBLIC_BASE_URL || ''}/api/mcp</code></p>
  </body></html>`);
}
