// Story 7-PREP-1: load .env.local + .env before any test runs. The
// authenticatedPage fixture's `auth.api.signInEmail` call (and the seed-
// helpers' `db` client) need DATABASE_URL + BETTER_AUTH_SECRET; without
// this preload, fixtures throw "DATABASE_URL is not set". Same pattern
// scripts/seed.ts uses at its top. This is the AC-4 "real technical
// need" exception to the zero-config-touch preference.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Story 8-2: shared file path for the email recording sink. The Next.js
// dev server (started by webServer below) reads EMAIL_TEST_RECORD_FILE
// from env and appends one JSON line per sendEmail call. Playwright
// workers truncate + read this same file to assert email firings.
// Single fixed location keeps the cross-process contract simple.
const EMAIL_RECORD_PATH = join(tmpdir(), 'deskhive-e2e-email-recordings.jsonl');

// Also propagate the recording path to the test-worker process so
// readRecordedEmails() can resolve it without an explicit argument.
process.env.EMAIL_TEST_RECORD_FILE = EMAIL_RECORD_PATH;

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
    env: {
      // Story 8-2: activate the email recording sink in the dev-server
      // process so sendEmail writes to the shared file instead of
      // calling Resend. Workers read the same file to assert.
      //
      // NB: when reuseExistingServer is true (local dev) and a Next.js
      // server is already running without this env var, recording
      // won't activate. BA must run `pnpm dev` AFTER pulling this story
      // or restart any existing dev server. CI restarts fresh each run.
      EMAIL_TEST_RECORD_FILE: EMAIL_RECORD_PATH,
    },
  },
});
