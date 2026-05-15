# Story 6-2: Hide "My Bookings" from Admin Nav — BA Decisions

**Story:** 6-2
**Epic:** 6 — Phase 1 Polish
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Tuesday, May 12, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 1 polish backlog item 6-2 in `phase2-framing-and-polish-backlog.md`

---

## Context

DeskHive enforces strict role separation: guests book desks; super admins manage spaces, desks, and approve/reject bookings. Admins do not personally book desks — they operate the platform, they don't consume it.

The current header nav (shipped in Story 5-1 and refined in Story 5-2) shows "My bookings" to all authenticated users including super admins. This is a UX leak — the link points to `/my-bookings`, a guest-only feature surface. Admins clicking it either see an empty page or behavior that doesn't match their actual workflow. It also confuses the mental model: admins are not "users with bookings"; they are operators of a marketplace.

This story removes the leak. "My bookings" disappears from admin nav, and direct navigation to `/my-bookings` by an admin is caught and redirected to their natural workspace at `/admin/bookings`.

---

## Scope

**In scope:**
- The header nav rendered in `src/app/layout.tsx` (or the header component if extracted)
- The route handler / page logic at `/my-bookings` to add an admin redirect
- Any test coverage that exercises the admin header or the `/my-bookings` route

**Out of scope:**
- Any changes to the guest experience on `/my-bookings` — the page itself stays exactly as it is for guests
- Any changes to `/admin/bookings` content, layout, or filters — the destination page is unchanged
- Any changes to login, register, or Better Auth flow
- Any database schema changes
- The cosmetic login Guest/Admin toggle (separate story, 6-6)

---

## Decisions

### Decision 1: Header nav — "My bookings" link is hidden for super admins

The header in `app/layout.tsx` renders different nav based on audience (locked in Story 5-1, Decision 2):

- **Public (logged out):** logo + Browse spaces + How it works + Log in + Sign up
- **Guest (logged in):** logo + Browse spaces + **My bookings** + user-pill + Log out
- **Super Admin:** logo + Browse spaces + **My bookings** + Admin + user-pill + Log out

After this story:

- **Super Admin nav:** logo + Browse spaces + **Admin** + user-pill + Log out

The "My bookings" link is removed from the super admin nav variant only. Guest and public nav variants are unchanged.

### Decision 2: Direct navigation to `/my-bookings` by an admin redirects to `/admin/bookings`

Even with the nav link hidden, an admin can still reach `/my-bookings` by:
- Typing the URL directly
- Following a stale bookmark
- Following an old shared link
- Browser autocomplete

The `/my-bookings` page must detect when an authenticated super admin lands on it and server-side redirect to `/admin/bookings`.

**Why `/admin/bookings` specifically:** The admin's intent in hitting "my bookings" is to see bookings. Their natural workspace for that is the admin booking management page, which shows all guest-requested bookings with Confirm/Reject actions. Landing them there preserves their intent and routes them to their proper role context.

**Redirect type:** Server-side redirect (Next.js `redirect()` from `next/navigation` inside the Server Component or route handler). Not a client-side `<Navigate>` or `window.location` — those flash content. The admin should never see the guest "My bookings" page for even one frame.

**HTTP status:** 307 Temporary or 302 Found (whichever Next.js `redirect()` defaults to). Not 301 Permanent — the route is not deprecated, it's just not for this role.

### Decision 3: Guests on `/my-bookings` see no change

For a guest user, `/my-bookings` continues to render exactly as it does today:
- Status sections (Awaiting / Upcoming / Past per Story 5-1 Decision 3d)
- Their own bookings only via `listBookingsForGuest`
- All existing badges, actions, and layout

The redirect logic must check authenticated role and only redirect when role is super admin.

### Decision 4: Unauthenticated users on `/my-bookings` see no change

Existing Phase 1 behavior: unauthenticated users hitting `/my-bookings` get redirected to login with a `callbackUrl=/my-bookings` parameter (standard Better Auth pattern from US-1.3).

This behavior is unchanged. The admin redirect logic only runs for authenticated admin sessions, after the unauthenticated check has passed.

**Execution order in `/my-bookings`:**
1. Check authentication. If not authenticated → redirect to login with callbackUrl (existing behavior)
2. Check role. If super admin → redirect to `/admin/bookings` (NEW)
3. If guest → render guest bookings page (existing behavior)

### Decision 5: The admin nav check uses the same session/role source as everywhere else

The header in `layout.tsx` already differentiates between guest and admin nav. That same role check drives whether "My bookings" renders. No new role-fetching code, no new session helper, no new query — just use the existing `session.user.role === 'SUPER_ADMIN'` (or equivalent) check that already gates the "Admin" link.

This keeps the role check consistent across the codebase. Story 6-2 is not the place to refactor role detection.

### Decision 6: Cancel any callbackUrl=/my-bookings flow for admins

Edge case: an admin logs out, then logs in via a link that has `callbackUrl=/my-bookings`. After successful login, the callback redirect lands them on `/my-bookings`, which then immediately redirects to `/admin/bookings`.

That's acceptable behavior — one extra hop, but lands in the right place. **Don't add special logic to short-circuit the callbackUrl flow.** The `/my-bookings` page's own admin-redirect handles it cleanly. Adding callback-aware role logic in the login flow would scatter role checks and create maintenance debt for Phase 2's multi-tenant work.

### Decision 7: No tests of empty-state admin behavior on `/my-bookings`

