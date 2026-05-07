import { test, expect } from '@playwright/test';

// Story 5-1 reskin: heading still "Create your account"; submit button still
// "Create account". Inline-error class changed from `.text-red-700` to
// `.field-error`.

test.describe('/register page', () => {
  test('renders the form with all required fields', async ({ page }) => {
    await page.goto('/register');

    // Heading
    await expect(
      page.getByRole('heading', { name: /create your account/i }),
    ).toBeVisible();

    // Three labeled inputs
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    // Submit button
    await expect(
      page.getByRole('button', { name: /create account/i }),
    ).toBeVisible();
  });

  test('submitting empty form surfaces validation errors', async ({ page }) => {
    await page.goto('/register');

    await page.getByRole('button', { name: /create account/i }).click();

    // Inline errors now use the `.field-error` class (was `.text-red-700`).
    await expect(page.locator('.field-error').first()).toBeVisible({
      timeout: 5000,
    });
  });
});
