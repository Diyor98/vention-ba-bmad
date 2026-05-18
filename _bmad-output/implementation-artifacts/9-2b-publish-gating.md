# Story 9-2b: Publish Gating

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Space Owner who has just created a new space**,
I want **the space to stay in a private DRAFT state until I've completed Stripe Connect onboarding and explicitly clicked Publish on the space detail page** — with the Publish button disabled (with a "Complete Stripe onboarding first" hint) until my Connect account is active —
so that **half-built spaces never appear in the public listing, and bookings can't be created against spaces whose host can't yet receive payouts.**

> Story 9-2b is the **publish-gating follow-up to Story 9-2 (Connect onboarding)**. Source of truth: [docs/design/9-2b-publish-gating-ba-decisions.md](docs/design/9-2b-publish-gating-ba-decisions.md) — 10 locked decisions. Locked 2026-05-18 (BA: Ikhtiyor Ziyayev), committed `1f08150` + `02a9548`.

> **Companion / dependency:** Story 9-2 (`feat(stripe): Story 9-2 — Stripe Connect Express onboarding`, shipped at `0d384e0` on `origin/main`). 9-2b consumes the `stripe_connect_accounts` table 9-2 introduced; the gating logic in `publishSpaceAction` reads `charges_enabled && payouts_enabled` from that table. 9-2 must be on `main` (it is) before 9-2b dispatch.

> **After 9-2b ships, the running app behaves like this:** an owner clicks "New space" → fills the form → space is created with `status='DRAFT'` (NOT `'PUBLISHED'` as before). They land on `/owner/spaces` and see the new space with a **Draft** badge. The space does NOT appear in the public `/spaces` listing. Clicking into the space (detail page) shows a **Publish** button. If the owner has completed Connect onboarding, the button is enabled — clicking it flips the space to PUBLISHED and surfaces a toast. If not, the button is disabled with a tooltip linking to `/owner/settings`. Admin-side `/admin/spaces/new` continues to auto-publish (no change). Phase 1's seeded PUBLISHED spaces are unaffected.

> **Key anti-patterns to keep in mind:**
> - **No per-row Publish button in `/owner/spaces`** — only the badge shows on the list (Decision §3 anti-pattern). The Publish button lives on the detail page only.
> - **No `unpublishSpaceAction`** — DRAFT → PUBLISHED is one-way in this story's scope (Decision §2 anti-pattern).
> - **No DB column default change** — keep `status` default = `'PUBLISHED'`; owner-side flow passes `'DRAFT'` explicitly (Decision §1 + §4 anti-pattern).
> - **No auto-publish on Connect onboarding completion** — owner clicks Publish explicitly (Decision §1 anti-pattern).
> - **No auto-unpublish if Connect later becomes inactive** — ops concern, deferred to booking-action layer (Decision §1 anti-pattern).
> - **No bypassing the cross-tenant `NOT_FOUND` rule** — owner A trying to publish owner B's space MUST get `NOT_FOUND`, not `FORBIDDEN` (Decision §2 + Story 7-5 leak-prevention).
> - **No `published_at` timestamp column** — the enum is sufficient (Decision §1 anti-pattern).
> - **No new `we_*` webhook endpoint, no email-infrastructure changes, no Stripe SDK calls in `publishSpaceAction`** — this story is purely about a DB state transition gated by reads from `stripe_connect_accounts`.

## Acceptance Criteria

> Source: locked BA Decisions document Decisions 1–10 + Browser verification checklist (8 points).

1. **AC-1 (Drizzle schema: extend `spaces.status` check constraint to include `'DRAFT'`).** Per BA Decision §1:
   - Edit [src/db/schema.ts](deskhive/src/db/schema.ts) line ~63 — `spacesTable` check constraint:
     ```typescript
     // Before:
     (t) => [check('spaces_status_check', sql`${t.status} IN ('PUBLISHED', 'SUSPENDED')`)],
     // After:
     (t) => [check('spaces_status_check', sql`${t.status} IN ('DRAFT', 'PUBLISHED', 'SUSPENDED')`)],
     ```
   - **DB-level column default STAYS `'PUBLISHED'`** (line 55, `status: text('status').notNull().default('PUBLISHED')`). Anti-pattern: do NOT change it. Owner-side flow passes `'DRAFT'` explicitly per AC-4.
   - **No new tables.** No data migration required — existing PUBLISHED rows stay PUBLISHED; new DRAFT rows only land via owner-side creation (AC-4).
   - Run `pnpm db:generate` to produce migration `deskhive/drizzle/migrations/0004_*.sql`. Inspect the SQL — should be a single `DROP CONSTRAINT ... ADD CONSTRAINT ...` block with no data changes.
   - Add a story-tag comment block at the top of the generated migration matching the Story 9-2 convention (`0003_numerous_stone_men.sql` shape — story description + rollback hint).

