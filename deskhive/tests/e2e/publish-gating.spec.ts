import { expect, type Page } from '@playwright/test';
import { eq, like } from 'drizzle-orm';
import { test } from '../fixtures';
import { db } from '@/db/client';
import { spacesTable, stripeConnectAccountsTable, usersTable } from '@/db/schema';

// Story 9-2b: Publish-gating E2E coverage (BA Decision §7 — 2 tests).
//
// Test 1 (happy path): owner@deskhive.local has the seeded synthetic
// Connect row with chargesEnabled=true + payoutsEnabled=true. Creates a
// DRAFT space, publishes it on the detail page, verifies it shows up on
// the public listing.
//
// Test 2 (gated path): owner-no-connect@deskhive.local has NO Connect
// row (bounded second seed user per Decision §5). Creates a DRAFT space,
// verifies the Publish button is disabled with the tooltip + Settings
// affordance, verifies the space does NOT appear on the public listing.
//
// Both tests create persistent spaces; an afterEach hook deletes any
// space whose name starts with the test marker, regardless of pass/fail.
// Story 8-POLISH-1 hazard reminder: if these tests fail in a stale dev
// server, restart `pnpm dev` first + re-run `pnpm db:seed` to land the
// new owner-no-connect@deskhive.local user.

const TEST_NAME_PREFIX = 'PG9-2b';

async function deleteTestSpaces(): Promise<void> {
  await db
    .delete(spacesTable)
    .where(like(spacesTable.name, `${TEST_NAME_PREFIX}%`));
}

async function restoreOwnerConnectRow(): Promise<void> {
  // Defensive restore: connect-onboarding.spec.ts deletes + restores this
  // row mid-suite. If a prior aborted run left it deleted, the happy-path
  // test below would mis-render the disabled state. Idempotent re-insert.
  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, 'owner@deskhive.local'))
    .limit(1);
  if (!owner) {
    throw new Error(
      'Seed owner not found. Run `pnpm db:seed` before E2E tests.',
    );
  }
  const [existing] = await db
    .select({ id: stripeConnectAccountsTable.id })
    .from(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, owner.id))
    .limit(1);
  if (!existing) {
    await db.insert(stripeConnectAccountsTable).values({
      userId: owner.id,
      stripeAccountId: 'acct_seed_for_e2e_only',
      onboardingCompleted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
  }
}

async function ensureOwnerNoConnectHasNoRow(): Promise<void> {
  // The seed script deliberately does NOT create a Connect row for this
  // user, but a prior test or manual probe could have inserted one.
  // Defensive delete keeps the gated-path test deterministic.
  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, 'owner-no-connect@deskhive.local'))
    .limit(1);
  if (!owner) {
    throw new Error(
      'Seed owner-no-connect not found. Run `pnpm db:seed` after pulling Story 9-2b.',
    );
  }
  await db
    .delete(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, owner.id));
}

// publishSpaceAction (and connect.ts) require `effectiveMode === 'host'`.
// The authenticatedPage fixture only mints the auth session — it does NOT
// set the `deskhive_mode` cookie. Without this, the action returns
// NOT_FOUND (Decision §2's collapsed-error philosophy) and the toast
// never fires. Setting the cookie here mirrors what /UserPill's mode
// switch does in the real UI. Scoped to this spec only — the host-mode
// requirement is a publishSpaceAction concern, not a general fixture
// requirement (other /owner/* tests don't fire publish-gated actions).
async function enableHostMode(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'deskhive_mode',
      value: 'host',
      url: 'http://localhost:3000',
    },
  ]);
}

async function fillCreateSpaceForm(page: Page, name: string): Promise<void> {
  // The form has 5 required fields; values are arbitrary but valid (URL
  // must pass type=url validation in the browser).
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('City').fill('Berlin');
  await page.getByLabel('Address').fill('Friedrichstr 1');
  await page
    .getByLabel('Description')
    .fill('E2E publish-gating fixture space. Auto-deleted after test.');
  await page
    .getByLabel('Image URL')
    .fill('https://example.com/publish-gating.jpg');
  await page.getByRole('button', { name: /save/i }).click();
}

