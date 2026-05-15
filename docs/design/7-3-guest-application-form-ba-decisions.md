# Story 7-3: Guest Application Form + Entry Point — BA Decisions

**Story:** 7-3
**Epic:** 7 — Multi-Tenant (Space Owner Role)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Wednesday, May 13, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §8 Epic 7, Story 7-3

---

## Context

Story 7-1 established the role infrastructure (`SPACE_OWNER` role, mode switching). Story 7-2 added the data layer (`applications` table + Server Actions: `createApplicationAction`, `approveApplicationAction`, `rejectApplicationAction`).

This story is the **Guest-facing UI layer** — the form a regular user fills out to become a Space Owner. After this ships, a Guest can submit an application through the browser without needing direct DB writes or seed scripts.

The admin review UI (Story 7-4) and the owner dashboard (Story 7-5) come after this story.

**Important framing note:** this story uses existing Phase 1 design patterns (form styles, card patterns, button styles, dropdown patterns) rather than waiting for new designs from Makhbuba. If she has specific design refinements for `/become-a-host` after seeing it, those can be polished in a follow-up. The structural skeleton is built with established tokens.

---

## Scope

**In scope:**
- New route: `/become-a-host` — landing page with value propositions + application form
- New user-pill dropdown entry: "Become a Space Owner" — visible only for Guests with no PENDING application
- The form itself: fields per BA Decision §3 below, validates client-side AND server-side via `createApplicationAction`
- Pre-fill the form's `full_name` and `email` from the authenticated session (read-only display) — these aren't form inputs since they come from `users` table per Story 7-2 Decision §1
- "Pending state" handling: if user already has a PENDING application, the page shows status + read-only summary instead of the form
- Success state: on form submit success → toast via Story 6-3 wrapper + redirect to `/my-bookings`
- Error handling: form-level errors (validation failures, `PENDING_APPLICATION_EXISTS`, `ALREADY_SPACE_OWNER`, etc.) rendered inline using `useActionState` pattern
- E2E tests: at minimum, "Guest submits valid application → success toast → redirect" and "Guest with pending application sees pending state instead of form"
- Unit tests for any new pure-function helpers introduced (validation schema test count)

**Out of scope:**
- Admin review UI (Story 7-4)
- Owner dashboard (Story 7-5)
- Email sending on submission (Epic 8 — notification stub from Story 7-2 still no-ops)
- Editing or withdrawing a submitted application (not in Phase 2 scope)
- Re-application after rejection — handled by existing logic (user can apply again because PENDING-uniqueness allows REJECTED → new application). No special UI flow for "you were rejected, here's why" — see Decision §5.
- Hero images, illustrations, or marketing imagery on `/become-a-host` — defer to a polish pass if Makhbuba wants them
- Multi-step form / wizard — single-page form
- Custom validation per country for Tax ID format — free text per Story 7-2 Decision §1
- Application history page ("see all my past applications") — out of Phase 2 scope
- SUPER_ADMIN seeing "Become a Space Owner" — admins can't apply per Story 7-2 Decision §6

---

## Decisions

### Decision 1: Route + page structure

New route at `/become-a-host`. The page has two states based on the user's current state:

**State A — User can apply (Guest, no pending application):**
- Page header: "Become a Space Owner"
- Subheader: "Earn from unused desks in your coworking space"
- Value propositions section (3-4 cards): "No long-term contracts", "15% platform fee", "Get paid via Stripe", "You control bookings"
- "What's next" section: numbered list explaining the application → review → approval flow (1-2 days for review)
- The application form (Decision §3)
- Submit button

**State B — User already has a PENDING application:**
- Page header: "Application under review"
- Subheader: showing submission date
- Read-only summary of what they submitted
- Copy: "We'll let you know via email when the review is complete. Reviews typically take 1-2 business days."
- No form, no submit button
- Subtle "Need to update something? Contact support" line (no real action, just informational — support contact is out of scope)

**State C — User is already a SPACE_OWNER:**
- Page header: "You're already a Space Owner"
- Copy: "You can manage your spaces from the [Dashboard]."
- Link to `/owner` (works once Story 7-5 ships; for now placeholder from Story 7-1)
- No form

**State D — User is SUPER_ADMIN:**
- Page header: "Admins can't apply to host"
- Copy: explanation that admins manage the platform, can't list their own spaces
- No form

