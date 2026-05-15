# Story 7-4: Super Admin Application Review UI — BA Decisions

**Story:** 7-4
**Epic:** 7 — Multi-Tenant (Space Owner Role)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Wednesday, May 13, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §8 Epic 7, Story 7-4

---

## Context

Story 7-2 added the `applications` table and three Server Actions: `createApplicationAction`, `approveApplicationAction`, `rejectApplicationAction`. Story 7-3 wired the Guest-facing side — Guests can submit applications via `/become-a-host`.

This story builds the **Super Admin review side** — the UI for an admin to see all applications, filter by status, review individual applications, and Approve or Reject them. After this ships, the application loop is closeable end-to-end through the UI: Guest submits → admin reviews → admin approves → Guest is promoted to SPACE_OWNER (the atomic role promotion from Story 7-2 Decision §3 fires).

Reuses Phase 1 admin patterns extensively (filter chips, sortable tables, status badges, admin sub-nav tabs from Story 5-2).

---

## Scope

**In scope:**
- New admin sub-nav tab: **Applications** (added to existing Spaces / Bookings / Guests tabs from Phase 1)
- New route: `/admin/applications` — list page with filter chips + sortable table
- New route: `/admin/applications/[id]` — detail page with read-only application view + Approve/Reject actions
- Reject confirmation modal with optional rejection reason textarea
- Updated seed script: creates 3-5 test applications across PENDING / APPROVED / REJECTED statuses
- Status badges: PENDING (amber) / APPROVED (green) / REJECTED (red) — extend existing `<StatusBadge>` component from Phase 1
- E2E test coverage: admin can filter, sort, approve, reject; non-admins cannot access these routes
- Memory entry codifying the admin review UI pattern
- After approve/reject: redirect back to `/admin/applications` with a toast confirmation

**Out of scope:**
- Editing approved/rejected applications (terminal states are immutable per Story 7-2 architecture)
- Bulk approve / bulk reject (Phase 3 or later — Phase 2 reviews are one-at-a-time)
- Application history view for the Guest user (not in this story; see Story 7-3 Decision §5)
- Sending emails on approve/reject (Epic 8 — notification stubs from Story 7-2 still no-op)
- Showing rejection reasons in the user-facing Guest UI (not in Phase 2)
- Search/text filter on applications (just status filter chips, like /admin/bookings)
- Pagination on the list page (Phase 2 expects small application volume; same call as /admin/bookings)
- Modifying Story 7-2 Server Actions (use as-is)
- Modifying Story 7-3 Guest-facing flow

---

## Decisions

### Decision 1: Admin sub-nav extension — add "Applications" tab

Phase 1's admin sub-nav (Story 5-2) has tabs: **Spaces / Bookings / Guests**. Story 7-4 adds a fourth tab: **Applications**.

Position: between Bookings and Guests, or after Guests — Amelia picks the order that flows best visually (likely between Bookings and Guests since "Applications" relates to user lifecycle similar to Guests).

The tab shows a count badge like the others (Phase 1 admin sub-nav shows `Bookings 14`, `Spaces 3`, etc.). The Applications tab should show PENDING count specifically (e.g., `Applications 3` meaning 3 awaiting review). This makes the admin aware of pending work at a glance.

**Decision:** badge counts PENDING applications only, not total. PENDING is the "needs attention" state.

### Decision 2: List page at `/admin/applications`

Layout follows Phase 1 admin pages exactly:

- Page title: "Applications"
- Subtitle: "Review and approve Space Owner applications."
- Filter chips (same pattern as `/admin/bookings` from Story 5-2):
  - **All** (total count)
  - **Pending** (PENDING count)
  - **Approved** (APPROVED count)
  - **Rejected** (REJECTED count)
