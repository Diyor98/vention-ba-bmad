import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-5 query-helper tests for the 4 new bookings helpers added by
// BA Decision §11. Per the split-by-mock-boundary, 3-layers pattern,
// these tests mock at `@/db/client` (the leaf Drizzle boundary):
//   route → @/lib/payments/webhooks
//   handler → @/db/queries/*
//   query → @/db/client                ← THIS LAYER
//
// What's verified:
//   • Drizzle chain produces the correct return-value shape (row vs
//     undefined for the mark/lookup helpers; boolean for the delete
//     helper).
//   • The 3-condition WHERE safety-net contract on
//     deleteAbandonedBookingByCheckoutSession is exercised by the
//     "0 rows returned → false" case. The 3 mismatch paths (status /
//     payment_status / id) all surface as "DB returned no rows" at
//     this layer; the SQL-construction-time conditions are trusted to
//     compose correctly via Drizzle's typed builder.
//
// NOT verified at this layer:
//   • The actual SQL WHERE clause structure (Drizzle's `and(eq(...),
//     eq(...))` produces an opaque SQL object; asserting on it would
//     test Drizzle's behavior, not ours). The handler-layer tests in
//     webhooks.test.ts verify the helpers are called with the right
//     args; the SQL composition is trusted.

const {
  dbSelectMock,
  dbUpdateMock,
  dbDeleteMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    delete: (...args: unknown[]) => dbDeleteMock(...args),
  },
}));

import {
  getBookingByPaymentIntentId,
  markBookingConfirmedAndCapturedByPaymentIntent,
  markBookingRejectedAndVoidedByPaymentIntent,
  deleteAbandonedBookingByCheckoutSession,
  // Story 9-6 helpers
  markBookingCancelledAndVoided,
  markBookingCancelledAndRefunded,
  markBookingCancelledAndRefundedByPaymentIntent,
} from './bookings';

beforeEach(() => {
  dbSelectMock.mockReset();
  dbUpdateMock.mockReset();
  dbDeleteMock.mockReset();
});

// Chain stubs — build the Drizzle fluent-chain return objects so the
// helpers under test can navigate them. Each terminal step returns a
// promise resolving to the rows array.

function stubSelectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbSelectMock.mockReturnValueOnce({ from });
}

function stubUpdateChain(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  dbUpdateMock.mockReturnValueOnce({ set });
}

function stubDeleteChain(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  dbDeleteMock.mockReturnValueOnce({ where });
}

// ─────────────────────────────────────────────────────────────────────
// getBookingByPaymentIntentId (Story 9-5 NEW lookup helper).
// ─────────────────────────────────────────────────────────────────────

