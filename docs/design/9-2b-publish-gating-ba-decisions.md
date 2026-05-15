# Story 9-2b: Publish Gating — BA Decisions (STRAWMAN)

**Story:** 9-2b
**Epic:** 9 — Payments (Theme B)
**Phase:** 2
**Type:** Schema migration + Server Action + owner-side UI
**Author:** Ikhtiyor Ziyayev, Business Analyst (strawman drafted by dev-agent — review/edit/lock)
**Date drafted:** 2026-05-15
**Status:** STRAWMAN — NOT LOCKED. BA review pending.
**Source:** Phase 2 PRD §4.6 FR-OWNER-3 + carved out of the 9-2 strawman during BA scope review on 2026-05-15

**Companion / dependency:** **Story 9-2 — Stripe Connect Express Onboarding** (separate decisions doc at [docs/design/9-2-stripe-connect-onboarding-ba-decisions.md](docs/design/9-2-stripe-connect-onboarding-ba-decisions.md)). **9-2b CANNOT dispatch until 9-2 has shipped** — this story depends on 9-2's `stripe_connect_accounts` table existing, on the seeded `owner@deskhive.local` having a synthetic Connect row, and on Connect-state booleans being populated.

> **⚠️ STRAWMAN.** Every decision below is the dev-agent's recommendation with rationale. BA reviews each, edits where she disagrees, and removes the STRAWMAN banner before dispatching `*create-story 9-2b with path docs/design/9-2b-publish-gating-ba-decisions.md` (AFTER 9-2 ships).

---

## Context

Phase 2 PRD §4.6 FR-OWNER-3: *"A Space Owner who has not completed Stripe Connect onboarding cannot publish a space. They can create draft spaces, but the 'Publish' action is gated."*

Story 9-2 (Stripe Connect onboarding) populates the DB with each owner's `charges_enabled` / `payouts_enabled` flags. Story 9-2b operationalizes those flags by:

1. Introducing a `DRAFT` state to the existing `spaces.status` enum (Phase 1 had `PUBLISHED | SUSPENDED`).
2. Making owner-created spaces default to `DRAFT` instead of auto-publishing.
3. Adding a `publishSpaceAction` Server Action that flips DRAFT → PUBLISHED, gated on the owner's Connect state being active.
4. Surfacing a "Publish" button + DRAFT badge in `/owner/spaces` and `/owner/spaces/[id]`.
5. Adding a bounded second seed user `owner-no-connect@deskhive.local` so the gated-path E2E test has a stable target.

After 9-2b ships:
- A space owner who has NOT completed Connect onboarding can create spaces, but those spaces stay in DRAFT and don't appear publicly. Clicking Publish surfaces a clear "complete Stripe onboarding first" error.
- A space owner who HAS completed Connect onboarding can flip their DRAFT spaces to PUBLISHED with a click.
- Phase 1's existing seeded spaces (created admin-side, default `PUBLISHED`) are unaffected — the new DRAFT state is application-level for owner-created spaces only.

---

## Scope

**In scope:**

