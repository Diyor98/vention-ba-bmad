import { test, expect } from '@playwright/test';

// Story 5-1 reskin: tests target `.site-header` (the explicit class) instead
// of the generic `<header>` element selector — page-section <header> tags
// inside <main> on `/`, `/spaces/[id]`, and `/my-bookings` would otherwise
// make `page.locator('header')` match multiple elements. Also: the public
// header now uses "Sign up" text for the register CTA (was "Register").

test.describe('global header (unauthenticated)', () => {
  test('shows DeskHive brand link pointing to /', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('.site-header');
    await expect(header).toBeVisible();

    const brand = header.getByRole('link', { name: 'DeskHive' });
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('href', '/');
  });

  test('shows Log in and Sign up links on /', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('.site-header');
    const loginLink = header.getByRole('link', { name: /^log in$/i });
    const signUpLink = header.getByRole('link', { name: /^sign up$/i });

    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/login');
    await expect(signUpLink).toBeVisible();
    await expect(signUpLink).toHaveAttribute('href', '/register');
  });

  test('header is rendered on /login and /register too (global)', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(
      page.locator('.site-header').getByRole('link', { name: 'DeskHive' }),
    ).toBeVisible();

    await page.goto('/register');
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(
      page.locator('.site-header').getByRole('link', { name: 'DeskHive' }),
    ).toBeVisible();
  });
});
