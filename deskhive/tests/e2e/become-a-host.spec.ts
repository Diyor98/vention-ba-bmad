import { test as baseTest, expect } from '@playwright/test';
import { test } from '../fixtures';

// Story 7-3: /become-a-host page. Unauthenticated → State E redirect
// (covered below, no fixture needed).
//
// Story 7-PREP-1: extended with authenticated coverage for State A
// (fresh Guest sees apply form) and State B (Guest with PENDING sees
// under-review banner). The AC-2 bounded seed exception adds the
// `guest@deskhive.local` fresh Guest user — the four applicant seeds
// all have applications and therefore land in State B; State A is only
// reachable via the new fresh Guest.
//
// Full State A → submit → State B end-to-end is deferred to a future
// story that brings DB reset infrastructure (mutation discipline,
// Story 7-PREP-1 AC-9).

baseTest.describe('/become-a-host — unauthenticated (State E)', () => {
  baseTest('GET /become-a-host redirects to /login with callbackUrl', async ({
    page,
  }) => {
    await page.goto('/become-a-host');
    await expect(page).toHaveURL(/\/login\?callbackUrl=\/become-a-host$/);
  });

  baseTest('login page receives the callbackUrl as hidden input value', async ({
    page,
  }) => {
    await page.goto('/become-a-host');
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    const hidden = page.locator('input[name="callbackUrl"]');
    await expect(hidden).toHaveAttribute('value', '/become-a-host');
  });
});

test.describe('/become-a-host — authenticated state branching', () => {
  // State A: fresh Guest with no application — apply form visible.
  // The fresh `guest@deskhive.local` seed user (Story 7-PREP-1 AC-2)
  // is the only seed user that lands here; the four applicants all
  // have applications and would land in State B.
  test('fresh Guest with no application sees State A apply form', async ({
    authenticatedPage,
  }) => {
    const page = await authenticatedPage('guest');
    await page.goto('/become-a-host');
    await expect(
      page.getByRole('heading', { name: /become a space owner/i, level: 1 }),
    ).toBeVisible();
    // The application form's "Business name" field is the canonical State A
    // marker — present only on the form, not in State B's read-only summary
    // (State B uses <dt>/<dd>, not <label>+<input>).
    await expect(page.getByLabel(/business name/i)).toBeVisible();
  });

  // State B: Guest with PENDING application sees the "under review"
  // banner. applicant1@deskhive.local has a PENDING application via
  // the Story 7-4 seed.
  test('Guest with PENDING application sees State B (under review)', async ({
    authenticatedPage,
  }) => {
    const page = await authenticatedPage({ email: 'applicant1@deskhive.local' });
    await page.goto('/become-a-host');
    await expect(
      page.getByRole('heading', { name: /application under review/i, level: 1 }),
    ).toBeVisible();
  });
});