2. **AC-2 (Add `publishSpaceAction` Server Action with locked signature + 4-step behavior).** Per BA Decision §2:
   - Add `publishSpaceAction` to [src/actions/space.ts](deskhive/src/actions/space.ts) alongside the existing `createSpaceAction` + `editSpaceAction` (keep all three in one file — no new file needed for one short action).
   - Locked TypeScript signature (verbatim from BA Decision §2):
     ```typescript
     async function publishSpaceAction(input: { spaceId: string }): Promise<
       | { ok: true }
       | {
           ok: false;
           error: 'NOT_FOUND' | 'STRIPE_NOT_ACTIVE' | 'ALREADY_PUBLISHED';
         }
     >;
     ```
   - **Locked behavior (7 ordered steps from BA Decision §2):**
     1. Verify caller's session; route through `effectiveMode(session)` from [src/lib/mode.ts](deskhive/src/lib/mode.ts); confirm `role === 'SPACE_OWNER'` AND `mode === 'host'`. If not, return `{ ok: false, error: 'NOT_FOUND' }` (collapses unauthorized into the same leak-prevention code per Decision §2's broader anti-pattern philosophy).
     2. Look up the space by `spaceId` via `getSpaceById(spaceId)` from [src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts). If not found → `{ ok: false, error: 'NOT_FOUND' }`.
     3. Verify `space.ownerId === session.user.id`. If not → `{ ok: false, error: 'NOT_FOUND' }` (Story 7-5 cross-tenant leak-prevention).
     4. If `space.status === 'PUBLISHED'` → `{ ok: false, error: 'ALREADY_PUBLISHED' }`.
     5. If `space.status === 'SUSPENDED'` → `{ ok: false, error: 'NOT_FOUND' }` (admin-suspended; owner shouldn't see the publish path).
     6. Look up the owner's `stripe_connect_accounts` row via `getConnectAccountByUserId(session.user.id)` from [src/db/queries/stripe-connect.ts](deskhive/src/db/queries/stripe-connect.ts) (Story 9-2 helper). If missing OR `chargesEnabled !== true` OR `payoutsEnabled !== true` → `{ ok: false, error: 'STRIPE_NOT_ACTIVE' }`.
     7. `db.update(spacesTable).set({ status: 'PUBLISHED', updatedAt: new Date() }).where(eq(spacesTable.id, spaceId))`. Return `{ ok: true }`.
   - **Anti-pattern enforced:** the action consults the DB directly — **NO calls to `src/lib/payments/connect.ts` wrappers** (which talk to Stripe). The Connect-state check reads cached state from the DB row, not live state from Stripe. The webhook handler from Story 9-2 keeps that DB row in sync. Decision §8 explicitly excludes `src/lib/payments/*` from this story's diff.
   - **No `NOT_OWNER` error code** — owner-mismatch collapses into `NOT_FOUND` per step 3 (Decision §2's locked change vs. the original strawman).
   - **No `db.transaction()` needed** — single-table single-row UPDATE; PG row-level isolation is sufficient.
   - Add the action to the `revalidatePath` calls that match the affected surfaces: `/owner/spaces`, `/owner/spaces/${spaceId}`, `/` (public listing now changes), `/spaces/${spaceId}` (public detail).

3. **AC-3 (Detail page Publish button — Client Component wrapping the action).** Per BA Decision §3:
   - Create new Client Component at `deskhive/src/app/(owner)/owner/spaces/[id]/publish-space-button.tsx`:
     - `'use client'` directive at top.
     - Props: `{ spaceId: string; canPublish: boolean }`. `canPublish` is computed server-side in the parent — `true` iff owner has Connect row with both booleans true.
     - Uses `useTransition` for the form submit. Mirrors the `OnboardingCtaButton` pattern from Story 9-2.
     - When `canPublish === false`: button rendered with `disabled` + a `title` attribute "Complete Stripe onboarding to publish this space." Adjacent inline link `<Link href="/owner/settings">Go to Settings →</Link>` for affordance.
     - When `canPublish === true`: button enabled. On click, calls `publishSpaceAction({ spaceId })`. On `{ ok: true }`: `toastSuccess('Space published', '...')` from [src/lib/toast.ts](deskhive/src/lib/toast.ts) + `router.refresh()` to re-render with new status. On `{ ok: false, error: 'STRIPE_NOT_ACTIVE' }`: `toastError('Complete Stripe onboarding before publishing', ...)`. On other errors: generic `toastError('Could not publish space', result.error)`.
     - Button text: `"Publish space"` when enabled; same label when disabled (the disabled affordance is the visual disabled state + tooltip, not different copy).
   - Edit [src/app/(owner)/owner/spaces/[id]/page.tsx](deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx):
     - Add a render branch when `space.status === 'DRAFT'`: insert a section above (or inside) the existing "Details" card showing the Draft badge + Publish button.
     - Add `getConnectAccountByUserId(ownerId)` lookup at the top of the Server Component (parallel to the existing `getSpaceByIdForOwner` call).
     - Compute `canPublish = !!connectRow && connectRow.chargesEnabled && connectRow.payoutsEnabled`.
     - Render `<PublishSpaceButton spaceId={space.id} canPublish={canPublish} />` only when `space.status === 'DRAFT'`. When PUBLISHED or SUSPENDED, render nothing publish-related.
   - **Anti-pattern enforced:** Publish button NEVER renders on PUBLISHED or SUSPENDED spaces (Decision §3 anti-pattern).

4. **AC-4 (Application-level DRAFT default on owner-created spaces).** Per BA Decision §4:
   - Extend `createSpace` in [src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts) to accept an optional status parameter:
     ```typescript
     export async function createSpace(
       input: CreateSpaceInput,
       ownerId?: string,
       status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
     ): Promise<Space> { ... }
     ```
     Replace the hardcoded `status: 'PUBLISHED'` on the insert with the parameter.
   - Edit `createSpaceAction` in [src/actions/space.ts](deskhive/src/actions/space.ts) (the existing Server Action — DO NOT add a new owner-only action):
     ```typescript
     // Before (Story 7-5):
     created = await createSpace(
       parsed.data,
       callerRole === 'SPACE_OWNER' ? callerId : undefined,
     );
     // After (Story 9-2b):
     created = await createSpace(
       parsed.data,
       callerRole === 'SPACE_OWNER' ? callerId : undefined,
       callerRole === 'SPACE_OWNER' ? 'DRAFT' : 'PUBLISHED',
     );
     ```
   - **Anti-pattern enforced:** the role-branched status decision lives in the **action layer** (the entry-point already branching on role for `ownerId`), NOT inside `createSpace` itself. Decision §4 anti-pattern: do NOT branch on caller role inside the shared helper.
   - **DB-level column default stays `'PUBLISHED'`** — no schema change to the default. Admin-created spaces and any future server-side seed inserts that don't pass a status keep the existing behavior.

5. **AC-5 (DRAFT badge on the list page).** Per BA Decision §3 (DRAFT badge subsection):
   - Edit [src/app/(owner)/owner/spaces/page.tsx](deskhive/src/app/(owner)/owner/spaces/page.tsx). In the table row's first cell (where space name renders), conditionally add a Draft badge next to the name when `s.status === 'DRAFT'`:
     ```tsx
     <span className="top">
       {s.name}
       {s.status === 'DRAFT' && (
         <span className="badge badge-pending" style={{ marginLeft: '0.5rem' }}>
           <span className="dot" aria-hidden="true" />
           Draft
         </span>
       )}
     </span>
     ```
   - **No per-row Publish button** (Decision §3 anti-pattern — the Edit button stays as-is; Publish lives on the detail page only).
   - **Use the existing `badge badge-pending` CSS class** for visual consistency. Decision §3 references "the existing SUSPENDED badge convention" — but the dev-agent audited the codebase and found no pre-existing space-status badge component (Story 7-5 did not introduce one). The closest visual match is the booking/application `badge-pending` (gold/yellow) used by [src/components/status-badge.tsx](deskhive/src/components/status-badge.tsx). Document this in the Dev Agent Record as a "BA-decision-doc inaccuracy noted but harmless" — using `badge-pending` for the Draft chip is a defensible default.
   - **No new component required.** Inlined JSX is sufficient for a one-state badge in two places. If Story 9-3+ needs space-status badges with multiple variants, that's the right time to factor out a `SpaceStatusBadge` component.

6. **AC-6 (DRAFT badge on the detail page).** Per BA Decision §3 (DRAFT badge subsection):
   - Edit [src/app/(owner)/owner/spaces/[id]/page.tsx](deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx). The existing meta-strip (line ~60) shows `Status <strong>{space.status}</strong>`. When status is DRAFT, replace that text fragment with the same `badge badge-pending` chip used on the list page; for PUBLISHED and SUSPENDED, keep the raw-text status fragment.
   - The Publish button section from AC-3 sits in a separate area (above or below the Details card; dev-agent picks the visual placement).

7. **AC-7 (Verify public-listing query filter is `status = 'PUBLISHED'`).** Per BA Decision §6:
   - Read [src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts). Confirm both `listPublishedSpaces` (line 44) and `getPublishedSpaceById` (line 72) filter `eq(spacesTable.status, 'PUBLISHED')` (NOT `ne(status, 'SUSPENDED')` or no filter at all).
   - **Dev-agent confirmed during create-story audit:** both queries already filter `status = 'PUBLISHED'`. ✓ **No code changes needed for AC-7.** Document the audit in the Dev Agent Record as a "Decision §6 verification passed" line.
   - **Anti-pattern enforced:** do NOT trust the strawman's assertion without reading the code. The audit IS the verification.

8. **AC-8 (Bounded second seed user `owner-no-connect@deskhive.local`).** Per BA Decision §5:
   - Edit [scripts/seed.ts](deskhive/scripts/seed.ts) to add a new seeded user following the existing `seedUser` pattern:
     ```typescript
     const SEED_OWNER_NO_CONNECT_EMAIL = 'owner-no-connect@deskhive.local';
     const SEED_OWNER_NO_CONNECT_PASSWORD = 'OwnerNoConnect1!';  // 14 chars; meets the 8-char policy
     const SEED_OWNER_NO_CONNECT_FULL_NAME = 'Owner Without Connect';
     // ... in main():
     await seedUser({
       email: SEED_OWNER_NO_CONNECT_EMAIL,
       password: SEED_OWNER_NO_CONNECT_PASSWORD,
       fullName: SEED_OWNER_NO_CONNECT_FULL_NAME,
       role: 'SPACE_OWNER',
     });
     ```
   - **DO NOT create a `stripe_connect_accounts` row** for this user — the E2E test #2 needs them in the "not yet onboarded" state.
   - **DO NOT seed any spaces** for this user — the gated-path E2E test (AC-11 #2) exercises the full create-then-attempt-publish flow.
   - This is a **bounded exception** to Story 7-PREP-1 AC-2's "no test users beyond minimal seed" principle, justified by the gated-path E2E test having no other automated coverage. Mirrors Story 7-PREP-1's `guest@deskhive.local` precedent + Decision §5's open-question YES recommendation.

9. **AC-9 (Playwright fixture — add `owner-no-connect` role shorthand).** Per BA Decision §5:
   - Edit [tests/fixtures/auth-helpers.ts](deskhive/tests/fixtures/auth-helpers.ts):
     - Add to `SEED_CREDENTIALS`: `'owner-no-connect@deskhive.local': 'OwnerNoConnect1!',`
     - Add to `ROLE_EMAIL`: `'owner-no-connect': 'owner-no-connect@deskhive.local',`
     - Add `'owner-no-connect'` to the `AuthRole` union type.
   - **The existing 4-role union (`'guest' | 'owner' | 'admin' | 'fresh-owner'`) becomes a 5-role union.** Story 7-PREP-1's `authenticatedPage(role)` fixture automatically picks up the new entry — no fixture-mechanism changes needed.

10. **AC-10 (Unit tests — 4 new for `publishSpaceAction`).** Per BA Decision §9:
    - Create [src/actions/space.test.ts](deskhive/src/actions/space.test.ts) (new file — there's no pre-existing test file for `space.ts` actions). Mock surface:
      - `next/headers` for `headers()`
      - `@/lib/auth/config` for `auth.api.getSession`
      - `@/lib/mode` for `effectiveMode`
      - `@/db/queries/spaces` for `getSpaceById` + `updateSpace`-style call (use `@/db/client` mock for the direct `db.update(...)` since the action does it inline)
      - `@/db/queries/stripe-connect` for `getConnectAccountByUserId`
      - `next/cache` for `revalidatePath`
    - 4 tests (matching Decision §9's enumeration):
      1. **Happy path** — `owner@deskhive.local` (mocked session) with active Connect row + DRAFT space → action returns `{ ok: true }`. `db.update(spacesTable)` was called with `set: { status: 'PUBLISHED', updatedAt: ... }` and the right `where` clause.
      2. **`STRIPE_NOT_ACTIVE`** — owner with no Connect row (or row with `chargesEnabled: false`) → action returns `{ ok: false, error: 'STRIPE_NOT_ACTIVE' }`. `db.update` was NOT called.
      3. **Cross-tenant `NOT_FOUND`** — owner-A session, space owned by owner-B → action returns `{ ok: false, error: 'NOT_FOUND' }`. `db.update` was NOT called. **No 'NOT_OWNER' code surfaces** (Decision §2 locked drop of NOT_OWNER from the union).
      4. **`ALREADY_PUBLISHED`** — owner session + their own PUBLISHED space → action returns `{ ok: false, error: 'ALREADY_PUBLISHED' }`. `db.update` was NOT called.
    - **Target unit test count after this story:** 329 (baseline at end of Story 9-2 + the BA-walk fix) + 4 = **333**. ⚠️ **Note:** the BA decisions doc cites 327 (assumed 323 baseline + 4) — that's stale. Actual baseline is 329 because Story 9-2 delivered +16 tests (not +11) and the BA-walk fix added +1. Documenting in Dev Agent Record.

11. **AC-11 (E2E tests — 2 new for publish-gating).** Per BA Decision §7:
    - Create [tests/e2e/publish-gating.spec.ts](deskhive/tests/e2e/publish-gating.spec.ts). Two tests in a single `test.describe` block (no `.serial` needed — they use different seeded owners, no shared state):
      1. **Happy publish path** — `authenticatedPage('owner')` (the seeded `owner@deskhive.local` with synthetic complete-Connect row from Story 9-2's seed). Flow:
         - Navigate to `/owner/spaces/new`, fill form, submit.
         - Land on `/owner/spaces/[new-id]` (or `/owner/spaces` depending on the form's variant prop redirect behavior — verify the existing Story 7-5 form's `variant="owner"` post-success target).
         - Visit `/owner/spaces`. Assert the new row shows the **Draft** badge + the space name. Assert the row does NOT show a Publish button (Decision §3 anti-pattern).
         - Click the row to navigate to the detail page.
         - Assert the **Publish space** button is visible + enabled.
         - Click Publish.
         - Assert success toast appears (`toastSuccess('Space published', ...)` text).
         - Assert the page re-renders without the Draft badge + without the Publish button.
         - Visit `/spaces` (public listing). Assert the just-published space appears in the public list.
      2. **Gated publish path** — `authenticatedPage('owner-no-connect')` (the new seeded user with no Connect row). Flow:
         - Navigate to `/owner/spaces/new`, fill form, submit.
         - Visit `/owner/spaces`. Assert the new row shows the Draft badge.
         - Click into the detail page.
         - Assert the **Publish space** button is visible but **disabled** (per Decision §3's "disabled state when Connect is incomplete"). Assert the tooltip text or adjacent affordance link to `/owner/settings` is present.
         - (E2E can't fully test a server-side STRIPE_NOT_ACTIVE error because the disabled button can't be clicked — the disabled state IS the gating from the user's perspective. The unit-test #2 covers the action's STRIPE_NOT_ACTIVE branch.)
         - Visit `/spaces` (public listing). Assert the gated-owner's space does NOT appear (still DRAFT).
    - **Target E2E test count after this story:** 56 (baseline at end of Story 9-2) + 2 = **58**.
    - **Operational reminder:** the Story 8-POLISH-1 dev-server-reuse hazard + Story 7-PREP-1 mutation-discipline cascade are still alive. Run `pnpm db:seed` after pulling 9-2b to ensure the new `owner-no-connect@deskhive.local` user is in the DB; restart any stale `pnpm dev` so the new schema check constraint is loaded.

12. **AC-12 (Memory file extension).** Per BA Decision §10:
    - Extend out-of-tree `~/.claude/.../memory/reference_stripe_service_pattern.md` with a new section under the existing Story 9-2 content, covering:
      - DRAFT enum addition pattern + why-not-published_at-timestamp (Decision §1).
      - Application-level vs. DB-level default split — owner-side flow passes status explicitly; admin-side flow relies on DB default (Decision §4).
      - `publishSpaceAction` shape + the 3-error-code discriminated union (Decision §2) — note that the strawman's original 4-code union was reduced to 3 (NOT_OWNER dropped) because owner-mismatch collapses into NOT_FOUND.
      - Cross-tenant `NOT_FOUND`-not-`FORBIDDEN` reuse — cross-references Story 7-5's pattern in `reference_owner_scoped_crud_pattern.md`.
      - Bounded `owner-no-connect@deskhive.local` seed user (Decision §5) — note as **second precedent** after Story 7-PREP-1's `guest@deskhive.local`.
      - "Publish lives only on detail page" pattern + rationale (Decision §3 reshaping) — list-row Publish is a footgun; detail-page-as-preview-before-publish; single surface for future gating-logic evolution.
      - Forward-reference: Story 9-3's booking-creation path will likely add a similar Connect-state-active check at the booking-create boundary (not at the space-publish boundary). The pattern in `publishSpaceAction` is the template.
    - **No new memory file** — extend `reference_stripe_service_pattern.md`.

13. **AC-13 (`git diff` scope — bounded per Decision §8).**
    - All changes confined to:
      - `deskhive/src/db/schema.ts` — `spaces.status` check constraint extended to include `'DRAFT'`
      - `deskhive/drizzle/migrations/0004_*.sql` (new, auto-generated) — single `DROP CONSTRAINT ... ADD CONSTRAINT` migration
      - `deskhive/drizzle/migrations/meta/0004_snapshot.json` + `_journal.json` (auto)
      - `deskhive/src/db/queries/spaces.ts` — extend `createSpace` to accept optional `status` parameter
      - `deskhive/src/actions/space.ts` — add `publishSpaceAction`; update `createSpaceAction` to pass `'DRAFT'` for SPACE_OWNER callers
      - `deskhive/src/actions/space.test.ts` (new) — 4 unit tests for `publishSpaceAction`
      - `deskhive/src/app/(owner)/owner/spaces/page.tsx` — inline Draft badge in the name cell
      - `deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx` — Draft badge in the meta-strip + render `<PublishSpaceButton>` when status is DRAFT
      - `deskhive/src/app/(owner)/owner/spaces/[id]/publish-space-button.tsx` (new) — Client Component
      - `deskhive/scripts/seed.ts` — seed `owner-no-connect@deskhive.local`
      - `deskhive/tests/fixtures/auth-helpers.ts` — add `'owner-no-connect'` to ROLE_EMAIL, SEED_CREDENTIALS, AuthRole union
      - `deskhive/tests/e2e/publish-gating.spec.ts` (new) — 2 E2E tests
      - `_bmad-output/implementation-artifacts/sprint-status.yaml`
      - `_bmad-output/implementation-artifacts/9-2b-publish-gating.md` (this file)
      - Memory files in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
      - `deskhive/src/lib/stripe-service.ts` (Story 9-1's empty seam)
      - `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers) — `publishSpaceAction` reads from the DB row, never calls Stripe
      - `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/`
      - `deskhive/src/app/(owner)/owner/settings/*` (Story 9-2's onboarding UI)
      - `deskhive/src/app/api/stripe/webhook/route.ts` (Story 9-2's webhook handler)
      - `deskhive/scripts/stripe-ping.ts`
      - Better Auth config
      - Tailwind / proxy.ts / playwright.config.ts

14. **AC-14 (Single commit + memory + docs follow-up after BA greenlight).** Per the Story 5-1 → 9-2 established pattern:
    - All Story 9-2b changes land in a single commit on `main` titled `feat(stripe): Story 9-2b — publish gating`. (Note the `feat(stripe):` scope matches 9-1 + 9-2 commit style; the work is technically about spaces but the GATE is on Stripe Connect state, so the `stripe` scope is appropriate.)
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight + flips sprint-status from `review` → `done` after push (same pattern as 8-POLISH-1 / 9-1 / 9-2).
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).

15. **AC-15 (Stop bar — BA browser verification checklist).** All 8 points from BA Decisions §"Browser verification checklist" must pass before greenlight. Highlights:
    1. All unit tests pass — target **333** (329 baseline + 4 new). Note divergence from BA decision-doc's stated 327.
    2. All E2E tests pass — target **58** (56 baseline + 2 new). Restart `pnpm dev` first + re-run `pnpm db:seed` to land the new seed user.
    3. `pnpm typecheck` + `pnpm lint` clean.
    4. `pnpm build` — **39 routes unchanged** (publish-gating is UI-only on existing routes; no new pages, no new API routes).
    5. `git diff --stat` shows ONLY files in AC-13. Zero changes to `src/lib/stripe.ts`, `src/lib/payments/connect.ts`, `src/app/(owner)/owner/settings/*`, `src/app/api/stripe/webhook/route.ts`, email infrastructure.
    6. **Happy publish path (real walk):** sign in as `owner@deskhive.local` → `/owner/spaces/new` → create space "Test Draft" → land on `/owner/spaces` → see "Test Draft" with **Draft** badge → click the row → detail page → see **Publish space** button enabled → click Publish → toast confirms → DRAFT badge gone, Publish button gone → visit `/spaces` (public) → "Test Draft" appears in the public listing.
    7. **Gated publish path:** sign in as `owner-no-connect@deskhive.local` → `/owner/spaces/new` → create space "Gated Draft" → see Draft badge → click into detail page → Publish button visible but **disabled** with tooltip / link to `/owner/settings` → visit `/spaces` → "Gated Draft" does NOT appear.
    8. **Phase 1 regression:** existing seeded PUBLISHED spaces still appear in `/spaces`; `/admin/spaces/new` (BA's choice to spot-check) still auto-publishes; existing Guest browse + book flows unaffected.

## Tasks / Subtasks

- [x] **Task 0 — Prep + 9-2 audit + operator state check.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (329 expected) / `build` (39 routes expected) / `test:e2e` (56 expected, modulo the documented hazards).
  - Confirm Story 9-2 + its fix are at `done` on `main` (`git log --oneline` shows `0d384e0`, `8f230b2`).
  - Re-read [docs/design/9-2b-publish-gating-ba-decisions.md](docs/design/9-2b-publish-gating-ba-decisions.md) end-to-end.
  - Inspect [src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts) `listPublishedSpaces` + `getPublishedSpaceById` for Decision §6 verification (audit confirmed these already filter `status = 'PUBLISHED'`).
  - Read [src/actions/space.ts](deskhive/src/actions/space.ts) for the existing `createSpaceAction` + `editSpaceAction` shape; the new `publishSpaceAction` will sit alongside.
  - Read [src/app/(owner)/owner/spaces/page.tsx](deskhive/src/app/(owner)/owner/spaces/page.tsx) + [src/app/(owner)/owner/spaces/[id]/page.tsx](deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx) for the existing list/detail render shape — find the right insertion points for the Draft badge + Publish button.
  - Confirm seeded `owner@deskhive.local` still has the synthetic Connect row from Story 9-2's seed (the dev-story replay verification ended with the synthetic row restored). If not, run `pnpm db:seed` to re-establish.

- [x] **Task 1 — Schema + migration** (AC-1):
  - Edit [src/db/schema.ts](deskhive/src/db/schema.ts) `spacesTable` check constraint: add `'DRAFT'` to the IN clause.
  - Run `pnpm db:generate` → produces `drizzle/migrations/0004_<random_name>.sql`.
  - Inspect the generated SQL: should be a `DROP CONSTRAINT ... ADD CONSTRAINT ...` block, NO data changes.
  - Add the story-tag comment block at the top of `0004_*.sql` matching the `0003_numerous_stone_men.sql` convention.
  - Apply locally: `pnpm db:migrate`.

- [x] **Task 2 — Query helper extension** (AC-4):
  - Extend `createSpace` in [src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts) with the optional `status` parameter defaulting to `'PUBLISHED'`. Update the comment block to note the Story 9-2b extension.

- [x] **Task 3 — Server Action `publishSpaceAction`** (AC-2):
  - Add to [src/actions/space.ts](deskhive/src/actions/space.ts) following the locked 7-step behavior.
  - Returns `Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' | 'STRIPE_NOT_ACTIVE' | 'ALREADY_PUBLISHED' }>`.
  - Includes `revalidatePath('/owner/spaces')`, `revalidatePath(/owner/spaces/${spaceId})`, `revalidatePath('/')`, `revalidatePath(/spaces/${spaceId})` on success.

- [x] **Task 4 — Update `createSpaceAction` to pass DRAFT for SPACE_OWNER** (AC-4):
  - One-line change to the existing `createSpace(...)` call site in [src/actions/space.ts](deskhive/src/actions/space.ts) — pass the third positional argument.

- [x] **Task 5 — Detail page Publish button + Client Component** (AC-3, AC-6):
  - Create `deskhive/src/app/(owner)/owner/spaces/[id]/publish-space-button.tsx` (Client Component).
  - Edit [src/app/(owner)/owner/spaces/[id]/page.tsx](deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx):
    - Import `getConnectAccountByUserId` from `@/db/queries/stripe-connect`.
    - Call it in parallel with the existing `getSpaceByIdForOwner` (use `Promise.all`).
    - Compute `canPublish`.
    - Render `<PublishSpaceButton spaceId={...} canPublish={canPublish} />` conditional on `space.status === 'DRAFT'`.
    - Update the meta-strip to render the Draft badge when status is DRAFT (replacing `<strong>{space.status}</strong>`).

- [x] **Task 6 — List page Draft badge** (AC-5):
  - Edit [src/app/(owner)/owner/spaces/page.tsx](deskhive/src/app/(owner)/owner/spaces/page.tsx). Inline a conditional `<span className="badge badge-pending">Draft</span>` next to the space name when row's status is DRAFT.
  - **DO NOT add a per-row Publish button** (Decision §3 anti-pattern).

- [x] **Task 7 — Seed `owner-no-connect@deskhive.local`** (AC-8):
  - Edit [scripts/seed.ts](deskhive/scripts/seed.ts) following the existing `seedUser` pattern.
  - Run `pnpm db:seed` to verify idempotent insert + correct role assignment.
  - **DO NOT seed a Connect row, DO NOT seed any spaces** for this user.

- [x] **Task 8 — Playwright fixture for `owner-no-connect`** (AC-9):
  - Edit [tests/fixtures/auth-helpers.ts](deskhive/tests/fixtures/auth-helpers.ts):
    - Add `'owner-no-connect@deskhive.local': 'OwnerNoConnect1!'` to `SEED_CREDENTIALS`.
    - Add `'owner-no-connect': 'owner-no-connect@deskhive.local'` to `ROLE_EMAIL`.
    - Update the `AuthRole` type to include the new key.

- [x] **Task 9 — Unit tests for `publishSpaceAction`** (AC-10):
  - Create [src/actions/space.test.ts](deskhive/src/actions/space.test.ts) with the 4 cases from Decision §9 + AC-10.
  - Mock pattern: `vi.mock('@/db/client')` + `vi.mock('@/db/queries/stripe-connect')` + `vi.mock('@/lib/auth/config')` + `vi.mock('next/headers')` + `vi.mock('@/lib/mode')` + `vi.mock('next/cache')` (for `revalidatePath`).
  - Run `pnpm test src/actions/space.test.ts` → 4/4 green.

- [x] **Task 10 — E2E tests for publish-gating** (AC-11):
  - Create [tests/e2e/publish-gating.spec.ts](deskhive/tests/e2e/publish-gating.spec.ts) with the 2 cases from AC-11.
  - Run isolated: `pnpm test:e2e tests/e2e/publish-gating.spec.ts` → 2/2 green.

- [x] **Task 11 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — 333 expected.
  - `pnpm build` — 39 routes unchanged.
  - `pnpm test:e2e` — 58 expected (modulo the documented dev-server-reuse + mutation-discipline hazards from prior stories).

- [x] **Task 12 — `git diff` verification + manual smoke test** (AC-13, AC-15):
  - `git diff --stat` matches AC-13 file list. Zero entries in `src/lib/stripe*`, `src/lib/payments/*`, `src/app/(owner)/owner/settings/*`, `src/app/api/stripe/webhook/*`, email infrastructure.
  - Quick smoke test: `pnpm dev` running, sign in as seeded `owner@deskhive.local`, create a new space, verify Draft badge appears, click Publish, verify it flips to PUBLISHED, verify it shows up on `/spaces`.
  - **AC-15 §6–§8 (full BA browser walk including the gated-path with `owner-no-connect@deskhive.local` and the Phase 1 regression check)** is DEFERRED to BA's review pass per the precedent.

- [x] **Task 13 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-12, AC-14):
  - Extend `~/.claude/.../memory/reference_stripe_service_pattern.md` with the Story 9-2b section per AC-12.
  - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `9-2b-publish-gating: review`; update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–12 `[x]` (Task 12's BA-walk DEFERRED note stays); fill in Dev Agent Record.
  - Stage all files per AC-13.
  - Commit: `feat(stripe): Story 9-2b — publish gating`.
  - **Do NOT push.** Wait for BA browser-verification per Task 12 + AC-15 §6–§8 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + flip sprint-status to `done` (same pattern as 9-1 / 9-2 / 8-POLISH-1).

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **direct follow-up to Story 9-2** — operationalizes the `charges_enabled` / `payouts_enabled` flags 9-2 populates by gating space publication on them. Phase 2 PRD §4.6 FR-OWNER-3 directly.

After 9-2b lands at `review` and BA greenlights:

- Owners who haven't onboarded Stripe Connect can still create spaces (they accumulate as DRAFTs on their `/owner/spaces` page).
- The Publish button on the space detail page is the single gate — disabled until Connect is active, surfacing a clear "go finish onboarding" affordance.
- Once an owner completes Stripe Connect onboarding (Story 9-2), they return to their DRAFT spaces, click Publish on each, and those spaces start appearing in the public `/spaces` listing.
- Phase 1 seeded spaces and admin-created spaces continue to auto-publish — no regression to existing behavior.
- The DRAFT enum state + the `publishSpaceAction` shape become the template for any future "gated activation" patterns (e.g., Story 9-3's booking-creation gating, polish-backlog's space-suspension UI).

Feature scope (Story 9-2b only):
- ✅ `DRAFT` added to `spaces.status` enum check constraint via Drizzle migration `0004_*.sql`.
- ✅ `createSpace` query helper extended with optional `status` parameter (default unchanged: `'PUBLISHED'`).
- ✅ `createSpaceAction` updated to pass `'DRAFT'` when caller is SPACE_OWNER, `'PUBLISHED'` for SUPER_ADMIN.
- ✅ `publishSpaceAction` Server Action with 3-error-code typed return (`'NOT_FOUND' | 'STRIPE_NOT_ACTIVE' | 'ALREADY_PUBLISHED'`), 7-step locked behavior.
- ✅ `/owner/spaces` list page: inline Draft badge in the name cell (NO per-row Publish button).
- ✅ `/owner/spaces/[id]` detail page: Draft badge in meta-strip + new Client Component `<PublishSpaceButton>` rendered conditionally on `status === 'DRAFT'`.
- ✅ Seed update: `owner-no-connect@deskhive.local` (bounded second seed user).
- ✅ Playwright fixture: `'owner-no-connect'` role shorthand.
- ✅ 4 new unit tests (`publishSpaceAction` happy path + 3 error branches).
- ✅ 2 new E2E tests (happy publish path + gated publish path).
- ✅ Memory entry extension.

Out of scope (do NOT build):
- ❌ Stripe Connect onboarding — Story 9-2 (already shipped).
- ❌ Payment intents / booking-with-payment — Story 9-3.
- ❌ Payment capture/cancel on booking state transitions — Story 9-4.
- ❌ Generalized webhook dispatch — Story 9-5.
- ❌ Refund flow — Story 9-6.
- ❌ Payouts view — Story 9-7.
- ❌ Payment-event-driven emails — Story 8-4.
- ❌ `unpublishSpaceAction` (one-way DRAFT → PUBLISHED only in this story).
- ❌ Auto-publish on Connect completion (owner clicks Publish explicitly).
- ❌ Auto-unpublish if Connect later becomes inactive (booking-action layer concern, deferred).
- ❌ Admin-side DRAFT support — `/admin/spaces/new` continues to auto-publish.
- ❌ Per-row Publish button on `/owner/spaces` list (Decision §3 anti-pattern; detail page only).
- ❌ `published_at` timestamp column.
- ❌ Frontend Stripe SDK (`@stripe/stripe-js`) — Story 9-3.
- ❌ Modifications to `src/lib/stripe*`, `src/lib/payments/*`, `src/app/(owner)/owner/settings/*`, `src/app/api/stripe/webhook/*` — all are Story 9-2's surface, untouched.
- ❌ Modifications to email infrastructure — Theme C decoupled.
- ❌ Phase 2 PRD §4.5 cancel-interpretation — Story 9-4 / 9-6 territory.

### Key decisions baked into the spec

1. **DRAFT enum addition (vs. `published_at` timestamp).** Decision §1. The enum is the natural extension — Phase 1 already has `PUBLISHED | SUSPENDED`; adding `DRAFT` reuses the existing constraint mechanism without a parallel timestamp source of truth. The check-constraint-extension migration is minimal (one DDL statement).

2. **Application-level default for owner-created (vs. flipping the DB default).** Decision §4. The DB-level default stays `'PUBLISHED'`; the OWNER-side action explicitly passes `'DRAFT'`. Keeps admin-side and any future server-side seed inserts on the existing behavior — no spooky-action-at-a-distance.

3. **Publish button on the detail page only (BA-revised from the strawman's "both list + detail").** Decision §3, locked 2026-05-18. Three reasons:
   - List-row Publish is a footgun — owners with many draft spaces could mis-click on the wrong row, with no preview opportunity. Publish is one-way in this story (no `unpublishSpaceAction`).
   - Detail page acts as preview-before-publish — owner sees the full space content as the public listing will render it, then chooses.
   - Single surface = single source of truth for the disabled-state logic + future gating refinements (e.g., Story 9-3's "must have ≥1 active desk" check would live in one place, not two).

4. **`NOT_OWNER` dropped from the error-code union (BA-revised from the strawman's 4-code union).** Decision §2, locked 2026-05-18. Step 3 of the action behavior collapses owner-mismatch into `NOT_FOUND` for leak prevention (Story 7-5 pattern). With that, `NOT_OWNER` is structurally unreachable; the typed union shouldn't advertise codes the caller can never receive. Final union: `'NOT_FOUND' | 'STRIPE_NOT_ACTIVE' | 'ALREADY_PUBLISHED'`.

5. **Bounded second seed user `owner-no-connect@deskhive.local` (vs. programmatic delete-restore).** Decision §5. Mirrors Story 7-PREP-1's `guest@deskhive.local` precedent — bounded exception to the "no test users beyond minimal seed" principle, justified by the gated-path E2E test having no other automated coverage. Programmatic delete-restore between tests is brittle when tests run in parallel.

6. **`publishSpaceAction` consults the DB row, not Stripe directly.** The DB row is kept in sync by Story 9-2's `account.updated` webhook handler + the `refreshConnectStatusAction` polling on `/owner/settings/onboarding/return`. The publish-gating check is a pure DB read (`getConnectAccountByUserId`) — no Stripe SDK call from `publishSpaceAction`. This means `src/lib/payments/connect.ts` and the rest of Story 9-2's Stripe-touching code stay untouched by this story (Decision §8 anti-pattern: zero diff in `src/lib/payments/*`).

7. **Inline Draft badge JSX (vs. new `SpaceStatusBadge` component).** Decision §3's reference to "the existing SUSPENDED badge convention" was the dev-agent's expectation — but the audit found no pre-existing space-status badge component (Story 7-5 didn't introduce one). For a one-state badge in two places, an inline `<span className="badge badge-pending">Draft</span>` (matching the gold/yellow PENDING styling used by [StatusBadge](deskhive/src/components/status-badge.tsx)) is sufficient. If Story 9-3+ introduces multi-variant space-status badges, that's the right time to factor out `SpaceStatusBadge`. Documented in the Dev Agent Record.

### Test-count baseline divergence from the BA decisions doc

Decision §9 cites "323 baseline + 4 = 327" as the post-9-2b target. The dev-agent's audit shows the actual baseline is **329**:

- 312 (pre-9-2)
- + 16 from Story 9-2 (BA targeted +11; 5 bonus tests on auth/error paths shipped during dev-story)
- + 1 from the BA-walk-fix commit `0d384e0` (wrapped-throw-path test)
- = **329**

After 9-2b's +4: **target = 333**, not 327. This is the same pattern as the Story 9-1 BA-decision-doc's "~308 → 313–315" estimate vs. the actual 305 → 312 baseline. The BA decision docs use rough estimates; the dev-agent's actuals are authoritative. Documenting in Dev Agent Record.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` — add `9-2b-publish-gating: ready-for-dev` to Epic 9's section (after `9-2-stripe-connect-onboarding: done`). On move-to-review (Task 13), flip to `review`. On BA greenlight (post-push), flip to `done`.

### Recent commits (Epic 9 chain)

```
02a9548 docs: clean residual strawman markers in 9-2b doc
1f08150 docs: lock Story 9-2b BA decisions (publish gating)
8f230b2 chore: mark Story 9-2 done in sprint status
0d384e0 fix(stripe): wrap account.updated webhook handler in defensive try-catch
4cc46c2 docs: log E2E hygiene follow-up backlog item
ee3ab20 feat(stripe): Story 9-2 — Stripe Connect Express onboarding     ← Last Epic 9 feature commit
e6d4c0f docs: lock Story 9-2 BA decisions (Stripe Connect Express onboarding)
```

Story 9-2b is the **fourth Epic 9 feature commit** (after 9-1, 9-2, and 9-2's BA-walk fix). Subject: `feat(stripe): Story 9-2b — publish gating`.

### Forward-looking notes preserved

- **Phase 2 PRD §4.5 cancel-interpretation question** — memory `project_phase2_prd_4_5_cancel_interpretation.md` unchanged by 9-2b (no cancel/refund logic touched). Becomes load-bearing for **Story 9-4** (capture/cancel) and **Story 9-6** (refund). Re-confirm before authoring those decisions docs.
- **`owner-no-connect@deskhive.local` reusability** — the new seed user introduced in 9-2b is reusable by future stories that need a "Connect-incomplete owner" E2E target. Stories 9-3 / 9-4 / 9-6 likely have similar gated-path tests; they can reuse this fixture rather than seed more users.
- **`publishSpaceAction`'s NOT_FOUND-not-FORBIDDEN pattern** is the template for any future gating action on owner-scoped resources. Memory entry codifies the convention.

### References

- [Source: docs/design/9-2b-publish-gating-ba-decisions.md](docs/design/9-2b-publish-gating-ba-decisions.md) — locked 2026-05-18 (BA: Ikhtiyor Ziyayev), committed `1f08150` + `02a9548`. 10 decisions + browser verification checklist.
- [Source: docs/03-phase2-prd.md §4.6 FR-OWNER-3] — PRD origin for publish gating.
- [Source: deskhive/src/db/schema.ts](deskhive/src/db/schema.ts) — extend `spaces.status` check; do NOT touch the DB default.
- [Source: deskhive/src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts) — extend `createSpace`; verify `listPublishedSpaces` + `getPublishedSpaceById` (already filter `status = 'PUBLISHED'` per audit).
- [Source: deskhive/src/db/queries/stripe-connect.ts](deskhive/src/db/queries/stripe-connect.ts) — Story 9-2's helpers; `publishSpaceAction` calls `getConnectAccountByUserId`.
- [Source: deskhive/src/actions/space.ts](deskhive/src/actions/space.ts) — add `publishSpaceAction`; update `createSpaceAction` to pass DRAFT for SPACE_OWNER.
- [Source: deskhive/src/app/(owner)/owner/spaces/page.tsx](deskhive/src/app/(owner)/owner/spaces/page.tsx) — list page; add inline Draft badge.
- [Source: deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx](deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx) — detail page; add Draft badge in meta-strip + render `<PublishSpaceButton>` conditional.
- [Source: deskhive/src/lib/mode.ts](deskhive/src/lib/mode.ts) — `effectiveMode(session)` helper (Story 7-1); reused by `publishSpaceAction`.
- [Source: deskhive/src/lib/toast.ts](deskhive/src/lib/toast.ts) — `toastSuccess` / `toastError` for Publish-button feedback.
- Story 7-PREP-1 `authenticatedPage(role)` fixture — extended with `'owner-no-connect'` role.
- Dev-agent memory `reference_stripe_service_pattern.md` — extend with publish-gating section per AC-12.
- Dev-agent memory `project_phase2_prd_4_5_cancel_interpretation.md` — unchanged; forward-looking flag for 9-4 / 9-6.

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

- `pnpm db:migrate` applied `0004_fine_ronan.sql` cleanly (single DROP/ADD CONSTRAINT block; no data changes).
- `pnpm db:seed` idempotently created `owner-no-connect@deskhive.local` on first run; subsequent runs reported "already exists; seed is a no-op."
- `pnpm test src/actions/space.test.ts` — 5/5 green in isolation.
- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm test` — 334 passed + 1 skipped (`login-action.test.ts`).
- `pnpm build` — 40 routes (no new routes; UI-only changes on existing surfaces).
- `pnpm test:e2e tests/e2e/publish-gating.spec.ts` — 2/2 green in isolation.
- `pnpm test:e2e` (full suite) — 48 passed, 5 failed, 5 did not run. The 5 failures are the pre-existing documented hazards from Stories 7-PREP-1 (mutation-discipline cascade) + 8-POLISH-1 (dev-server-reuse): admin-applications, application-emails, become-a-host × 2, booking-emails. Unchanged set from prior dev-story runs.

### Completion Notes

- **Migration** `0004_fine_ronan.sql` — Drizzle auto-generated cleanly (single `DROP CONSTRAINT spaces_status_check ... ADD CONSTRAINT spaces_status_check ... CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUSPENDED'))` pair). Story-tag comment block added at top matching the `0003_numerous_stone_men.sql` convention. No data migration; existing rows stay in PUBLISHED.
- **Net unit tests: +5, target was +4 → 334 not 333.** Wrote 5 cases (4 from BA Decision §9 + a 2b variant "Connect row exists but `chargesEnabled=false`" that tests the boolean-flag branch separately from the row-missing branch). Same kind of bonus-tests-on-error-paths pattern as Story 9-2's +16-vs-+11.
- **Net E2E tests: +2 → 58 total.** Both pass in isolation; both pass in full-suite runs with the defensive-restore-before-click pattern (see hazard note below).
- **AC-7 verification passed unchanged.** `listPublishedSpaces` (line 47-52) and `getPublishedSpaceById` (line 78) already filter `eq(spacesTable.status, 'PUBLISHED')`. The create-story audit was correct; no code changes needed for AC-7.
- **Draft badge styling:** used the existing `badge badge-pending` class (gold/yellow) per AC-5's recommendation. No SpaceStatusBadge component factored out (Decision §7 in the Dev Notes section — single-state badge in two places, inline JSX is sufficient). Visual cohesion with the existing booking PENDING badge.
- **No cross-tenant test surprises.** The NOT_FOUND collapse mock was straightforward: `getSessionMock` returns owner-A; `getSpaceByIdMock` returns a space with `ownerId: 'user-owner-B'`; the action returns NOT_FOUND before any Connect lookup or DB write. Added a defensive assertion that NOT_OWNER doesn't surface on the wire (Decision §2 lock).
- **Build route count: 40 (story estimated 39).** Inspected the build output; the actual baseline before 9-2b was already 40 (including `/` + `/_not-found`). The story-doc's 39 estimate was conservative; we added zero new routes (UI changes on existing pages only).
- **E2E mode-cookie gotcha:** `publishSpaceAction` requires `effectiveMode === 'host'` per Decision §2 step 1. The `authenticatedPage` fixture mints the auth session cookie but does NOT set `deskhive_mode`. Without it, the action returns NOT_FOUND (per the collapse rule), no toast fires, and the test fails at the toast assertion. Added an `enableHostMode(page)` helper local to the spec that calls `page.context().addCookies(...)` to set `deskhive_mode=host`. Scoped to this spec; other /owner/* tests don't fire publish-gated actions so they don't need the cookie.
- **E2E parallelism race (new hazard, narrow):** the happy-path test races against `connect-onboarding.spec.ts` test #2 ("initial state") which deletes + restores the same `acct_seed_for_e2e_only` Connect row for `owner@deskhive.local`. Under `fullyParallel: true`, my beforeEach's restore can be undone in the race window before my publish click. Mitigated by re-calling `restoreOwnerConnectRow()` immediately before `getByRole('button', { name: /publish space/ }).click()` — narrows the race window to ~10ms. Passes consistently in the local suite. Family with the documented 8-POLISH-1 / 7-PREP-1 hazards; logged in the polish-backlog as a follow-up candidate.
- **`pnpm db:seed` idempotent for the new user.** First run created `owner-no-connect@deskhive.local`; subsequent runs no-op via the `seedUser`-existing-email check.
- **Public listing audit:** verified `/` (the public browse) is what `revalidatePath('/')` targets; there's no `/spaces` index route (the build confirms this — only `/spaces/[id]` for detail). The story's AC-11 happy-path text said "visit `/spaces`"; updated the E2E spec to navigate to `/` instead.
- **No `published_at` column, no `unpublishSpaceAction`, no Stripe SDK calls in `publishSpaceAction`** — all Decision §1/§2/§8 anti-patterns held.

### File List

**New:**
- `deskhive/drizzle/migrations/0004_fine_ronan.sql` (auto-generated by Drizzle + story-tag comment block)
- `deskhive/drizzle/migrations/meta/0004_snapshot.json` (auto)
- `deskhive/src/actions/space.test.ts` (5 unit tests for `publishSpaceAction`)
- `deskhive/src/app/(owner)/owner/spaces/[id]/publish-space-button.tsx` (Client Component)
- `deskhive/tests/e2e/publish-gating.spec.ts` (2 E2E tests + `enableHostMode` helper)

**Modified:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (Epic 9 row + last_updated parenthetical)
- `_bmad-output/implementation-artifacts/9-2b-publish-gating.md` (Status → review; tasks `[x]`; DAR filled in)
- `deskhive/drizzle/migrations/meta/_journal.json` (Drizzle journal entry for 0004)
- `deskhive/scripts/seed.ts` (+ `owner-no-connect@deskhive.local` seeded user; no Connect row, no spaces for this user)
- `deskhive/src/actions/space.ts` (added `publishSpaceAction`; `createSpaceAction` now passes `'DRAFT'` for SPACE_OWNER callers)
- `deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx` (Draft badge in meta-strip; new "Publish space" section with `<PublishSpaceButton>` conditional on `status === 'DRAFT'`)
- `deskhive/src/app/(owner)/owner/spaces/page.tsx` (inline Draft badge in the name cell)
- `deskhive/src/db/queries/spaces.ts` (`createSpace` accepts optional `status: 'PUBLISHED' | 'DRAFT'` parameter, defaulting to `'PUBLISHED'`)
- `deskhive/src/db/schema.ts` (spaces.status check constraint extended to include `'DRAFT'`; DB-level column default unchanged)
- `deskhive/tests/fixtures/auth-helpers.ts` (`'owner-no-connect'` role added to SEED_CREDENTIALS, ROLE_EMAIL, AuthRole union)

**Out-of-tree (memory):**
- `~/.claude/.../memory/reference_stripe_service_pattern.md` (extended with publish-gating section per AC-12)
- `~/.claude/.../memory/MEMORY.md` (one-liner refresh)

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-18 | Story drafted by `bmad-create-story` from locked BA decisions document (commits `1f08150` + `02a9548`). | (none) |
| _TBD_ | Story implemented; `spaces.status` enum extended to include `'DRAFT'` via migration `0004_<name>.sql`; `createSpace` query helper gets optional `status` param; `createSpaceAction` passes `'DRAFT'` for SPACE_OWNER; new `publishSpaceAction` with 3-error-code typed return + 7-step locked behavior; list page gets inline Draft badge (no per-row Publish button per Decision §3); detail page gets Draft badge + new Client Component `<PublishSpaceButton>` (`useTransition` + toast pattern from Story 9-2); seed gets `owner-no-connect@deskhive.local` (bounded second seed user per Decision §5); Playwright fixture extended; 4 new unit tests + 2 new E2E tests. Memory entry extended. Single commit per AC-14 — awaiting BA browser walk before push. | _TBD (filled by `docs:` follow-up after BA greenlight + push, same pattern as Stories 8-POLISH-1 + 9-1 + 9-2)_ |
