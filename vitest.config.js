import { defineConfig } from 'vitest/config';

// `npm test`: fast unit tests. Nothing here talks to Google or a database.
export default defineConfig({
  test: { include: ['test/unit/**/*.test.js'], environment: 'node' }
});
