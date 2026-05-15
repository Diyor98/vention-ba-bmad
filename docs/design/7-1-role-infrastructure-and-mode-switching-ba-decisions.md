# Story 7-1: Role Infrastructure + Mode Switching — BA Decisions

**Story:** 7-1
**Epic:** 7 — Multi-Tenant (Space Owner Role)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Tuesday, May 12, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §8 Epic 7 — combines original Story 7-1 (role infrastructure) and original Story 7-5 (mode switching) into a single coherent first story.

---

## PRD revision note

This story combines what the Phase 2 PRD originally listed as two separate stories:
- **Original 7-1:** Role infrastructure (DB + helpers + dormant nav variant)
- **Original 7-5:** Mode-switching infrastructure

**Reason for combination:** The original 7-1's "dormant nav variant" is a code smell — UI built but unreachable until 7-5 wires it up. Combining the two stories eliminates the dormant code, makes the result demonstrable end-to-end after a single ship, and keeps verification coherent. The PRD is otherwise authoritative.

After this story ships, Epic 7's remaining sequence is:
- 7-2: Applications data model + Server Actions
- 7-3: Guest-facing application form + entry point
- 7-4: Super Admin applications review UI
- 7-5: Space Owner dashboard + space management (was original 7-6)

The PRD itself will be updated post-ship to reflect this renumbering.

---

## Context

Phase 1 modeled DeskHive as a single-tenant platform: every "admin" was a SUPER_ADMIN who owned all spaces. Phase 2's Theme A breaks that conflation by introducing the SPACE_OWNER role — independent operators who can list spaces, manage their own bookings, and (in later stories) receive payouts.

This first story establishes the foundation:
- The role itself exists in the schema and access control system
- A user can be a SPACE_OWNER and switch between Guest mode (booking) and Host mode (managing spaces) post-authentication
- Spaces are now ownable via `spaces.owner_id`
- Phase 1 seeded spaces remain valid (owner_id nullable, existing flows continue)

