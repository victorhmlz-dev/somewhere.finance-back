import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // The files share one database, and some tests read lists that every
    // file writes to (the Discover feed, trends).
    fileParallelism: false,
  },
});