**State E — User is not logged in:**
- Redirect to `/login?redirect=/become-a-host` (per existing Phase 1 auth-redirect pattern)

The page is a Server Component (per Phase 1 default). It reads the session, queries application state, and renders the appropriate state. The form itself is a Client Component (form state, validation, submit).

### Decision 2: Entry point — user-pill dropdown

Add a new entry to the user-pill dropdown in the header. Conditions for visibility:

- Only when user role is `GUEST` (not SPACE_OWNER, not SUPER_ADMIN)
- Only when user has NO PENDING application (we don't want to show "Become a Space Owner" if they've already applied and are waiting)

If user has a PENDING application, the entry instead shows "Application pending" (visible cue that something is in progress). Clicking it goes to `/become-a-host` which then renders State B.

**Wait — let me reconsider.** Adding conditional text complicates the dropdown UI. Cleaner approach:

**Final decision:** The dropdown entry text is always "Become a Space Owner" for any Guest user. Clicking it goes to `/become-a-host`. The destination page handles the state branching. The entry is hidden for SPACE_OWNER and SUPER_ADMIN.

This is simpler and follows the same pattern as "My bookings" (always shown for Guest, the destination page handles the "no bookings yet" empty state).

### Decision 3: Form fields

Per Story 7-2 Decision §1, the application table has these user-input fields:

| Field | Input type | Validation | Notes |
|---|---|---|---|
| Business name | Single-line text | Required, 2–200 chars | "Acme Coworking" |
| Business address | Multi-line textarea | Required, 10–500 chars | Multi-line allowed |
| Tax ID | Single-line text | Required, 2–50 chars | Free text — no format validation |
| Motivation | Multi-line textarea | Optional, up to 1000 chars | "Why do you want to host?" |

The form also displays (read-only, not input):
- Full name (from session)
- Email (from session)

Display these read-only fields above the inputs in a "Your details" subsection so the user sees what info is being submitted with the application. They can't edit them on this form (account settings would be a separate feature).

Validation: use the same validation library/pattern as Phase 1 forms (likely Zod, but Amelia confirms). Schema lives in `src/lib/applications.ts` (the service module from Story 7-2) so it's shared between client and server.

### Decision 4: Submit flow + states

When user clicks Submit:

1. Client-side: validation runs. If errors, show inline error messages per field. No submission.
2. Client-side: button disabled + shows "Submitting..." while in flight (use `useFormStatus` per BA decision §6 of Story 7-2 — this is exactly the case it covers).
3. Server: `createApplicationAction(formData)` runs.
4. On success: redirect to `/my-bookings` + toast "Application submitted. We'll email you when it's reviewed." (via Story 6-3 wrapper).
5. On error (typed states from Story 7-2):
   - `PENDING_APPLICATION_EXISTS` → silent redirect to `/become-a-host` which now renders State B (concurrency catch — they had a tab open, applied in another tab)
   - `ALREADY_SPACE_OWNER` → silent redirect to `/become-a-host` which renders State C
   - `ADMINS_CANNOT_APPLY` → unlikely to hit if Decision §2 hides the entry, but defensive: render State D
   - Validation errors → render inline per field
   - Generic/unknown errors → form-level error: "Something went wrong. Please try again."

### Decision 5: Re-application after rejection

A user can have multiple historical applications if previous ones were REJECTED. Story 7-2 Decision §5 allows this.

For Story 7-3 UI: the page treats rejected users the same as Guests who never applied — they see State A (the form). The system makes no special acknowledgment of "you were previously rejected" — this is intentional to avoid friction or implying shame.

**Out of scope for this story:** showing rejection reasons or rejection history. If the Super Admin wrote a rejection reason during 7-4, the user can see it via the email they received (Epic 8) but not via this UI. Future story could surface this.

### Decision 6: Pre-fill `full_name` and `email` from session

The application's `user_id` FK is the source of truth for who applied. The `users` table has `full_name` and `email`. These aren't duplicated on `applications` table (Story 7-2 Decision §1).

On the form, display them as read-only above the inputs:

```
Your details
─────────────
Full name:  [Ikhtiyor Ziyayev]
Email:      [ikhtiyor@deskhive.local]
```

If the user wants to change name or email, they'd do it in account settings (out of scope). The application uses whatever's current at submission time via the FK.

### Decision 7: Success redirect destination

After successful submission, redirect to `/my-bookings`.

