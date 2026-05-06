import { test, expect } from '@playwright/test';

test('home page renders with DeskHive title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/DeskHive/);
});
