import { test, expect } from '@playwright/test';

// Story 7-5: all five /owner/* routes inherit the SPACE_OWNER-only role
// guard from src/app/(owner)/layout.tsx (Story 7-1). This file covers
// the unauthenticated → /login redirect path for each route — first
// line of defense, no Better Auth fixture required.
//
// Authenticated cases (BA Decisions §"Browser verification" §1-38,
// including cross-owner isolation in §23-24) are deferred to the BA
// browser walk per the established authenticated-E2E deferral precedent
// (Stories 5-1 → 7-4). The cumulative debt is restated in the Story 7-5
// Completion Notes — a Better Auth fixtures prep story should land
// before Theme C (Email, Epic 8) ships.
//
// NB: the (owner)/layout uses a literal callbackUrl ('/login?callbackUrl=/owner')
// rather than interpolating each route. So all 5 routes redirect to the
// same destination — that's a Story 7-1 design choice we preserve here.

test.describe('/owner/* — unauthenticated', () => {
  test('GET /owner redirects to /login', async ({ page }) => {
    await page.goto('/owner');
    await expect(page).toHaveURL(/\/login/);
  });

  test('GET /owner/spaces redirects to /login', async ({ page }) => {
    await page.goto('/owner/spaces');
    await expect(page).toHaveURL(/\/login/);
  });

  test('GET /owner/spaces/new redirects to /login', async ({ page }) => {
    await page.goto('/owner/spaces/new');
    await expect(page).toHaveURL(/\/login/);
  });

  test('GET /owner/spaces/<uuid> redirects to /login', async ({ page }) => {
    await page.goto('/owner/spaces/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login/);
  });

  test('GET /owner/bookings redirects to /login', async ({ page }) => {
    await page.goto('/owner/bookings');
    await expect(page).toHaveURL(/\/login/);
  });
});
