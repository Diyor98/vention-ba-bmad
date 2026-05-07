import { test, expect } from '@playwright/test';

test.describe('admin bookings — unauthenticated', () => {
  test('GET /admin/bookings redirects to /login', async ({ page }) => {
    await page.goto('/admin/bookings');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('GET /api/admin/bookings returns 401 without a session cookie', async ({
    request,
  }) => {
    const res = await request.get('/api/admin/bookings');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/admin/bookings/:id/confirm returns 401 without a session cookie', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/admin/bookings/00000000-0000-0000-0000-000000000000/confirm',
    );
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/admin/bookings/:id/reject returns 401 without a session cookie', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/admin/bookings/00000000-0000-0000-0000-000000000000/reject',
    );
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });
});
