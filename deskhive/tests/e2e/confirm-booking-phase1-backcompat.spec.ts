import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { test } from '../fixtures';
import { db } from '@/db/client';
import { bookingsTable, usersTable } from '@/db/schema';
import { createPendingBookingViaDb } from '../fixtures/seed-helpers';

// Story 9-4: Phase 1 backwards-compat regression test (BA Decision §13 +
// AC-12). Locked option (i): 1 new E2E covering the locked Phase 1
// admin-workflow-continuity contract.
//
// Why this exists: Decision §6 introduces a runtime branch in
// confirmBookingAction:
//   • paymentIntentId IS NOT NULL + paymentStatus='AUTHORIZED' → Phase 2:
//     call stripe.paymentIntents.capture FIRST, then DB UPDATE.
//   • paymentIntentId IS NULL → Phase 1: skip Stripe entirely; use the
//     existing confirmBooking helper unchanged.
// Unit tests mock the Stripe wrapper at the @/lib/payments/payment-intents
// boundary and prove the action makes the right branching decisions on
// mocked inputs. This E2E proves the production short-circuit behavior
// end-to-end: a real PG-shape Phase 1 booking row + the real dev-server
// action wiring + the real admin UI button + the real DB write — all
// without any Stripe API call firing.
//
// If a future refactor accidentally calls capturePaymentIntent on a
// NULL-PI row (e.g., simplifying the branch + assuming non-null PI), this
// test catches it before BA walk: the dev server's Stripe call would
// error against an empty paymentIntentId, the action would return
// STRIPE_CAPTURE_FAILED, the booking would NOT transition to CONFIRMED,
// and the DB assertion below would fail.

// authenticatedPage('admin') resolves to admin@deskhive.local via the
// Story 7-PREP-1 fixture; no need to reference the email directly here.
const SEED_GUEST_EMAIL = 'applicant1@deskhive.local';
const SEED_SPACE_NAME = 'Seeded Owner Coworks';

async function getGuestUserId(): Promise<string> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_GUEST_EMAIL))
    .limit(1);
  if (!row) {
    throw new Error(`Guest not found: ${SEED_GUEST_EMAIL}. Run pnpm db:seed.`);
  }
  return row.id;
}

async function deleteBooking(bookingId: string): Promise<void> {
  await db.delete(bookingsTable).where(eq(bookingsTable.id, bookingId));
}

// Pick a date far in the future to avoid collisions with seeded bookings
// AND with any other E2E test's bookings (booking-with-payment.spec.ts +
// publish-gating.spec.ts use ~30 days out). 60 days is comfortably clear.
function pickBookingDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60);
  return d.toISOString().slice(0, 10);
}

test.describe('/admin/bookings — Phase 1 backwards-compat for Story 9-4 (confirm without Stripe)', () => {
  // No parallel hazards: the test owns its own (guestId, deskId, date)
  // tuple via the booking it creates in beforeEach. Other specs don't
  // touch admin@'s confirm flow on Phase 1-shape rows.

  let currentBookingId: string | null = null;
  let currentBookingDate: string | null = null;

  test.beforeEach(async () => {
    const bookingDate = pickBookingDate();
    // createPendingBookingViaDb produces a Phase 1-shape row:
    // paymentIntentId IS NULL, paymentStatus IS NULL, totalCents=0,
    // platformFeeCents=0. Status='PENDING'. The helper also clears any
    // pre-existing booking on this (desk, date) slot for idempotency.
    const bookingId = await createPendingBookingViaDb({
      guestEmail: SEED_GUEST_EMAIL,
      spaceName: SEED_SPACE_NAME,
      bookingDate,
    });
    currentBookingId = bookingId;
    currentBookingDate = bookingDate;
  });

  test.afterEach(async () => {
    if (currentBookingId) {
      await deleteBooking(currentBookingId);
    }
  });

  test('admin confirms a Phase 1 booking (paymentIntentId IS NULL) without firing Stripe', async ({
    authenticatedPage,
  }) => {
    if (!currentBookingId || !currentBookingDate) {
      throw new Error('beforeEach did not populate booking state');
    }
    const bookingId = currentBookingId;
    const guestUserId = await getGuestUserId();

    // Pre-condition: confirm the DB row is in the Phase 1 shape.
    const [preRow] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1);
    expect(preRow).toBeDefined();
    expect(preRow?.status).toBe('PENDING');
    expect(preRow?.paymentIntentId).toBeNull();
    expect(preRow?.paymentStatus).toBeNull();

    // ── Sign in as admin + navigate to /admin/bookings ──────────
    const page = await authenticatedPage('admin');
    await page.goto('/admin/bookings');

    // The bookings table renders dates as locale-formatted strings
    // (e.g., "Fri, Jul 17"), NOT the ISO `YYYY-MM-DD`. Matching by ISO
    // date is brittle + locale-dependent. Scope by guest email — the
    // seeded `applicant1@deskhive.local` is unique to applicant1 —
    // AND filter to rows where a "Confirm" button is rendered (which
    // only happens for PENDING rows). The combination uniquely
    // identifies our test row even if applicant1 has other bookings
    // (the row we just inserted is the only PENDING one at our future
    // date that the helper would have written, since
    // createPendingBookingViaDb clears prior bookings on the (desk,
    // date) slot first).
    const row = page
      .locator('tr', { hasText: SEED_GUEST_EMAIL })
      .filter({ has: page.getByRole('button', { name: /^confirm$/i }) })
      .first();
    const confirmButton = row.getByRole('button', { name: /^confirm$/i });
    await expect(confirmButton).toBeEnabled();

    // ── Click Confirm + verify DB transitions to CONFIRMED ──────
    await confirmButton.click();

    // Poll the DB for the conditional UPDATE to land. The Server Action
    // runs synchronously inside the form submission; we should see the
    // row flip within a couple seconds.
    await expect
      .poll(
        async () => {
          const [row] = await db
            .select()
            .from(bookingsTable)
            .where(eq(bookingsTable.id, bookingId))
            .limit(1);
          return row?.status ?? null;
        },
        { timeout: 10_000, intervals: [250, 500, 1000] },
      )
      .toBe('CONFIRMED');

    // ── Critical assertion: payment_status STAYED NULL ──────────
    // This proves the action took the Phase 1 backwards-compat branch
    // (no Stripe call, no markBookingConfirmedAndCaptured call). If a
    // future refactor breaks the branch, this assertion fails.
    const [postRow] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1);
    expect(postRow).toBeDefined();
    expect(postRow?.status).toBe('CONFIRMED');
    expect(postRow?.paymentStatus).toBeNull();
    expect(postRow?.paymentIntentId).toBeNull();
    expect(postRow?.guestUserId).toBe(guestUserId);

    // Defensive: verify no error toast / inline error surfaces.
    // Phase 1 / Story 5-2 design renders errors inline next to the
    // button via `state.message`; on success there's no UI feedback at
    // all (idle state). Asserting the button or its error span is gone
    // from the row would couple this test to the UI's exact post-confirm
    // rendering (which may show the row in a different table section).
    // Instead, just confirm no error toast surfaced on the page.
    await expect(page.getByText(/booking failed/i)).toHaveCount(0);
  });
});
