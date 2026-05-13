// Story 7-PREP-1: load .env.local + .env before any test runs. The
// authenticatedPage fixture's `auth.api.signInEmail` call (and the seed-
// helpers' `db` client) need DATABASE_URL + BETTER_AUTH_SECRET; without
// this preload, fixtures throw "DATABASE_URL is not set". Same pattern
// scripts/seed.ts uses at its top. This is the AC-4 "real technical
// need" exception to the zero-config-touch preference.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
