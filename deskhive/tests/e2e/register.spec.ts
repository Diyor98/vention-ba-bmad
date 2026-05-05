import { test, expect } from '@playwright/test';

test.describe('/register page', () => {
  test('renders the form with all required fields', async ({ page }) => {
    await page.goto('/register');

    // Heading
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    // Three labeled inputs (matching the autoComplete attributes for stability)
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    // Submit button
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('submitting empty form surfaces validation errors', async ({ page }) => {
    await page.goto('/register');

    // Submit the form without filling anything. The HTML `required` and `noValidate`
    // settings let the request through to the Server Action, which returns
    // VALIDATION_ERROR with field-level messages.
    await page.getByRole('button', { name: /create account/i }).click();

    // At least one inline error in red should appear (text-red-700 class).
    // Wait briefly for the Server Action to round-trip.
    await expect(page.locator('.text-red-700').first()).toBeVisible({ timeout: 5000 });
  });
});
