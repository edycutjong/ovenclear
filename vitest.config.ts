import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Tests must run fully offline and deterministically.
    testTimeout: 20_000,
  },
});
