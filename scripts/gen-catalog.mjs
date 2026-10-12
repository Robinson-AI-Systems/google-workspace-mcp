#!/usr/bin/env node
// Run from any working directory: npm run gen:catalog [-- --check].
// Import the fully guarded runtime registry, never a hand-maintained list.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { regenerateReadme } from '../src/catalog-document.js';

// Registry assembly does not query a DB. Give local documentation builds a
// non-operational placeholder URL without ever opening a connection.
process.env.DATABASE_URL ||= 'postgres://catalog:catalog@localhost/unused';
const { registry } = await import('../src/tools/index.js');
const readmeFile = fileURLToPath(new URL('../README.md', import.meta.url));
const before = readFileSync(readmeFile, 'utf8');
const after = regenerateReadme(before, registry.tools);
const check = process.argv.includes('--check');
if (check && before !== after) {
  console.error('Registry/README catalog drift. Run npm run gen:catalog and commit the updated README.');
  process.exitCode = 1;
} else if (!check && before !== after) {
  writeFileSync(readmeFile, after);
  console.log('Updated generated README catalog from ' + registry.tools.length + ' registered tools.');
} else {
  console.log('Generated README catalog matches ' + registry.tools.length + ' registered tools.');
}
