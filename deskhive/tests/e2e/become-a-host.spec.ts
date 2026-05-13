import { test, expect } from '@playwright/test';

// Story 7-3: /become-a-host page. Authenticated cases (State A/B/C/D
// happy paths) are deferred to BA browser walk per the established
// authenticated-E2E deferral precedent (Stories 5-1 → 7-2). This file
// covers the unauthenticated State E redirect behavior, which doesn't
// need a fixture.

test.describe('/become-a-host — unauthenticated', () => {
  test('GET /become-a-host redirects to /login with callbackUrl', async ({ page }) => {
    await page.goto('/become-a-host');
    // Phase 1 callbackUrl convention (US-3.3 + Story 6-2 memory). Slash
    // is preserved unencoded inside the query value — Next.js's redirect()
    // doesn't URL-encode reserved sub-delims that are allowed there.
    // The literal substring is `/login?callbackUrl=/become-a-host`.
    await expect(page).toHaveURL(/\/login\?callbackUrl=\/become-a-host$/);
  });

  test('login page receives the callbackUrl as hidden input value', async ({ page }) => {
    await page.goto('/become-a-host');
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    // The Phase 1 login form renders a hidden input
    // <input type="hidden" name="callbackUrl" value="/become-a-host" />
    // (from src/app/(public)/login/login-form.tsx).
    const hidden = page.locator('input[name="callbackUrl"]');
    await expect(hidden).toHaveAttribute('value', '/become-a-host');
  });
});
