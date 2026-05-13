import { test as baseTest, expect } from '@playwright/test';
import { test } from '../fixtures';

// Story 7-4: /admin/applications + /admin/applications/[id]. The
// unauthenticated → /login redirect path is covered below (no fixture
// needed — admin/layout.tsx redirects to '/login' on the 401 path,
// matching the existing Phase 1 behavior).
//
// Story 7-PREP-1: extended with authenticated coverage via the
// authenticatedPage fixture. The Story 7-4 seed creates four applicant
// users with applications across PENDING/APPROVED/REJECTED — the
// migrated case verifies the admin list page renders them.

baseTest.describe('/admin/applications — unauthenticated', () => {
  baseTest('GET /admin/applications redirects to /login', async ({ page }) => {
    await page.goto('/admin/applications');
    await expect(page).toHaveURL(/\/login$/);
  });

  baseTest('GET /admin/applications/<uuid> redirects to /login', async ({ page }) => {
    await page.goto('/admin/applications/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('/admin/applications — authenticated', () => {
  // The Story 7-4 seed creates `applicant1@deskhive.local` (Anna
  // Bergstrom) with a PENDING application. Admin should see them in
  // the list. This single test verifies (a) the fixture works for the
  // admin role, (b) the SUPER_ADMIN role guard passes when the cookie
  // is present, and (c) listAllApplications + the join to users renders
  // the applicant's full name end-to-end.
  test('admin sees seeded applications in the list', async ({ authenticatedPage }) => {
    const page = await authenticatedPage('admin');
    await page.goto('/admin/applications');
    await expect(page.getByText('Anna Bergstrom')).toBeVisible();
  });
});
