// Small helpers shared by every tool module.
import { formatError } from './errors.js';

// ---------- results ----------
export const MAX_ITEMS = 200;
export const MAX_BASE64_CHARS = 64 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/_-]+={0,2}$/;
const DATA_KEY_RE = /base64|data|raw|bytes|content/i; // only fields named like file data are ever swapped for their size
const GOOGLE_KIND_RE = /^[a-z]+#[a-zA-Z]+$/;           // "drive#file", "calendar#event"
const isPlain = (v) => v !== null && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * Keeps results small enough to be useful in a conversation:
 *  - lists longer than 200 items are cut to the first 200, with a note saying how many there were
 *    (a top-level list becomes { items, truncated }; nextPageToken fields are never touched);
 *  - Google's `kind` labels ("drive#file") are removed. `etag` is kept: contacts_update needs it;
 *  - file data (fields named like base64Data / data / content) larger than 64 KB is replaced by its size,
 *    so big files are not pulled through chat. Open them from their Drive link instead.
 * Anything that is not a plain object, list or string (Date, Buffer, ...) is passed through untouched.
 */
export function compact(value) {
  const note = (len) => `Showing the first ${MAX_ITEMS} of ${len}. Narrow the search or ask for a smaller page to see the rest.`;
  const walk = (v, key) => {
    if (Array.isArray(v)) return (v.length > MAX_ITEMS ? v.slice(0, MAX_ITEMS) : v).map((x) => walk(x));
    if (isPlain(v)) {
      const out = {};
      for (const [k, item] of Object.entries(v)) {
        if (k === 'kind' && typeof item === 'string' && GOOGLE_KIND_RE.test(item)) continue;
        out[k] = walk(item, k);
        if (Array.isArray(item) && item.length > MAX_ITEMS) out[`${k}_truncated`] = note(item.length);
      }
      return out;
    }
    if (typeof v === 'string' && key && DATA_KEY_RE.test(key) && v.length > MAX_BASE64_CHARS && BASE64_RE.test(v)) {
      return { omitted: 'data', bytes: Math.floor(v.length * 3 / 4) - (v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0), note: 'Large file data is not sent through chat. Open the file from its Drive link (webViewLink) instead.' };
    }
    return v;
  };
  if (Array.isArray(value) && value.length > MAX_ITEMS) return { items: walk(value), truncated: note(value.length) };
  return walk(value);
}

/** Wrap a plain value as the { content: [...] } shape the MCP protocol expects. Never throws: odd values fall back to plain formatting. */
export function ok(value) {
  let text;
  if (typeof value === 'string') text = value;
  else {
    try { text = JSON.stringify(compact(value), null, 2); }
    catch {
      try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
    }
  }
  return { content: [{ type: 'text', text: text ?? 'undefined' }] };
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
