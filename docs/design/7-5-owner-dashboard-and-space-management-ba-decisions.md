# Story 7-5: Space Owner Dashboard + Space Management — BA Decisions

**Story:** 7-5
**Epic:** 7 — Multi-Tenant (Space Owner Role)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Wednesday, May 13, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §4.6 (FR-OWNER-1 through FR-OWNER-4) and §8 Epic 7, originally Story 7-6, renumbered to 7-5 after Story 7-1 absorbed the original 7-5 (mode-switching).

---

## Context

Story 7-1 stubbed three Host-mode routes with "Coming soon" placeholders: `/owner`, `/owner/spaces`, `/owner/bookings`. Stories 7-2, 7-3, and 7-4 closed the application loop end-to-end — a Guest can apply, an admin can approve, and the approved Guest becomes a SPACE_OWNER with "Switch to hosting" wired up.

This story replaces the placeholders with the real Host-mode surface — a Space Owner can now:
- See an overview of their hosting activity
- Create, edit, and manage their own spaces (and desks within them)
- See and act on bookings that fall on their spaces only

This is the last Theme A story. After it ships, Theme A is closed and Theme B (Payments, Epic 9) + Theme C (Email, Epic 8) can proceed in parallel.

**Reuses Phase 1 admin patterns extensively** — Makhbuba hasn't sent new Phase 2 host-mode designs yet, so 7-5 mirrors `/admin/spaces`, `/admin/spaces/[id]`, `/admin/spaces/new`, and `/admin/bookings` with an ownership filter. Refinements come later if Makhbuba proposes them.

---

## Scope

**In scope:**
- New route: `/owner` — dashboard with stat cards
- New route: `/owner/spaces` — list of spaces owned by the current Space Owner
- New route: `/owner/spaces/new` — create-space form
- New route: `/owner/spaces/[id]` — edit-space form, including desk CRUD (add desk, edit desk price/label, deactivate desk)
- New route: `/owner/bookings` — bookings on the current Space Owner's spaces only, with confirm/reject actions
- Updated booking confirm/reject Server Actions: extend the ownership check so an owner can confirm/reject bookings on their own spaces, while admins keep platform-wide access (single Server Action, scoped check inside)
- Updated space create/edit Server Actions: extend ownership check so an owner can only edit their own spaces; new spaces created by an owner are stamped with `owner_id = session.user.id`; admin-created spaces continue to have `owner_id = NULL` (or settable to a specific owner — see Decision 8)
- Role gating on all `/owner/*` routes: SPACE_OWNER only; everyone else soft-redirects (same pattern as Story 7-1)
- Seed script update: assign at least one seeded space to the seed SPACE_OWNER (`owner@deskhive.local`) and create a few seeded bookings on it, so verification has real data
- E2E test coverage: owner CRUDs a space, owner sees only own bookings, owner cannot access another owner's space, admin still sees everything
- Memory entry codifying the owner-scoped CRUD pattern

