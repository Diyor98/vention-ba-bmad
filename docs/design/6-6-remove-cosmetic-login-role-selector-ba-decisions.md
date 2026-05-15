# Story 6-6: Remove Cosmetic Login Role Selector — BA Decisions

**Story:** 6-6
**Epic:** 6 — Phase 1 Polish
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Tuesday, May 12, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 1 polish backlog item 6-6 in `phase2-framing-and-polish-backlog.md`; designer confirmation from Makhbuba Komilova on May 12, 2026 ("Это для демо, можно делать без переключателя" — "It's for the demo, you can do it without the toggle").

---

## Context

Story 5-2 (admin screen reskin) shipped a cosmetic Guest/Admin toggle on the login screen as part of Makhbuba's v2 design. At the time, Decision #8 of Story 5-2 treated the toggle as visual-only: Better Auth determines role server-side from the user's account, and the toggle had no functional effect on authentication.

This was an acceptable compromise to ship the reskin without redesigning auth. But cosmetic-only interactive UI is an anti-pattern (fake affordance):

- A user who clicks "Admin" expects something to change. Nothing does.
- A guest who clicks "Admin" and logs in with their guest credentials gets logged in as a guest anyway, creating confusion ("did I do something wrong? am I in the right place?")
- The toggle's existence misrepresents the auth model. DeskHive uses one login flow for all users; role is determined by the account, not by user selection.

On May 12, 2026, the designer (Makhbuba Komilova) confirmed via Teams that the toggle is not required: it was a demo affordance. Independent research on the Airbnb model — locked as the inspiration for Phase 2's multi-tenant theme — confirms that Airbnb has no pre-auth role toggle. Airbnb has one login for everyone; role switching happens *after* authentication via a "Switch to hosting" affordance in the authenticated header dropdown.

This story removes the toggle from the login screen. Phase 2's multi-tenant theme will introduce the correct post-auth role-switching pattern when the Space Owner role exists.

---

## Scope

**In scope:**
- Remove the Guest/Admin toggle markup from the login page
- Remove any toggle-specific CSS classes from `globals.css` if they are not shared with other components
- Remove any client-side state managing the toggle selection (if any leaked in despite the cosmetic-only intent)
- Adjust the login page's vertical rhythm if the toggle removal leaves visual imbalance (minor spacing adjustment only)
- Preserve the simplified login header from Story 5-2 Decision #8 (only "Sign up" button visible)

**Out of scope:**
- Phase 2 post-auth role switcher ("Switch to hosting" / "Switch to space owner") — that's part of the Phase 2 multi-tenant theme
- Any change to Better Auth, sessions, login Server Action, or callback routing
- Any change to the register page (it has no toggle)
- Any change to the admin sub-nav, header navigation, or other authenticated chrome
- Adding any replacement visual element to "fill" the space the toggle leaves — see Decision 2
- Updating Makhbuba's design artifact files in `docs/design/` — the design package can be updated by Makhbuba at her convenience; not blocking implementation

---

## Decisions

### Decision 1: Remove the toggle entirely — no feature flag, no conditional rendering

The toggle is deleted from the JSX. No `{showRoleToggle && ...}` wrapper, no feature flag, no environment variable gate. Phase 2 will introduce the correct post-auth pattern in the correct place (authenticated header dropdown); preserving dead UI on the login screen complicates that work and creates two surfaces to remove later.

This is a permanent deletion. The Story 5-2 Decision #8 ("treat the toggle as cosmetic-only") is now superseded.

### Decision 2: No replacement visual element

The login form alone is the design after this story. Do not add an illustration, tagline, brand graphic, or decorative element to "fill" the visual space the toggle leaves. The login page becomes simpler — that is the goal.

If Makhbuba (or future design work) wants a richer login visual in Phase 2, that is a Phase 2 design decision. This story is about *removing*, not redesigning.

### Decision 3: Preserve the simplified header from Story 5-2

Story 5-2 Decision #8 included a header simplification on the login page: only the "Sign up" button is visible (the "Log in" link is hidden, since the user is already on the login screen). This part of Decision #8 stays. Only the toggle itself is removed.

### Decision 4: CSS cleanup

Inspect `globals.css` and the login page's component files for toggle-specific CSS classes. Likely candidates:
- `.login-role-toggle`, `.role-toggle`, `.role-selector`, `.auth-role-pills`, or similar
- Any inline Tailwind utility classes scoped only to the toggle markup

If toggle-specific classes exist and are not referenced by any other component, remove them. If a class is shared with another component (unlikely but possible), leave it.

Err on the side of removing. Dead CSS is debt.

### Decision 5: No schema, no Server Action, no query helper changes

This is a presentation-layer deletion only. The login flow's Server Action, Better Auth integration, session handling, callback URL logic, and all role-based redirects (locked in Story 6-2) remain unchanged.

### Decision 6: All existing Phase 1 flows continue working unchanged

After this story, the following flows must work identically to how they worked before:

- Login as a guest → lands on browse spaces (or callback URL if present), header shows guest nav
- Login as a super admin → lands on the admin area (or callback URL), header shows admin nav
- Logout returns to the public state
- Register a new account → register page works normally (no toggle there to begin with)
- The Story 6-2 admin redirect on `/my-bookings` continues to work
- The Story 6-1 dollar-input desk price form continues to work
- The Story 6-3 booking confirmation toast continues to work

This story changes only the login screen's visual surface. Nothing functional changes downstream.

### Decision 7: No tests for the removed toggle

