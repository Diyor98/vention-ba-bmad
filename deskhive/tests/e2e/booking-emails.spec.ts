import {
  test,
  expect,
  readRecordedEmails,
  truncateRecordedEmails,
  createPendingBookingViaDb,
  getSeededOwnerSpaceId,
  type EmailRecord,
} from '../fixtures';

// Story 8-3: authenticated E2E coverage for the booking lifecycle
// emails. Uses the EMAIL_TEST_RECORD_FILE recording sink (Story 8-2
// AC-6) + waitForRecordedEmail polling pattern (Story 8-2 Debug Log #3
// — recording file is the authoritative completion signal, more
// reliable than URL navigation under headless Chromium).
//
// COVERAGE (4 of 6 scoped tests; the deferred 2 are unit-tested in
// src/lib/bookings.test.ts):
//   ✓ Test 1: Guest creates booking → both guest + owner emails recorded
//   ✓ Test 2: Owner confirms own booking → only guest email
//     (Decision §3 self-action skip)
//   ✓ Test 3: Admin confirms booking on owner's space → both emails
//     (Decision §3 inverse)
//   ✓ Test 4: Guest cancels PENDING → only guest email
//     (Decision §2 — PENDING-cancellations are noise, not signal)
//   ✗ DEFERRED: Guest cancels CONFIRMED → both emails
//     (cancelBookingAction rejects non-PENDING; Phase 1 doesn't allow
//     CONFIRMED cancellations. Decision §2 branch covered at unit
//     test level via bookings.test.ts.)
//   ✗ DEFERRED: NULL-owner space booking → no owner email
//     (would require admin-creating a temporary NULL-owner space;
//     Decision §1 branch covered at unit test level.)
//
// STATE COORDINATION:
//   Test 1 creates a PENDING booking for guest@deskhive.local.
//   Test 2 acts on applicant1's seeded PENDING.
//   Test 3 acts on the PENDING from Test 1.
//   Test 4 creates a fresh PENDING via createPendingBookingViaDb (a
//     direct db insert that bypasses notifyBookingRequested, so the
//     recording file is not polluted) for applicant4 (the only
//     remaining GUEST without an active booking after Tests 1-3).
//
//   These tests are NOT idempotent across full E2E runs. BA must
//   re-run `pnpm db:seed` between full suites to reset state.
//
// WEBSERVER ENV CAVEAT (inherited from Story 8-2):
//   playwright.config.ts sets EMAIL_TEST_RECORD_FILE on webServer.env.
//   If a dev server was started locally BEFORE pulling this story (and
//   reuseExistingServer is true), the env var won't activate. Restart
//   `pnpm dev` once after pulling Story 8-3.

test.beforeEach(async () => {
  await truncateRecordedEmails();
});