describe('getBookingByPaymentIntentId (Story 9-5)', () => {
  it.each([
    {
      label: 'happy — DB returns 1 row → helper returns that row',
      dbRows: [
        {
          id: 'booking-uuid-1',
          paymentIntentId: 'pi_test_match',
          status: 'PENDING',
          paymentStatus: 'AUTHORIZED',
        },
      ],
      expected: {
        id: 'booking-uuid-1',
        paymentIntentId: 'pi_test_match',
        status: 'PENDING',
        paymentStatus: 'AUTHORIZED',
      },
    },
    {
      label: 'not-found — DB returns [] → helper returns undefined',
      dbRows: [],
      expected: undefined,
    },
  ])('$label', async ({ dbRows, expected }) => {
    stubSelectChain(dbRows);
    const result = await getBookingByPaymentIntentId('pi_test_match');
    expect(result).toEqual(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────
// markBookingConfirmedAndCapturedByPaymentIntent (Story 9-5 NEW).
// ─────────────────────────────────────────────────────────────────────

describe('markBookingConfirmedAndCapturedByPaymentIntent (Story 9-5)', () => {
  it.each([
    {
      label: 'happy — DB returns 1 row (conditional WHERE matched) → helper returns row',
      dbRows: [
        {
          id: 'booking-uuid-1',
          paymentIntentId: 'pi_test_capture',
          status: 'CONFIRMED',
          paymentStatus: 'CAPTURED',
        },
      ],
      expectedDefined: true,
    },
    {
      label: 'race lost — DB returns [] (conditional WHERE filtered) → helper returns undefined',
      dbRows: [],
      expectedDefined: false,
    },
  ])('$label', async ({ dbRows, expectedDefined }) => {
    stubUpdateChain(dbRows);
    const result =
      await markBookingConfirmedAndCapturedByPaymentIntent('pi_test_capture');
    if (expectedDefined) {
      expect(result).toBeDefined();
      expect(result?.paymentStatus).toBe('CAPTURED');
      expect(result?.status).toBe('CONFIRMED');
    } else {
      expect(result).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// markBookingRejectedAndVoidedByPaymentIntent (Story 9-5 NEW).
// ─────────────────────────────────────────────────────────────────────

describe('markBookingRejectedAndVoidedByPaymentIntent (Story 9-5)', () => {
  it.each([
    {
      label: 'happy — DB returns 1 row → helper returns row with REJECTED + VOIDED',
      dbRows: [
        {
          id: 'booking-uuid-2',
          paymentIntentId: 'pi_test_cancel',
          status: 'REJECTED',
          paymentStatus: 'VOIDED',
        },
      ],
      expectedDefined: true,
    },
    {
      label: 'race lost — DB returns [] → helper returns undefined',
      dbRows: [],
      expectedDefined: false,
    },
  ])('$label', async ({ dbRows, expectedDefined }) => {
    stubUpdateChain(dbRows);
    const result =
      await markBookingRejectedAndVoidedByPaymentIntent('pi_test_cancel');
    if (expectedDefined) {
      expect(result).toBeDefined();
      expect(result?.paymentStatus).toBe('VOIDED');
      expect(result?.status).toBe('REJECTED');
    } else {
      expect(result).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// deleteAbandonedBookingByCheckoutSession (Story 9-5 NEW orphan-DELETE).
// The 3-condition safety-net WHERE (status='PENDING' AND
// payment_status='AWAITING_PAYMENT' AND id=$bookingId) is the load-
// bearing safety net per BA Decision §5 + §11. At this mock layer, all
// 3 mismatch paths surface identically as "DB returned no rows" —
// they're collapsed into the single "no-rows → false" case below. The
// individual SQL conditions are trusted (Drizzle composes them via
// typed `and(eq(...), eq(...), eq(...))`).
// ─────────────────────────────────────────────────────────────────────

describe('deleteAbandonedBookingByCheckoutSession (Story 9-5)', () => {
  it.each([
    {
      label: 'happy — DB returns 1 row (real orphan in PENDING + AWAITING_PAYMENT) → true',
      dbRows: [{ id: 'booking-uuid-orphan' }],
      expected: true,
    },
    {
      label:
        '3-condition WHERE no-op — DB returns [] (status mismatch OR payment_status mismatch OR id mismatch) → false',
      dbRows: [],
      expected: false,
    },
  ])('$label', async ({ dbRows, expected }) => {
    stubDeleteChain(dbRows);
    const result =
      await deleteAbandonedBookingByCheckoutSession('booking-uuid-orphan');
    expect(result).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Story 9-6 query helpers — 3 new conditional UPDATEs for the
// cancelBookingAction 3-branch logic + charge.refunded webhook backstop.
// Same mock-at-@/db/client boundary pattern as the 9-5 helpers.
// ─────────────────────────────────────────────────────────────────────

describe('markBookingCancelledAndVoided (Story 9-6)', () => {
  it.each([
    {
      label:
        'happy — DB returns 1 row (PENDING + AUTHORIZED matched) → helper returns row with VOIDED',
      dbRows: [
        {
          id: 'booking-uuid-pending',
          guestUserId: 'guest-1',
          status: 'CANCELLED',
          paymentStatus: 'VOIDED',
        },
      ],
      expectedDefined: true,
    },
    {
      label:
        'race lost — DB returns [] (conditional WHERE filtered — wrong status / wrong payment_status / wrong guest) → helper returns undefined',
      dbRows: [],
      expectedDefined: false,
    },
  ])('$label', async ({ dbRows, expectedDefined }) => {
    stubUpdateChain(dbRows);
    const result = await markBookingCancelledAndVoided(
      'booking-uuid-pending',
      'guest-1',
    );
    if (expectedDefined) {
      expect(result).toBeDefined();
      expect(result?.status).toBe('CANCELLED');
      expect(result?.paymentStatus).toBe('VOIDED');
    } else {
      expect(result).toBeUndefined();
    }
  });
});

describe('markBookingCancelledAndRefunded (Story 9-6)', () => {
  it.each([
    {
      label:
        'happy — DB returns 1 row (CONFIRMED + CAPTURED matched) → helper returns row with REFUNDED + refundedAt + refundAmountCents',
      dbRows: [
        {
          id: 'booking-uuid-confirmed',
          guestUserId: 'guest-1',
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          refundedAt: new Date(),
          refundAmountCents: 2500,
        },
      ],
      expectedDefined: true,
    },
    {
      label:
        'race lost — DB returns [] (conditional WHERE filtered) → helper returns undefined',
      dbRows: [],
      expectedDefined: false,
    },
  ])('$label', async ({ dbRows, expectedDefined }) => {
    stubUpdateChain(dbRows);
    const result = await markBookingCancelledAndRefunded(
      'booking-uuid-confirmed',
      'guest-1',
      2500,
    );
    if (expectedDefined) {
      expect(result).toBeDefined();
      expect(result?.status).toBe('CANCELLED');
      expect(result?.paymentStatus).toBe('REFUNDED');
      expect(result?.refundAmountCents).toBe(2500);
    } else {
      expect(result).toBeUndefined();
    }
  });
});

describe('markBookingCancelledAndRefundedByPaymentIntent (Story 9-6)', () => {
  it.each([
    {
      label:
        'happy — DB returns 1 row → helper returns row with REFUNDED (webhook-backstop path)',
      dbRows: [
        {
          id: 'booking-uuid-confirmed',
          paymentIntentId: 'pi_test_captured',
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          refundedAt: new Date(),
          refundAmountCents: 2500,
        },
      ],
      expectedDefined: true,
    },
    {
      label:
        'race lost — DB returns [] (action won race; booking already REFUNDED) → helper returns undefined',
      dbRows: [],
      expectedDefined: false,
    },
  ])('$label', async ({ dbRows, expectedDefined }) => {
    stubUpdateChain(dbRows);
    const result = await markBookingCancelledAndRefundedByPaymentIntent(
      'pi_test_captured',
      2500,
    );
    if (expectedDefined) {
      expect(result).toBeDefined();
      expect(result?.paymentStatus).toBe('REFUNDED');
      expect(result?.refundAmountCents).toBe(2500);
    } else {
      expect(result).toBeUndefined();
    }
  });
});