Because the toggle had no functional effect, there are likely no automated tests asserting its presence or behavior. If any test exists that explicitly checks for the toggle (e.g., a snapshot test, a Playwright assertion looking for the `Guest`/`Admin` text), that test was wrong by design — the toggle was cosmetic and shouldn't have been asserted. Remove any such tests in this story.

Do not add new tests for "the toggle is absent." That is over-specification. The browser checklist verifies absence.

### Decision 8: Memory note for Phase 2

The Phase 2 multi-tenant theme will introduce a post-auth role switcher in the authenticated header dropdown, following the Airbnb pattern:
- One login flow for all roles
- After authentication, the header shows the user's current "mode" (Guest / Space Owner / Super Admin)
- A "Switch to hosting" or "Switch to space owner" affordance lets users change context without re-authenticating

Amelia should add a MEMORY.md note (or update the existing `project_login_role_selector_cosmetic.md` memory entry) noting:
- The pre-auth toggle is removed as of Story 6-6
- The Phase 2 multi-tenant theme is the canonical home for role switching, post-auth, per the Airbnb pattern
- The new memory anchor name (if updated): `project_login_single_form_post_auth_role_switch.md` or similar

This codifies the architectural decision so Phase 2 doesn't accidentally reintroduce a pre-auth toggle.

---

## Architectural anti-patterns forbidden

- **Do NOT** introduce a feature flag or conditional render for the toggle. Just remove it.
- **Do NOT** add a post-auth role switcher in this story. Phase 2 work.
- **Do NOT** modify Better Auth flow, session handling, or login Server Action.
- **Do NOT** touch the register page.
- **Do NOT** add replacement visual elements (illustrations, taglines, brand graphics) on the login page.
- **Do NOT** change the simplified header (Story 5-2 Decision #8 stays — only "Sign up" visible on the login page).
- **Do NOT** add tests asserting the toggle is absent. Browser checklist handles verification.
- **Do NOT** update the design package files in `docs/design/`. Makhbuba owns those artifacts and will refresh them at her convenience.

---

## Browser verification checklist

After Amelia completes the dev story, BA verifies before greenlight:

1. **Login page renders without the toggle** — open `/login` in a fresh browser session → no Guest/Admin toggle visible anywhere on the page.

2. **Login page composition** — the page shows only:
   - Header with logo + "Sign up" button (no "Log in" link, per Story 5-2 Decision #8)
   - Page title "Welcome back" + subtitle "Log in to manage your bookings."
   - Email input field with label
   - Password input field with label
   - Primary "Log in" submit button
   - Footer link "New to DeskHive? Create an account"
   - Page footer "© 2026 DeskHive"

3. **Visual rhythm is acceptable** — the login form does not look broken, awkwardly empty, or visually unbalanced after the toggle removal. Minor spacing tweaks are acceptable if needed; major layout changes are out of scope.

4. **Login as guest** — enter guest credentials → submit → lands on browse spaces (or callback URL if present), header shows guest nav (Browse spaces + My bookings + user-pill + Log out).

5. **Login as super admin** — enter super admin credentials → submit → lands on admin area (or callback URL), header shows admin nav (Browse spaces + Admin + user-pill + Log out, no "My bookings" link per Story 6-2).

6. **Logout works** — click Log out → returns to public state, header shows public nav (Browse spaces + How it works if applicable + Log in + Sign up).

7. **Register flow unchanged** — click "Create an account" → register page renders normally (no toggle, never had one), can register a new account, lands on logged-in state.

8. **callbackUrl works** — in a logout state, visit `/my-bookings` → redirects to `/login?callbackUrl=/my-bookings` → log in as guest → lands on `/my-bookings`. Same flow with admin credentials → lands on `/admin/bookings` (Story 6-2 redirect).

9. **Story 6-3 booking toast still works** — log in as guest → book a desk → see the confirmation toast on the Space Detail page (revised behavior from Story 6-3).

10. **Story 6-1 desk price form still works** — log in as admin → edit a desk → input dollars, save, reload, verify the value persists.

11. **No console errors** in DevTools after exercising the full login → action → logout cycle for both guest and admin.

12. **Footer reads `© 2026 DeskHive` everywhere** — no regression from prior stories.

13. **All existing unit + E2E tests still pass** — baseline from end of Story 6-3 (likely 166 unit + 31 E2E, exact numbers in the prior commit's CI output). Minimum-necessary updates only; any test that explicitly checked for the toggle (if it exists) should be removed.

---

## Files likely touched

Estimate for context, not a directive. Dev story may discover additional files.

- The login page component (probably `src/app/(auth)/login/page.tsx` or `src/app/login/page.tsx` — exact path depends on route group structure)
- A login form Client Component if the toggle had any state (unlikely but possible)
- `src/app/globals.css` — only if toggle-specific classes exist and are not shared
- Any test file (Playwright or Vitest) explicitly asserting toggle presence (likely none, but check)
- MEMORY.md or the memory reference file at `~/.claude/.../memory/project_login_role_selector_cosmetic.md` to record the deprecation

---

## Memory note for Phase 2

This story removes a pre-auth role-selection pattern that was incorrect for DeskHive's auth model. The correct pattern — post-auth role switching via authenticated header dropdown — is reserved for the Phase 2 multi-tenant theme, when the Space Owner role exists and role switching has real meaning.

Memory anchor: update or supersede `project_login_role_selector_cosmetic.md` with the deprecation note and the Phase 2 forward-looking pattern.

---

**End of BA decisions document.**