test.describe('/owner/spaces — publish gating (Story 9-2b)', () => {
  test.beforeEach(async () => {
    await deleteTestSpaces();
    await restoreOwnerConnectRow();
    await ensureOwnerNoConnectHasNoRow();
  });

  test.afterEach(async () => {
    await deleteTestSpaces();
  });

  test('happy publish path — active Connect → space publishes + appears on /spaces', async ({
    authenticatedPage,
  }) => {
    const name = `${TEST_NAME_PREFIX}-happy-${Date.now()}`;
    const page = await authenticatedPage('owner');
    await enableHostMode(page);

    // Step 1: create a fresh space.
    await page.goto('/owner/spaces/new');
    await fillCreateSpaceForm(page, name);

    // The owner-variant form pushes to /owner/spaces/[new-id] on success.
    await page.waitForURL(/\/owner\/spaces\/[0-9a-f-]+$/i);

    // Step 2: detail page shows Draft badge + enabled Publish button.
    await expect(page.getByText('Draft')).toBeVisible();
    const publishButton = page.getByRole('button', { name: /^publish space$/i });
    await expect(publishButton).toBeVisible();
    await expect(publishButton).toBeEnabled();

    // Step 3: list page shows Draft badge next to the name; no per-row
    // Publish button (Decision §3 anti-pattern).
    await page.goto('/owner/spaces');
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByText('Draft')).toBeVisible();
    await expect(
      row.getByRole('button', { name: /^publish space$/i }),
    ).toHaveCount(0);

    // Step 4: back to detail, click Publish.
    await row.getByRole('link', { name: 'Edit' }).click();
    await page.waitForURL(/\/owner\/spaces\/[0-9a-f-]+$/i);
    // Defensive re-restore RIGHT before the click — connect-onboarding.
    // spec.ts deletes + restores the same Connect row for owner@deskhive.
    // local in parallel under `fullyParallel: true`. The beforeEach
    // restore can be undone in the race window before we click. Narrows
    // the gap to ~10ms.
    await restoreOwnerConnectRow();
    await page.getByRole('button', { name: /^publish space$/i }).click();

    // Step 5: toast confirms; status flips to PUBLISHED (badge + button
    // both disappear after router.refresh()).
    await expect(page.getByText(/space published/i)).toBeVisible();
    await expect(page.getByText('Draft')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^publish space$/i }),
    ).toHaveCount(0);

    // Step 6: public listing now includes the just-published space.
    // The public browse lives at `/` in this app (no /spaces index route);
    // /spaces/[id] is only the detail page.
    await page.goto('/');
    await expect(page.getByText(name)).toBeVisible();
  });

  test('gated publish path — no Connect row → Publish disabled + space stays private', async ({
    authenticatedPage,
  }) => {
    const name = `${TEST_NAME_PREFIX}-gated-${Date.now()}`;
    const page = await authenticatedPage('owner-no-connect');
    await enableHostMode(page);

    // Step 1: create a fresh space.
    await page.goto('/owner/spaces/new');
    await fillCreateSpaceForm(page, name);
    await page.waitForURL(/\/owner\/spaces\/[0-9a-f-]+$/i);

    // Step 2: Publish button is visible but DISABLED; the Settings
    // affordance link is present so the owner has a path to onboarding.
    await expect(page.getByText('Draft')).toBeVisible();
    const publishButton = page.getByRole('button', {
      name: /^publish space$/i,
    });
    await expect(publishButton).toBeVisible();
    await expect(publishButton).toBeDisabled();
    await expect(
      page.getByRole('link', { name: /go to settings/i }),
    ).toBeVisible();

    // Step 3: list page shows the Draft badge for this row too.
    await page.goto('/owner/spaces');
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByText('Draft')).toBeVisible();

    // Step 4: public listing does NOT include the gated owner's space.
    // Public browse is at `/` (no /spaces index route).
    await page.goto('/');
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
