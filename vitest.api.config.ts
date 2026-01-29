import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/__tests__/**/*.test.ts'],
    globals: true,
    testTimeout: 10000,
    pool: 'forks',
  },
});
