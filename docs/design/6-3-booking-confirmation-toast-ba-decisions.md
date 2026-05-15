# Story 6-3: Booking Confirmation Toast — BA Decisions

**Story:** 6-3
**Epic:** 6 — Phase 1 Polish
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Tuesday, May 12, 2026 (revised same day post-implementation review — see Change Log at bottom)
**Status:** Locked, ready for dispatch
**Source:** Phase 1 polish backlog item 6-3 in `phase2-framing-and-polish-backlog.md`; manager feedback from May 8 review.

---

## Context

Phase 1 ships a working booking flow: a guest picks a date on the Space Detail page, picks an available desk, clicks "Book this desk," and the system creates a PENDING booking. The booking then appears in My Bookings under "Awaiting confirmation."

The manager review on May 8 flagged that the booking transition feels too quiet. The action succeeds, but there is no positive confirmation moment at the point of action. The guest clicks "Book this desk" → the page navigates → the booking shows up in My Bookings, but the user never sees the system say "yes, we got it." This is friction at exactly the moment the user is making a commitment.

A toast — a small floating notification — is the standard pattern to close this gap. This story adds toast notifications to the guest booking flow: a success toast on a successful booking creation, and an error toast on booking failures (rare, but possible: race condition where the desk is no longer available, network error, validation failure).

This is a presentation-layer addition only. No schema changes, no Server Action signature changes, no new query helpers.

---

## Scope

**In scope:**
- A reusable toast component / system that can render success and error toasts
- Wiring the toast to the "Book this desk" action on `/spaces/[id]`
- Success toast on successful booking creation
- Error toast on failed booking creation
- Auto-dismiss after ~4 seconds + manual close (X) button + pause-on-hover
- Bottom-right screen position
- Test coverage for the toast component and the booking flow integration

**Out of scope:**
- Toasts on cancel booking, admin confirm, admin reject — admin status changes already give visual feedback (badge updates, action buttons disappear). Guest cancel will get a toast if and only if it's trivially in the same code path; otherwise deferred.
- Toasts on auth flows (login success, register success) — those redirect to a fresh page, separate UX problem.
- Toasts elsewhere in the app (price edits, space creation, etc.) — Phase 2 polish if needed.
- A global notification center / inbox — out of scope, not requested.
- Toast accessibility deep-dive beyond the basics (basic ARIA live region only).
- Stacking multiple simultaneous toasts — only one toast visible at a time; new toasts replace existing ones. If this turns out to be jarring in testing, escalate to BA; do not invent stacking unprompted.

---

## Decisions

### Decision 1: Toast library — pick the lightweight, well-supported option

The dev story should pick a small, well-maintained toast library rather than hand-rolling one. Hand-rolled toasts get accessibility and animation wrong on the first pass and have to be redone.

**Recommendation:** `sonner` (by the Vercel/Next.js ecosystem author). It is:
- Small bundle size
- Headless / styleable (so we can match the DeskHive brand tokens from Story 5-1)
- Works cleanly with Next.js App Router and React Server Components
- Has solid keyboard / accessibility support out of the box
- Used in production by Stripe, Linear, Vercel, and others
- Native pause-on-hover behavior

If `sonner` conflicts with an existing dependency or has a hidden cost the dev story discovers, `react-hot-toast` is the acceptable fallback. Do not bring in a heavyweight UI framework (Radix Toast, full Mantine, etc.) just for this — that's overkill.

The dev story should add the dependency, mount the toast root component once in `app/layout.tsx`, and expose a small wrapper module (e.g., `src/lib/toast.ts`) that the rest of the app imports from. The wrapper insulates the codebase from the library choice so Phase 2 can swap implementations without touching call sites.

### Decision 2: Toast position — bottom-right

The toast renders in the bottom-right corner of the viewport. Reasons:
- Standard modern web pattern (Stripe, Linear, Vercel, Notion)
- Does not fight with the sticky header established in Story 5-1
- Does not block primary content (the booking the user just made, appearing in the page or after navigation)
- Familiar to users — no learning curve

On mobile / narrow viewports, the toast can stretch to fill the bottom edge with safe-area insets, but this story is desktop-first; mobile polish for the toast is Phase 2 if needed.

### Decision 3: Toast duration — ~4 seconds auto-dismiss, plus manual close and pause-on-hover

The success and error toasts auto-dismiss after **4000ms** (4 seconds). This is the industry standard:
- Long enough to read a short message
- Short enough not to overstay welcome
- Long enough for a user who glances away briefly to still catch it

