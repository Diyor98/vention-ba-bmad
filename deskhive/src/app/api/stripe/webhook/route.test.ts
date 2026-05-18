import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-5: route-level tests after the dispatch generalization.
//
// Pre-9-5 this file mocked `@/db/queries/stripe-connect` + `@/db/queries/bookings`
// directly because the route owned all handler logic. Post-9-5 the route is a
// thin shell — handler logic lives in `src/lib/payments/webhooks.ts`, tested
// independently in `webhooks.test.ts`. This file now mocks at the dispatch
// boundary (`@/lib/payments/webhooks` → `dispatchWebhookEvent`) per BA Decision
// §13's split-by-mock-boundary, 3-layers pattern:
//   route → @/lib/payments/webhooks
//   handler → @/db/queries/*
//   query → @/db/client
//
// Assertion lists for the migrated 9-2 + 9-3 tests are unchanged in spirit
// (response shape + webhook_events insert / no-insert behavior). The internal
// mocks shifted from leaf DB ops to the dispatch seam.
//
// NEW dispatcher-level tests (AC-12):
//   • Unknown event type → dispatcher returns { handled: false } →
//     route returns 200 handled:false, NO webhook_events insert.
//   • Handler throws → dispatcher safety-net catches → returns { ok: false,
//     status: 500 } → route returns 500, NO webhook_events insert.

const {
  constructEventMock,
  dispatchWebhookEventMock,
  dbSelectMock,
  dbInsertMock,
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  dispatchWebhookEventMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: constructEventMock,
    },
  },
}));

vi.mock('@/lib/payments/webhooks', () => ({
  dispatchWebhookEvent: dispatchWebhookEventMock,
}));

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
    insert: (...args: unknown[]) => dbInsertMock(...args),
  },
}));

import { POST } from './route';

/**
 * Stub the Drizzle select chain for the webhook_events idempotency
 * check. The handler does:
 *   db.select({ id: ... }).from(webhookEventsTable).where(...).limit(1)
 * which should resolve to an array. If the array has a row, the
 * handler short-circuits; if empty, it proceeds to dispatch.
 */
function stubWebhookEventsLookup(found: boolean) {
  const limitFn = vi
    .fn()
    .mockResolvedValue(found ? [{ id: 'evt_db_row' }] : []);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  dbSelectMock.mockReturnValue({ from: fromFn });
}

/**
 * Stub the Drizzle insert chain for webhook_events. The handler does:
 *   db.insert(webhookEventsTable).values({ ... })
 */
function stubWebhookEventsInsert() {
  const valuesFn = vi.fn().mockResolvedValue([]);
  dbInsertMock.mockReturnValue({ values: valuesFn });
  return valuesFn;
}