Because admins are redirected before the page renders, there is no admin-facing UI on `/my-bookings`. Don't write tests for "what an admin sees on their My Bookings page" — they never see it. Tests should verify the redirect happens, not the (non-existent) admin rendering.

### Decision 8: No mention of the admin redirect in user-facing copy

Don't add a toast, flash message, or banner saying "Admins don't use My Bookings — taking you to admin bookings instead." That's noise. The redirect is silent. The admin sees the admin bookings page, recognizes it, and continues. If they wonder how they got there, the URL bar tells them.

### Decision 9: No "My Bookings" link in any admin-context UI

Audit any other admin-context surfaces (admin layout, admin sub-nav, admin breadcrumbs, admin empty states, admin dashboard placeholders if any exist) for stale references to "My bookings" or `/my-bookings`. If found, remove them.

This is a small audit — Phase 1 doesn't have many admin surfaces. Likely zero hits. Bundle into this story rather than leaving as separate cleanup.

---

## Architectural anti-patterns forbidden

- **Do NOT** introduce a new role-checking utility or helper. Use the existing session/role mechanism that gates the "Admin" link in the header today.
- **Do NOT** use client-side redirects (`useRouter().push()`, `window.location`, `<Navigate>`). Server-side redirect via Next.js `redirect()` only. Client-side redirects flash content and waste a render cycle.
- **Do NOT** add role-aware logic into the login callback flow. The `/my-bookings` page handles its own role check. Keep the login flow simple.
- **Do NOT** alter the guest experience on `/my-bookings`. The page is unchanged for guests.
- **Do NOT** modify `listBookingsForGuest`, `listAllBookings`, or any query helper. This is presentation/routing only.
- **Do NOT** add a "you don't have permission" page or 403 view. The admin gets a useful destination, not an error.
- **Do NOT** delete the `/my-bookings` route. Guests still need it.

---

## Browser verification checklist

After Amelia completes the dev story, BA verifies before greenlight:

1. **Header nav as super admin** — log in with super admin account → header shows: logo + Browse spaces + Admin + user-pill + Log out. **No "My bookings" link visible anywhere in the header.**

2. **Header nav as guest** — log in with guest account → header shows: logo + Browse spaces + **My bookings** + user-pill + Log out. (Unchanged from current behavior — sanity check that the change is admin-specific.)

3. **Header nav as public (logged out)** — open the app in a private/incognito window → header shows: logo + Browse spaces + How it works + Log in + Sign up. (Unchanged — sanity check.)

4. **Direct nav to `/my-bookings` as super admin** — while logged in as super admin, type `/my-bookings` in the URL bar → page redirects to `/admin/bookings`. URL bar shows `/admin/bookings`. No flash of guest "My bookings" content. Admin bookings page renders normally with admin sub-nav and filter chips.

5. **Direct nav to `/my-bookings` as guest** — while logged in as guest, type `/my-bookings` in the URL bar → guest "My bookings" page renders normally with status sections. No redirect. (Sanity check.)

6. **Direct nav to `/my-bookings` while logged out** — visit `/my-bookings` in private window → redirects to `/login?callbackUrl=/my-bookings`. (Unchanged — sanity check.)

7. **Login flow with admin callbackUrl** — log out. Visit `/my-bookings` (redirects to login with callbackUrl). Log in with super admin credentials. Land on `/admin/bookings` (one extra hop through `/my-bookings` → admin redirect, acceptable).

8. **Login flow with guest callbackUrl** — log out. Visit `/my-bookings` (redirects to login with callbackUrl). Log in with guest credentials. Land on `/my-bookings` (normal callback behavior).

9. **Admin can still confirm/reject bookings** — from `/admin/bookings`, click Confirm on a pending booking → transitions to CONFIRMED (Story 5-2 behavior unchanged). Click Reject → transitions to REJECTED.

10. **Guest can still cancel their bookings** — log in as guest, go to My bookings, cancel a pending booking → transitions to CANCELLED (Story 3-5 behavior unchanged).

11. **No console errors** in DevTools after navigating: logout → login as admin → click around → logout → login as guest → click around → logout.

12. **All existing unit + E2E tests still pass.** Update any test that explicitly clicks "My bookings" as an admin (it shouldn't exist, but if it does, the test was wrong and should be removed).

13. **Footer still reads `© 2026 DeskHive`** — no regression from earlier stories.

---

## Files likely touched

Estimate for context, not a directive. Dev story may discover additional files.

- `src/app/layout.tsx` — header nav conditional rendering for the admin variant (remove "My bookings" link)
- `src/app/(guest)/my-bookings/page.tsx` or `src/app/my-bookings/page.tsx` — add admin role check + redirect to `/admin/bookings` after the auth check
- Possibly a header component file if the header was extracted from `layout.tsx` in a prior story
- Test files exercising header rendering and `/my-bookings` access (likely Playwright E2E)

---

## Memory note for Phase 2

This story reinforces strict role separation between guests and operators. Phase 2's multi-tenant theme introduces a third role (Space Owner) and rebalances who-can-do-what across roles. The pattern established here — role-specific nav variants + server-side route redirects for wrong-role access — is the right pattern for Phase 2 to extend:

- Space Owner nav variant will be added alongside guest and super admin variants
- `/owner/*` routes will redirect non-owners
- `/admin/*` routes will be reviewed to ensure space owners don't accidentally get super admin access

Amelia should add a MEMORY.md note flagging this pattern so Phase 2 work follows the same approach rather than inventing alternatives.

---

**End of BA decisions document.**
