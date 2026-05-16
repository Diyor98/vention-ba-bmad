import { test as baseTest, expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { test } from '../fixtures';
import { db } from '@/db/client';
import { stripeConnectAccountsTable, usersTable } from '@/db/schema';

// Story 9-2: E2E coverage for the Stripe Connect onboarding surface
// (BA Decision §9 — 3 tests).
//
// Hard limit: the actual onboarding flow redirects out to
// connect.stripe.com (Stripe-hosted KYC form) which Playwright can't
// full-loop (cross-origin, anti-bot, Stripe TOS). The tests below
// stop at the boundary — they verify the /owner/settings UI state
// branches + the unauthenticated guard. The URL-prefix assertion from
// BA Decision §9 test #3 is covered at the unit-test level
// (src/actions/connect.test.ts → `initiateConnectOnboardingAction —
// first call (no row) creates a new Stripe account, upserts, returns
// redirect URL`) — performing it in E2E would either pollute the
// test-mode Stripe sandbox with throwaway accounts (real Stripe API
// round-trip needed) or require invasive test-only DOM instrumentation.
//
// Tests #1 and #2 share state (the seeded synthetic Connect row) so
// they're wrapped in test.describe.serial. Test #2 uses the
// programmatic delete-and-restore pattern (BA Decision §9 — avoids
// polluting the seed with a second owner just for one test).

const SEED_OWNER_EMAIL = 'owner@deskhive.local';
const SEED_OWNER_CONNECT_ACCOUNT_ID = 'acct_seed_for_e2e_only';

async function getOwnerUserId(): Promise<string> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_OWNER_EMAIL))
    .limit(1);
  if (!row) {
    throw new Error(
      `Seed owner ${SEED_OWNER_EMAIL} not found in DB. Run \`pnpm db:seed\`.`,
    );
  }
  return row.id;
}

async function deleteOwnerConnectRow(): Promise<void> {
  const ownerId = await getOwnerUserId();
  await db
    .delete(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, ownerId));
}

async function restoreOwnerConnectRow(): Promise<void> {
  const ownerId = await getOwnerUserId();
  // DELETE + INSERT (not upsert) because we want the row's flags reset
  // to the seeded values regardless of what a prior test may have set.
  await db
    .delete(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, ownerId));
  await db.insert(stripeConnectAccountsTable).values({
    userId: ownerId,
    stripeAccountId: SEED_OWNER_CONNECT_ACCOUNT_ID,
    onboardingCompleted: true,
    chargesEnabled: true,
    payoutsEnabled: true,
  });
}

test.describe.serial('/owner/settings — Stripe Connect onboarding (Story 9-2)', () => {
  test('complete state — owner with synthetic Connect row sees "Onboarding complete"', async ({
    authenticatedPage,
  }) => {
    // Defensive restore: a prior aborted run of test #2 (initial state)
    // could have left the row deleted. Restore before navigating.
    await restoreOwnerConnectRow();

    const page = await authenticatedPage('owner');
    await page.goto('/owner/settings');

    await expect(
      page.getByRole('heading', { name: /onboarding complete/i, level: 3 }),
    ).toBeVisible();
    await expect(page.getByTestId('connect-complete')).toBeVisible();
    await expect(page.getByTestId('charges-enabled-indicator')).toContainText(
      /yes/i,
    );
    await expect(page.getByTestId('payouts-enabled-indicator')).toContainText(
      /yes/i,
    );
  });

  test('initial state — owner with NO Connect row sees "Complete onboarding" CTA', async ({
    authenticatedPage,
  }) => {
    await deleteOwnerConnectRow();
    try {
      const page = await authenticatedPage('owner');
      await page.goto('/owner/settings');

      await expect(
        page.getByRole('heading', { name: /complete onboarding/i, level: 3 }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /complete onboarding/i }),
      ).toBeVisible();
    } finally {
      // Always restore the seeded row so downstream tests + the BA
      // browser walk see the expected complete state.
      await restoreOwnerConnectRow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Unauthenticated guard — owner-only route, redirects to /login.
// Stands in for BA Decision §9 test #3 (URL-prefix capture). The
// URL-returning behavior of initiateConnectOnboardingAction is proven
// at the unit-test level (src/actions/connect.test.ts test 5). Doing
// it here would either pollute Stripe with throwaway accounts or need
// test-only DOM instrumentation.
// ─────────────────────────────────────────────────────────────────────
baseTest.describe('/owner/settings — unauthenticated guard (Story 9-2)', () => {
  baseTest(
    'GET /owner/settings redirects to /login when not signed in',
    async ({ page }) => {
      await page.goto('/owner/settings');
      await expect(page).toHaveURL(/\/login/);
    },
  );
});