Three safety nets:
- **Close (X) button** in the corner of the toast lets users dismiss manually before the timer fires. The close button must be keyboard-accessible (focusable, Enter or Space key dismisses).
- **Pause-on-hover** — the auto-dismiss timer pauses while the user hovers over the toast, giving them time to read fully if they want. Timer resumes when the mouse leaves.
- **Slide-in animation on entry** — a brief slide-up-from-bottom motion catches the eye so users notice the toast appearing. `sonner` provides this by default.

### Decision 4: Toast content — success variant

When a booking is successfully created:

- **Visual:** Green accent (status-confirmed color token from Story 5-1 design system). Small checkmark icon at the start.
- **Title:** `Booking requested`
- **Body:** `We'll let you know when it's confirmed.`
- **Link button:** `View in My Bookings` — clicking takes the user to `/my-bookings`. This is a **real navigation** (the user is on `/spaces/[id]` when the toast fires, per revised Decision §7), bridging the natural next step. The user can also dismiss / let the toast auto-dismiss and stay on Space Detail to book another desk.

The toast appears immediately on successful booking creation, **on the Space Detail page where the user just clicked Book** (revised Decision §7 — no redirect on success).

### Decision 5: Toast content — error variant

When booking creation fails:

- **Visual:** Red accent (status-rejected color token from Story 5-1 design system). Small alert icon at the start.
- **Title:** `Booking failed`
- **Body:** A specific error message when available, falling back to a generic message.

