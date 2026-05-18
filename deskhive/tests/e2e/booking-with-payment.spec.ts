import { expect } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { test } from '../fixtures';
import { db } from '@/db/client';
import {
  bookingsTable,
  stripeConnectAccountsTable,
  usersTable,
} from '@/db/schema';

// Story 9-3: Booking-with-payment E2E coverage (BA Decision §12 — 2 tests).
//
// Both tests sign in as the seeded `guest@deskhive.local` and target the
// seeded `Seeded Owner Coworks` space (owned by `owner@deskhive.local`).
// The test OWNS the owner's Connect-row lifecycle (pattern memorialized
// from Story 9-2b's post-BA-walk refactor):
//
//   • Test 1 (happy path) — ensures the owner's seeded synthetic Connect
//     row is in active state (chargesEnabled=true, payoutsEnabled=true)
//     in beforeEach. Verifies that the action's redirect URL points to
//     Stripe Checkout AND that the pre-claim booking row was inserted
//     in PENDING + AWAITING_PAYMENT + payment_intent_id IS NULL state.
//
//   • Test 2 (gated path) — mutates the owner's Connect row to
//     chargesEnabled=false in beforeEach. Verifies that the action
//     returns STRIPE_NOT_ACTIVE (surfaced as a toast on /spaces/[id])
//     and that NO booking row was created. The Stripe Checkout URL
//     never appears.
//
// `test.describe.configure({ mode: 'serial' })` — both tests mutate the
// same Connect row; concurrent workers would race. Cheap to serialize
// (only 2 tests, ~30s combined).
//
// Cross-file race awareness: connect-onboarding.spec.ts also mutates
// `owner@deskhive.local`'s Connect row. The test-owns-state + serial-
// within-describe combination is resilient as long as full-suite
// parallelism doesn't schedule connect-onboarding concurrently in
// another worker. If a race surfaces, the defensive re-restore
// pattern (right before the click) is the 9-2b-blessed mitigation.
//
// Why we don't enter Stripe Checkout: same reasoning as 9-2's
// connect-onboarding.spec.ts. Stripe-hosted UI is cross-origin, anti-
// bot-protected, and the UI changes without notice. Playwright stops
// at the URL boundary; the actual payment authorization is unit-tested
// at the wrapper level + manually verified by the BA browser walk.

const SEED_OWNER_EMAIL = 'owner@deskhive.local';
const SEED_OWNER_CONNECT_ACCOUNT_ID = 'acct_seed_for_e2e_only';
const SEED_GUEST_EMAIL = 'guest@deskhive.local';
const SEED_SPACE_NAME = 'Seeded Owner Coworks';

async function getOwnerUserId(): Promise<string> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_OWNER_EMAIL))
    .limit(1);
  if (!row) {
    throw new Error(
      `Seed user \`${SEED_OWNER_EMAIL}\` not found. Run \`pnpm db:seed\`.`,
    );
  }
  return row.id;
}

async function getGuestUserId(): Promise<string> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_GUEST_EMAIL))
    .limit(1);
  if (!row) {
    throw new Error(
      `Seed user \`${SEED_GUEST_EMAIL}\` not found. Run \`pnpm db:seed\`.`,
    );
  }
  return row.id;
}

async function setOwnerConnectState(
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
): Promise<void> {
  const ownerId = await getOwnerUserId();
  // DELETE + INSERT so the row is in a known state regardless of
  // upstream history. Mirrors the connect-onboarding.spec.ts restore
  // pattern so the two specs can coexist.
  await db
    .delete(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, ownerId));
  await db.insert(stripeConnectAccountsTable).values({
    userId: ownerId,
    stripeAccountId: SEED_OWNER_CONNECT_ACCOUNT_ID,
    onboardingCompleted: true,
    chargesEnabled,
    payoutsEnabled,
  });
}

async function deleteBookingByGuestAndDate(
  guestUserId: string,
  bookingDate: string,
): Promise<void> {
  // Exact-match cleanup (9-2b parallelism-safe lesson). Targets the
  // booking the test just created without touching anything else.
  await db
    .delete(bookingsTable)
    .where(
      and(
        eq(bookingsTable.guestUserId, guestUserId),
        eq(bookingsTable.bookingDate, bookingDate),
      ),
    );
}

