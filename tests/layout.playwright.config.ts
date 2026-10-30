import { defineConfig } from '@playwright/test';

// Layout fixtures never authenticate or start a server against a live tenant.
export default defineConfig({
  testDir: '.',
  testMatch: ['hr-structure-layout.spec.ts', 'sales-reversal-layout.spec.ts', 'credit-workspace-layout.spec.ts'],
  outputDir: '../test-results/layout',
  workers: 2,
  reporter: 'list',
  use: { headless: true, trace: 'retain-on-failure' },
});
