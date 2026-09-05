import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3187', viewport: { width: 1000, height: 850 } },
  webServer: {
    command: 'bun run dev --port 3187',
    url: 'http://127.0.0.1:3187/editor',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
