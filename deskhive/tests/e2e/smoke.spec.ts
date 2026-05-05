import { test, expect } from '@playwright/test';

test('home page renders the create-next-app welcome page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Create Next App/);
});
