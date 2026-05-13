/**
 * Story 7-PREP-1: `authenticatedPage` Playwright fixture.
 *
 * Extends Playwright's `test` with a factory that mints a Better Auth
 * session for the requested role/email and returns a `Page` whose
 * context already carries the session cookie. No /login form fill, no
 * backdoor route, no password parameter at the call site (credentials
 * live in tests/fixtures/auth-helpers.ts).
 *
 * Spec usage:
 *
 *   import { test, expect } from '../fixtures';
 *
 *   test('owner sees their own bookings', async ({ authenticatedPage }) => {
 *     const page = await authenticatedPage('owner');
 *     await page.goto('/owner/bookings');
 *     // ...
 *   });
 *
 * Or with the arbitrary-email variant (must be in SEED_CREDENTIALS):
 *
 *   const page = await authenticatedPage({ email: 'applicant1@deskhive.local' });
 */

import {
  test as baseTest,
  expect,
  type Page,
} from '@playwright/test';
import {
  SEED_CREDENTIALS,
  createSessionCookies,
  resolveEmail,
  type AuthRole,
} from './auth-helpers';

type AuthenticatedPageFactory = (
  role: AuthRole | { email: string },
) => Promise<Page>;

type Fixtures = {
  authenticatedPage: AuthenticatedPageFactory;
};

/**
 * The fixture is a "worker-scoped factory" — Playwright instantiates
 * the factory once per test, and each call to the factory inside the
 * test body creates a fresh browser context with the requested
 * session. This shape supports tests that need to switch roles mid-
 * test (e.g., admin approves → newly-promoted user logs in — though
 * such tests should be rare).
 */
export const test = baseTest.extend<Fixtures>({
  authenticatedPage: async ({ browser }, use) => {
    const factory: AuthenticatedPageFactory = async (role) => {
      const email = resolveEmail(role);
      const password = SEED_CREDENTIALS[email];
      const cookies = await createSessionCookies(email, password);
      const context = await browser.newContext();
      await context.addCookies(cookies);
      const page = await context.newPage();
      return page;
    };
    // `use` here is Playwright's fixture-injection API, not React's
    // useState/useEffect. The eslint react-hooks rule false-positives
    // because the enclosing function isn't named with a React-Hook
    // prefix (Playwright convention forces this property name).
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(factory);
  },
});

export { expect };
