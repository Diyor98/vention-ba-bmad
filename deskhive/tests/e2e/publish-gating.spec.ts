import { expect, type Page } from '@playwright/test';
import { eq, like } from 'drizzle-orm';
import { test } from '../fixtures';
import { db } from '@/db/client';
import { spacesTable, stripeConnectAccountsTable, usersTable } from '@/db/schema';

// Story 9-2b: Publish-gating E2E coverage (BA Decision §7 — 2 tests).
//
// Both tests sign in as `owner-pending-onboarding@deskhive.local` — the
// bounded-exception seed user (Decision §5) that the seed's
// `scrubPendingOnboardingConnectRow` step keeps in a "no Connect row"
// state on every `pnpm db:seed`. The TEST itself owns the Connect row's
// lifecycle:
//
//   • Test 1 (happy path) — INSERTs a synthetic Connect row with
//     chargesEnabled=true + payoutsEnabled=true right before clicking
//     Publish. Verifies the space publishes + appears on `/`.
//
//   • Test 2 (gated path) — leaves the row absent. Verifies the Publish
//     button is disabled with the tooltip + Settings affordance, and
//     verifies the space does NOT appear on `/`.
//
// Why both tests use the same pending-onboarding user (rather than the
// happy path using `owner@deskhive.local` with its seeded synthetic
// row): `connect-onboarding.spec.ts` mutates the seeded `owner@` user's
// Connect row mid-suite under `fullyParallel: true`. The original 9-2b
// happy-path test using `owner@` raced against that mutation and failed
// intermittently. Owning the Connect row inside this spec on a user no
// other spec touches eliminates the race entirely — and it's the
// template for Stories 9-3 / 9-4 / 9-6, which will need similar
// "Connect-active vs. Connect-inactive" parameterization.
//
// Both tests create persistent spaces; an afterEach hook deletes any
// space whose name starts with the test marker AND clears the pending
// owner's Connect row, regardless of pass/fail.
//
// Story 8-POLISH-1 hazard reminder: if these tests fail in a stale dev
// server, restart `pnpm dev` first + re-run `pnpm db:seed` to land the
// renamed `owner-pending-onboarding@deskhive.local` user.

const TEST_NAME_PREFIX = 'PG9-2b';
const PENDING_OWNER_EMAIL = 'owner-pending-onboarding@deskhive.local';

async function getPendingOwnerId(): Promise<string> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, PENDING_OWNER_EMAIL))
    .limit(1);
  if (!row) {
    throw new Error(
      `Seed user \`${PENDING_OWNER_EMAIL}\` not found. Run \`pnpm db:seed\` after pulling the 9-2b fixture-rename follow-up.`,
    );
  }
  return row.id;
}

async function deleteSpaceByExactName(name: string): Promise<void> {
  await db.delete(spacesTable).where(eq(spacesTable.name, name));
}

async function deleteAnyOrphanTestSpaces(): Promise<void> {
  // Run ONCE at suite start to clean up leftover spaces from any prior
  // aborted run. Use LIKE — at this point no tests have started so
  // there's no risk of nuking another test's in-flight space. Per-test
  // cleanup goes through `deleteSpaceByExactName` to stay parallelism-
  // safe under `fullyParallel: true`.
  await db
    .delete(spacesTable)
    .where(like(spacesTable.name, `${TEST_NAME_PREFIX}%`));
}

async function clearPendingOwnerConnectRow(): Promise<void> {
  // Idempotent — runs before every test (to scrub anything a parallel
  // test or BA-walk may have inserted) and after every test (to clean
  // up the synthetic row the happy path inserts).
  const ownerId = await getPendingOwnerId();
  await db
    .delete(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, ownerId));
}

async function setPendingOwnerActiveConnectRow(): Promise<void> {
  // Inserts a synthetic Connect row with both flags = true. Uses a
  // distinct stripeAccountId from the `owner@` seed's row so the two
  // never collide on the table's UNIQUE constraint, even mid-test.
  const ownerId = await getPendingOwnerId();
  await db.insert(stripeConnectAccountsTable).values({
    userId: ownerId,
    stripeAccountId: 'acct_test_pending_owner_e2e_only',
    onboardingCompleted: true,
    chargesEnabled: true,
    payoutsEnabled: true,
  });
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
  // Both tests share the same `owner-pending-onboarding` user. Under
  // `fullyParallel: true`, two workers running these tests concurrently
  // would race on that user's Connect row (happy path INSERTs it;
  // gated path expects it absent). Serializing the describe forces them
  // through one worker — cheap (only 2 tests, ~25s combined) and
  // eliminates the race entirely.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    // Sweep leftover detritus from prior aborted runs. Per-test cleanup
    // uses exact-name matching (see afterEach) so two parallel workers
    // can't nuke each other's in-flight spaces.
    await deleteAnyOrphanTestSpaces();
  });

  // Per-test cleanup tracks the test's own space name in a closure so the
  // afterEach can target only that row. Avoids the parallelism footgun
  // where a `LIKE '${TEST_NAME_PREFIX}%'` cleanup in one worker deletes
  // another worker's in-flight space.
  let currentSpaceName: string | null = null;

  test.beforeEach(async () => {
    currentSpaceName = null;
    await clearPendingOwnerConnectRow();
  });

  test.afterEach(async () => {
    if (currentSpaceName) {
      await deleteSpaceByExactName(currentSpaceName);
    }
    await clearPendingOwnerConnectRow();
  });

  test('happy publish path — active Connect → space publishes + appears on /spaces', async ({
    authenticatedPage,
  }) => {
    const name = `${TEST_NAME_PREFIX}-happy-${Date.now()}`;
    currentSpaceName = name;
    const page = await authenticatedPage('owner-pending-onboarding');
    await enableHostMode(page);

    // Step 1: create a fresh space.
    await page.goto('/owner/spaces/new');
    await fillCreateSpaceForm(page, name);

    // The owner-variant form pushes to /owner/spaces/[new-id] on success.
    await page.waitForURL(/\/owner\/spaces\/[0-9a-f-]+$/i);

    // Step 2: BEFORE asserting "Publish enabled" — flip the test user
    // from "pending onboarding" to "active Connect" by inserting a
    // synthetic Connect row. The detail page is a Server Component that
    // reads this state on every render; navigating away and back will
    // pick it up.
    await setPendingOwnerActiveConnectRow();
    await page.reload();

    await expect(page.getByText('Draft')).toBeVisible();
    const publishButton = page.getByRole('button', {
      name: /^publish space$/i,
    });
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
    currentSpaceName = name;
    const page = await authenticatedPage('owner-pending-onboarding');
    await enableHostMode(page);

    // Step 1: create a fresh space.
    await page.goto('/owner/spaces/new');
    await fillCreateSpaceForm(page, name);
    await page.waitForURL(/\/owner\/spaces\/[0-9a-f-]+$/i);

    // Step 2: Publish button is visible but DISABLED; the Settings
    // affordance link is present so the owner has a path to onboarding.
    // (No Connect row inserted — beforeEach already cleared.)
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
