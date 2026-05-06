import { test, expect } from '@playwright/test';

test.describe('admin spaces — unauthenticated', () => {
  test('GET /admin/spaces redirects to /login', async ({ page }) => {
    await page.goto('/admin/spaces');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('GET /admin/spaces/new redirects to /login', async ({ page }) => {
    await page.goto('/admin/spaces/new');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('POST /api/admin/spaces returns 401 without a session cookie', async ({ request }) => {
    const res = await request.post('/api/admin/spaces', {
      data: {
        name: 'Hive Central',
        city: 'Berlin',
        addressLine: 'Friedrichstr 1',
        description: 'Bright modern workspace',
        primaryImageUrl: 'https://example.com/x.jpg',
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('GET /admin/spaces/:id redirects to /login', async ({ page }) => {
    await page.goto('/admin/spaces/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('PUT /api/admin/spaces/:id returns 401 without a session cookie', async ({ request }) => {
    const res = await request.put(
      '/api/admin/spaces/00000000-0000-0000-0000-000000000000',
      {
        data: {
          name: 'Hive Central',
          city: 'Berlin',
          addressLine: 'Friedrichstr 1',
          description: 'Updated description',
          primaryImageUrl: 'https://example.com/x.jpg',
        },
      },
    );
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/admin/spaces/:id/desks returns 401 without a session cookie', async ({ request }) => {
    const res = await request.post(
      '/api/admin/spaces/00000000-0000-0000-0000-000000000000/desks',
      { data: { label: 'Desk-1', dailyPriceCents: '2500' } },
    );
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });
});
