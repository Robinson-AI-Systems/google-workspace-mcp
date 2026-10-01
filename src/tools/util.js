// Small helpers shared by every tool module.
import { formatError } from './errors.js';

// ---------- results ----------
export const MAX_ITEMS = 200;
export const MAX_BASE64_CHARS = 64 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * Keeps results small enough to be useful in a conversation:
 *  - lists longer than 200 items are cut to the first 200, with a note saying how many there were
 *    (a top-level list becomes { items, truncated }; nextPageToken fields are never touched);
 *  - Google bookkeeping (`etag`, and `kind` values like "drive#file") is removed;
 *  - base64 data larger than 64 KB is replaced by its length. Use drive_upload_from_url or export
 *    links for large files instead of pulling their bytes through chat.
 */
export function compact(value) {
  const walk = (v) => {
    if (Array.isArray(v)) {
      const shown = v.length > MAX_ITEMS ? v.slice(0, MAX_ITEMS) : v;
      return shown.map(walk);
    }
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, item] of Object.entries(v)) {
        if (k === 'etag' && typeof item === 'string') continue;
        if (k === 'kind' && typeof item === 'string' && item.includes('#')) continue;
        out[k] = walk(item);
        if (Array.isArray(item) && item.length > MAX_ITEMS) {
          out[`${k}_truncated`] = `Showing the first ${MAX_ITEMS} of ${item.length}. Narrow the search or ask for a smaller page to see the rest.`;
        }
      }
      return out;
    }
    if (typeof v === 'string' && v.length > MAX_BASE64_CHARS && BASE64_RE.test(v)) {
      return { omitted: 'data', bytes: Math.floor(v.length * 3 / 4) - (v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0), note: 'Large file data is not sent through chat. Use an export link or drive_upload_from_url instead.' };
    }
    return v;
  };
  if (Array.isArray(value) && value.length > MAX_ITEMS) {
    return { items: walk(value), truncated: `Showing the first ${MAX_ITEMS} of ${value.length}. Narrow the search or ask for a smaller page to see the rest.` };
  }
  return walk(value);
}

/** Wrap a plain value as the { content: [...] } shape the MCP protocol expects. */
export function ok(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(compact(value), null, 2);
  return { content: [{ type: 'text', text }] };
}

/** Error result for Claude: plain-English explanation first, Google's own message kept at the end. See errors.js. */
export function errorResult(err) {
  return { content: [{ type: 'text', text: formatError(err) }], isError: true };
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
