// Small helpers shared by every tool module.

/** Wrap a plain value as the { content: [...] } shape the MCP protocol expects. */
export function ok(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

/** Standard error shape so Claude sees the real Google API error message, not a stack trace. */
export function errorResult(err) {
  const message = err?.response?.data?.error?.message || err?.message || String(err);
  const details = err?.response?.data?.error?.errors;
  return {
    content: [{
      type: 'text',
      text: `Error: ${message}${details ? '\nDetails: ' + JSON.stringify(details) : ''}`
    }],
    isError: true
  };
}

/** Merge several {tools, handlers} namespace modules into one flat registry. */
export function mergeNamespaces(modules) {
  const tools = [];
  const handlers = {};
  const seen = new Set();
  for (const mod of modules) {
    for (const tool of mod.tools) {
      if (seen.has(tool.name)) {
        throw new Error(`Duplicate tool name registered: ${tool.name}`);
      }
      seen.add(tool.name);
      tools.push(tool);
    }
    Object.assign(handlers, mod.handlers);
  }
  return { tools, handlers };
}
