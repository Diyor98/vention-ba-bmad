import { test, expect } from '@playwright/test';

test.describe('public browse spaces', () => {
  test('home page renders the Spaces heading and city filter form', async ({ page }) => {
    await page.goto('/');

    // Heading text changed in Story 5-1 reskin from "Spaces" to "Browse spaces"
    // (matches the public site nav label). Same h1, same page.
    await expect(
      page.getByRole('heading', { name: /^browse spaces$/i, level: 1 }),
    ).toBeVisible();

    // City filter form
    await expect(page.getByLabel('Filter by city')).toBeVisible();
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
  });

  test('GET /api/spaces returns 200 with an array', async ({ request }) => {
    const res = await request.get('/api/spaces');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('city filter form submits to /?city=...', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Filter by city').fill('NowhereCity');
    await page.getByRole('button', { name: /search/i }).click();
    await expect(page).toHaveURL(/\/\?city=NowhereCity$/);
  });
});
