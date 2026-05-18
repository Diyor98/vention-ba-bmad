import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// Story 9-5 handler-level tests for the new sub-module
// `src/lib/payments/webhooks.ts`. Per BA Decision §13's split-by-mock-
// boundary, 3-layers pattern:
//   route → @/lib/payments/webhooks
//   handler → @/db/queries/*       ← THIS LAYER
//   query → @/db/client
//
// 6 locked handler tests (BA Decision §13):
//   • handlePaymentIntentSucceeded happy / idempotent / deferred
//   • handlePaymentIntentCanceled happy / idempotent
//   • handleCheckoutSessionExpired happy + idempotent (parameterized)
//
// Bonus regression coverage (+N pattern from 9-1/9-2/9-2b/9-3/9-4):
//   • handleAccountUpdated happy path — direct handler-level
//     coverage post-9-5 migration. Pre-9-5 this logic was tested via
//     the route file's leaf-DB mocks; post-refactor the route mocks at
//     the dispatch boundary so handler internals would otherwise be
//     untested at the new layer.
//   • handleCheckoutSessionCompleted happy path — same rationale.
//   • dispatchWebhookEvent unknown-event-type — verifies the
//     dispatcher's WEBHOOK_HANDLERS lookup returns { handled: false }
//     for unmapped types (the route also tests this end-to-end but the
//     dispatcher's own behavior wasn't directly covered).
//   • dispatchWebhookEvent safety-net catches handler throw —
//     verifies the real top-level try-catch wraps an unexpected throw
//     into { ok: false, status: 500 } (BA Decision §8 should-never-
//     happen safety net). The route test mocks dispatchWebhookEvent
//     entirely; this test exercises the real safety net.

const {
  getConnectAccountByStripeAccountIdMock,
  upsertConnectAccountMock,
  getBookingByIdMock,
  markBookingAuthorizedMock,
  getBookingByPaymentIntentIdMock,
  markBookingConfirmedAndCapturedByPaymentIntentMock,
  markBookingRejectedAndVoidedByPaymentIntentMock,
  deleteAbandonedBookingByCheckoutSessionMock,
  // Story 9-6: webhook backstop for charge.refunded.
  markBookingCancelledAndRefundedByPaymentIntentMock,
} = vi.hoisted(() => ({
  getConnectAccountByStripeAccountIdMock: vi.fn(),
  upsertConnectAccountMock: vi.fn(),
  getBookingByIdMock: vi.fn(),
  markBookingAuthorizedMock: vi.fn(),
  getBookingByPaymentIntentIdMock: vi.fn(),
  markBookingConfirmedAndCapturedByPaymentIntentMock: vi.fn(),
  markBookingRejectedAndVoidedByPaymentIntentMock: vi.fn(),
  deleteAbandonedBookingByCheckoutSessionMock: vi.fn(),
  markBookingCancelledAndRefundedByPaymentIntentMock: vi.fn(),
}));

vi.mock('@/db/queries/stripe-connect', () => ({
  getConnectAccountByStripeAccountId: getConnectAccountByStripeAccountIdMock,
  upsertConnectAccount: upsertConnectAccountMock,
}));

vi.mock('@/db/queries/bookings', () => ({
  getBookingById: getBookingByIdMock,
  markBookingAuthorized: markBookingAuthorizedMock,
  getBookingByPaymentIntentId: getBookingByPaymentIntentIdMock,
  markBookingConfirmedAndCapturedByPaymentIntent:
    markBookingConfirmedAndCapturedByPaymentIntentMock,
  markBookingRejectedAndVoidedByPaymentIntent:
    markBookingRejectedAndVoidedByPaymentIntentMock,
  deleteAbandonedBookingByCheckoutSession:
    deleteAbandonedBookingByCheckoutSessionMock,
  // Story 9-6
  markBookingCancelledAndRefundedByPaymentIntent:
    markBookingCancelledAndRefundedByPaymentIntentMock,
}));

