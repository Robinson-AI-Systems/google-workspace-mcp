// The actual MCP endpoint Claude talks to. Stateless by design (a fresh
// Server + transport per request) because Vercel serverless functions don't
// keep anything in memory between calls -- this is the officially supported
// pattern for running MCP over HTTP on a serverless platform.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { registry } from '../src/tools/index.js';
import { errorResult } from '../src/tools/util.js';
import { buildHostedApiClients, ensureMigrated } from '../src/auth/google-auth-hosted.js';
import { getAccessToken, initSchema, touchAccessToken, connectionId } from '../src/db.js';

export const config = { api: { bodyParser: true } };

function buildServer(googleAccount, connection) {
  const server = new Server(
    { name: 'robinson-google-workspace-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: registry.tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolHandler = registry.handlers[name];
    if (!toolHandler) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    try {
      const clients = await buildHostedApiClients(googleAccount);
      clients.connection = connection; // which Claude connection is asking, for the change log
      return await toolHandler(args || {}, clients);
    } catch (err) {
      return errorResult(err);
    }
  });

  return server;
}

export default async function handler(req, res) {
  await initSchema();

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const base = (process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/$/, '');

  if (!token) {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    res.status(401).json({ error: 'unauthorized', error_description: 'Missing bearer token.' });
    return;
  }

  const tokenRecord = await getAccessToken(token);
  if (!tokenRecord) {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  // Upgrade older deployments (one shared Google login) in place, once.
  await ensureMigrated();

  // Every tool call on this connection acts as the Google account chosen at
  // login time (NULL = the server's default account, for older connections).
  try { await touchAccessToken(token); } catch { /* "last used" is informational; never fail a request over it */ }
  const server = buildServer(tokenRecord.google_account || undefined, `${String(tokenRecord.client_id).slice(0, 12)}/${connectionId(token)}`);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
