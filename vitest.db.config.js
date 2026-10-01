import { defineConfig } from 'vitest/config';

// `npm run test:db`: tests that need a real Postgres (TEST_DATABASE_URL).
export default defineConfig({
  test: { include: ['test/db/**/*.test.js'], environment: 'node', testTimeout: 30000, hookTimeout: 30000, fileParallelism: false }
});