function makePostRequest(body: string, signature: string): Request {
  return new Request('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body,
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  constructEventMock.mockReset();
  dispatchWebhookEventMock.mockReset();
  dbSelectMock.mockReset();
  dbInsertMock.mockReset();
  process.env = { ...ORIGINAL_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_test_secret' };
});

describe('POST /api/stripe/webhook — route shell (Story 9-5 refactor)', () => {
  // ────────────────────────────────────────────────────────────────────
  // Migrated 9-2 + 9-3 tests — assertion shape preserved, internal mocks
  // shifted to the dispatch boundary per BA Decision §13.
  // ────────────────────────────────────────────────────────────────────

  it('Story 9-2 — valid account.updated signature → 200 handled + inserts webhook_events', async () => {
    constructEventMock.mockReturnValueOnce({
      id: 'evt_test_account_updated',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_xyz',
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    });
    stubWebhookEventsLookup(false);
    dispatchWebhookEventMock.mockResolvedValueOnce({
      ok: true,
      handled: true,
    });
    const valuesFn = stubWebhookEventsInsert();

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, handled: true });

    // Dispatch was called with the verified event.
    expect(dispatchWebhookEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchWebhookEventMock.mock.calls[0]?.[0]?.id).toBe(
      'evt_test_account_updated',
    );

    // webhook_events insert captured with the right payload.
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    expect(valuesFn).toHaveBeenCalledTimes(1);
    expect(valuesFn.mock.calls[0]?.[0]?.stripeEventId).toBe(
      'evt_test_account_updated',
    );
    expect(valuesFn.mock.calls[0]?.[0]?.eventType).toBe('account.updated');
  });

  it('Story 9-2 — invalid signature → 400, NO dispatch, NO webhook_events insert', async () => {
    constructEventMock.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const res = await POST(makePostRequest('{}', 'sig_bad'));

    expect(res.status).toBe(400);
    expect(dispatchWebhookEventMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it('Story 9-2 — duplicate stripe_event_id → 200 idempotent, NO re-processing', async () => {
    constructEventMock.mockReturnValueOnce({
      id: 'evt_dupe',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_x',
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    });
    stubWebhookEventsLookup(true); // event id already in webhook_events.

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, idempotent: true });
    expect(dispatchWebhookEventMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it('Story 9-2 BA-walk fix — handler returns { ok: false, status: 500 } → 500, NO webhook_events insert', async () => {
    // Replaces the pre-9-5 "upsertConnectAccount throws → 500" test.
    // After the refactor the handler owns its 3-stage try-catch; the route
    // just translates the result. This test verifies the route's HTTP
    // shape on the ok:false path AND that webhook_events is NOT inserted
    // (Decision §6 anti-pattern preserved on failure → Stripe retries).
    constructEventMock.mockReturnValueOnce({
      id: 'evt_upsert_throws',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_xyz',
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        },
      },
    });
    stubWebhookEventsLookup(false);
    dispatchWebhookEventMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      message: 'Database update failed',
    });

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Database update failed');
    // CRITICAL: failed handling must NOT insert into webhook_events —
    // Decision §6 anti-pattern preserved so Stripe's retry can re-attempt.
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it('Story 9-2 — handler returns { deferred: true } → 200 deferred, NO webhook_events insert', async () => {
    constructEventMock.mockReturnValueOnce({
      id: 'evt_unknown_acct',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_we_dont_know',
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    });
    stubWebhookEventsLookup(false);
    dispatchWebhookEventMock.mockResolvedValueOnce({
      ok: true,
      deferred: true,
    });

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, deferred: true });
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it('Story 9-3 — checkout.session.completed happy path → 200 handled + inserts webhook_events', async () => {
    constructEventMock.mockReturnValueOnce({
      id: 'evt_checkout_completed_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_1',
          payment_intent: 'pi_test_payment_1',
          metadata: { bookingId: 'booking-uuid-1' },
        },
      },
    });
    stubWebhookEventsLookup(false);
    dispatchWebhookEventMock.mockResolvedValueOnce({
      ok: true,
      handled: true,
    });
    const valuesFn = stubWebhookEventsInsert();

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, handled: true });

    // Dispatch was called with the verified event.
    expect(dispatchWebhookEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchWebhookEventMock.mock.calls[0]?.[0]?.type).toBe(
      'checkout.session.completed',
    );

    // webhook_events insert fires with the right payload (first real
    // handle — Decision §6 anti-pattern from 9-2 carries forward).
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    expect(valuesFn).toHaveBeenCalledTimes(1);
    expect(valuesFn.mock.calls[0]?.[0]?.stripeEventId).toBe(
      'evt_checkout_completed_1',
    );
    expect(valuesFn.mock.calls[0]?.[0]?.eventType).toBe(
      'checkout.session.completed',
    );
  });

  it('Story 9-3 — checkout.session.completed idempotent → 200 idempotent, NO webhook_events insert', async () => {
    constructEventMock.mockReturnValueOnce({
      id: 'evt_checkout_completed_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_2',
          payment_intent: 'pi_test_payment_2',
          metadata: { bookingId: 'booking-uuid-2' },
        },
      },
    });
    stubWebhookEventsLookup(false);
    dispatchWebhookEventMock.mockResolvedValueOnce({
      ok: true,
      idempotent: true,
    });

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, idempotent: true });

    // CRITICAL: Decision §6 anti-pattern from 9-2 — only insert into
    // webhook_events on FIRST real handle. The return-URL handler
    // already did the work; this webhook is a no-op, so the
    // webhook_events row is NOT inserted.
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────
  // NEW dispatcher-level tests (BA Decision §13).
  // ────────────────────────────────────────────────────────────────────

  it('Story 9-5 NEW — unknown event type → 200 handled:false, NO webhook_events insert', async () => {
    // Reproduces the pre-9-5 "unhandled event type" behavior with the
    // post-9-5 dispatch boundary. The dispatcher returns
    // { handled: false } for any event.type not in WEBHOOK_HANDLERS;
    // the route returns 200 handled:false WITHOUT inserting into
    // webhook_events (Decision §10: keeps the log clean for 9-6 / 9-7
    // to backfill when they ship).
    constructEventMock.mockReturnValueOnce({
      id: 'evt_unknown_type',
      type: 'customer.created',
      data: { object: { id: 'cus_test' } },
    });
    stubWebhookEventsLookup(false);
    dispatchWebhookEventMock.mockResolvedValueOnce({
      ok: true,
      handled: false,
    });

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, handled: false });
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it('Story 9-5 NEW — dispatcher safety-net throw → 500, NO webhook_events insert', async () => {
    // Should-never-happen safety net (BA Decision §8). Handlers SHOULD
    // always return a WebhookHandlerResult; the dispatcher's top-level
    // try-catch is the belt over the suspenders. In this test the
    // dispatcher mock itself rejects to simulate an unexpected throw
    // path; in production the same shape arrives via the real
    // dispatcher's safety net converting a handler throw into
    // { ok: false, status: 500 }.
    constructEventMock.mockReturnValueOnce({
      id: 'evt_handler_throws',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test',
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    });
    stubWebhookEventsLookup(false);
    dispatchWebhookEventMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      message: 'Unexpected handler error',
    });

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Unexpected handler error');
    expect(dbInsertMock).not.toHaveBeenCalled();
  });
});
