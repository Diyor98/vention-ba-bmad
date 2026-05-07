import { test, expect } from '@playwright/test';

// Story 5-1 reskin: page heading changed from "Log in" to "Welcome back"
// (per design Section heading + subtitle pattern). The submit button still
// reads "Log in", so the button-name regex is unchanged. Inline-error class
// changed from `.text-red-700` to `.field-error`.

test.describe('/login page', () => {
  test('renders the form with all required fields', async ({ page }) => {
    await page.goto('/login');

    // Heading is now "Welcome back"
    await expect(
      page.getByRole('heading', { name: /welcome back/i }),
    ).toBeVisible();

    // Two labeled inputs
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    // Submit button still reads "Log in"
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  });

  test('submitting empty form surfaces validation errors', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: /log in/i }).click();

    // Inline errors now use the `.field-error` class (was `.text-red-700`).
    await expect(page.locator('.field-error').first()).toBeVisible({
      timeout: 5000,
    });
  });
});
