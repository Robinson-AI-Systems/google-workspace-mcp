// The record of changes made to Workspace through this server. A line is written
// for each change: when, which Google account it acted as, which Claude
// connection asked, which tool, what it touched, a one-line summary, and what
// Google held before and after.
//
// Credentials never go in. Anything whose name looks like a secret is replaced
// by "[redacted]" before it is stored, and very long text (file data, photo
// bytes) is replaced by its length.
import { recordChange as saveChange } from './db.js';

const SECRET_NAME = /token|secret|password|passphrase|private_?key|authorization|credential|api_?key|cookie|photodata|base64/i;
const MAX_TEXT = 2000;

export function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 8) return '[too deep]';
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_NAME.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  if (typeof value === 'string' && value.length > MAX_TEXT) return `[${value.length} characters not stored]`;
  return value;
}

/**
 * Write one change to the log. Never throws: if the log cannot be written the change has still
 * happened, so the caller gets { logged: false } and a warning goes to the server log.
 * `clients` is what tool handlers receive; it carries who we acted as and which connection asked.
 */
export async function recordChange(clients, { tool, target, summary, before, after, dryRun = false }) {
  try {
    const id = await saveChange({
      actingAs: clients?.actingAs,
      connection: clients?.connection,
      tool, target, summary,
      before: redact(before),
      after: redact(after),
      dryRun
    });
    return { logged: true, id };
  } catch {
    console.warn(`[changelog] Could not record the change made by ${tool}; the change itself went through.`);
    return { logged: false };
  }
}
