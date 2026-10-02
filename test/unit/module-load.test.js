// Imports every source file. Fake clients hide a missing import (the code path that uses it never runs
// in a test); loading the file for real catches things like a name used but never imported.
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const files = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const rel = join(dir, f);
  return statSync(join(root, rel)).isDirectory() ? files(rel) : rel.endsWith('.js') ? [rel] : [];
});


describe('every source file loads', () => {
  process.env.DATABASE_URL ||= 'postgres://user:pass@localhost/none';
  for (const file of [...files('src'), ...files('api')]) {
    it(file, async () => { await expect(import(pathToFileURL(join(root, file)).href)).resolves.toBeTruthy(); });
  }
});
