import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Their own database, created and migrated before they start, never the
    // one of the .env (see test/support/test-database.ts)
    globalSetup: ['test/support/global-setup.ts'],
    setupFiles: ['test/support/setup-env.ts'],
    // The files share one database, and some tests read lists that every
    // file writes to (the Discover feed, trends).
    fileParallelism: false,
  },
});
