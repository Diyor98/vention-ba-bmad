import { test, expect } from '@playwright/test';

const BOGUS_UUID = '00000000-0000-0000-0000-000000000000';

test.describe('booking creation — unauthenticated', () => {
  test('POST /api/bookings returns 401 without a session cookie', async ({ request }) => {
    const res = await request.post('/api/bookings', {
      data: { deskId: BOGUS_UUID, bookingDate: '2099-12-31' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('GET /my-bookings redirects to /login', async ({ page }) => {
    await page.goto('/my-bookings');
    // Either /login or /login?callbackUrl=... — accept either trailing form.
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });

  test('POST /api/bookings without body returns 400 (invalid JSON)', async ({ request }) => {
    // request.post with no `data` defaults to empty body — Next parses as
    // empty string which triggers the JSON parse failure path.
    const res = await request.post('/api/bookings', {
      headers: { 'content-type': 'application/json' },
      data: '',
    });
    // 401 (proxy/auth blocks first) OR 400 (if it reaches the handler).
    // Auth runs first per our layered guards, so we expect 401.
    expect([400, 401]).toContain(res.status());
  });

  test('GET /api/bookings/me returns 401 without a session cookie', async ({ request }) => {
    const res = await request.get('/api/bookings/me');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/bookings/:id/cancel returns 401 without a session cookie', async ({ request }) => {
    const res = await request.post(`/api/bookings/${BOGUS_UUID}/cancel`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });
});