Reasoning:
- `/my-bookings` is the Guest's "home base" after auth
- It's where the existing Phase 1 booking toast appears
- Redirecting back to `/become-a-host` would render State B which is informational but feels stuck
- Redirecting to `/` (Browse spaces) would be jarring (the user just submitted something serious; landing on a marketplace browse feels wrong context)

`/my-bookings` is the right balance: shows the user is still in the Guest experience, has access to their existing data, and gets the email-via-confirmation expectation.

### Decision 8: Toast copy on success

"Application submitted — we'll email you when it's reviewed."

This matches the Phase 1 voice pattern from Story 6-3 (`TOAST_COPY` constants). Calm, informative, no exclamation marks, no marketing fluff.

Variant ID: `TOAST_COPY.applicationSubmitted` or similar (Amelia picks the constant name, follows Story 6-3 naming convention).

### Decision 9: Toast on rejection / approval — explicitly NOT in this story

The user doesn't see a toast on application approval or rejection because those happen via admin action while the user is offline / elsewhere. The communication channel for outcomes is email (Epic 8). When the user next logs in, the dropdown entry simply changes (entry hidden if SPACE_OWNER, entry re-shown if rejected and can re-apply).

There's no in-app notification system in Phase 2. This is acceptable per PRD scope.

### Decision 10: Form layout — single column

Don't use a multi-column form. Single column, full-width inputs (within container max-width). Same pattern as Phase 1's login and register forms.

Reasoning: faster to design, easier to scan, mobile-friendly without needing mobile-specific work.

### Decision 11: No new dependencies

This story shouldn't require any new npm packages. Reuses:
- Phase 1 form styles (shared.css)
- Phase 1 button styles (.btn-primary)
- Story 6-3 toast wrapper (src/lib/toast.ts)
- Story 7-2 Server Actions and validation schema (src/lib/applications.ts)
- Existing card patterns for value propositions
- Existing typography tokens
- `useActionState` + `useFormStatus` from React (already in use Phase 1)

If Amelia thinks a new dependency is needed, escalate before installing.

### Decision 12: E2E test coverage

At minimum:

1. **Happy path:** Guest user logs in → opens user-pill → clicks "Become a Space Owner" → fills form with valid input → submits → sees toast → lands on `/my-bookings`. Application row exists in DB with status=PENDING.

2. **Pending state:** After happy path, user navigates to `/become-a-host` again → sees State B (application under review) → no form visible.

3. **Hidden entry for Space Owner:** Log in as `owner@deskhive.local` → user-pill dropdown → no "Become a Space Owner" entry (entry is gated on role).

4. **Hidden entry for Super Admin:** Log in as admin → dropdown → no entry.

5. **Validation error:** Submit form with empty business name → inline error shown, no submission.

Other unit/validation tests live alongside the validation schema.

### Decision 13: Memory entry codifying the Guest-facing application UI pattern

Amelia adds a memory file capturing:
- The State A/B/C/D/E page-state model (Decision §1)
- The Phase 1 pattern of "Server Component reads state, Client Component handles form" being applied here
- The post-submit redirect-to-`/my-bookings` decision (Decision §7) as the canonical "post-action calm landing" target
- That toast voice for "application submitted" is non-celebratory (no exclamation, no emoji) — matches Story 6-3's transactional tone

Suggested file name: `reference_guest_application_form_ui.md` or similar (Amelia picks per convention).

---

## Architectural anti-patterns forbidden

- **Do NOT** modify the `applications` table or its Server Actions. Use them as-is from Story 7-2.
- **Do NOT** duplicate validation logic between client and server. Share via the schema in `src/lib/applications.ts`.
- **Do NOT** add an email-sending call. The notification stubs from Story 7-2 still no-op in this story.
- **Do NOT** add an in-app notification or "unread" indicator system. Email is the only notification channel in Phase 2.
- **Do NOT** show rejection reasons or rejection history in this UI. Out of scope.
- **Do NOT** add SUPER_ADMIN to the entry point visibility logic. Admins don't apply.
- **Do NOT** allow multiple PENDING applications. The server enforces this (Story 7-2 Decision §5); the UI shows the pending state instead of the form.
- **Do NOT** introduce a wizard / multi-step form. Single-page form.
- **Do NOT** add hero images or marketing illustrations. Polish pass later if Makhbuba wants them.
- **Do NOT** modify the user-pill dropdown structure introduced in Story 7-1. Just add a new menu entry conditionally.

---

## Browser verification checklist

