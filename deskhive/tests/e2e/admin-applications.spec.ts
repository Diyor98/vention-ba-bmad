import { test, expect } from '@playwright/test';

// Story 7-4: /admin/applications + /admin/applications/[id]. Authenticated
// cases (the full BA 22-point browser walk — admin sees tab, filters, sorts,
// approves, rejects with reason, SPACE_OWNER + Guest blocked) are deferred
// to BA browser walk per the established authenticated-E2E deferral
// precedent (Stories 5-1 → 7-3).
//
// This file covers the unauthenticated → login redirect behavior, which
// doesn't need a Better Auth fixture. The admin-area role guard lives in
// src/app/admin/layout.tsx and applies to both /admin/applications routes
// inherited from the layout chain.

test.describe('/admin/applications — unauthenticated', () => {
  test('GET /admin/applications redirects to /login', async ({ page }) => {
    await page.goto('/admin/applications');
    // admin/layout.tsx redirects to '/login' (no callbackUrl) on the 401
    // path, matching the existing Phase 1 behavior used by /admin/spaces
    // and /admin/bookings.
    await expect(page).toHaveURL(/\/login$/);
  });

  test('GET /admin/applications/<uuid> redirects to /login', async ({ page }) => {
    await page.goto('/admin/applications/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});
