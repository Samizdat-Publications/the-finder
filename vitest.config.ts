import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'build/**', 'sources/**', '.claude/**'],
    testTimeout: 60000,
    reporters: ['default', 'json'],
    outputFile: { json: 'harness/out/vitest.json' },
  },
});