**Out of scope:**
- `/owner/payouts` page (Epic 9 — Stripe Connect)
- `/owner/settings` page (Epic 9 — Stripe Connect onboarding status)
- Stripe Connect onboarding gate on space publishing (Epic 9 — see Decision 4: 7-5 spaces auto-publish like Phase 1 admin spaces)
- Email notifications on booking confirm/reject by owner (Epic 8 — Phase 1 had no email here either; behavior unchanged)
- A "this month payouts" stat card on the dashboard (see Decision 2 — replaced with honest stats)
- Owner-initiated refunds (Epic 9, FR-REFUND-4 — the Server Action signature was deliberately deferred there)
- Image upload (Phase 1 uses image URL only; 7-5 keeps that)
- Multi-image gallery, amenities, working hours, etc. — anything not in the Phase 1 space schema
- Advanced analytics, charts, occupancy heatmaps (Phase 3 candidate per backlog)
- Backfilling existing Phase 1 seeded spaces with a permanent owner (still nullable; only the seed user's space gets an owner for testing)
- Changes to the public browse / space detail / booking flow
- Changes to `/admin/spaces`, `/admin/bookings`, `/admin/applications`, `/admin/guests` — admin pages continue to show everything platform-wide (see Decision 7)
- New space fields, new booking fields, new desk fields
- Bulk actions on either spaces or bookings
- Search/text filter on owner pages (chips + sort only, same as admin)
- Pagination (same call as admin pages — Phase 2 expects small volume)

---

## Decisions

### Decision 1: `/owner` dashboard — three stat cards, all honest

The dashboard shows three stat cards in a single row (responsive: stacks on narrow viewports). Layout mirrors a typical Phase 1 admin overview card pattern.

**Cards:**

1. **Active spaces** — count of spaces where `owner_id = session.user.id` (no status filter for now since all spaces auto-publish — see Decision 4)
2. **Pending bookings** — count of bookings on this owner's spaces with `status = 'PENDING'`
3. **Bookings this month** — count of bookings on this owner's spaces with `created_at >= start_of_current_month`, all statuses combined

Each card is a click-through:
- Active spaces → `/owner/spaces`
- Pending bookings → `/owner/bookings?filter=pending` (or however the filter chip pre-selection works — Amelia picks)
- Bookings this month → `/owner/bookings` (no filter)

**Below the cards:** a "Recent activity" section showing the 5 most recent bookings on this owner's spaces (newest first), each linking to the relevant booking row in `/owner/bookings`. Same compact list format Phase 1 uses elsewhere — applicant name, space name, status badge, created_at.

If no spaces yet: a single CTA card replaces all the stat cards — title "You haven't listed a space yet", body "Create your first space to start hosting.", primary button "Create space" → `/owner/spaces/new`. This is the empty state for a fresh-approved owner.

**Pushback on the original PRD spec:** the PRD §4.6 listed "this month payouts" as the third stat. I'm replacing it with "Bookings this month" because:
- Payouts come from Stripe Connect (Epic 9). Until that ships, a $0 payout card either lies (suggests the system is tracking, and there happened to be no payouts) or it's a confusing "Coming soon $0" stub.
- "Bookings this month" is honest, useful, and reads off the same data that `/owner/bookings` already needs to query.
- When Epic 9 ships, the payouts card can be added back as a fourth card, or replace this one then.

### Decision 2: `/owner/spaces` — owner-scoped list

Layout mirrors `/admin/spaces` from Phase 1, but filtered to `WHERE spaces.owner_id = session.user.id`.

- Page title: "My spaces"
- Subtitle: "Spaces you host on DeskHive."
- Top-right primary button: "New space" → `/owner/spaces/new`
- Sortable table columns (same components as `/admin/spaces`):
  - **Name** (sortable, alpha) — clicking the name navigates to `/owner/spaces/[id]`
  - **City**
  - **Desks** (count of active desks)
  - **Created** (created_at, sortable)
  - **Action** (Edit button → `/owner/spaces/[id]`)

**Empty state:** "You haven't listed a space yet. Create your first space to start hosting." + CTA button "Create space".

**No status filter chips** — all owner spaces are "published" in Phase 2 (see Decision 4). If/when drafts arrive in Epic 9, add chips then.

### Decision 3: `/owner/spaces/new` — create form, owner-stamped

Mirrors `/admin/spaces` create form from Phase 1 exactly — same fields (name, city, address, description, image URL), same validation, same `useActionState` pattern.

The only behavioral difference is that the Server Action stamps `owner_id = session.user.id` on the new space, instead of leaving it NULL like the admin-created case.

**Server Action signature:** the existing `createSpaceAction` (or whatever the Phase 1 name is) gets extended. If the caller is a SPACE_OWNER, the action sets `owner_id = caller.id`. If the caller is a SUPER_ADMIN, the action leaves `owner_id` as whatever Phase 1 currently sets (likely NULL — keeping admin behavior unchanged).

After successful create: redirect to `/owner/spaces/[new_id]` (the edit page) so the owner can immediately add desks, OR redirect to `/owner/spaces` with a toast. **Recommendation: redirect to `/owner/spaces/[new_id]`** — a freshly-created space with zero desks is useless, and pushing the owner straight into "now add desks" matches the natural next step.

Toast copy on landing: "Space created — now add a desk to make it bookable."

### Decision 4: All owner-created spaces auto-publish in Phase 2

The Phase 2 PRD §4.6 FR-OWNER-3 says "A Space Owner who has not completed Stripe Connect onboarding cannot publish a space. They can create draft spaces, but the Publish action is gated."

That gate ships in Epic 9 (Stripe Connect). For Story 7-5:

**Decision:** all owner-created spaces auto-publish, same as Phase 1 admin spaces. No draft/published distinction. No `is_published` column added in this story.

**Reasoning:**
- Phase 1 has no draft state — spaces are always visible on the public browse page once created
- Adding a draft state in 7-5 only to gate it in 9-2 means schema churn and UI churn across two stories for the same feature
- Epic 9 introduces the gate and (if needed) the draft state in one coherent change
- For Phase 2 demo: owner-created spaces appear on `/` (public browse) immediately after create — same as Phase 1

If Makhbuba's eventual designs require draft state earlier, revisit. For now, no.

### Decision 5: `/owner/spaces/[id]` — edit form, including desk CRUD

Mirrors `/admin/spaces/[id]` from Phase 1 exactly:
- Top section: editable space fields (name, city, address, description, image URL) with Save button
- Desks section below: list of desks with label + daily price (in dollars via `src/lib/money.ts`) + active/inactive toggle + Edit/Delete actions
- "Add desk" button → opens an inline form or modal (matches whatever Phase 1 admin does)
- All actions go through the existing Phase 1 desk Server Actions, extended with the same ownership check (see Decision 8)

**Server-side guard:** if the requested space's `owner_id !== session.user.id`, soft-redirect to `/owner/spaces` (don't 404, don't 500 — silent redirect, same pattern as Story 6-2 / 7-1).

**Breadcrumb:** `My spaces / [Space name]` — clicking "My spaces" returns to the list.

**No status changes here** — no Publish/Unpublish, no Archive. Phase 1 doesn't have those either.

### Decision 6: `/owner/bookings` — owner-scoped, confirm/reject wired

Mirrors `/admin/bookings` from Phase 1, with the data filtered to bookings where the booking's space has `owner_id = session.user.id`.

- Page title: "Bookings"
- Subtitle: "Bookings on your spaces."
- Filter chips: **All / Pending / Confirmed / Rejected / Cancelled** (same as `/admin/bookings`)
- Sortable table columns (same as `/admin/bookings`):
  - **Date** (booking date, sortable)
  - **Guest** (guest's full_name + email, two lines)
  - **Space** (space name)
  - **Desk** (desk label)
  - **Status** (StatusBadge)
  - **Action** (Confirm + Reject buttons inline for PENDING; nothing for terminal states — same pattern as admin)

**Confirm/Reject behavior:** same as `/admin/bookings` from Phase 1 — Confirm is one-click, Reject opens the modal (Phase 1's existing pattern, whatever it is). Reuses the existing Phase 1 booking confirm/reject Server Actions with the extended ownership check from Decision 8.

**Empty state:** "No bookings yet. Your spaces will show bookings here once Guests book them."

**No new toast copy needed** — Phase 1's existing confirm/reject toasts (from Story 6-3) apply. Same destination-toast pattern.

### Decision 7: Admin routes remain platform-wide and unchanged

Phase 2 PRD §4.6 FR-OWNER-2 says "the existing `/admin/*` routes remain for Super Admin only." Story 7-5 honors that:

- `/admin/spaces` continues to list ALL spaces platform-wide, regardless of `owner_id` (NULL or set)
- `/admin/bookings` continues to list ALL bookings platform-wide
- `/admin/applications` (Story 7-4) is unchanged
- `/admin/guests` is unchanged
- Admin can edit any space regardless of `owner_id` (Phase 1 behavior preserved)
- Admin can confirm/reject any booking regardless of which owner's space (Phase 1 behavior preserved)

**No new admin UI in this story.** No "filter by owner" chip on `/admin/spaces`, no "owner column" on `/admin/bookings`. Those are post-7-5 polish if needed.

The point: 7-5 adds owner-scoped surfaces; it does not subtract from or rescope admin surfaces.

### Decision 8: Ownership check lives in the Server Actions, not the route

**Security-critical decision.** When a SPACE_OWNER hits `/owner/spaces/[id]/edit` or clicks Confirm on a booking, the Server Action — not the route — is the authoritative gate.

Pattern:

```
// Inside the existing Server Action
const caller = await getSession()
if (!caller) redirectToLogin()

// Owner-scope path
if (caller.role === 'SPACE_OWNER') {
  // verify the target row belongs to this owner
  if (space.owner_id !== caller.id) return errorState('Not found')
}

// Admin path
if (caller.role === 'SUPER_ADMIN') {
  // no scope check — admin can edit any space
}

// Anyone else: rejected
```

**Why this matters:**
- Defense in depth. The `/owner/*` route guard blocks naive access, but a determined caller hitting the Server Action directly (POST with a forged form action) must still be rejected.
- Single source of truth — one Server Action per mutation, with a scope branch inside.
- No "owner-scoped action" vs. "admin-scoped action" duplication.

This rule applies to all mutating actions used in `/owner/*`:
- `editSpaceAction` (and create)
- `addDeskAction`, `editDeskAction`, `deactivateDeskAction` (or whatever Phase 1 names them)
- `confirmBookingAction`, `rejectBookingAction`

**Unit tests must cover the "owner tries to edit another owner's space" rejection path explicitly.** This is the critical Phase 2 security regression risk.

### Decision 9: Role gating on `/owner/*` routes — soft redirect

Same pattern as Story 7-1. All `/owner/*` routes:

- Unauthenticated → redirect to `/login`
- Authenticated as GUEST → soft redirect to `/` (Browse spaces)
- Authenticated as SUPER_ADMIN → soft redirect to `/admin`
- Authenticated as SPACE_OWNER → render the page

No 403 page, no error toast. Silent redirect matches the rest of the app.

**Note on mode:** the route guard checks role, not mode. A SPACE_OWNER in Guest mode who navigates directly to `/owner/spaces` should still see the page (and presumably the header is showing the Guest variant, which is fine — the URL implies intent). Don't force-flip the mode cookie based on URL.

### Decision 10: Seed updates — give the test owner real data

Update the seed script so verification has meaningful data:

- The existing `owner@deskhive.local` seed user (created in Story 7-1) is assigned ownership of one of the existing seeded spaces (`UPDATE spaces SET owner_id = owner_user_id WHERE id = first_seeded_space_id`)
- Create 2-3 seeded bookings on that owner's space from Guest seed users — mix of PENDING / CONFIRMED / REJECTED statuses
- The other existing seeded spaces stay with `owner_id = NULL` (Phase 1 admin-owned, untouched)

Seed must remain idempotent — re-running shouldn't duplicate the ownership assignment or the bookings.

This ensures:
- BA verification can log in as `owner@deskhive.local` and immediately see real data (1 space, 2-3 bookings) rather than empty states
- The empty-state paths are still verifiable by logging in as the just-approved test user (`ihtiyor@mail.com` from Story 7-4) who has zero spaces and zero bookings — perfect empty-state test subject

### Decision 11: Header nav links remain Story 7-1's three items

Story 7-1's Host-mode nav has three items: **Dashboard / My spaces / Bookings** linking to `/owner` / `/owner/spaces` / `/owner/bookings`.

**No new nav items in this story.** No Payouts, no Settings — those come with Epic 9.

The header table from Story 7-1 Decision 4 remains correct. 7-5 just makes the destinations real instead of placeholders.

### Decision 12: Memory entry

Amelia adds a memory file capturing:

- The owner-scoped CRUD pattern (route guard for naive access + Server Action ownership check for defense-in-depth)
- The "single Server Action with role-branched scope check" approach to avoid action duplication
- The Phase 2 decision to auto-publish owner spaces (no draft state until Epic 9)
- The stat-card honesty principle: don't show $0 payouts when payouts don't exist yet — show a real metric instead
- The dashboard empty-state pattern (CTA card replaces stat cards when zero spaces)

Suggested file name: `reference_owner_scoped_crud_pattern.md` (Amelia picks per the naming convention).

---

## Architectural anti-patterns forbidden

- **Do NOT** create owner-specific duplicate Server Actions (e.g., `ownerConfirmBookingAction` next to `confirmBookingAction`). Extend the existing actions with role-branched scope checks per Decision 8.
- **Do NOT** rely on the route guard alone for ownership. The Server Action MUST re-verify (Decision 8).
- **Do NOT** add a draft/published state on spaces. All owner-created spaces auto-publish (Decision 4).
- **Do NOT** add a "this month payouts" stat card. Use real metrics instead (Decision 1).
- **Do NOT** create `/owner/payouts` or `/owner/settings` routes. Those are Epic 9.
- **Do NOT** add email-sending code anywhere. Epic 8.
- **Do NOT** add Stripe Connect onboarding gate, status badge, or any payment-related UI. Epic 9.
- **Do NOT** modify `/admin/spaces`, `/admin/bookings`, `/admin/applications`, or `/admin/guests` behavior. Admin pages remain platform-wide and unchanged (Decision 7).
- **Do NOT** backfill `owner_id` on all Phase 1 seeded spaces. Only the one space the seed owner gets assigned (Decision 10).
- **Do NOT** add new fields to the spaces or bookings table.
- **Do NOT** introduce pagination, search, or bulk actions — same call as admin pages.
- **Do NOT** introduce new status colors or badge variants. Reuse existing.
- **Do NOT** add Phase 3 features (analytics, occupancy heatmaps, multi-image galleries).
- **Do NOT** allow a SPACE_OWNER to edit a space they don't own — server returns error state, UI doesn't even show the affordance.
- **Do NOT** allow a SPACE_OWNER to confirm/reject bookings on spaces they don't own.
- **Do NOT** modify Better Auth, the applications table, the role enum, or the mode-switching cookie.
- **Do NOT** force-flip the mode cookie based on URL navigation (Decision 9 note).

---

## Browser verification checklist

After Amelia completes the dev story:

### Setup
- Dev server running on `localhost:3000`
- Re-run `pnpm db:migrate` (no schema changes expected; if migration adds anything, verify it's just data, not schema)
- Re-run `pnpm db:seed` to populate the test owner's space + bookings
- Test credentials:
  - SUPER_ADMIN: `admin@deskhive.local`
  - SPACE_OWNER with data: `owner@deskhive.local` (1 space + 2-3 bookings seeded)
  - SPACE_OWNER without data: `ihtiyor@mail.com` (just-approved in Story 7-4, zero spaces — empty state test subject)
  - GUEST: `guest@deskhive.local`

### Checks

1. **Log in as `owner@deskhive.local`** → header shows Guest mode by default. Click user-pill → "Switch to hosting" appears. Click it.

2. **Lands in Host mode** — header now shows Dashboard / My spaces / Bookings. URL is wherever you were (or `/` — doesn't matter).

3. **Click Dashboard** → lands on `/owner`. Three stat cards visible:
   - Active spaces (should read "1")
   - Pending bookings (matches seed — probably 1 or 2)
   - Bookings this month (matches seed)
4. **Recent activity section** below stat cards shows the 5 most recent bookings (or fewer if seed has fewer). Each row clickable.

5. **Click "Active spaces" stat card** → navigates to `/owner/spaces`. The seeded space appears in the table. No other spaces visible (the other Phase 1 seeded spaces with `owner_id = NULL` are NOT shown).

6. **Click "New space"** → lands on `/owner/spaces/new`. Form fields render (name, city, address, description, image URL).

7. **Fill in form** with test data (e.g., name "Test Owner Space", city "Tashkent", any address, any description, valid image URL) → click Save.

8. **Redirects to `/owner/spaces/[new_id]`** (edit page of the newly created space). Toast appears: "Space created — now add a desk to make it bookable."

9. **Add a desk** — fill in label "Desk-1" and daily price ($25.00 in dollars), Save. Desk appears in the desks list.

10. **Edit the desk price** — change price to $30.00 → save. New price reflected.

11. **Click "My spaces"** in header → back on `/owner/spaces`. Now two spaces visible (original seed + just-created).

12. **Click Bookings in header** → lands on `/owner/bookings`. Filter chips: All / Pending / Confirmed / Rejected / Cancelled. Bookings table shows only bookings on this owner's spaces (NOT the new space's bookings since it has none, but the original seeded space's bookings appear).

13. **Click Pending filter chip** → only PENDING bookings remain.

14. **Click Confirm on a PENDING booking** → status flips to CONFIRMED in the table. Toast appears (Phase 1 toast copy — whatever it was).

15. **Click Reject on another PENDING booking** → Phase 1's reject modal opens. Confirm rejection → status flips to REJECTED. Toast appears.

16. **DB spot check (optional)** — `SELECT id, status FROM bookings WHERE space_id = <test_owner_space_id>` confirms the status changes happened on the right rows.

17. **Switch to traveling** → header reverts to Guest mode. Click user-pill → "Switch to hosting" available again (sticky-affordance is intact).

18. **Log out. Log in as `ihtiyor@mail.com`** (just-approved owner from Story 7-4, zero spaces).

19. **Switch to hosting** → lands or stays on whatever page. Click Dashboard.

20. **Empty-state dashboard** — `/owner` shows the single CTA card "You haven't listed a space yet" + "Create space" button. No stat cards.

21. **Click "Create space"** → lands on `/owner/spaces/new`. Fill it in, save, redirected to edit page with toast.

22. **Bookings page empty state** — `/owner/bookings` shows "No bookings yet. Your spaces will show bookings here once Guests book them."

23. **Cross-owner isolation check** — while still logged in as `ihtiyor@mail.com`, manually navigate to `/owner/spaces/[id_of_owner@deskhive.local_space]` in the address bar.

24. **Soft redirect to `/owner/spaces`** — the route guard / Server Action ownership check rejects. No data leak.

25. **Log out. Log in as `admin@deskhive.local`** → admin nav (no Switch to hosting, no `/owner/*` access).

26. **Try direct nav to `/owner`** as admin → soft redirect to `/admin` (or `/` — confirm Decision 9 behavior).

27. **Try direct nav to `/owner/spaces` as admin** → same soft redirect.

28. **`/admin/spaces` still shows ALL spaces** — including the just-created owner spaces and the Phase 1 NULL-owner spaces. Admin platform-wide view unchanged.

29. **`/admin/bookings` still shows ALL bookings** — admin platform-wide view unchanged.

30. **Admin can edit one of the owner's spaces** — open `/admin/spaces/[owner_space_id]`, change description, save. Edit works (admin has full access).

31. **Log out. Log in as Guest** (`guest@deskhive.local`).

32. **Try `/owner` as Guest** → soft redirect to `/`. No `/owner/*` access.

33. **Public browse `/`** — the owner-created space appears on the public browse page (auto-published per Decision 4).

34. **Click into the owner-created space** → space detail page renders. Desks show. Guest can book a desk (Phase 1 flow unchanged).

35. **Phase 1 + 7-1 + 7-2 + 7-3 + 7-4 flows unchanged** — quick regression sweep:
    - Guest registers → defaults to GUEST role
    - Guest applies via `/become-a-host` (Story 7-3)
    - Admin reviews application at `/admin/applications` (Story 7-4)
    - Admin approves → applicant becomes SPACE_OWNER, "Switch to hosting" appears
    - Admin booking confirm/reject still works (Story 5-2)
    - Booking toast on space detail (Story 6-3)
    - Desk price input in dollars (Story 6-1)

36. **No console errors** anywhere.

37. **All unit + E2E tests pass** — `pnpm test` + `pnpm test:e2e`. Note new test count.

38. **Footer reads `© 2026 DeskHive`** on every `/owner/*` page.

---

## Files likely touched

Estimate, not directive.

- `src/app/(owner)/owner/page.tsx` — replace placeholder with real dashboard
- `src/app/(owner)/owner/spaces/page.tsx` — replace placeholder with real list
- `src/app/(owner)/owner/spaces/new/page.tsx` (new) — create-space form
- `src/app/(owner)/owner/spaces/[id]/page.tsx` (new) — edit-space form + desk CRUD
- `src/app/(owner)/owner/bookings/page.tsx` — replace placeholder with real list
- `src/app/(owner)/owner/_components/...` — dashboard stat cards, recent activity, etc.
- `src/actions/spaces.ts` (or equivalent Phase 1 file) — extend create/edit actions with ownership scope branch
- `src/actions/desks.ts` (or equivalent) — extend desk CRUD actions with ownership scope branch
- `src/actions/bookings.ts` (or equivalent) — extend confirm/reject actions with ownership scope branch
- `src/lib/spaces.ts` or service module — owner-scoped queries (`getSpacesByOwnerId`, `getBookingsForOwner`, etc.)
- `src/lib/toast.ts` — add new toast copy constants (e.g., `TOAST_COPY.spaceCreated`)
- `scripts/seed.ts` — assign one space to `owner@deskhive.local` + create bookings on it
- `tests/e2e/owner-spaces.spec.ts` (new) — E2E for owner CRUD
- `tests/e2e/owner-bookings.spec.ts` (new) — E2E for owner-scoped bookings
- `tests/unit/...` — extend action tests with ownership-rejection cases (CRITICAL — Decision 8)
- Memory file in `~/.claude/.../memory/` — owner-scoped CRUD pattern

No changes to:
- `applications` table or its Server Actions (Stories 7-2 / 7-4)
- Mode-switching cookie or `switchModeAction` (Story 7-1)
- Better Auth configuration
- `/admin/*` routes' behavior or queries
- The public browse / space detail / booking flow (Phase 1)
- Schema (no new columns expected — `owner_id` already exists from Story 7-1)

---

## Memory note for Phase 2 continuation

This story closes Theme A. After 7-5 ships:

- A Guest can apply → admin reviews → approved Guest becomes SPACE_OWNER → SPACE_OWNER can create + manage spaces, see + act on bookings on their spaces, end-to-end through the UI
- All of Phase 1's admin functionality remains intact for SUPER_ADMIN
- The platform now has the structural shape of a real marketplace — multiple owners, scoped data access, defense-in-depth ownership checks

**Theme B (Payments, Epic 9) can now proceed** — it has owners to pay out to.

**Theme C (Email, Epic 8) can now proceed** — application emails (Story 8-2) replace the stubs from Story 7-2; booking/payment emails (Stories 8-3 / 8-4) build on Phase 1 + Theme B.

Recommended next prep work before Theme C:
- The authenticated E2E test infrastructure (Better Auth fixtures for Playwright) flagged in 7-1/7-2/7-3/7-4 close-outs. Theme C email tests will need this.

---

**End of BA decisions document.**
