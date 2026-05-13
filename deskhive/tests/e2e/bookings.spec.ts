import { test as baseTest, expect } from '@playwright/test';
import { test } from '../fixtures';

const BOGUS_UUID = '00000000-0000-0000-0000-000000000000';

// Story 7-PREP-1: existing 5 unauthenticated tests preserved; one
// authenticated case added — Guest sees their seeded booking at
// /my-bookings. The Story 7-5 seed creates a CONFIRMED booking by
// applicant2 on `Seeded Owner Coworks`, which is the assertion target.
// Best-effort per AC-8 — if the seed shape shifts, narrow the assertion
// rather than deleting the test.

baseTest.describe('booking creation — unauthenticated', () => {
  baseTest('POST /api/bookings returns 401 without a session cookie', async ({ request }) => {
    const res = await request.post('/api/bookings', {
      data: { deskId: BOGUS_UUID, bookingDate: '2099-12-31' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  baseTest('GET /my-bookings redirects to /login', async ({ page }) => {
    await page.goto('/my-bookings');
    // Either /login or /login?callbackUrl=... — accept either trailing form.
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });

  baseTest('POST /api/bookings without body returns 400 (invalid JSON)', async ({ request }) => {
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

  baseTest('GET /api/bookings/me returns 401 without a session cookie', async ({ request }) => {
    const res = await request.get('/api/bookings/me');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  baseTest('POST /api/bookings/:id/cancel returns 401 without a session cookie', async ({ request }) => {
    const res = await request.post(`/api/bookings/${BOGUS_UUID}/cancel`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });
});

test.describe('booking visibility — authenticated', () => {
  // applicant2@deskhive.local has a CONFIRMED booking on Seeded Owner
  // Coworks per the Story 7-5 seed. Authenticated Guest visits
  // /my-bookings and sees the space they booked.
  test('Guest sees their own seeded booking at /my-bookings', async ({
    authenticatedPage,
  }) => {
    const page = await authenticatedPage({ email: 'applicant2@deskhive.local' });
    await page.goto('/my-bookings');
    await expect(page.getByText('Seeded Owner Coworks')).toBeVisible();
  });
});
