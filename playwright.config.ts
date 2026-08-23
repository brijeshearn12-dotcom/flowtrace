import { defineConfig, devices } from '@playwright/test';

/**
 * FlowTrace Browser Acceptance Test Configuration
 * Runs the full judge flow against the live dev server.
 *
 * Usage:
 *   pnpm test:browser           -- run all acceptance tests headless
 *   pnpm test:browser:ui        -- run with headed browser for visual debugging
 *
 * Requires the dev server to be running (`pnpm dev`) or use the webServer option below.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/browserAcceptance.test.ts'],
  timeout: 60_000,
  retries: 1,
  workers: 1, // sequential — tests share a live server

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Auto-start the dev server if not already running
  webServer: [
    {
      command: 'cmd /C "set NODE_TLS_REJECT_UNAUTHORIZED=0&& tsx watch server/index.ts"',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'vite client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
