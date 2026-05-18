import { describe, it, expect } from 'vitest';
import { isRefundEligible } from './refund-policy';

// Story 9-6 unit tests for the refund-eligibility helper. Pure function;
// no mocks needed (inject `now` for determinism).
//
// Boundary cases (BA Decision §3):
//   • Reference point = bookingDate at 00:00:00 UTC.
//   • Cutoff         = bookingDateUtcAnchor - 24h.
//   • Eligibility    = now < cutoff (strict-less-than — favors platform).
//   • Boundary       = INELIGIBLE (now === cutoff is refused).
//   • Past-date      = INELIGIBLE (cutoff is in the past too).

describe('isRefundEligible (Story 9-6 — Phase 2 single-policy)', () => {
  it.each([
    {
      label:
        'exactly 24h before booking date (boundary now === cutoff) → INELIGIBLE',
      bookingDate: '2026-06-15',
      now: new Date('2026-06-14T00:00:00Z'), // exactly the cutoff
      expected: false,
    },
    {
      label: '24h + 1ms before booking date → ELIGIBLE',
      bookingDate: '2026-06-15',
      now: new Date('2026-06-13T23:59:59.999Z'), // 1ms before cutoff
      expected: true,
    },
    {
      label: '23h59m59s before booking date → INELIGIBLE',
      bookingDate: '2026-06-15',
      now: new Date('2026-06-14T00:00:01Z'), // 1s after cutoff
      expected: false,
    },
    {
      label: 'past booking date (yesterday) → INELIGIBLE',
      bookingDate: '2025-12-01',
      now: new Date('2026-05-19T12:00:00Z'),
      expected: false,
    },
    {
      label: 'far-future booking date (30 days out) → ELIGIBLE',
      bookingDate: '2026-06-18',
      now: new Date('2026-05-19T12:00:00Z'),
      expected: true,
    },
    {
      label: 'Date input (vs string) — interpreted via toISOString().slice(0,10)',
      bookingDate: new Date('2026-06-15T15:30:00Z'),
      now: new Date('2026-06-13T23:59:59.999Z'),
      expected: true,
    },
    {
      label: 'same UTC day as booking date (less than 24h before start-of-day) → INELIGIBLE',
      bookingDate: '2026-06-15',
      now: new Date('2026-06-15T08:00:00Z'), // morning of the booking day
      expected: false,
    },
  ])('$label', ({ bookingDate, now, expected }) => {
    expect(isRefundEligible(bookingDate, now)).toBe(expected);
  });
});
