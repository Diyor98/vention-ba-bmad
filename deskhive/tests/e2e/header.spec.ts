import { test, expect } from '@playwright/test';

test.describe('global header (unauthenticated)', () => {
  test('shows DeskHive brand link pointing to /', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    await expect(header).toBeVisible();

    const brand = header.getByRole('link', { name: 'DeskHive' });
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('href', '/');
  });

  test('shows Log in and Register links on /', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    const loginLink = header.getByRole('link', { name: /log in/i });
    const registerLink = header.getByRole('link', { name: /register/i });

    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/login');
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute('href', '/register');
  });

  test('header is rendered on /login and /register too (global)', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('header').getByRole('link', { name: 'DeskHive' })).toBeVisible();

    await page.goto('/register');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('header').getByRole('link', { name: 'DeskHive' })).toBeVisible();
  });
});