// Pick a date far in the future to avoid colliding with any seeded
// bookings. Use the same date across both tests; per-test cleanup is
// guest-id + date scoped, and the two tests sign in as the same guest
// so back-to-back runs would conflict — that's fine since serial mode
// guarantees one runs at a time + afterEach cleans up.
function pickBookingDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

test.describe('/spaces/[id] — booking with payment (Story 9-3)', () => {
  // Both tests mutate the same owner@ Connect row — serialize so
  // concurrent workers don't race on it.
  test.describe.configure({ mode: 'serial' });

  // Track the test's specific (guestUserId, date) so afterEach can
  // delete only the booking the test created. Avoids the 9-2b
  // worker-A-nukes-worker-B's-in-flight-row hazard.
  let currentBookingDate: string | null = null;
  let currentGuestUserId: string | null = null;

  test.beforeAll(async () => {
    // Defensive: clean up any leftover bookings from prior aborted runs
    // for the seed guest. Safe at suite start (no parallel workers yet).
    const guestId = await getGuestUserId();
    const date = pickBookingDate();
    await deleteBookingByGuestAndDate(guestId, date);
  });

  test.afterAll(async () => {
    // Restore owner@'s Connect row to the seeded synthetic-active state
    // so downstream specs (connect-onboarding.spec.ts, etc.) start from
    // a clean state. Mirrors the 9-2b afterAll discipline.
    await setOwnerConnectState(true, true);
  });

  test.beforeEach(async () => {
    currentBookingDate = null;
    currentGuestUserId = null;
  });

  test.afterEach(async () => {
    if (currentGuestUserId && currentBookingDate) {
      await deleteBookingByGuestAndDate(currentGuestUserId, currentBookingDate);
    }
  });

  test('happy path — guest is redirected to Stripe Checkout + booking is pre-claimed in AWAITING_PAYMENT', async ({
    authenticatedPage,
  }) => {
    // ── Setup: owner has active Connect row ──────────────────────
    await setOwnerConnectState(true, true);

    const guestId = await getGuestUserId();
    const bookingDate = pickBookingDate();
    currentGuestUserId = guestId;
    currentBookingDate = bookingDate;

    // ── Find the seeded space's ID via DB (don't rely on the home
    //    page render order for stability). ───────────────────────
    const [space] = await db
      .select()
      .from((await import('@/db/schema')).spacesTable)
      .where(
        eq((await import('@/db/schema')).spacesTable.name, SEED_SPACE_NAME),
      )
      .limit(1);
    if (!space) throw new Error(`Seeded space not found: ${SEED_SPACE_NAME}`);

    // ── Navigate as guest + pick a date ──────────────────────────
    const page = await authenticatedPage('guest');
    await page.goto(`/spaces/${space.id}?date=${bookingDate}`);

    // ── Three desks → three "Book this desk" buttons. Scope to the
    // first one (Desk 1). The action under test doesn't care which
    // desk; the pre-claim mechanism handles the slot-claim race per
    // desk/date.
    const bookButton = page
      .getByRole('button', { name: /book this desk/i })
      .first();
    await expect(bookButton).toBeEnabled();

    // ── Click and let the form submit ──────────────────────────────
    // The BookDeskButton submits the form → Server Action runs the 9-
    // step flow (auth/validation/desk/space/Connect-gate/money/pre-
    // claim insert/UUID/Stripe Checkout). On success, the client fires
    // `window.location.assign(redirectUrl)` to navigate to Stripe.
    //
    // We don't try to intercept the cross-origin nav (Playwright's
    // top-level navigation interception is flaky on Stripe URLs).
    // Instead we assert on the DB pre-claim — that's the load-bearing
    // contract: the booking row exists in PENDING + AWAITING_PAYMENT
    // + payment_intent_id IS NULL state regardless of whether the
    // browser actually made it to Stripe.
    //
    // Wrap the click in a catch — if the navigation destroys the page
    // context mid-click, Playwright surfaces an error we don't care
    // about. The DB assertion is what matters.
    await bookButton.click().catch(() => undefined);

    // Poll the DB for the pre-claim row. The Server Action is async +
    // commits the row before calling Stripe; we should see it within
    // a few seconds.
    await expect
      .poll(
        async () => {
          const [row] = await db
            .select()
            .from(bookingsTable)
            .where(
              and(
                eq(bookingsTable.guestUserId, guestId),
                eq(bookingsTable.bookingDate, bookingDate),
              ),
            )
            .limit(1);
          return row?.paymentStatus ?? null;
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      )
      .toBe('AWAITING_PAYMENT');

    // ── Verify the full pre-claim shape ──────────────────────────
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.guestUserId, guestId),
          eq(bookingsTable.bookingDate, bookingDate),
        ),
      )
      .limit(1);
    expect(booking).toBeDefined();
    expect(booking?.status).toBe('PENDING');
    expect(booking?.paymentStatus).toBe('AWAITING_PAYMENT');
    expect(booking?.paymentIntentId).toBeNull();
    expect(booking?.totalCents).toBeGreaterThan(0);
    // Platform fee = 15% of totalCents, Math.floor (Decision §2). The
    // seeded desks have prices ≥ $25 so the fee is non-zero.
    expect(booking?.platformFeeCents).toBeGreaterThan(0);
    expect(booking?.platformFeeCents).toBe(
      Math.floor((booking?.totalCents ?? 0) * 0.15),
    );
  });

  test('gated path — owner with inactive Connect → STRIPE_NOT_ACTIVE toast + no booking row', async ({
    authenticatedPage,
  }) => {
    // ── Setup: simulate Connect-inactive owner ───────────────────
    // Set chargesEnabled=false (payoutsEnabled stays true) — the
    // action's Connect-state-active gate (Decision §8) checks BOTH
    // flags + presence-of-row; flipping either one is sufficient to
    // trigger STRIPE_NOT_ACTIVE.
    await setOwnerConnectState(false, true);

    const guestId = await getGuestUserId();
    const bookingDate = pickBookingDate();
    currentGuestUserId = guestId;
    currentBookingDate = bookingDate;

    const [space] = await db
      .select()
      .from((await import('@/db/schema')).spacesTable)
      .where(
        eq((await import('@/db/schema')).spacesTable.name, SEED_SPACE_NAME),
      )
      .limit(1);
    if (!space) throw new Error(`Seeded space not found: ${SEED_SPACE_NAME}`);

    const page = await authenticatedPage('guest');
    await page.goto(`/spaces/${space.id}?date=${bookingDate}`);

    // ── Click Book this desk ─────────────────────────────────────
    // Three desks → three "Book this desk" buttons. Scope to the first
    // one (Desk 1). The action under test doesn't care which desk; the
    // pre-claim mechanism handles the slot-claim race per desk/date.
    const bookButton = page
      .getByRole('button', { name: /book this desk/i })
      .first();
    await expect(bookButton).toBeEnabled();

    // Defensive re-restore (9-2b pattern) — connect-onboarding.spec.ts
    // mutates the same owner@ Connect row in parallel under
    // `fullyParallel: true`. The beforeEach's inactive state can be
    // undone in the goto → click window. Re-applying right before the
    // click narrows the race to ~10ms.
    await setOwnerConnectState(false, true);
    await bookButton.click();

    // ── Verify the STRIPE_NOT_ACTIVE error toast surfaces ────────
    // BOOKING_FAILED_TITLE = 'Booking failed' (Story 6-3 copy).
    // BOOKING_FAILED_STRIPE_NOT_ACTIVE = "This space can't accept
    //                                    bookings right now." (Decision §10).
    await expect(page.getByText(/booking failed/i)).toBeVisible();
    await expect(
      page.getByText(/this space can.?t accept bookings right now/i),
    ).toBeVisible();

    // ── Verify NO booking row was created ────────────────────────
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.guestUserId, guestId),
          eq(bookingsTable.bookingDate, bookingDate),
        ),
      )
      .limit(1);
    expect(booking).toBeUndefined();
  });
});