- Drizzle schema: extend `spaces.status` check constraint to allow `'DRAFT'` (in addition to existing `'PUBLISHED'` and `'SUSPENDED'`). Migration auto-generated.
- New Server Action `publishSpaceAction({ spaceId })` — flips DRAFT → PUBLISHED. Gated on owner's `charges_enabled && payouts_enabled` from the `stripe_connect_accounts` row (introduced by 9-2). Returns typed error codes.
- Owner-side space-creation flow (`/owner/spaces/new` from Story 7-5) explicitly inserts new spaces with `status: 'DRAFT'`. The DB-level default stays `'PUBLISHED'` (Phase 1 admin-created spaces and seeded data continue auto-publishing).
- `/owner/spaces` list UI: DRAFT badge on unpublished spaces; Publish button per row (or per detail page — Decision §3 picks).
- `/owner/spaces/[id]` detail UI: same DRAFT badge + Publish action.
- Public-listing query (`src/db/queries/spaces.ts`) — VERIFY it already filters `status = 'PUBLISHED'`. If not (i.e., if it filters with `status != 'SUSPENDED'`), update to be inclusive-list (`status = 'PUBLISHED'`) so DRAFT spaces stay private.
- Seed update — add `owner-no-connect@deskhive.local` user + NO `stripe_connect_accounts` row (so they're in the "not yet onboarded" state by construction).
- Playwright fixture (`tests/fixtures/auth-helpers.ts`) — add `owner-no-connect` role shorthand.
- Unit tests for `publishSpaceAction` (4 cases per Decision §9).
- E2E tests for publish-gating (2 cases per Decision §7).
- Memory entry: extend `reference_stripe_service_pattern.md` with the publish-gating section.

**Out of scope:**

- ❌ Stripe Connect onboarding itself — Story 9-2 (must ship first).
- ❌ Payment intents, payment flow — Story 9-3.
- ❌ Auto-unpublish if an owner's Connect later becomes inactive — see Decision §1 anti-pattern. This is an ops concern; 9-3+ booking actions surface "host can't currently take bookings" at the booking-creation layer, not via space status.
- ❌ Toggle-back-to-DRAFT (un-publish) — no `unpublishSpaceAction` in this story. Owners can only flip DRAFT → PUBLISHED. Going back to DRAFT is a future polish if needed.
- ❌ Suspending an owner's spaces from the admin side (`/admin/spaces`) — uses the existing `SUSPENDED` status; no changes from 9-2b.
- ❌ Modifying any email infrastructure or webhook-event handling beyond what 9-2 ships.
- ❌ Notifying owners by email when their first space is publishable (i.e., when Connect onboarding completes AND they have a draft space) — out of Phase 2 scope; polish backlog.
- ❌ Phase 2 PRD §4.5 cancel-interpretation — Story 9-4 / 9-6 territory.

---

## Decisions

### Decision 1: Publish gating — `DRAFT` enum addition + application-level default for owner-created

**Rationale:** The existing `spaces.status` enum is `PUBLISHED | SUSPENDED` (DB default `PUBLISHED`). Phase 1 assumed all spaces were publicly bookable on creation. Phase 2 PRD §4.6 FR-OWNER-3 introduces the draft concept.

Three options considered:
- **(A) Add `DRAFT` to the enum + application-level default of `DRAFT` for owner-created spaces.** DB default stays `PUBLISHED` for Phase 1 + admin-created.
- **(B) Separate `published_at TIMESTAMPTZ` column on spaces.** NULL = draft.
- **(C) Defer publish-gating entirely** (no schema change in 9-2b; just gate the booking-creation path in 9-3 by checking the owner's Connect state).

**Locked:** Option (A). DRAFT enum addition.

**Why over (B):** the existing enum semantics (PUBLISHED / SUSPENDED) are state-as-string. Adding a third state is the natural extension. A timestamp column for "draftness" would conflict with the existing enum (two sources of truth for visibility) and require a separate constraint.

**Why over (C):** PRD §4.6 FR-OWNER-3 explicitly carves out the draft concept. Deferring it pushes the visibility problem downstream — bookings against half-built spaces is worse UX than a clear DRAFT badge.

**Locked schema change:**

```sql
ALTER TABLE spaces
  DROP CONSTRAINT spaces_status_check,
  ADD CONSTRAINT spaces_status_check
    CHECK (status IN ('DRAFT','PUBLISHED','SUSPENDED'));

-- Existing PUBLISHED rows stay PUBLISHED. No data migration needed.
-- DB column default 'PUBLISHED' STAYS unchanged. Owner-side insertion
-- code explicitly passes 'DRAFT' (see Decision §4); admin-side and
-- seeded inserts continue to rely on the default.
```

**Drizzle schema diff in `src/db/schema.ts`:**

```typescript
// Before (Story 7-1 / Phase 1):
(t) => [check('spaces_status_check', sql`${t.status} IN ('PUBLISHED', 'SUSPENDED')`)],

// After (Story 9-2b):
(t) => [check('spaces_status_check', sql`${t.status} IN ('DRAFT', 'PUBLISHED', 'SUSPENDED')`)],
```

**Why this matters:**
- Spaces with `status = 'DRAFT'` do NOT appear in the public `/spaces` listing (Decision §6 verifies the existing filter).
- The owner-side `/owner/spaces` listing shows ALL their spaces with a DRAFT badge on unpublished ones.
- `publishSpaceAction` (Decision §2) is the only path that flips DRAFT → PUBLISHED.

**Anti-pattern forbidden:**
- Do NOT add a `published_at TIMESTAMPTZ` column — the enum is sufficient.
- Do NOT auto-publish on Connect onboarding completion — the owner must take the explicit Publish action.
- Do NOT auto-unpublish if an owner's Connect later becomes inactive — that's an ops concern; freeze of bookings happens at the booking-action layer in 9-3+, not via space status.
- Do NOT change the DB-level column default from `'PUBLISHED'` to `'DRAFT'` — would silently change behavior for admin-created spaces. Owner-side code explicitly passes DRAFT.

**Open question for BA:** is the DRAFT-as-enum-state approach right, vs. `published_at` timestamp vs. deferring? **Strawman recommends DRAFT enum addition.**

---

### Decision 2: `publishSpaceAction` Server Action

Locked name + signature:

```typescript
// Flips a space from DRAFT → PUBLISHED. Gated on owner.charges_enabled &&
// owner.payouts_enabled.
async function publishSpaceAction(input: { spaceId: string }): Promise<
  | { ok: true }
  | {
      ok: false;
      error: 'NOT_FOUND' | 'NOT_OWNER' | 'STRIPE_NOT_ACTIVE' | 'ALREADY_PUBLISHED';
    }
>;
```

**Locked behavior:**
1. Verify caller's session, route through `effectiveMode(session)` from Story 7-1, confirm caller is a SPACE_OWNER in host mode.
2. Look up the space by `spaceId`. If not found → return `{ ok: false, error: 'NOT_FOUND' }`. (NOT_FOUND, not FORBIDDEN — cross-tenant leak prevention from Story 7-5.)
3. Verify `space.ownerId === session.user.id`. If not → `NOT_FOUND` (same leak-prevention rule).
4. If `space.status === 'PUBLISHED'` → `{ ok: false, error: 'ALREADY_PUBLISHED' }`.
5. If `space.status === 'SUSPENDED'` → `{ ok: false, error: 'NOT_FOUND' }` (admins suspended this; owner shouldn't see the publish path).
6. Look up the owner's `stripe_connect_accounts` row by `userId`. If missing OR `charges_enabled !== true` OR `payouts_enabled !== true` → `{ ok: false, error: 'STRIPE_NOT_ACTIVE' }`.
7. Update `space.status = 'PUBLISHED'`, `updatedAt = NOW()`. Return `{ ok: true }`.

**Why this matters:**
- The four error codes are typed (union) so the UI can map each to its own copy.
- The `NOT_FOUND` reuse for cross-tenant access AND for SUSPENDED status keeps the leak surface tight (Story 7-5 Decision §6 pattern).
- The transaction is single-table (just `spaces`) — no `db.transaction()` needed; a regular `db.update(...)` is sufficient.

**Anti-pattern forbidden:**
- Do NOT add a `markSpaceUnpublishedAction` / `unpublishSpaceAction` — out of scope for 9-2b (one-way DRAFT → PUBLISHED only).
- Do NOT silently auto-onboard the owner from inside `publishSpaceAction` — gating returns an error; the UI directs the owner to `/owner/settings`.
- Do NOT bypass the cross-tenant `NOT_FOUND`-not-`FORBIDDEN` rule — owner-A trying to publish owner-B's space MUST get `NOT_FOUND`.

---

### Decision 3: UI surface — where the Publish button lives

**Rationale:** Two reasonable patterns:
- **(A) Per-row Publish button in `/owner/spaces`** — owners see all their drafts in a list, click Publish on the row.
- **(B) Per-detail Publish button in `/owner/spaces/[id]`** — owners click into a draft to see its details, click Publish there.
- **(C) Both.**

**Locked:** Option (C). Both surfaces show the Publish button.

**Why:**
- List view is the natural "publish-this-draft" affordance for owners who know which space they want to publish.
- Detail view is the natural "publish-this-after-editing-it" affordance for owners mid-edit.
- The two buttons share the same Server Action; UI cost is two button placements.

**Locked button behavior:**
- Visible ONLY when `space.status === 'DRAFT'`.
- Disabled state when the owner's Connect is incomplete — tooltip: "Complete Stripe onboarding to publish this space." Link to `/owner/settings`.
- Clicking submits the form posting to `publishSpaceAction`. On success: toast "Space published" + the row's badge transitions from DRAFT to PUBLISHED + the Publish button disappears. On `STRIPE_NOT_ACTIVE` error: toast "Complete Stripe onboarding before publishing" + link to `/owner/settings`.

**DRAFT badge:**
- Both list + detail surfaces show a `DRAFT` chip/badge next to the space name when status is DRAFT.
- Color/style matches existing `SUSPENDED` badge convention (Story 7-5 likely established this; verify in `src/components/`).

**Anti-pattern forbidden:**
- Do NOT show the Publish button on PUBLISHED or SUSPENDED spaces.
- Do NOT hide draft spaces from the owner's own listing — they need to see + manage them.
- Do NOT auto-disable the button purely client-side based on a Connect-state prop — server-side validation in `publishSpaceAction` is authoritative; the client-side disable is a UX nicety, not security.

---

### Decision 4: Application-level default for owner-created spaces

**Rationale:** Three options for making new owner-created spaces default to DRAFT:
- **(A) Change the DB column default to `'DRAFT'`** + Phase 1 admin-created spaces continue to explicitly pass `'PUBLISHED'`.
- **(B) Keep DB default `'PUBLISHED'`** + owner-side space-creation flow (`/owner/spaces/new` from Story 7-5) explicitly passes `status: 'DRAFT'`. Admin-side continues to rely on the default.
- **(C) Branch on caller role at insert time** — same code path determines status by checking `session.user.role`.

**Locked:** Option (B). Keep DB default; owner-side flow explicitly passes `'DRAFT'`.

**Why over (A):** changing the DB default would silently affect admin-created spaces and any future server-side seed inserts — too much spooky-action-at-a-distance.

**Why over (C):** branching by role inside an insert helper conflates ownership concerns with creation concerns. Cleaner: each entry point (admin route, owner route) decides its own status.

**Locked code change in `src/app/(owner)/owner/spaces/new/page.tsx` (or the corresponding Server Action that handles the form submit):**

```typescript
// Before (Story 7-5):
await db.insert(spacesTable).values({
  name, city, addressLine, description, primaryImageUrl,
  ownerId: session.user.id,
});  // status defaults to 'PUBLISHED' via the DB column default

// After (Story 9-2b):
await db.insert(spacesTable).values({
  name, city, addressLine, description, primaryImageUrl,
  ownerId: session.user.id,
  status: 'DRAFT',  // owner-side spaces start as draft per FR-OWNER-3
});
```

**Why this matters:** keeping Phase 1 / admin-side behavior unchanged is the lower-risk path. The PRD doesn't require admin-created spaces to start as DRAFT.

**Anti-pattern forbidden:**
- Do NOT change the DB column default.
- Do NOT add owner-vs-admin branching inside a shared insert helper — separate entry points, separate explicit values.

---

### Decision 5: `owner-no-connect@deskhive.local` bounded seed user

**Rationale:** The gated-path E2E test (Decision §7 test #2) needs a stable owner who is in SPACE_OWNER role + host mode but has NO `stripe_connect_accounts` row (or has a row with all flags = false). The seeded `owner@deskhive.local` has a synthetic complete-Connect row (Story 9-2 Decision §8), so it can't satisfy this test.

Three options:
- **(A) Add a second seeded owner user** `owner-no-connect@deskhive.local` with the SPACE_OWNER role but no Connect row.
- **(B) Programmatically delete `owner@deskhive.local`'s Connect row at test setup + restore in teardown.** Same pattern Decision §9 in 9-2 uses for the initial-state test.
- **(C) Use an unauthenticated path that triggers the same error code.** Nope — `publishSpaceAction` requires SPACE_OWNER auth.

**Locked:** Option (A). Bounded seed exception (mirrors Story 7-PREP-1's `guest@deskhive.local` precedent).

**Why over (B):** programmatic-delete-and-restore between tests is brittle when tests run in parallel + corrupts shared state. A dedicated seeded user is cleaner.

**Why this is a "bounded exception":** the project's general principle is "no test users beyond the minimal seed" (Story 7-PREP-1 AC-2). Story 7-PREP-1 itself opened the door to bounded exceptions when justified by paying-down-test-debt. 9-2b's gated-path test is exactly that — without the new user, the gated path has no automated coverage at all.

**Implementation:**

```typescript
// scripts/seed.ts — additive block, idempotent
const ownerNoConnectEmail = 'owner-no-connect@deskhive.local';
const ownerNoConnectPassword = 'OwnerNoConnect1!';
// ... use the same auth.api.signUpEmail pattern as the existing owner@ seed
// ... assign role SPACE_OWNER
// ... DO NOT create a stripe_connect_accounts row for this user
console.log(`Seeded ${ownerNoConnectEmail} (no Connect row; for publish-gating E2E).`);
```

**Playwright fixture:**

```typescript
// tests/fixtures/auth-helpers.ts — add to the ROLE_EMAIL map
const ROLE_EMAIL = {
  guest: 'guest@deskhive.local',
  owner: 'owner@deskhive.local',
  'owner-no-connect': 'owner-no-connect@deskhive.local',  // NEW
  admin: 'admin@deskhive.local',
  // ...
};
```

**Anti-pattern forbidden:**
- Do NOT skip this seed user and rely on programmatic state mutation (Option B).
- Do NOT give `owner-no-connect@deskhive.local` an existing space — they should create one mid-test so the test exercises the full create-then-attempt-publish flow.

**Open question for BA:** is the bounded-seed-exception acceptable here, mirroring 7-PREP-1? **Strawman recommends YES.**

---

### Decision 6: Public-listing query — verify (and possibly update) status filter

**Rationale:** The public `/spaces` listing query must filter out DRAFT spaces. Story 7-1's schema added the status column with check constraint `PUBLISHED | SUSPENDED` — the listing query likely already filters explicitly. With DRAFT introduced, three possible existing behaviors:
- **(A) Query filters `status = 'PUBLISHED'`** — already correct; DRAFT auto-excluded.
- **(B) Query filters `status != 'SUSPENDED'`** — needs updating to `status = 'PUBLISHED'` so DRAFT is also excluded.
- **(C) Query has no status filter** — needs adding `status = 'PUBLISHED'`. (Unlikely but verify.)

**Locked behavior:** the dev-agent inspects `src/db/queries/spaces.ts` (or wherever the public listing is defined) and ensures the filter is `status = 'PUBLISHED'`. If it's not, update.

**Why this matters:** if DRAFT spaces accidentally appeared in the public listing, the entire publish-gating feature would be useless.

**Anti-pattern forbidden:**
- Do NOT trust that the filter is already `status = 'PUBLISHED'` without reading the code.
- Do NOT add per-call status filters — fix at the query-helper level so all call sites benefit.

---

### Decision 7: E2E coverage strategy — publish-gating (2 tests)

**Locked E2E scope (2 tests):**

1. **Happy publish path** — `owner@deskhive.local` (with synthetic complete-Connect row from 9-2) navigates to `/owner/spaces/new`, creates a space → space appears in `/owner/spaces` with DRAFT badge → owner clicks Publish → toast confirms → space transitions to PUBLISHED → DRAFT badge disappears → Publish button disappears.

2. **Gated publish path** — `owner-no-connect@deskhive.local` (no Connect row, per Decision §5) navigates to `/owner/spaces/new`, creates a space → space appears with DRAFT badge → owner clicks Publish → error toast surfaces `STRIPE_NOT_ACTIVE` text + link to `/owner/settings` → space stays in DRAFT.

**E2E test file:** `tests/e2e/publish-gating.spec.ts` (new). Single `test.describe` block; no need for `test.describe.serial` since the two tests use different seeded owners.

**Out of scope for E2E:**
- The `NOT_FOUND` cross-tenant case (covered as a unit test).
- The `ALREADY_PUBLISHED` case (covered as a unit test).
- The `SUSPENDED` case (covered as a unit test).

**Anti-pattern forbidden:**
- Do NOT skip the gated-path test — it's the only proof that the Connect-state check actually fires.
- Do NOT seed a pre-existing DRAFT space for `owner-no-connect@deskhive.local`; the test exercises the full create-then-publish flow.

---

### Decision 8: Files likely touched

Estimate, not directive.

**Modified files:**
- `deskhive/src/db/schema.ts` — extend `spaces.status` check constraint to add `'DRAFT'`. NO new tables.
- `deskhive/drizzle/<timestamp>_spaces_status_draft.sql` — auto-generated migration (constraint-only change).
- `deskhive/src/actions/space.ts` — add `publishSpaceAction`. (Or new dedicated file `src/actions/publish-space.ts` if `space.ts` is already crowded — dev-agent picks.)
- `deskhive/src/app/(owner)/owner/spaces/new/page.tsx` — owner-created space inserts with `status: 'DRAFT'` explicitly.
- `deskhive/src/app/(owner)/owner/spaces/page.tsx` — DRAFT badge + Publish button per row.
- `deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx` — same.
- `deskhive/src/db/queries/spaces.ts` — verify and (if needed) update public-listing status filter (Decision §6).
- `deskhive/scripts/seed.ts` — add `owner-no-connect@deskhive.local` (Decision §5).
- `deskhive/tests/fixtures/auth-helpers.ts` — add `owner-no-connect` role shorthand (Decision §5).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 9-2b status entry under Epic 9.
- `_bmad-output/implementation-artifacts/9-2b-publish-gating.md` — story file.
- Memory: `reference_stripe_service_pattern.md` (extend with publish-gating section).

**New files:**
- `deskhive/tests/e2e/publish-gating.spec.ts` — 2 E2E tests per Decision §7.
- (No new Server Action file unless dev-agent splits `publishSpaceAction` out.)
- (No new query helper file unless dev-agent extracts the Connect-state-check.)

**Zero changes to:**
- `deskhive/src/lib/stripe.ts` (Story 9-1's singleton).
- `deskhive/src/lib/stripe-service.ts` (the empty seam).
- `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers — `publishSpaceAction` consults the DB directly, not Stripe).
- `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/` (Theme C decoupled).
- `deskhive/src/app/(owner)/owner/settings/*` (Story 9-2's onboarding UI).
- `deskhive/src/app/api/stripe/webhook/route.ts` (Story 9-2's webhook).
- `deskhive/scripts/stripe-ping.ts`.
- Better Auth config.
- Tailwind / proxy.ts.

---

### Decision 9: Test coverage

**Unit tests** (target: 4 new):

1. `publishSpaceAction` happy path — owner with `charges_enabled && payouts_enabled` → DRAFT → PUBLISHED.
2. `publishSpaceAction` `STRIPE_NOT_ACTIVE` — owner without complete Connect → returns error.
3. `publishSpaceAction` cross-tenant `NOT_FOUND` — owner A tries to publish owner B's space → returns NOT_FOUND.
4. `publishSpaceAction` `ALREADY_PUBLISHED` — space already PUBLISHED → returns ALREADY_PUBLISHED.

(The `SUSPENDED` path falls under `NOT_FOUND` per Decision §2's leak-prevention rule; covered by test #3's logic, not a separate test.)

**E2E tests** (target: 2 new per Decision §7).

**Target unit test count after this story:** 323 (baseline at end of 9-2) + 4 = **327**.

**Target E2E test count after this story:** 56 (baseline at end of 9-2) + 2 = **58**.

**Target build routes after this story:** 39 (unchanged from 9-2 — no new routes; only UI updates to existing owner-side pages).

---

### Decision 10: Memory file extension

Extend `reference_stripe_service_pattern.md` with a new section under the existing Connect-onboarding content:

- DRAFT enum addition (Decision §1).
- Application-level vs. DB-level default split (Decision §4).
- `publishSpaceAction` shape + four-error-code discriminated union (Decision §2).
- Cross-tenant `NOT_FOUND`-not-`FORBIDDEN` reuse (cross-references Story 7-5's pattern).
- Bounded `owner-no-connect@deskhive.local` seed user (Decision §5) — note as second precedent after Story 7-PREP-1's `guest@deskhive.local`.
- Forward-reference: Story 9-3's booking-creation path will likely add a similar Connect-state-active check at the booking-create boundary (not at the space-publish boundary).

**No new memory file** — extend `reference_stripe_service_pattern.md`.

---

## Architectural anti-patterns forbidden (rollup)

- Do NOT add a `published_at` timestamp column (Decision §1).
- Do NOT change the DB column default from `'PUBLISHED'` to `'DRAFT'` (Decision §1, §4).
- Do NOT auto-publish on Connect onboarding completion (Decision §1).
- Do NOT auto-unpublish if Connect later becomes inactive (Decision §1).
- Do NOT add an `unpublishSpaceAction` (Decision §2).
- Do NOT bypass cross-tenant `NOT_FOUND` for unauthorized space access (Decision §2).
- Do NOT show the Publish button on non-DRAFT spaces (Decision §3).
- Do NOT branch on caller role inside a shared insert helper (Decision §4).
- Do NOT skip the bounded second seed user (Decision §5).
- Do NOT trust the public-listing status filter without reading it first (Decision §6).
- Do NOT skip the gated-path E2E test (Decision §7).

---

## Browser verification checklist (preliminary — BA finalizes after lock)

**Setup:**
- Story 9-2 has shipped and is at `done` on `main`.
- `pnpm db:seed` has run after pulling 9-2b (creates `owner-no-connect@deskhive.local`).
- `owner@deskhive.local` still has the synthetic Connect row from 9-2's seed (verifies idempotent re-seed).

**Checks (8 points, refined post-lock):**

1. All unit tests pass — target 327.
2. All E2E tests pass — target 58.
3. Typecheck + lint clean.
4. `pnpm build` — 39 routes (unchanged from 9-2).
5. `git diff --stat` shows ONLY files in Decision §8. Zero changes to `src/lib/stripe.ts`, `src/lib/payments/connect.ts`, `src/app/(owner)/owner/settings/*`, `src/app/api/stripe/webhook/route.ts`, email infrastructure.
6. **Happy publish path:** sign in as `owner@deskhive.local` → `/owner/spaces/new` → create space "Test Draft" → land on `/owner/spaces` → see "Test Draft" with DRAFT badge → click Publish → toast confirms → DRAFT badge gone, Publish button gone → space appears in public `/spaces` listing.
7. **Gated publish path:** sign in as `owner-no-connect@deskhive.local` → `/owner/spaces/new` → create space "Gated Draft" → see DRAFT badge → click Publish → toast says "Complete Stripe onboarding before publishing" with link to `/owner/settings` → space STILL has DRAFT badge → space does NOT appear in public `/spaces` listing.
8. **Phase 1 regression:** existing seeded PUBLISHED spaces still appear in `/spaces`; admin-created spaces from `/admin/spaces/new` (if BA tests this path) still auto-publish.

---

## Memory note for Phase 2 continuation

After 9-2b ships:
- Epic 9 progress: 3 of 7+ stories shipped (9-1, 9-2, 9-2b).
- Phase 2 overall: ~14 of ~18 stories shipped.
- **Next dispatch: Story 9-3** (Booking flow with payment intents). Will install `@stripe/stripe-js` for the browser side + redirect through Stripe Checkout. Story 9-3's booking-creation path likely adds its own "owner's Connect must be active to receive bookings" gate at the booking-create boundary (paralleling 9-2b's space-publish gate).

**Dependencies cleared by 9-2b:**
- Publish gating works end-to-end.
- The DRAFT enum state exists for any future story that needs it.
- The bounded `owner-no-connect@deskhive.local` seed user can be reused by Stories 9-3 / 9-4 / 9-6 for gated-path E2E testing.

**Open seams 9-2b leaves for later stories:**
- Story 9-3 introduces the booking-with-payment-intent flow + likely its own Connect-state gate.
- Story 9-4 wires payment capture/cancel.
- Story 9-5 generalizes the webhook dispatch.
- Story 9-6 wires refund.
- Story 9-7 surfaces payouts.
- Story 8-4 wires payment-event emails.

---

## STRAWMAN review checklist (for BA — delete before lock)

- [ ] Decision §1 — `DRAFT` enum addition (vs. `published_at` timestamp vs. deferring publish-gating)?
- [ ] Decision §3 — Publish button on BOTH list + detail (vs. one or the other)?
- [ ] Decision §4 — keep DB default `'PUBLISHED'` + owner-side flow passes `'DRAFT'` explicitly (vs. flipping the DB default)?
- [ ] Decision §5 — `owner-no-connect@deskhive.local` as bounded seed exception (vs. programmatic delete-restore)?
- [ ] Decision §6 — does the existing public-listing query already filter `status = 'PUBLISHED'`? Dev-agent will verify during dev-story; BA may want to pre-check.
- [ ] Decision §9 — 4 unit tests + 2 E2E feels right for this scope? Could trim if BA wants leaner.
- [ ] Any decisions to remove entirely?
- [ ] Any decisions to add that I missed?
- [ ] Confirm: 9-2b does not modify ANY file that 9-2 modifies (clean boundary)?

When all checks are resolved + edits made, delete this section, delete the "STRAWMAN — NOT LOCKED" banner at the top, and dispatch `*create-story 9-2b with path docs/design/9-2b-publish-gating-ba-decisions.md` — but ONLY AFTER Story 9-2 has shipped and is at `done` on `main`.

---

**End of strawman BA decisions document.**