async function waitForRecordedEmail(
  template: string,
  timeoutMs = 15_000,
): Promise<EmailRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const records = await readRecordedEmails();
    const found = records.find((r) => r.template === template);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for recorded email with template '${template}' after ${timeoutMs}ms`,
  );
}

test.describe.serial('booking lifecycle emails (Story 8-3)', () => {
  test('Guest creates a booking → both booking-requested-guest and booking-requested-owner are recorded', async ({
    authenticatedPage,
  }) => {
    const page = await authenticatedPage('guest');

    // Navigate directly to the Seeded Owner Coworks detail page via its
    // DB-resolved id (the homepage link's accessible name varies per
    // image alt text; direct URL is more robust). The seed creates 3
    // desks (Desk 1 / Desk 2 / Desk 3); we book Desk 1 on a future date.
    const spaceId = await getSeededOwnerSpaceId();
    await page.goto(`/spaces/${spaceId}`);

    // Date field defaults to today; pick 21 days out to avoid colliding
    // with seeded bookings (which are 7/14 days out) and past-date
    // validation.
    const futureDate = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 21);
      return d.toISOString().slice(0, 10);
    })();
    await page.locator('input[type="date"]').fill(futureDate);

    // The first "Book this desk" button — Desk 1.
    await page
      .getByRole('button', { name: /book this desk/i })
      .first()
      .click();

    // Wait for both emails to record. Order isn't guaranteed (Promise.all
    // semantics inside notifyBookingRequested — we issue sendEmails
    // sequentially but read the file at end). Wait for each separately.
    const guestEmail = await waitForRecordedEmail('booking-requested-guest');
    const ownerEmail = await waitForRecordedEmail('booking-requested-owner');

    expect(guestEmail.to).toBe('guest@deskhive.local');
    expect(guestEmail.subject).toBe(
      '[DeskHive] Your booking at Seeded Owner Coworks',
    );

    expect(ownerEmail.to).toBe('owner@deskhive.local');
    expect(ownerEmail.subject).toContain('[DeskHive] Booking on Seeded Owner Coworks — ');

    // Defensive Decision §9: owner record's dataJson must NOT contain
    // the guest's name (privacy-light minimalism enforced at type level
    // + verified at runtime).
    expect(ownerEmail.dataJson).not.toContain('Test Guest');
    expect(ownerEmail.dataJson).not.toContain('guestName');
  });

  test('Admin confirms a booking on owner\'s space → both booking-confirmed-guest and booking-confirmed-owner recorded (Decision §3 inverse)', async ({
    authenticatedPage,
  }) => {
    // Use the PENDING booking guest@deskhive.local just created in Test 1.
    // Admin navigates to /admin/bookings and confirms it. Because the
    // admin (not the owner) is the actor, BOTH guest + owner emails fire.
    const page = await authenticatedPage('admin');
    await page.goto('/admin/bookings');

    // Find the row for guest@deskhive.local's booking and click Confirm.
    const guestRow = page.getByRole('row', { name: /guest@deskhive\.local/i });
    await expect(guestRow).toBeVisible({ timeout: 10_000 });
    await guestRow.getByRole('button', { name: /^confirm$/i }).click();

    const guestEmail = await waitForRecordedEmail('booking-confirmed-guest');
    const ownerEmail = await waitForRecordedEmail('booking-confirmed-owner');

    expect(guestEmail.to).toBe('guest@deskhive.local');
    expect(ownerEmail.to).toBe('owner@deskhive.local');

    // Defense-in-depth: owner email must NOT mention guest name.
    expect(ownerEmail.dataJson).not.toContain('Test Guest');
  });

  test('Owner confirms own booking → only booking-confirmed-guest recorded (Decision §3 self-action skip)', async ({
    authenticatedPage,
  }) => {
    // applicant1 has a PENDING booking on Seeded Owner Coworks from the
    // Story 7-5 seed (validGuests[0] in seedOwnerBookings). The owner
    // confirms it; the owner-side email is SKIPPED because the actor IS
    // the owner.
    const page = await authenticatedPage('owner');
    // (owner)/layout requires SPACE_OWNER role only; the mode cookie
    // doesn't gate access. Navigate directly.
    await page.goto('/owner/bookings');

    const applicant1Row = page.getByRole('row', {
      name: /applicant1@deskhive\.local/i,
    });
    await expect(applicant1Row).toBeVisible({ timeout: 10_000 });
    await applicant1Row.getByRole('button', { name: /^confirm$/i }).click();

    // Wait for the guest email to record, then check the FULL records
    // list to assert the owner email is NOT present.
    await waitForRecordedEmail('booking-confirmed-guest');

    // Brief settle window in case the action is in-flight (~500ms is
    // enough — Server Actions resolve in well under that).
    await new Promise((resolve) => setTimeout(resolve, 500));

    const records = await readRecordedEmails();
    const guestEmails = records.filter(
      (r) => r.template === 'booking-confirmed-guest',
    );
    const ownerEmails = records.filter(
      (r) => r.template === 'booking-confirmed-owner',
    );

    expect(guestEmails.length).toBe(1);
    expect(guestEmails[0].to).toBe('applicant1@deskhive.local');
    expect(ownerEmails.length).toBe(0); // Decision §3 verification.
  });

  test('Guest cancels PENDING booking → only booking-cancelled-guest recorded (Decision §2)', async ({
    authenticatedPage,
  }) => {
    // applicant4 doesn't have an active booking (their seed booking is
    // REJECTED). Create a fresh PENDING via direct db insert (bypasses
    // notifyBookingRequested — keeps the recording file clean for the
    // cancellation flow).
    // Use a far-future date to avoid colliding with the seeded
    // applicant2 CONFIRMED booking (today + 14 days on Desk 1).
    const cancellableDate = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 45);
      return d.toISOString().slice(0, 10);
    })();
    // Use Desk 2 to avoid colliding with seeded bookings (all seeded
    // bookings are on Desk 1) and any cross-run detritus.
    await createPendingBookingViaDb({
      guestEmail: 'applicant4@deskhive.local',
      spaceName: 'Seeded Owner Coworks',
      bookingDate: cancellableDate,
      deskLabel: 'Desk 2',
    });

    // Truncate again — the inline DB insert didn't touch the file, but
    // belt-and-suspenders.
    await truncateRecordedEmails();

    const page = await authenticatedPage({
      email: 'applicant4@deskhive.local',
    });
    await page.goto('/my-bookings');

    // /my-bookings renders bookings in <ul>/<li> cards (not <tr>). Find
    // the "Cancel request" button — applicant4 has exactly one PENDING
    // after the helper insert (their seeded REJECTED booking doesn't get
    // a cancel button).
    const cancelButton = page.getByRole('button', { name: /cancel request/i });
    await expect(cancelButton).toBeVisible({ timeout: 10_000 });
    await cancelButton.click();

    await waitForRecordedEmail('booking-cancelled-guest');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const records = await readRecordedEmails();
    const guestEmails = records.filter(
      (r) => r.template === 'booking-cancelled-guest',
    );
    const ownerEmails = records.filter(
      (r) => r.template === 'booking-cancelled-owner',
    );

    expect(guestEmails.length).toBe(1);
    expect(guestEmails[0].to).toBe('applicant4@deskhive.local');
    expect(ownerEmails.length).toBe(0); // Decision §2 verification.
  });
});
