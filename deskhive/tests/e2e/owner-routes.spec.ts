import { test as baseTest, expect } from '@playwright/test';
import { test, getSeededOwnerSpaceId } from '../fixtures';

// Story 7-5: all five /owner/* routes inherit the SPACE_OWNER-only role
// guard from src/app/(owner)/layout.tsx (Story 7-1). The unauthenticated
// suite below covers first-line-of-defense redirects.
//
// Story 7-PREP-1: extended with authenticated coverage via the
// authenticatedPage fixture. The cross-tenant test is the load-bearing
// AC for this prep story — it closes the gap from Story 7-5 Decision §8
// that the BA browser walk skipped.
//
// NB: the (owner)/layout uses a literal callbackUrl ('/login?callbackUrl=/owner')
// rather than interpolating each route. So all 5 unauthenticated routes
// redirect to the same destination — that's a Story 7-1 design choice
// we preserve here.

baseTest.describe('/owner/* — unauthenticated', () => {
  baseTest('GET /owner redirects to /login', async ({ page }) => {
    await page.goto('/owner');
    await expect(page).toHaveURL(/\/login/);
  });

  baseTest('GET /owner/spaces redirects to /login', async ({ page }) => {
    await page.goto('/owner/spaces');
    await expect(page).toHaveURL(/\/login/);
  });

  baseTest('GET /owner/spaces/new redirects to /login', async ({ page }) => {
    await page.goto('/owner/spaces/new');
    await expect(page).toHaveURL(/\/login/);
  });

  baseTest('GET /owner/spaces/<uuid> redirects to /login', async ({ page }) => {
    await page.goto('/owner/spaces/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login/);
  });

  baseTest('GET /owner/bookings redirects to /login', async ({ page }) => {
    await page.goto('/owner/bookings');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('/owner/* — authenticated', () => {
  // The load-bearing AC for Story 7-PREP-1 (BA Decision §4 — non-
  // negotiable). Closes the Story 7-5 Decision §8 gap that the BA
  // browser walk skipped: an owner navigating directly to another
  // owner's space URL gets soft-redirected to /owner/spaces with no
  // data leak. NOT_FOUND-not-FORBIDDEN: the response is identical to
  // a genuinely-missing row.
  test("fresh-owner cannot access another owner's space via direct URL", async ({
    authenticatedPage,
  }) => {
    const ownerSpaceId = await getSeededOwnerSpaceId();
    const page = await authenticatedPage('fresh-owner');
    await page.goto(`/owner/spaces/${ownerSpaceId}`);
    // Soft-redirect to /owner/spaces — Story 7-5 (owner)/layout pattern.
    await expect(page).toHaveURL(/\/owner\/spaces$/);
    // fresh-owner (applicant3) owns zero spaces, so the empty-state CTA
    // is what's rendered post-redirect.
    await expect(page.getByText(/haven['’]t listed a space yet/i)).toBeVisible();
  });

  // Positive sibling case: the actual owner DOES see their seeded space
  // in the list. Proves the fixture works and the list page filters by
  // owner_id correctly.
  test('owner sees their own seeded space at /owner/spaces', async ({
    authenticatedPage,
  }) => {
    const page = await authenticatedPage('owner');
    await page.goto('/owner/spaces');
    await expect(page.getByText('Seeded Owner Coworks')).toBeVisible();
  });
});
