// Thin wrapper kept for muscle memory. The real checks live in test/db/upgrade.test.js
// and run in their own throwaway schema, so this is safe against any Postgres,
// including a Neon branch:
//   DATABASE_URL="<branch connection string>" node scripts/test-db-upgrade.mjs
import { spawnSync } from 'node:child_process';

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (or TEST_DATABASE_URL) to a throwaway database or Neon branch first.');
  process.exit(2);
}
const run = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.db.config.js'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: url }
});
process.exit(run.status ?? 1);
