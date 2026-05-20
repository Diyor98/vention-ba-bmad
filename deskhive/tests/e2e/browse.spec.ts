import { test, expect } from '@playwright/test';

// DESIGN-INT-GAPS-PASS-2 Gap 2: the searchable grid moved from `/` to
// `/browse` so `/` could host the marketing hero per prototype lines
// 705-813. Hero now owns the `landing-h1` testid; the grid keeps its
// h1 copy ("Find a desk...") + city filter form on /browse.
test.describe('public browse spaces', () => {
  test('/browse renders the grid heading and city filter form', async ({ page }) => {
    await page.goto('/browse');

    await expect(
      page.getByRole('heading', { name: /find a desk\. book a day\. get to work\./i, level: 1 }),
    ).toBeVisible();

    await expect(page.getByLabel('Filter by city')).toBeVisible();
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
  });

  test('GET /api/spaces returns 200 with an array', async ({ request }) => {
    const res = await request.get('/api/spaces');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('city filter form submits to /browse?city=...', async ({ page }) => {
    await page.goto('/browse');
    await page.getByLabel('Filter by city').fill('NowhereCity');
    await page.getByRole('button', { name: /search/i }).click();
    await expect(page).toHaveURL(/\/browse\?city=NowhereCity$/);
  });
});
