// Fails when a tool that might change things has no safety layer (dryRun preview, read-back, change log).
//
// The rule is the safe way round: EVERY tool must have dryRun unless it is clearly a read (its name
// starts with get/list/search/... after the area prefix) or it is named in READ_ONLY below with the reason.
// So a new tool with an unusual verb (sort, merge, untrash, ...) is caught instead of slipping through.
// Run by `npm run check` and CI.
process.env.DATABASE_URL ||= 'postgres://user:pass@localhost/none';
const { registry } = await import('../src/tools/index.js');

import { findMissing, READ_ONLY } from './check-writes-lib.mjs';
const missing = findMissing(registry.tools);
const stale = Object.keys(READ_ONLY).filter((n) => !registry.tools.some((t) => t.name === n));
if (missing.length) console.error(`These tools have no dryRun/confirm safety layer and are not listed as read-only:\n  ${missing.join('\n  ')}\nAdd them to the safety table (src/tools/guards*.js), or, if they truly only read, to READ_ONLY in scripts/check-writes.mjs with a reason.`);
if (stale.length) console.error(`READ_ONLY lists tools that do not exist (remove them):\n  ${stale.join('\n  ')}`);
process.exit(missing.length || stale.length ? 1 : 0);