After Amelia completes the dev story, BA verifies:

### Setup
- Dev server running on `localhost:3000`
- DevTools console open
- Test credentials:
  - Guest user: existing seed (e.g., `guest@deskhive.local`)
  - SPACE_OWNER: `owner@deskhive.local` / `SpaceOwner1!` (from Story 7-1)
  - SUPER_ADMIN: `admin@deskhive.local` (existing seed)

### Checks

1. **Migration unchanged** — `pnpm db:migrate` shows no new migration needed (Story 7-2 already added the table).

2. **Login as Guest** → header user-pill dropdown shows new "Become a Space Owner" entry (cleanly placed in dropdown, follows existing visual style).

3. **Click "Become a Space Owner"** → lands on `/become-a-host` State A (form with value propositions, what's next, form fields).

4. **Form pre-fill** — "Your details" section shows Guest's name and email read-only. The form fields (business name, etc.) are empty.

5. **Submit empty form** → inline validation errors appear per required field, no submission. No console errors.

6. **Submit valid form** — fill all required fields with reasonable input → click Submit → button disables, shows "Submitting..." → success → redirect to `/my-bookings` → toast appears with copy from Decision §8.

7. **DB verification** — query `applications` table → new row exists with status=PENDING, correct user_id, all submitted fields stored, created_at timestamp recent.

8. **State B (pending)** — navigate back to `/become-a-host` → sees "Application under review" state with submission date + read-only summary + "we'll email you" copy. No form shown.

9. **Dropdown entry still visible** — header dropdown still shows "Become a Space Owner" (clicking it lands on State B). This is per Decision §2 — simpler than conditional text.

10. **Log out, log in as SPACE_OWNER** (`owner@deskhive.local`) → user-pill dropdown does NOT show "Become a Space Owner" entry.

11. **Navigate manually to `/become-a-host`** as SPACE_OWNER → sees State C ("You're already a Space Owner") with link to Dashboard.

12. **Log out, log in as SUPER_ADMIN** → user-pill dropdown does NOT show entry.

13. **Navigate manually to `/become-a-host`** as SUPER_ADMIN → sees State D ("Admins can't apply").

14. **Log out, navigate to `/become-a-host`** (unauthenticated) → redirected to `/login?redirect=/become-a-host`. After login, lands on `/become-a-host` State A.

15. **Phase 1 + 7-1 + 7-2 flows unchanged** — quick sweep:
    - Book a desk (Phase 1 + Story 6-3 toast still works)
    - Admin booking management (Phase 1)
    - Switch to hosting / traveling (Story 7-1)
    - Mode-sticky behavior (Story 7-1)

16. **No console errors** during all the above.

17. **All unit + E2E tests pass** — `pnpm test` + `pnpm test:e2e`. Note new test count.

18. **Footer reads `© 2026 DeskHive`** on `/become-a-host` (page renders within standard layout).

---

## Files likely touched

Estimate, not directive.

- `src/app/become-a-host/page.tsx` (new) — Server Component with state branching
- `src/app/become-a-host/_components/application-form.tsx` (new) — Client Component form
- `src/app/become-a-host/_components/pending-state.tsx` (new) — State B render
- `src/lib/applications.ts` — extend with validation schema if not already there from Story 7-2
- `src/components/header/...` or wherever the user-pill dropdown lives — add the new entry
- `tests/e2e/become-a-host.spec.ts` (new) — E2E coverage per Decision §12
- `tests/unit/applications-validation.test.ts` (new or extend) — schema tests
- Memory file — new entry per Decision §13

No changes to:
- `applications` table schema (use as-is from Story 7-2)
- Server Actions from Story 7-2 (use as-is)
- Better Auth configuration
- Existing Phase 1 routes
- Admin routes (Story 7-4)

---

## Memory note for Phase 2 continuation

This story establishes:
- The Guest-facing application flow end-to-end
- The "State branching by user context" pattern for routes like `/become-a-host` (likely reusable for `/owner` once Story 7-5 ships)
- The validation schema sharing pattern between client and server via the service module

Story 7-4 (next) consumes by:
- Reviewing applications submitted via this form
- Calling approve/reject Server Actions on real PENDING applications (no longer test-seeded)

Epic 8 Story 8-2 consumes by:
- Sending the "Application received" email after `createApplicationAction` succeeds
- The form's success path doesn't change — only the stub function gets a body

---

**End of BA decisions document.**