**Specific error cases to handle explicitly:**
- **Desk no longer available** (someone else booked it; the partial unique index from Architectural Decision #1 catches this and the `matchUniqueViolation` helper from `db-errors.ts` identifies it): `That desk was just booked by someone else. Please try a different desk.`
- **Validation error** (date in the past, missing field, etc.): The validation message from the server.
- **Network / server error / unknown:** `Something went wrong. Please try again.`

The error toast does NOT auto-navigate the user. They stay on the Space Detail page and can pick another desk or another date.

### Decision 6: Toast content — copy is final

The copy in Decisions 4 and 5 is final. Do not let the dev pass invent alternate copy ("Booking submitted!", "Success!", "Oops!", etc.). Consistent, specific copy beats variety. Specific copy also makes the toast feel professional rather than templated.

If the dev story has a strong reason to change copy (e.g., Better Auth or Server Action error shape constrains the message), escalate to BA before changing. Do not silently change.

### Decision 7: Booking flow navigation — REVISED (no redirect on success)

**REVISED 2026-05-12** during post-implementation browser review. Prior version of this decision said "do not change navigation behavior" and instructed the dev story to use a cross-navigation toast hand-off (via `?booked=1` query param). The implementation worked but surfaced a UX inconsistency: the toast appeared on `/my-bookings` after a server-side redirect, and the toast's "View in My Bookings" action button was a soft no-op (the user was already on `/my-bookings`). The button was either useless or confusing.

**Revised behavior:**

1. Guest clicks "Book this desk" on `/spaces/[id]`.
2. Server Action creates PENDING booking.
3. **Server Action returns `{ status: 'success' }` instead of redirecting.** Mirrors the existing shape of `cancelBookingAction`'s success return.
4. Client Component (`<BookDeskButton>`) reads the success state from `useActionState`, fires the toast on `/spaces/[id]` (the current page — user stays).
5. **User controls navigation via the toast.** The "View in My Bookings" action button is now a real navigation (`router.push('/my-bookings')`), not a soft no-op. The user can also let the toast auto-dismiss and stay on Space Detail to book another desk.

**Why this is better UX:**

- The toast appears in the **action context** — where the user just clicked Book. Confirmation in-place feels more responsive than "page navigated, oh look a toast on the new page."
- The action button does **real work**. The user has two meaningful paths: navigate to My Bookings, or stay and book another desk for the same date or another date.
- The Phase 1 manager-feedback driver ("booking feels too quiet") is better served — the user sees their action confirmed exactly where they performed it.
- The implementation is simpler: no cross-navigation hand-off, no query-param scrubbing, no `<Suspense>` considerations around `useSearchParams()`.

**`revalidatePath` calls still fire** before the success state returns — the booking is still invalidated in the route cache for both `/spaces/[id]` and `/my-bookings`. The user landing on `/my-bookings` after clicking the action button sees the fresh booking immediately, just like before.

**For the dev story:** the implementation is straightforward and lives entirely in `<BookDeskButton>` + a single-line return change in `createBookingAction`. No new files, no cross-navigation Client Component needed.

### Decision 8: Only one toast at a time

If a user clicks "Book this desk" multiple times rapidly (double-click, fast-click), or triggers multiple toasts in sequence, the latest toast replaces the previous one. Toasts do not stack.

The booking button itself should be disabled via `useFormStatus` (locked Architectural Decision #5) during submission, so double-click should already be impossible. This decision is defense-in-depth in case that protection ever slips.

### Decision 9: ARIA live region — basic accessibility only

The toast root must be marked as an ARIA live region (`aria-live="polite"` for success, `aria-live="assertive"` for errors). `sonner` handles this automatically with the correct attributes per toast type.

The dev story does not need to do a full accessibility audit. Use the library defaults; do not add more.

### Decision 10: Cancel booking — out of scope unless trivial

The guest cancel flow (Story 3-5) could benefit from a toast ("Booking cancelled"). This story adds it ONLY IF the toast wrapper is wired up generically enough that adding a `toast.success("Booking cancelled")` to the existing cancel Server Action handler is a one-line addition.

If it requires more than that — e.g., touching the cancel UI component significantly, or wiring up new error handling — defer to a separate polish item. Scope discipline. Do not let "while we're at it" creep happen.

### Decision 11: No toast on admin actions (Confirm/Reject)

Admins already get visual feedback when they Confirm or Reject a booking — the row's status badge updates, the action buttons disappear. Toasts there would be redundant noise. Out of scope.

### Decision 12: Test coverage required

The dev story should include:
- A unit test that the toast wrapper module exposes the expected API (`toast.success()`, `toast.error()`)
- An E2E test that exercises the booking happy path: guest logs in → picks a date → clicks Book this desk → toast appears with the success message → toast contains the "View in My Bookings" link → toast dismisses on click of X
- An E2E test (if practical) that exercises the booking error path: guest tries to book a desk that's already been booked → error toast appears with the conflict message
- The error path test is **nice to have, not required** — if it's hard to simulate the conflict in test infrastructure, skip it with a Dev Notes annotation

### Decision 13: Memory note for Phase 2

Phase 2 introduces email notifications (Theme C: Email infrastructure). The toast pattern and the email pattern share a common purpose: confirm to the user that something happened. They should remain consistent in language. For example, the success toast says "Booking requested. We'll let you know when it's confirmed." The first transactional email a guest receives could be "Your booking request was received. We'll email you when the space owner confirms." Consistent voice.

Amelia should add a MEMORY.md note flagging:
- `src/lib/toast.ts` (or wherever the wrapper lands) as the canonical UI feedback seam for Phase 1
- The toast copy as the source of truth for transactional copy voice; Phase 2 emails should match this voice

---

## Architectural anti-patterns forbidden

- **Do NOT** hand-roll a toast component. Use a library (sonner preferred).
- **Do NOT** import the toast library directly all over the codebase. Wrap it in `src/lib/toast.ts` so call sites import a stable wrapper, not the library directly.
- **Do NOT** change the Server Action's database interaction or error contract to add toast logic. Toasts are pure presentation — the action's existing validation, conditional UPDATE pattern, and verbatim error messages stay byte-for-byte. (NB: the `createBookingAction` return shape DOES grow a `'success'` variant per revised Decision §7 — this is a state-shape change, not a behavioral one.)
- **Do NOT** add toasts to admin Confirm/Reject. Redundant.
- **Do NOT** introduce a global notification center, in-app inbox, or notification persistence. Toasts are ephemeral by design.
- **Do NOT** stack toasts. One at a time.
- **Do NOT** invent alternate copy. Use the exact strings from Decisions 4 and 5.
- ~~**Do NOT** change the booking flow navigation. Only add the toast.~~ **REMOVED 2026-05-12** — revised Decision §7 now removes the post-success redirect; the booking flow no longer navigates the user away from `/spaces/[id]` on success. The toast's action button is the user's path to `/my-bookings`.
- **Do NOT** add toasts to login or register success — those are separate UX problems.
- **Do NOT** use a center-of-screen toast position. Bottom-right per Decision 2.
- **Do NOT** extend duration beyond 4 seconds. Pause-on-hover handles the "needed more time to read" case.

---

## Browser verification checklist

After Amelia completes the dev story, BA verifies before greenlight:

1. **Happy path: guest books a desk** — log in as guest → navigate to a Space Detail page → pick an available date → click "Book this desk" on an available desk → toast appears in bottom-right corner with green accent, checkmark icon, title "Booking requested", body "We'll let you know when it's confirmed.", and a "View in My Bookings" link button. **The user stays on `/spaces/[id]`** — URL bar does NOT change to `/my-bookings`.

2. **Toast auto-dismisses after ~4 seconds** — observe that the toast fades/slides out around 4 seconds without user interaction.

3. **Pause-on-hover** — book another desk → hover the mouse over the toast → toast does not auto-dismiss while hovering → move mouse away → timer resumes and toast dismisses ~4 seconds later.

4. **Toast manual close** — book another desk → click the X button on the toast before auto-dismiss → toast disappears immediately.

5. ~~**Toast survives navigation**~~ **REMOVED 2026-05-12 (revised Decision §7).** The booking flow no longer redirects on success; the toast appears on `/spaces/[id]`. There is no navigation to survive. Replaced by: **user stays on `/spaces/[id]` after success** — URL bar unchanged; can scroll back up to pick another desk.

6. **"View in My Bookings" link works** — click the link in the toast → navigates to `/my-bookings` (real navigation, not soft no-op) → the new booking is visible in "Awaiting confirmation" section.

7. **Booking actually created** — after success toast, click the action button (or navigate manually to `/my-bookings`) and verify the new booking is present in "Awaiting confirmation."

8. **Error path: race condition** — open two browser windows logged in as different guests → both open the same Space Detail page and the same desk on the same date → first guest clicks Book → second guest clicks Book within a moment → second guest sees a red toast with "Booking failed" title and message about the desk no longer being available.

9. **Error toast styling** — error toast appears in bottom-right, red accent, alert icon, descriptive message.

10. **Error toast does not navigate** — after error toast, user stays on Space Detail page and can try a different desk. (Same applies to the success path now per revised Decision §7 — the user stays on Space Detail unless they click the toast's action button.)

11. **Single toast at a time** — if you can trigger two toasts quickly (book one desk, immediately book another), only one toast visible at a time; new toast replaces previous.

12. **Toast does not appear for admin actions** — log in as super admin → go to `/admin/bookings` → Confirm a PENDING booking → row updates, badge changes, no toast appears. Same for Reject.

13. **Toast does not appear for register or login** — register a new account → land on logged-in state → no toast appears. Log out and log in → no toast appears.

14. **Keyboard accessibility** — tab to the toast close button when a toast is visible → press Enter or Space → toast dismisses.

15. **All existing Phase 1 flows still work** — register, login, browse, book, cancel, admin confirm, admin reject — every flow verified in prior stories must still work after this story.

16. **No console errors** in DevTools after exercising the full happy path + error path.

17. **All existing unit + E2E tests still pass** (148 unit + 31 E2E baseline from Story 6-2; minimum-necessary updates only, plus new tests added by this story).

18. **Footer still reads `© 2026 DeskHive`** — no regression.

---

## Files likely touched

Estimate for context, not a directive. Dev story may discover additional files.

- `package.json` — add `sonner` (or fallback `react-hot-toast`) dependency
- `src/app/layout.tsx` — mount the toast root component (`<Toaster />` from sonner)
- `src/lib/toast.ts` — new file: thin wrapper exposing `toast.success()` and `toast.error()` with brand-styled defaults
- `src/lib/toast.test.ts` — unit tests for the wrapper
- `src/app/spaces/[id]/page.tsx` or the booking Client Component within it — wire the toast call to the booking action result
- `src/app/(guest)/my-bookings/page.tsx` if Decision 10 is satisfied (cancel toast) — add toast to cancel handler
- E2E test files for the booking flow happy and (optionally) error paths

---

## Memory note for Phase 2

The toast pattern established here becomes the canonical UI feedback seam for Phase 1 and the voice template for Phase 2 transactional emails. Phase 2's Email infrastructure theme should reuse the same copy patterns ("Booking requested. We'll let you know when it's confirmed.") in the equivalent transactional emails to maintain a consistent product voice across channels.

`src/lib/toast.ts` is the stable wrapper. If Phase 2 needs to swap the underlying library (e.g., for richer notification types), the wrapper insulates call sites.

---

## Change Log

| Date | Change | Driver |
|---|---|---|
| 2026-05-12 (initial) | BA decisions doc authored, locked for dispatch. Decision §7 said "do not change navigation behavior" — implementation was to use `?booked=1` query-param cross-navigation hand-off. | Story drafting from Phase 1 polish backlog item 6-3. |
| 2026-05-12 (revision) | **Decision §7 revised** to remove the post-success redirect entirely. Server Action now returns `{ status: 'success' }` and the toast fires on `/spaces/[id]`; user controls navigation via the toast's action button. Decision §4 updated to clarify the action button is now a real navigation. The "do not change booking flow navigation" anti-pattern was struck. | UX inconsistency surfaced during browser verification: the prior cross-navigation pattern put the toast on `/my-bookings` after a server-side redirect, making the toast's "View in My Bookings" action button a soft no-op (user was already on the destination). The revision puts the toast in the action context where it's more responsive and gives the action button real work to do. Better serves the original manager feedback ("booking feels too quiet") because the user sees confirmation exactly where they performed the action. |

---

**End of BA decisions document.**
