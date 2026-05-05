import { describe, it, expect } from 'vitest';
import {
  apiError,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiConflict,
  apiInternalError,
} from './http';

describe('apiError', () => {
  it('returns the documented response shape', async () => {
    const res = apiError('SOME_CODE', 'Some message', 418);
    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body).toEqual({ error: 'Some message', code: 'SOME_CODE' });
  });

  it('includes fields when provided', async () => {
    const res = apiError('VALIDATION_ERROR', 'Validation failed', 400, {
      fields: { email: 'Required' },
    });
    const body = await res.json();
    expect(body).toEqual({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fields: { email: 'Required' },
    });
  });

  it('omits fields when not provided', async () => {
    const res = apiError('FOO', 'bar', 400);
    const body = await res.json();
    expect(body).not.toHaveProperty('fields');
  });
});

describe('error helpers', () => {
  it('apiUnauthorized → 401 UNAUTHORIZED', async () => {
    const res = apiUnauthorized();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('apiForbidden → 403 FORBIDDEN with default message', async () => {
    const res = apiForbidden();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });
  });

  it('apiForbidden → 403 with custom message', async () => {
    const res = apiForbidden('Wrong role');
    const body = await res.json();
    expect(body.error).toBe('Wrong role');
  });

  it('apiNotFound → 404 NOT_FOUND', async () => {
    const res = apiNotFound();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('apiValidationError → 400 VALIDATION_ERROR with fields', async () => {
    const res = apiValidationError({ email: 'Invalid' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fields: { email: 'Invalid' },
    });
  });

  it('apiConflict → 409 with custom code/message', async () => {
    const res = apiConflict('DESK_ALREADY_BOOKED', 'taken');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'taken', code: 'DESK_ALREADY_BOOKED' });
  });

  it('apiInternalError → 500 INTERNAL_ERROR', async () => {
    const res = apiInternalError();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