No application flow yet (that's 7-2/7-3/7-4). For this story, a user becomes a SPACE_OWNER via seed script or direct DB write only.

---

## Scope

**In scope:**
- Drizzle migration: extend the user role CHECK constraint to include `SPACE_OWNER`
- Drizzle migration: add `owner_id` column to `spaces` table (nullable, references `users.id`)
- Update role-checking helpers (whichever utility files contain the existing role-aware logic from Phase 1) to recognize SPACE_OWNER
- Header nav: new variant for SPACE_OWNER users, mode-aware (Guest mode shows Guest nav with a "Switch to hosting" option; Host mode shows Host nav with a "Switch to traveling" option)
- Session cookie: `deskhive_mode` cookie tracking current UI mode (`guest` or `host`), default `guest` for new sessions
- New Server Action: `switchModeAction(targetMode: 'guest' | 'host')` — toggles the cookie, revalidates the layout
- Update the seed script (`scripts/seed.ts` or equivalent) so a designated user can be flipped to SPACE_OWNER for testing
- Memory entry codifying the role-and-mode pattern for Phase 2 reuse

**Out of scope:**
- Application flow (apply → review → approve/reject) — that's stories 7-2/7-3/7-4
- Owner dashboard at `/owner` — that's story 7-5 (renumbered)
- Owner-side space management screens — that's story 7-5
- Payment flow (no Stripe yet) — that's Epic 9
- Email infrastructure (no application emails yet) — that's Epic 8
- Any changes to existing Phase 1 admin routes (`/admin/spaces`, `/admin/bookings`, `/admin/applications` doesn't exist yet)
- Any changes to guest-facing flows (booking, browse, my-bookings)
- Backfill migration assigning Phase 1 seeded spaces to a SPACE_OWNER (deferred — keep nullable owner_id for now)

---

## Decisions

### Decision 1: Schema additions, not table replacements

The user role enum extension is additive: existing `GUEST` and `SUPER_ADMIN` values remain unchanged. The CHECK constraint is dropped and re-added with the expanded value set. Per the Phase 1 locked decision (TEXT + CHECK, not pgEnum), this is a constraint swap, not an enum migration.

The `spaces.owner_id` column is nullable. Phase 1 seeded spaces have NULL owner_id and continue to work. Future stories may backfill or require it; this story does not.

### Decision 2: Mode is a session cookie, not a DB field

The user's current UI mode (Guest mode vs Host mode) is a session-level preference, not a persistent user attribute. A user might switch between modes multiple times in a single session.

- Cookie name: `deskhive_mode`
- Values: `guest` or `host`
- Set by: `switchModeAction` Server Action
- Read by: `app/layout.tsx` (to render the correct header variant) and any other component that branches on mode
- Default: `guest` (no cookie present = guest mode)
- Cookie attributes: HttpOnly, SameSite=Lax, Secure in production, no explicit expiry (session cookie)

**Important constraint:** if a user is in Host mode but their role is downgraded (e.g., approval revoked in a future flow), the next request reading the cookie must server-side validate: "is this user actually a SPACE_OWNER?" If not, fall back to Guest mode silently. Don't trust the cookie alone.

### Decision 3: Mode-switching is for SPACE_OWNER users only

Only users with `role = 'SPACE_OWNER'` can switch modes. The header dropdown shows:
- **Guest users:** no switch option, no nav changes (Phase 1 behavior, plus the upcoming "Become a Space Owner" entry from Story 7-3)
- **SPACE_OWNER in Guest mode:** "Switch to hosting" option in dropdown
- **SPACE_OWNER in Host mode:** "Switch to traveling" option in dropdown
- **SUPER_ADMIN users:** no switch option (Phase 1 behavior continues, no Host mode)

Server-side guard on `switchModeAction`: if the calling user is not a SPACE_OWNER and tries to switch to Host mode, the action no-ops and returns an error state. Don't 500 — just silently keep them in Guest mode. The UI shouldn't surface the switch option for non-owners anyway, but defense-in-depth matters.

### Decision 4: Header nav variants — full enumeration

After this story ships, the header has these variants:

| User State | Nav Items |
|---|---|
| Public (logged out) | Logo + Browse spaces + Log in + Sign up |
| Guest user (logged in) | Logo + Browse spaces + My bookings + user-pill + Log out |
| SPACE_OWNER in Guest mode | Logo + Browse spaces + My bookings + user-pill (with "Switch to hosting" in dropdown) + Log out |
| SPACE_OWNER in Host mode | Logo + Dashboard + My spaces + Bookings + user-pill (with "Switch to traveling" in dropdown) + Log out |
| SUPER_ADMIN | Logo + Browse spaces + Admin + user-pill + Log out (unchanged from Phase 1 / Story 6-2) |

**Host mode nav specifically:** the items "Dashboard," "My spaces," and "Bookings" link to `/owner`, `/owner/spaces`, and `/owner/bookings` respectively. These routes **do not exist yet** — they're built in story 7-5. For this story, the links resolve to 404 OR to a minimal placeholder page. **Decision: render minimal placeholder pages** at those three routes saying "Coming soon — full owner dashboard in story 7-5." This avoids broken-link UX during the transition.

The "Payouts" item from the PRD's Section 7.3 nav table is NOT in this story's Host mode nav. It comes in Epic 9 when payouts exist.

### Decision 5: `switchModeAction` is a Server Action, not an API route

Per Phase 1 architectural patterns, server-side mutations are Server Actions. `switchModeAction` follows the established shape: `useActionState`-compatible, returns typed state, sets/updates the cookie via `cookies()` from `next/headers`, calls `revalidatePath('/', 'layout')` to refresh the header.

The dropdown's "Switch to hosting" / "Switch to traveling" item is a form submission (not a link), with `switchModeAction` as the action target.

### Decision 6: Seed script update — flip a user to SPACE_OWNER

The seed script gets a new option: a designated seed user (probably the existing super admin or a new "Test Space Owner" user) is created with `role = 'SPACE_OWNER'`. This lets BA and developers exercise the mode-switching flow during this story's verification without needing the application flow (which doesn't exist yet).

**Specific seed change:** create one test user with email `owner@deskhive.local` (or similar), password matching the seed pattern, and `role = 'SPACE_OWNER'`. Document the credentials in the seed script comments.

### Decision 7: Role-checking helpers — extend, don't refactor

Phase 1 has existing role-checking utilities (likely in `src/lib/auth/` or similar) that check for SUPER_ADMIN. Story 6-2's memory entry codifies how to extend role-aware nav and route guards.

For this story:
- Find the existing role check helpers
- Add SPACE_OWNER recognition alongside GUEST and SUPER_ADMIN
- Do **not** refactor or abstract them — extend in place
- If there's an `isAdmin(user)` helper, add an `isSpaceOwner(user)` peer; don't rewrite to a generic `hasRole(user, role)` (that's exactly the abstraction Phase 1 Decision #9 forbids in a related context — keep helpers named and specific)

### Decision 8: Migrations are reversible

Drizzle migrations should include both up and down. The down migration drops `spaces.owner_id` and reverts the CHECK constraint. If for any reason this story needs to roll back post-merge, the down migration handles it cleanly.

### Decision 9: No changes to Better Auth configuration

Better Auth continues to manage sessions, login, register. The role field on users continues to be populated by Better Auth at register time (default `GUEST`). No changes to the auth flow itself.

### Decision 10: Memory entry codifying the role + mode pattern

Amelia adds a new memory file (or updates an existing one) capturing:
- The `deskhive_mode` cookie pattern (name, values, default, validation requirement)
- The "Switch to hosting/traveling" affordance pattern as the canonical post-auth role switcher
- The header nav variants table from Decision 4
- The Phase 1 anti-pattern that this supersedes (cosmetic pre-auth toggle from Story 6-6) is already memorialized in `project_login_single_form_post_auth_role_switch.md`; this new memory complements it by codifying the *implementation* of post-auth switching

Suggested memory file name: `reference_role_and_mode_switching.md` or similar (Amelia picks per the naming convention).

---

## Architectural anti-patterns forbidden

- **Do NOT** introduce a generic `hasRole(user, role)` helper. Keep named role-check helpers per Decision 7.
- **Do NOT** store mode in the database. It's session-level. Decision 2.
- **Do NOT** trust the mode cookie without server-side role re-verification. Decision 2.
- **Do NOT** build any of the `/owner/*` dashboard content — only minimal placeholders. Decision 4.
- **Do NOT** modify Better Auth configuration. Decision 9.
- **Do NOT** add an application flow (form, review screen, etc.). That's 7-2/7-3/7-4.
- **Do NOT** add any Stripe-related code. That's Epic 9.
- **Do NOT** add any email-related code. That's Epic 8.
- **Do NOT** backfill existing Phase 1 spaces to a specific owner_id. Keep them NULL.
- **Do NOT** create a `/admin/applications` route or any application-review surface.
- **Do NOT** modify existing Phase 1 admin routes (`/admin/spaces`, `/admin/bookings`, `/admin/guests`).

---

## Browser verification checklist

After Amelia completes the dev story, BA verifies before greenlight:

1. **Migration applies cleanly** — `pnpm drizzle-kit migrate` (or equivalent) runs without error on a fresh DB. Verify the user role CHECK constraint includes SPACE_OWNER. Verify `spaces.owner_id` column exists and is nullable.

2. **Seed creates a SPACE_OWNER user** — run the seed script. Verify a user with `role = 'SPACE_OWNER'` exists in the DB (e.g., `owner@deskhive.local`).

3. **Login as the SPACE_OWNER seed user** — log in with seed credentials. Lands on browse spaces (Guest mode by default). Header shows Guest mode nav (Browse spaces + My bookings + user-pill + Log out).

4. **Header dropdown shows "Switch to hosting"** — click the user-pill in the header. Dropdown reveals "Switch to hosting" option.

5. **Switch to Host mode works** — click "Switch to hosting". Page reloads (or layout revalidates). Header nav changes to Host mode (Dashboard + My spaces + Bookings + user-pill + Log out). URL stays on whatever page you were on.

6. **Switch back to Guest mode works** — click user-pill in Host mode → dropdown shows "Switch to traveling". Click it. Header reverts to Guest mode nav.

7. **Host mode nav items resolve to placeholders** — in Host mode, click Dashboard → lands on a placeholder page saying "Coming soon — full owner dashboard in story 7-5" (or similar). Same for My spaces and Bookings. No 404s, no broken layouts.

8. **Mode persists across page navigation** — switch to Host mode, navigate to `/` (Browse spaces). Header shows... hmm, this is a question — see "Open questions" section.

9. **Login as Guest user (existing seed user)** — log in with a regular guest account. Header shows Guest nav, **no "Switch to hosting" option in dropdown**. Mode cookie either isn't set or doesn't matter.

10. **Login as SUPER_ADMIN (existing seed user)** — log in as super admin. Header shows admin nav (Browse spaces + Admin + user-pill + Log out). **No "Switch to" option in dropdown**. Phase 1 / Story 6-2 behavior unchanged.

11. **Guest cannot switch to Host mode** — try to manually craft a request to `switchModeAction(targetMode='host')` as a Guest user (e.g., via curl or DevTools). Server rejects or no-ops. User stays in Guest mode.

12. **Existing Phase 1 flows unchanged** — register a new account → defaults to GUEST. Log in / log out works. Browse spaces, book a desk, see toast, view my bookings — all unchanged. Admin Confirm/Reject still works. Story 6-2 admin redirect still works.

13. **Story 6-3 booking toast still works** — log in as guest, book a desk → toast appears on Space Detail page with green accent.

14. **Story 6-1 desk price input still works** — log in as admin, edit a desk price → input accepts dollars, saves correctly.

15. **No console errors** during all the above clicking.

16. **All unit + E2E tests pass** — baseline from end of Story 6-6 plus any new tests added by this story.

17. **Footer reads `© 2026 DeskHive`** everywhere — no regression.

---

## Open question for the dev story

**Decision 8 verification step has an open question:** when a SPACE_OWNER in Host mode navigates to `/` (Browse spaces, a Guest-mode-feeling page), what should the header show?

Options:
- **A.** Stay in Host mode (cookie is sticky) — but Browse spaces feels like a Guest activity
- **B.** Auto-switch back to Guest mode when navigating to Guest-mode routes
- **C.** Show Host mode header but render Browse spaces normally (mode is just a header preference)

**Recommendation:** **Option A** — mode is a sticky preference, not auto-managed. The user opted into Host mode; they exit explicitly via the switch. Browse spaces in Host mode just means "owner is browsing other people's spaces" which is fine (they're allowed to be both Guest and Host).

This is the cleanest UX and easiest to verify. If the manager call or user testing surfaces a concern, revisit in a future story.

**Decision: lock Option A.** Mode is sticky. Switch is the only way to change it.

---

## Files likely touched

Estimate for context, not a directive. Dev story may discover additional files.

- `drizzle/schema.ts` or migration files — role enum + spaces.owner_id
- `drizzle/migrations/...` — generated migration SQL
- `src/lib/auth/...` — role check helpers (existing utility extended)
- `src/app/layout.tsx` — header rendering, mode cookie read
- A new header component file (if extracted) or inline edits to layout
- `src/actions/mode.ts` (new) — `switchModeAction`
- `src/app/(owner)/owner/page.tsx` (new) — placeholder dashboard
- `src/app/(owner)/owner/spaces/page.tsx` (new) — placeholder spaces list
- `src/app/(owner)/owner/bookings/page.tsx` (new) — placeholder bookings list
- `scripts/seed.ts` — add SPACE_OWNER test user
- Memory file in `~/.claude/.../memory/` — new pattern entry

---

## Memory note for Phase 2 continuation

This story establishes:
- The `deskhive_mode` session cookie convention
- The "Switch to hosting / Switch to traveling" affordance as the canonical post-auth role switcher
- The Host mode nav variant skeleton (with placeholders that get filled in by 7-5)
- The seed pattern for creating SPACE_OWNER users for testing

Subsequent Theme A stories build on top of:
- 7-2 adds the `applications` table and Server Actions that grant SPACE_OWNER role on approval
- 7-3 adds the user-facing "Become a Space Owner" flow that creates applications
- 7-4 adds the super admin review UI that triggers approval/rejection
- 7-5 (renumbered from original 7-6) fills in the `/owner/*` route surface with real content

Theme B (Payments) and Theme C (Email) build on top of all of Theme A.

---

**End of BA decisions document.**
