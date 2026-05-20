import { test, expect } from '@playwright/test';

// DESIGN-INT-GAPS-PASS-2 Round 2 Correction 2: /browse simplified to
// match the prototype's grid-only layout (lines 783-806). h1 is now
// "Browse spaces"; the city filter form became a right-aligned search
// input (no separate label/button — submits on Enter, with an
// sr-only submit button as a screen-reader / no-JS fallback).
test.describe('public browse spaces', () => {
  test('/browse renders the grid heading and a search input', async ({ page }) => {
    await page.goto('/browse');

    await expect(
      page.getByRole('heading', { name: /^browse spaces$/i, level: 1 }),
    ).toBeVisible();

    await expect(
      page.getByLabel('Search by city or neighborhood'),
    ).toBeVisible();
  });

  test('GET /api/spaces returns 200 with an array', async ({ request }) => {
    const res = await request.get('/api/spaces');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('search input submits to /browse?city=...', async ({ page }) => {
    await page.goto('/browse');
    const search = page.getByLabel('Search by city or neighborhood');
    await search.fill('NowhereCity');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/browse\?city=NowhereCity$/);
  });
});
