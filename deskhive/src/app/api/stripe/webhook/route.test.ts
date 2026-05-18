import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-2: tests for the narrow account.updated webhook handler
// (Decision §14 tests 8-11).
//
// Mock surface:
//   - @/lib/stripe                    → stub stripe.webhooks.constructEvent
//   - @/db/queries/stripe-connect     → stub getConnectAccountByStripeAccountId
//                                       + upsertConnectAccount
//   - @/db/client                     → stub the direct webhook_events
//                                       select + insert chain

const {
  constructEventMock,
  getByStripeAcctIdMock,
  upsertConnectMock,
  getBookingByIdMock,
  markBookingAuthorizedMock,
  dbSelectMock,
  dbInsertMock,
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  getByStripeAcctIdMock: vi.fn(),
  upsertConnectMock: vi.fn(),
  getBookingByIdMock: vi.fn(),
  markBookingAuthorizedMock: vi.fn(),
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

vi.mock('@/db/queries/stripe-connect', () => ({
  getConnectAccountByStripeAccountId: getByStripeAcctIdMock,
  upsertConnectAccount: upsertConnectMock,
}));

// Story 9-3: bookings query mocks for the new checkout.session.completed branch.
vi.mock('@/db/queries/bookings', () => ({
  getBookingById: getBookingByIdMock,
  markBookingAuthorized: markBookingAuthorizedMock,
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
  const limitFn = vi.fn().mockResolvedValue(found ? [{ id: 'evt_db_row' }] : []);
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
  getByStripeAcctIdMock.mockReset();
  upsertConnectMock.mockReset();
  getBookingByIdMock.mockReset();
  markBookingAuthorizedMock.mockReset();
  dbSelectMock.mockReset();
  dbInsertMock.mockReset();
  process.env = { ...ORIGINAL_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_test_secret' };
});

describe('POST /api/stripe/webhook (Story 9-2 Decision §14 tests 8-11)', () => {
  it('test 8 — valid account.updated signature → updates DB row + inserts webhook_events', async () => {
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
    getByStripeAcctIdMock.mockResolvedValueOnce({
      id: 'row-1',
      userId: 'user-owner-1',
      stripeAccountId: 'acct_test_xyz',
    });
    upsertConnectMock.mockResolvedValueOnce({});
    const valuesFn = stubWebhookEventsInsert();

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, handled: true });

    // DB row updated with the new booleans.
    expect(upsertConnectMock).toHaveBeenCalledTimes(1);
    expect(upsertConnectMock.mock.calls[0]?.[0]).toEqual({
      userId: 'user-owner-1',
      stripeAccountId: 'acct_test_xyz',
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingCompleted: true,
    });

    // webhook_events insert captured with the right payload.
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    expect(valuesFn).toHaveBeenCalledTimes(1);
    expect(valuesFn.mock.calls[0]?.[0]?.stripeEventId).toBe(
      'evt_test_account_updated',
    );
    expect(valuesFn.mock.calls[0]?.[0]?.eventType).toBe('account.updated');
  });

  it('test 9 — invalid signature → 400, NO upsert, NO webhook_events insert', async () => {
    constructEventMock.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const res = await POST(makePostRequest('{}', 'sig_bad'));

    expect(res.status).toBe(400);
    expect(upsertConnectMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it('test 10 — duplicate stripe_event_id → 200 idempotent, NO re-processing', async () => {
    constructEventMock.mockReturnValueOnce({
      id: 'evt_dupe',
      type: 'account.updated',
      data: { object: { id: 'acct_x', charges_enabled: true, payouts_enabled: true, details_submitted: true } },
    });
    stubWebhookEventsLookup(true); // event id already in webhook_events.

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, idempotent: true });
    expect(upsertConnectMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
    expect(getByStripeAcctIdMock).not.toHaveBeenCalled();
  });

  it('test 11 — unhandled event type → 200, NO webhook_events insert (preserves 9-5 backfill)', async () => {
    constructEventMock.mockReturnValueOnce({
      id: 'evt_pi_succeeded',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test' } },
    });
    stubWebhookEventsLookup(false);

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, handled: false });
    // Decision §7 anti-pattern: do NOT insert into webhook_events for
    // unhandled event types. This preserves Story 9-5's ability to
    // backfill once its real handlers ship.
    expect(dbInsertMock).not.toHaveBeenCalled();
    expect(upsertConnectMock).not.toHaveBeenCalled();
  });

  it('account.updated → upsertConnectAccount throws → 500 with diagnostic body, NO webhook_events insert (Story 9-2 BA-walk fix)', async () => {
    // Reproduces the BA browser walk failure: the upsert call throws
    // (Drizzle/PG transient error). The wrapped try/catch should
    // surface a 500 with body 'Database update failed' (distinct from
    // the other failure bodies) and a logger.error line with
    // stripe_webhook_upsert_failed tag, AND must NOT insert into
    // webhook_events (Decision §7 anti-pattern preserved on failure).
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
    getByStripeAcctIdMock.mockResolvedValueOnce({
      id: 'row-1',
      userId: 'user-owner-1',
      stripeAccountId: 'acct_test_xyz',
    });
    // Underlying DrizzleQueryError carrying a PG cause — exactly the
    // shape the BA walk's pnpm dev log showed (modulo .cause being
    // visible now).
    const drizzleErr = new Error(
      'Failed query: insert ... on conflict do update ...',
    );
    (drizzleErr as Error & { cause: Error }).cause = new Error(
      'Connection terminated unexpectedly',
    );
    upsertConnectMock.mockRejectedValueOnce(drizzleErr);

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Database update failed');
    // CRITICAL: failed handling must NOT insert into webhook_events —
    // Decision §7 anti-pattern preserved so Stripe's retry can re-attempt.
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it('account.updated for an unknown account → 200 deferred, NO webhook_events insert', async () => {
    constructEventMock.mockReturnValueOnce({
      id: 'evt_unknown_acct',
      type: 'account.updated',
      data: { object: { id: 'acct_we_dont_know', charges_enabled: true, payouts_enabled: true, details_submitted: true } },
    });
    stubWebhookEventsLookup(false);
    getByStripeAcctIdMock.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, deferred: true });
    expect(upsertConnectMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // Story 9-3: checkout.session.completed branch tests (Decision §11).
  // ──────────────────────────────────────────────────────────────────

  it('Story 9-3 — checkout.session.completed happy path: marks booking AUTHORIZED + inserts webhook_events', async () => {
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
    getBookingByIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-1',
      paymentStatus: 'AWAITING_PAYMENT',
      paymentIntentId: null,
    });
    // markBookingAuthorized returns the updated row on success (not
    // undefined — the conditional WHERE matched).
    markBookingAuthorizedMock.mockResolvedValueOnce({
      id: 'booking-uuid-1',
      paymentStatus: 'AUTHORIZED',
      paymentIntentId: 'pi_test_payment_1',
    });
    const valuesFn = stubWebhookEventsInsert();

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, handled: true });

    // markBookingAuthorized called with the right args.
    expect(markBookingAuthorizedMock).toHaveBeenCalledTimes(1);
    expect(markBookingAuthorizedMock.mock.calls[0]?.[0]).toEqual({
      bookingId: 'booking-uuid-1',
      paymentIntentId: 'pi_test_payment_1',
    });

    // webhook_events insert fires with the right payload (first real
    // handle — Decision §7 anti-pattern from 9-2 carries forward).
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
    expect(valuesFn).toHaveBeenCalledTimes(1);
    expect(valuesFn.mock.calls[0]?.[0]?.stripeEventId).toBe(
      'evt_checkout_completed_1',
    );
    expect(valuesFn.mock.calls[0]?.[0]?.eventType).toBe(
      'checkout.session.completed',
    );
  });

  it('Story 9-3 — checkout.session.completed idempotent (return-URL won): no-op + NO webhook_events insert', async () => {
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
    getBookingByIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-2',
      // Return-URL handler already won — booking is already AUTHORIZED.
      paymentStatus: 'AUTHORIZED',
      paymentIntentId: 'pi_test_payment_2',
    });
    // markBookingAuthorized's conditional WHERE filters this row out —
    // .returning() yields no row, the wrapper returns undefined.
    markBookingAuthorizedMock.mockResolvedValueOnce(undefined);

    const res = await POST(makePostRequest('{}', 'sig_valid'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, idempotent: true });

    // CRITICAL: Decision §7 anti-pattern from 9-2 — only insert into
    // webhook_events on FIRST real handle. The return-URL handler
    // already did the work; this webhook is a no-op, so the
    // webhook_events row is NOT inserted.
    expect(dbInsertMock).not.toHaveBeenCalled();
  });
});