import {
  handleAccountUpdated,
  handleCheckoutSessionCompleted,
  handlePaymentIntentSucceeded,
  handlePaymentIntentCanceled,
  handleCheckoutSessionExpired,
  // Story 9-6: charge.refunded backstop handler.
  handleChargeRefunded,
  dispatchWebhookEvent,
  WEBHOOK_HANDLERS,
} from './webhooks';

beforeEach(() => {
  getConnectAccountByStripeAccountIdMock.mockReset();
  upsertConnectAccountMock.mockReset();
  getBookingByIdMock.mockReset();
  markBookingAuthorizedMock.mockReset();
  getBookingByPaymentIntentIdMock.mockReset();
  markBookingConfirmedAndCapturedByPaymentIntentMock.mockReset();
  markBookingRejectedAndVoidedByPaymentIntentMock.mockReset();
  deleteAbandonedBookingByCheckoutSessionMock.mockReset();
  markBookingCancelledAndRefundedByPaymentIntentMock.mockReset();
});

// Minimal Stripe.Event factory — handlers only read .id, .type, and
// .data.object. Cast through unknown so the test file doesn't need the
// full Stripe.Event union construction (which varies by type).
function makeEvent(
  type: string,
  id: string,
  object: Record<string, unknown>,
): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

// ─────────────────────────────────────────────────────────────────────
// handlePaymentIntentSucceeded — BA Decision §13 locked tests 1-3.
// ─────────────────────────────────────────────────────────────────────

describe('handlePaymentIntentSucceeded (Story 9-5 NEW capture backstop)', () => {
  it('happy path — booking in (PENDING, AUTHORIZED) → conditional UPDATE rescues → handled:true', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-1',
      status: 'PENDING',
      paymentStatus: 'AUTHORIZED',
      paymentIntentId: 'pi_test_capture_1',
    });
    markBookingConfirmedAndCapturedByPaymentIntentMock.mockResolvedValueOnce({
      id: 'booking-uuid-1',
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      paymentIntentId: 'pi_test_capture_1',
    });

    const result = await handlePaymentIntentSucceeded(
      makeEvent('payment_intent.succeeded', 'evt_pi_succeeded_1', {
        id: 'pi_test_capture_1',
      }),
    );

    expect(result).toEqual({ ok: true, handled: true });
    // The conditional UPDATE is keyed on the PI id, not the booking id.
    expect(
      markBookingConfirmedAndCapturedByPaymentIntentMock,
    ).toHaveBeenCalledWith('pi_test_capture_1');
  });

  it('idempotent — booking already in (CONFIRMED, CAPTURED) (9-4 action won the race) → idempotent:true, NO insert signal', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-2',
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      paymentIntentId: 'pi_test_capture_2',
    });
    // Conditional WHERE filters out — returning() is empty.
    markBookingConfirmedAndCapturedByPaymentIntentMock.mockResolvedValueOnce(
      undefined,
    );

    const result = await handlePaymentIntentSucceeded(
      makeEvent('payment_intent.succeeded', 'evt_pi_succeeded_2', {
        id: 'pi_test_capture_2',
      }),
    );

    expect(result).toEqual({ ok: true, idempotent: true });
  });

  it('deferred — booking-not-found (no row matches PI id) → deferred:true, UPDATE NOT called', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce(undefined);

    const result = await handlePaymentIntentSucceeded(
      makeEvent('payment_intent.succeeded', 'evt_pi_succeeded_3', {
        id: 'pi_test_no_match',
      }),
    );

    expect(result).toEqual({ ok: true, deferred: true });
    expect(
      markBookingConfirmedAndCapturedByPaymentIntentMock,
    ).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// handlePaymentIntentCanceled — BA Decision §13 locked tests 4-5.
// ─────────────────────────────────────────────────────────────────────

describe('handlePaymentIntentCanceled (Story 9-5 NEW cancel backstop)', () => {
  it('happy path — booking in (PENDING, AUTHORIZED) → conditional UPDATE rescues → handled:true', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-3',
      status: 'PENDING',
      paymentStatus: 'AUTHORIZED',
      paymentIntentId: 'pi_test_cancel_1',
    });
    markBookingRejectedAndVoidedByPaymentIntentMock.mockResolvedValueOnce({
      id: 'booking-uuid-3',
      status: 'REJECTED',
      paymentStatus: 'VOIDED',
      paymentIntentId: 'pi_test_cancel_1',
    });

    const result = await handlePaymentIntentCanceled(
      makeEvent('payment_intent.canceled', 'evt_pi_canceled_1', {
        id: 'pi_test_cancel_1',
      }),
    );

    expect(result).toEqual({ ok: true, handled: true });
    expect(
      markBookingRejectedAndVoidedByPaymentIntentMock,
    ).toHaveBeenCalledWith('pi_test_cancel_1');
  });

  it('idempotent — booking already in (REJECTED, VOIDED) → idempotent:true', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-4',
      status: 'REJECTED',
      paymentStatus: 'VOIDED',
      paymentIntentId: 'pi_test_cancel_2',
    });
    markBookingRejectedAndVoidedByPaymentIntentMock.mockResolvedValueOnce(
      undefined,
    );

    const result = await handlePaymentIntentCanceled(
      makeEvent('payment_intent.canceled', 'evt_pi_canceled_2', {
        id: 'pi_test_cancel_2',
      }),
    );

    expect(result).toEqual({ ok: true, idempotent: true });
  });
});

