import { test, expect } from '@playwright/test';

const BOGUS_UUID = '00000000-0000-0000-0000-000000000000';

test.describe('public space detail', () => {
  test('GET /api/spaces/<bogus> returns 404', async ({ request }) => {
    const res = await request.get(`/api/spaces/${BOGUS_UUID}`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  test('GET /api/spaces/<bogus>/availability without date returns 400', async ({ request }) => {
    const res = await request.get(`/api/spaces/${BOGUS_UUID}/availability`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/spaces/<bogus>/availability with past date returns 400', async ({ request }) => {
    const res = await request.get(
      `/api/spaces/${BOGUS_UUID}/availability?date=2020-01-01`,
    );
    expect(res.status()).toBe(400);
  });

  test('GET /api/spaces/<bogus>/availability with future date returns 404 (space not found)', async ({ request }) => {
    const res = await request.get(
      `/api/spaces/${BOGUS_UUID}/availability?date=2099-12-31`,
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });
});
