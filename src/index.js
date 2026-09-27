#!/usr/bin/env node
// Local mode: run this on your own computer, launched by Claude Desktop via
// stdio. For the hosted version (usable from claude.ai on any device), see
// the /api directory and DEPLOY.md instead — this file is not used there.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { buildApiClients } from './auth/google-auth.js';
import { registry } from './tools/index.js';
import { errorResult } from './tools/util.js';

const server = new Server(
  { name: 'robinson-google-workspace-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: registry.tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = registry.handlers[name];
  if (!handler) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    const clients = await buildApiClients();
    return await handler(args || {}, clients);
  } catch (err) {
    return errorResult(err);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Robinson Google Workspace MCP running (${registry.tools.length} tools loaded).`);
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