// ─────────────────────────────────────────────────────────────────────
// handleCheckoutSessionExpired — BA Decision §13 locked test 6
// (parameterized happy + idempotent). Also covers the 3-condition
// safety-net WHERE contract by verifying the helper's return-value
// semantics (true = real orphan deleted; false = different path won
// or already cleaned).
// ─────────────────────────────────────────────────────────────────────

describe('handleCheckoutSessionExpired (Story 9-5 NEW orphan cleanup)', () => {
  it.each([
    {
      label: 'happy — orphan in (PENDING, AWAITING_PAYMENT) → DELETE returns true → handled:true',
      deleteResult: true,
      expected: { ok: true, handled: true },
    },
    {
      label: 'idempotent — different path won OR already cleaned → DELETE returns false → idempotent:true',
      deleteResult: false,
      expected: { ok: true, idempotent: true },
    },
  ])('$label', async ({ deleteResult, expected }) => {
    deleteAbandonedBookingByCheckoutSessionMock.mockResolvedValueOnce(
      deleteResult,
    );

    const result = await handleCheckoutSessionExpired(
      makeEvent('checkout.session.expired', 'evt_session_expired_1', {
        id: 'cs_test_session_expired',
        metadata: { bookingId: 'booking-uuid-orphan' },
      }),
    );

    expect(result).toEqual(expected);
    expect(deleteAbandonedBookingByCheckoutSessionMock).toHaveBeenCalledWith(
      'booking-uuid-orphan',
    );
  });

  it('deferred — missing metadata.bookingId → deferred:true, DELETE NOT called', async () => {
    const result = await handleCheckoutSessionExpired(
      makeEvent('checkout.session.expired', 'evt_session_expired_2', {
        id: 'cs_test_no_metadata',
        metadata: {},
      }),
    );

    expect(result).toEqual({ ok: true, deferred: true });
    expect(deleteAbandonedBookingByCheckoutSessionMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Bonus regression coverage for migrated handlers (+N pattern from
// prior stories). Pre-9-5 the route file's tests exercised these
// handlers via leaf-DB mocks; post-refactor the route mocks at the
// dispatch boundary, so without these the handler internals are
// untested at the new layer.
// ─────────────────────────────────────────────────────────────────────

describe('handleAccountUpdated (regression — verbatim migration from 9-2)', () => {
  it('happy path — known account → upsert called with correct flags → handled:true', async () => {
    getConnectAccountByStripeAccountIdMock.mockResolvedValueOnce({
      id: 'row-1',
      userId: 'user-owner-1',
      stripeAccountId: 'acct_test_xyz',
    });
    upsertConnectAccountMock.mockResolvedValueOnce({});

    const result = await handleAccountUpdated(
      makeEvent('account.updated', 'evt_account_updated_1', {
        id: 'acct_test_xyz',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      }),
    );

    expect(result).toEqual({ ok: true, handled: true });
    expect(upsertConnectAccountMock).toHaveBeenCalledWith({
      userId: 'user-owner-1',
      stripeAccountId: 'acct_test_xyz',
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingCompleted: true,
    });
  });
});

describe('handleCheckoutSessionCompleted (regression — verbatim migration from 9-3)', () => {
  it('happy path — booking AWAITING_PAYMENT → markBookingAuthorized → handled:true', async () => {
    getBookingByIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-r1',
      paymentStatus: 'AWAITING_PAYMENT',
      paymentIntentId: null,
    });
    markBookingAuthorizedMock.mockResolvedValueOnce({
      id: 'booking-uuid-r1',
      paymentStatus: 'AUTHORIZED',
      paymentIntentId: 'pi_test_r1',
    });

    const result = await handleCheckoutSessionCompleted(
      makeEvent('checkout.session.completed', 'evt_cs_completed_r1', {
        id: 'cs_test_r1',
        payment_intent: 'pi_test_r1',
        metadata: { bookingId: 'booking-uuid-r1' },
      }),
    );

    expect(result).toEqual({ ok: true, handled: true });
    expect(markBookingAuthorizedMock).toHaveBeenCalledWith({
      bookingId: 'booking-uuid-r1',
      paymentIntentId: 'pi_test_r1',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// handleChargeRefunded — Story 9-6 NEW (BA Decision §12 webhooks tests).
// Closes the narrow ops window for the Phase 2 CONFIRMED+CAPTURED refund
// path: action's stripe.refunds.create succeeds but DB UPDATE fails →
// booking stuck in (CONFIRMED, CAPTURED) until this webhook reconciles.
//
// 3 locked cases:
//   • Happy: booking in (CONFIRMED, CAPTURED, paymentIntentId='pi_...') →
//     conditional UPDATE returns row → { handled: true }.
//   • Idempotent: booking already in (CANCELLED, REFUNDED) → conditional
//     UPDATE returns undefined → { idempotent: true } (action won race).
//   • Deferred (booking-not-found): no booking matches PI id → { deferred }.
// ─────────────────────────────────────────────────────────────────────

describe('handleChargeRefunded (Story 9-6 NEW refund backstop)', () => {
  it('happy path — booking in (CONFIRMED, CAPTURED) → conditional UPDATE rescues → handled:true', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-refund-1',
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      paymentIntentId: 'pi_test_refund_1',
    });
    markBookingCancelledAndRefundedByPaymentIntentMock.mockResolvedValueOnce({
      id: 'booking-uuid-refund-1',
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      paymentIntentId: 'pi_test_refund_1',
    });

    const result = await handleChargeRefunded(
      makeEvent('charge.refunded', 'evt_charge_refunded_1', {
        id: 'ch_test_refund_1',
        payment_intent: 'pi_test_refund_1',
        amount: 2500,
        amount_refunded: 2500,
      }),
    );

    expect(result).toEqual({ ok: true, handled: true });
    // Helper called with PI id + refund amount from charge.amount_refunded.
    expect(
      markBookingCancelledAndRefundedByPaymentIntentMock,
    ).toHaveBeenCalledWith('pi_test_refund_1', 2500);
  });

  it('idempotent — booking already (CANCELLED, REFUNDED) (action won race) → idempotent:true', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-refund-2',
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      paymentIntentId: 'pi_test_refund_2',
    });
    // Conditional WHERE on (CONFIRMED, CAPTURED) filters out → undefined.
    markBookingCancelledAndRefundedByPaymentIntentMock.mockResolvedValueOnce(
      undefined,
    );

    const result = await handleChargeRefunded(
      makeEvent('charge.refunded', 'evt_charge_refunded_2', {
        id: 'ch_test_refund_2',
        payment_intent: 'pi_test_refund_2',
        amount: 2500,
        amount_refunded: 2500,
      }),
    );

    expect(result).toEqual({ ok: true, idempotent: true });
  });

  it('deferred — booking-not-found (no row matches PI) → deferred:true, UPDATE NOT called', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce(undefined);

    const result = await handleChargeRefunded(
      makeEvent('charge.refunded', 'evt_charge_refunded_3', {
        id: 'ch_test_refund_3',
        payment_intent: 'pi_test_no_match',
        amount: 2500,
        amount_refunded: 2500,
      }),
    );

    expect(result).toEqual({ ok: true, deferred: true });
    expect(
      markBookingCancelledAndRefundedByPaymentIntentMock,
    ).not.toHaveBeenCalled();
  });

  it('deferred — missing charge.payment_intent → deferred:true, lookup NOT called', async () => {
    // Stripe SHOULD always include payment_intent on charge.refunded, but
    // the handler defends defensively per BA Decision §7.
    const result = await handleChargeRefunded(
      makeEvent('charge.refunded', 'evt_charge_refunded_4', {
        id: 'ch_test_no_pi',
        payment_intent: null,
        amount: 2500,
        amount_refunded: 2500,
      }),
    );

    expect(result).toEqual({ ok: true, deferred: true });
    expect(getBookingByPaymentIntentIdMock).not.toHaveBeenCalled();
    expect(
      markBookingCancelledAndRefundedByPaymentIntentMock,
    ).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// dispatchWebhookEvent — direct tests of the dispatcher entry +
// safety-net. The route also tests these scenarios end-to-end via its
// mocked dispatch boundary, but the dispatcher itself needs direct
// coverage of its lookup + safety-net logic.
// ─────────────────────────────────────────────────────────────────────

describe('dispatchWebhookEvent (Story 9-5 dispatcher)', () => {
  it('unknown event type → returns { ok: true, handled: false } without touching any handler', async () => {
    const result = await dispatchWebhookEvent(
      makeEvent('customer.created', 'evt_unmapped', { id: 'cus_test' }),
    );

    expect(result).toEqual({ ok: true, handled: false });
    // None of the handlers' query mocks were touched.
    expect(getBookingByPaymentIntentIdMock).not.toHaveBeenCalled();
    expect(deleteAbandonedBookingByCheckoutSessionMock).not.toHaveBeenCalled();
    expect(getConnectAccountByStripeAccountIdMock).not.toHaveBeenCalled();
  });

  it('safety-net wrapper — handler throws unexpectedly → caught → { ok: false, status: 500 }', async () => {
    // Force one of the underlying query helpers to throw OUTSIDE the
    // handler's per-stage try-catch (e.g., a sync throw before the
    // first await). Easiest path: mock getBookingByPaymentIntentId to
    // throw synchronously — the handler's try-catch wraps the await,
    // so a sync throw inside the mock body still gets caught by the
    // handler's first try-catch. To genuinely exercise the dispatcher's
    // safety net we need the handler to throw OUTSIDE its own try-
    // catches. We do that by spying on WEBHOOK_HANDLERS at the source
    // — replacing the handler reference with one that throws.
    const original = WEBHOOK_HANDLERS['payment_intent.succeeded'];
    expect(original).toBeDefined();
    // The map is `as const`-typed Readonly but is a runtime mutable
    // object — TS resists; we cast for the test surface.
    const mutableMap = WEBHOOK_HANDLERS as unknown as Record<
      string,
      (event: Stripe.Event) => Promise<unknown>
    >;
    const throwingHandler = vi.fn().mockImplementation(() => {
      throw new Error('boom — handler missed its try-catch');
    });
    mutableMap['payment_intent.succeeded'] = throwingHandler;

    try {
      const result = await dispatchWebhookEvent(
        makeEvent('payment_intent.succeeded', 'evt_safety_net', {
          id: 'pi_test_throw',
        }),
      );

      expect(result).toEqual({
        ok: false,
        status: 500,
        message: 'Unexpected handler error',
      });
      expect(throwingHandler).toHaveBeenCalledTimes(1);
    } finally {
      // Restore so subsequent tests in this file aren't affected.
      mutableMap['payment_intent.succeeded'] = original!;
    }
  });
});