- Sortable table columns:
  - **Submitted** (created_at, default sort: newest first, sortable)
  - **Applicant** (user's full_name + email, two lines like `/admin/bookings`)
  - **Business** (business_name)
  - **Status** (StatusBadge: PENDING amber / APPROVED green / REJECTED red)
  - **Reviewed** (reviewed_at if applicable, else "—")
  - **Action** (Review button → links to detail page)

Empty states:
- No applications at all: "No applications yet. Once Guests apply, they'll appear here."
- Filter shows zero results: "No {pending|approved|rejected} applications."

### Decision 3: Detail page at `/admin/applications/[id]`

A simpler page focused on review:

- Breadcrumb: Admin / Applications / [Applicant name]
- Page title: applicant's full name + email
- Application data displayed as read-only labeled fields:
  - Submitted (timestamp)
  - Full name
  - Email
  - Business name
  - Business address
  - Tax ID
  - Motivation (if provided, else "—")
- Status section (StatusBadge + reviewed_at + reviewed_by_user.email if reviewed)
- Rejection reason (if status=REJECTED): displayed as a labeled paragraph

Bottom of page — **Action buttons** (only visible when status=PENDING):
- **Approve** button (primary, indigo)
- **Reject** button (secondary, with a "destructive" treatment per Phase 1 patterns)

When status is already APPROVED or REJECTED:
- No action buttons
- Instead: a banner "This application has been {approved|rejected}. Decisions are final."

### Decision 4: Reject confirmation modal

When admin clicks **Reject** on a PENDING application, a confirmation modal appears:

- Title: "Reject application"
- Body: "This will reject {applicant_name}'s application. They can apply again later."
- Optional textarea: "Reason (optional)" — maxlength 500 chars
- Helper text: "The reason is for your records. The applicant won't see it directly in the app (they'll receive a notification email in a future release)."
- Two buttons: "Cancel" + "Reject application" (destructive)

When admin confirms:
- `rejectApplicationAction(applicationId, reason)` fires (Story 7-2 Server Action, no changes)
- On success: modal closes, redirect to `/admin/applications` with toast: "Application rejected."
- On error: error inline in the modal

### Decision 5: Approve confirmation — NO modal

Approval doesn't need a modal. It's a one-step action — admin reviews the application, clicks Approve, and we trust the click.

On Approve click:
- `approveApplicationAction(applicationId)` fires (Story 7-2 Server Action — performs atomic role promotion per Decision §3)
- On success: redirect to `/admin/applications` with toast: "Application approved. {applicant_name} is now a Space Owner."
- On error: inline error message above the button

**Reasoning for asymmetry:** Approval is the "positive" path; making admin click through a modal adds friction. Rejection is the "destructive" path with permanent consequences; the modal acts as a confirmation gate. Same pattern as `/admin/bookings` from Phase 1 (Confirm is one-click; Reject probably had a modal — Amelia confirms by inspecting the code).

### Decision 6: Toast copy — locked

After successful approve:
> "Application approved — {applicant_name} is now a Space Owner."

After successful reject:
> "Application rejected."

Both via Story 6-3's `src/lib/toast.ts` wrapper. Variant IDs: `TOAST_COPY.applicationApproved` and `TOAST_COPY.applicationRejected` (or similar — Amelia picks the constant names).

Toast appears on `/admin/applications` after redirect (not on the detail page that's being navigated away from). Same "destination toast" pattern as Story 6-3.

### Decision 7: Seed updates — test applications

Update the seed script to create test applications for verification:

- 2 PENDING applications (different users)
- 1 APPROVED application (one of the existing test users gets promoted to SPACE_OWNER)
- 1 REJECTED application (with a rejection reason)

**Implementation choices:**
- Create new test guest users specifically for these applications (e.g., `applicant1@deskhive.local`, `applicant2@deskhive.local`, etc.) so the existing seed users don't get polluted
- Or use existing test users — Amelia picks based on what's cleanest

The seed must be idempotent — re-running shouldn't create duplicate applications.

**Important:** the APPROVED seed application means the corresponding user.role flips to SPACE_OWNER. The seed needs to handle this (either set the user's role directly, OR call `approveApplicationAction`-equivalent logic in the seed). Don't break the atomic role promotion guarantee from Story 7-2 Decision §3 — if seeding bypasses the Server Action, document it.

### Decision 8: Role gating — Super Admin only

Both `/admin/applications` and `/admin/applications/[id]` are gated by SUPER_ADMIN role:

- Use the existing `requireRole('SUPER_ADMIN')` pattern from Phase 1 (Story 6-2's memory)
- Non-admin Guest → soft-redirect to `/` or wherever non-admins go for admin routes (Phase 1 has the pattern locked)
- SPACE_OWNER → same soft-redirect; SPACE_OWNERS don't see other people's applications

Server Actions are already gated per Story 7-2 Decision §6. The UI gating is defense-in-depth + correct UX (no flashing-then-redirecting).

### Decision 9: Status badge extension

Phase 1 has `<StatusBadge>` with variants. Story 7-4 adds three:
- `PENDING` — amber (matches existing pending bookings styling — Story 5-2)
- `APPROVED` — green (matches existing confirmed bookings)
- `REJECTED` — red (matches existing rejected bookings)

Don't introduce new colors. Reuse existing tokens. If Phase 1 already has these exact colors for PENDING/CONFIRMED/REJECTED on bookings, that's the source.

### Decision 10: Filter chip behavior

Same as `/admin/bookings`:
- Default selected: "All"
- Clicking a chip filters the table client-side (URL doesn't change — same UX pattern)
- Filter chip styling unchanged from Phase 1

### Decision 11: Sorting

The table is sortable by:
- **Submitted** (default, newest first)
- **Applicant** (alphabetical by full_name)
- **Status** (groups by status order: PENDING, APPROVED, REJECTED — useful when "All" is selected)

Same sorting pattern as `/admin/bookings`. Use the existing sortable column component.

### Decision 12: Memory entry

Amelia adds a memory file capturing:
- The Admin review UI pattern (list + detail + modal)
- The asymmetric approve/reject UX (no modal for approve, modal for reject) and the reasoning
- The PENDING-count-only badge pattern (not total count) for admin sub-nav tabs
- The seed test-applications pattern for verifying admin review flows

Suggested file name: `reference_admin_review_ui_pattern.md` or similar.

---

## Architectural anti-patterns forbidden

- **Do NOT** modify Story 7-2's Server Actions (`createApplicationAction`, `approveApplicationAction`, `rejectApplicationAction`). Use as-is.
- **Do NOT** modify Story 7-3's Guest-facing form or `/become-a-host` route.
- **Do NOT** add email-sending code. The notification stubs from Story 7-2 still no-op.
- **Do NOT** allow editing of approved/rejected applications. Terminal states are final.
- **Do NOT** add bulk action UI (bulk approve, bulk reject). One-at-a-time.
- **Do NOT** add search/text filter on the list page. Status chips only.
- **Do NOT** add pagination. Phase 2 expects small volume.
- **Do NOT** introduce new color tokens for status badges. Reuse existing.
- **Do NOT** allow non-Super-Admin access to these routes. Server-side role check + soft redirect.
- **Do NOT** introduce new dependencies. Reuse Phase 1 + 7-1/7-2/7-3 patterns.
- **Do NOT** show rejection reason in the user-facing UI. Admin-only data for now.
- **Do NOT** auto-confirm rejection clicks (the modal is required).
- **Do NOT** show approve/reject buttons on already-decided applications.

---

## Browser verification checklist

After Amelia completes the dev story:

### Setup
- Dev server running on `localhost:3000`
- Re-run seed (`pnpm db:seed`) to populate test applications
- Test credentials:
  - SUPER_ADMIN: `admin@deskhive.local`
  - SPACE_OWNER: `owner@deskhive.local` (should NOT see admin routes)
  - GUEST: `guest@deskhive.local` or `ihtiyor@mail.com` (should NOT see admin routes)

### Checks

1. **Login as admin** → click Admin → admin page renders. New "Applications" tab visible in sub-nav with PENDING count badge (e.g., "Applications 2").

2. **Click Applications tab** → lands on `/admin/applications`. Filter chips visible (All / Pending / Approved / Rejected) with counts. Table shows seeded applications.

3. **Filter to Pending** → table shows only PENDING applications. Count chip stays correct.

4. **Filter to Approved** → table shows only APPROVED applications.

5. **Filter to Rejected** → table shows only REJECTED applications with their rejection reason visible in the detail (verified in checks 11-12).

6. **Sort by Applicant** → table re-sorts alphabetically.

7. **Click "Review" on a PENDING application** → lands on detail page. All fields render correctly. Approve + Reject buttons visible at the bottom.

8. **Click Approve** → button triggers, redirect to `/admin/applications` with green toast "Application approved — [name] is now a Space Owner."

9. **DB verification (optional)** — check that `applications.status` = APPROVED, `users.role` for that applicant = SPACE_OWNER (atomic promotion from Story 7-2 Decision §3 worked).

10. **Verify role promotion** — log out, log in as the just-approved user. User-pill dropdown now shows "Switch to hosting" entry (Story 7-1's affordance). Mode-switching works.

11. **Log back in as admin** → click Review on a PENDING application → click Reject → modal appears with "Reject application" title, optional reason textarea, Cancel + "Reject application" buttons.

12. **Type a rejection reason** → click "Reject application" → modal closes, redirect to `/admin/applications` with toast "Application rejected." Status badge updates to REJECTED. Reviewed_at populated.

13. **Click into a REJECTED application** → detail page shows the rejection reason in a labeled section. NO Approve/Reject buttons (decision is final). Banner reads "This application has been rejected. Decisions are final."

14. **Click into an APPROVED application** → same pattern, banner says "approved". NO Approve/Reject buttons.

15. **Log out, log in as SPACE_OWNER** (`owner@deskhive.local`) → header shows Space Owner nav (no Admin link).

16. **Try direct nav to `/admin/applications` as SPACE_OWNER** → soft-redirect to `/` or wherever (same pattern as Story 6-2).

17. **Try direct nav as Guest** → same redirect.

18. **Try direct nav as unauthenticated** → redirect to `/login`.

19. **Phase 1 + 7-1 + 7-2 + 7-3 flows unchanged** — quick regression sweep:
    - Book a desk + toast (Story 6-3)
    - Admin booking confirm/reject still works (Story 5-2)
    - Existing admin Spaces / Bookings / Guests tabs work
    - Switch to hosting / traveling (Story 7-1)
    - Guest applies via `/become-a-host` (Story 7-3)

20. **No console errors** anywhere.

21. **All unit + E2E tests pass** — `pnpm test` + `pnpm test:e2e`. Note new test count.

22. **Footer reads `© 2026 DeskHive`** on `/admin/applications` and detail pages.

---

## Files likely touched

Estimate, not directive.

- `src/app/admin/applications/page.tsx` (new) — list page
- `src/app/admin/applications/[id]/page.tsx` (new) — detail page
- `src/app/admin/applications/_components/...` — list table, filter chips, reject modal
- `src/components/admin/admin-tabs.tsx` (or wherever the sub-nav is) — add Applications tab
- `src/components/status-badge.tsx` — extend with new variants (PENDING/APPROVED/REJECTED for applications)
- `src/lib/toast.ts` — add new toast copy constants
- `scripts/seed.ts` — add test applications
- `tests/e2e/admin-applications.spec.ts` (new) — E2E coverage
- `tests/unit/...` — extend tests if any new validation logic
- Memory file in `~/.claude/.../memory/` — new pattern entry

No changes to:
- Story 7-2 Server Actions
- Story 7-3 Guest-facing form
- `applications` table schema
- Better Auth configuration
- Existing Phase 1 admin tabs (Spaces / Bookings / Guests) functionality

---

## Memory note for Phase 2 continuation

This story closes the application review loop end-to-end. After 7-4 ships:

- A Guest can apply (Story 7-3)
- A Super Admin can review and approve/reject (Story 7-4)
- An approved Guest becomes a SPACE_OWNER (Story 7-2 atomic role promotion)
- The new SPACE_OWNER can switch to Host mode (Story 7-1)
- Host mode shows placeholder `/owner/*` pages (Story 7-1) until Story 7-5 builds real content

After Story 7-4, only **Story 7-5 (Owner dashboard + space management)** remains in Theme A.

Theme A completion enables Theme B (Payments) and Theme C (Email) to proceed in parallel.

---

**End of BA decisions document.**
