import {
  test,
  expect,
  readRecordedEmails,
  truncateRecordedEmails,
  getApplicationIdByEmailAndStatus,
  getSeededUserRole,
  type EmailRecord,
} from '../fixtures';

// Story 8-2: authenticated E2E coverage for the three application
// emails. Uses the EMAIL_TEST_RECORD_FILE recording sink (Story 8-2
// AC-6) — sendEmail writes a JSON line per call instead of hitting
// Resend. Each test truncates the file in beforeEach, performs the
// user action, then reads + asserts the recorded calls.
//
// STATE COORDINATION:
//   - Test 1 mutates `guest@deskhive.local` (creates a PENDING application).
//   - Test 2 mutates `applicant1@deskhive.local` (approves their seeded
//     PENDING → promotes them to SPACE_OWNER).
//   - Test 3 mutates `applicant2@deskhive.local` (rejects their seeded
//     PENDING with an internal reason).
//
// These tests are NOT idempotent across full E2E runs. BA must
// re-run `pnpm db:seed` between full suites to reset state (mutation
// discipline per Story 7-PREP-1 AC-9 — DB reset infrastructure is a
// future story).
//
// WEBSERVER ENV CAVEAT:
//   playwright.config.ts sets EMAIL_TEST_RECORD_FILE on webServer.env.
//   If a dev server was started locally BEFORE pulling this story (and
//   reuseExistingServer is true), the env var won't activate. Restart
//   `pnpm dev` once after pulling Story 8-2.

test.beforeEach(async () => {
  await truncateRecordedEmails();
});

function findEmailByTemplate(
  records: EmailRecord[],
  template: string,
): EmailRecord | undefined {
  return records.find((r) => r.template === template);
}

// Polls readRecordedEmails until a record with the expected template
// appears, OR the timeout elapses. Used as the completion signal for
// Approve/Reject flows because URL navigation timing has proven
// flaky under headless Chromium with React 19 + Sonner + Server Actions
// (verified working in real browsers via BA walks). The recording file
// is the authoritative "did the action complete" signal.
async function waitForRecordedEmail(
  template: string,
  timeoutMs = 15_000,
): Promise<EmailRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const records = await readRecordedEmails();
    const found = findEmailByTemplate(records, template);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for recorded email with template '${template}' after ${timeoutMs}ms`,
  );
}

// Story 8-2: SERIAL execution within this spec. All three tests share the
// EMAIL_TEST_RECORD_FILE recording sink (single shared path via
// playwright.config.ts). Running them in parallel would let one test's
// truncate clobber another's records mid-flight. Each test still does its
// own beforeEach truncate to start from a clean file.
test.describe.serial('application emails — authenticated flows (Story 8-2)', () => {
  test('Guest submits valid application → application-received is recorded', async ({
    authenticatedPage,
  }) => {
    const page = await authenticatedPage('guest');
    await page.goto('/become-a-host');

    // State A: fresh Guest sees the form. Fill it in and submit.
    await page.getByLabel(/business name/i).fill('BA Verification Cafe');
    await page.getByLabel(/business address/i).fill('123 Test Lane, Tashkent');
    await page.getByLabel(/tax id/i).fill('TAX-E2E-001');
    // Motivation is optional; leave empty to exercise the null-motivation path.

    const submit = page.getByRole('button', {
      name: /submit application|submit/i,
    });
    await submit.click();

    // Recording-file polling is the authoritative "did the action
    // complete" signal — works even when post-submit UI navigation is
    // racy under headless Chromium.
    const received = await waitForRecordedEmail('application-received');
    expect(received.to).toBe('guest@deskhive.local');
    expect(received.subject).toBe('Your DeskHive Space Owner application');
    expect(received.dataJson).toContain('BA Verification Cafe');
  });

  test('Admin approves a PENDING application → application-approved is recorded + role promoted', async ({
    authenticatedPage,
  }) => {
    // Use applicant1's seeded PENDING — independent of Test 1's mutation.
    const applicationId = await getApplicationIdByEmailAndStatus(
      'applicant1@deskhive.local',
      'PENDING',
    );

    const page = await authenticatedPage('admin');
    await page.goto(`/admin/applications/${applicationId}`);

    const approveButton = page.getByRole('button', {
      name: /^approve(?:\s+application)?$/i,
    });
    await approveButton.click();

    // Wait for the recorded email (the action completion signal) rather
    // than URL navigation — see waitForRecordedEmail comment above.
    const approved = await waitForRecordedEmail('application-approved');
    expect(approved.to).toBe('applicant1@deskhive.local');
    expect(approved.subject).toBe(
      "You're approved as a DeskHive Space Owner",
    );

    // Story 7-2 atomic role-promotion regression check: applicant1 should
    // now be SPACE_OWNER in the DB. The role mutation happens inside the
    // same Server Action as the email send, so by the time the email is
    // recorded the role is also updated.
    const role = await getSeededUserRole('applicant1@deskhive.local');
    expect(role).toBe('SPACE_OWNER');
  });

  test('Admin rejects with internal reason → application-rejected is recorded WITHOUT the reason (Decision §6)', async ({
    authenticatedPage,
  }) => {
    const applicationId = await getApplicationIdByEmailAndStatus(
      'applicant2@deskhive.local',
      'PENDING',
    );

    const page = await authenticatedPage('admin');
    await page.goto(`/admin/applications/${applicationId}`);

    // Click the Reject trigger button to open the modal (Story 7-4
    // pattern). The trigger is labeled simply "Reject"; the modal's
    // submit button is labeled "Reject application".
    const rejectOpenButton = page.getByRole('button', { name: /^reject$/i });
    await rejectOpenButton.click();

    // Fill the optional reason (which is locked-internal per Decision §6).
    const reasonText = 'Internal-only note: tax ID looks incomplete';
    await page.getByLabel(/reason/i).fill(reasonText);

    // Submit the modal form via the inner "Reject application" button.
    const rejectSubmit = page.getByRole('button', {
      name: /^reject application$/i,
    });
    await rejectSubmit.click();

    // Recording-file polling as the completion signal.
    const rejected = await waitForRecordedEmail('application-rejected');
    expect(rejected.to).toBe('applicant2@deskhive.local');
    expect(rejected.subject).toBe('Your DeskHive Space Owner application');

    // CRITICAL Decision §6 verification: the dataJson must NOT contain
    // the internal rejection reason. Application's rejectionReason was
    // written to the DB (admin's records) but stays out of the email.
    expect(rejected.dataJson).not.toContain('tax ID looks incomplete');
    expect(rejected.dataJson).not.toContain('Internal-only note');
    expect(rejected.dataJson).not.toMatch(/"reason"|"rejectionReason"/);
  });
});
