import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['_verify/unit/**/*.test.ts'],
    environment: 'node',
    cache: false,
    fileParallelism: false,
    reporters: ['default'],
  },
});
