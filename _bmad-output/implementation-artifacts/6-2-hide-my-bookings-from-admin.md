# Story 6.2: Hide "My Bookings" from Admin Nav

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **the "My bookings" link removed from my header nav and direct navigation to `/my-bookings` to take me to `/admin/bookings` instead**,
so that **the UX matches my role — I operate the platform, I don't book desks — and I don't end up on an empty guest-only page.**

> Story 6.2 is the second story of **Epic 6 — Phase 1 Polish**. Source of truth: [docs/design/6-2-hide-my-bookings-from-admin-ba-decisions.md](docs/design/6-2-hide-my-bookings-from-admin-ba-decisions.md). All decisions locked.

> **Routing + nav change only.** No schema changes. No new query helpers. No new Server Actions. No changes to the guest experience on `/my-bookings`. No changes to the admin bookings page. The `/my-bookings` route is preserved (guests still use it). The `listBookingsForGuest` / `listAllBookings` queries are untouched.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–9 + Browser verification checklist.

1. **AC-1 (Header nav — hide "My bookings" for Super Admin).** In [src/components/header.tsx](deskhive/src/components/header.tsx), the existing conditional `{user && (<Link href="/my-bookings">My bookings</Link>)}` (line 43-47) becomes role-aware:
   - **Public (logged out):** unchanged — logo + Browse spaces + Log in + Sign up.
   - **Guest (logged in, role !== 'SUPER_ADMIN'):** unchanged — logo + Browse spaces + **My bookings** + user-pill + Log out.
   - **Super Admin:** new variant — logo + Browse spaces + **Admin** + user-pill + Log out. **"My bookings" link must not render** in the admin nav.
   - The role check uses the existing `session.user.role === 'SUPER_ADMIN'` pattern that already gates the "Admin" link on line 49. No new helper, no new role-fetch.
   - The header's leading source-comment (lines 6–18) must be updated to reflect the new admin variant (drop the "My bookings" mention from the Super Admin line).

2. **AC-2 (Server-side admin redirect on `/my-bookings`).** In [src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx), after the existing `requireSession()` check (line 14–22) and before any data fetching, add a role check:
   - If `session.user.role === 'SUPER_ADMIN'` → call `redirect('/admin/bookings')` from `next/navigation`.
   - The redirect must be **server-side** via `redirect()` — not client-side. The admin must never see the guest "My bookings" content even for one frame.
   - Execution order is locked (BA Decisions §4):
     1. `requireSession()` — if unauthenticated, `redirect('/login?callbackUrl=/my-bookings')` (existing behavior unchanged).
     2. Role check — if `SUPER_ADMIN`, `redirect('/admin/bookings')` (NEW).
     3. Otherwise (guest) — fetch via `listBookingsForGuest` and render (existing behavior unchanged).

3. **AC-3 (Reuse existing role-check mechanism — no new helper).** Per BA Decisions §5 + architectural anti-pattern §"Do NOT introduce a new role-checking utility":
   - The role check in `my-bookings/page.tsx` reads `session.user.role` directly with the same `as { role?: string }` cast pattern the header uses today.
   - **Do NOT** introduce a new `requireGuest()` / `redirectIfAdmin()` / etc. helper. The existing `requireRole(session, 'SUPER_ADMIN')` from [src/lib/auth/guards.ts](deskhive/src/lib/auth/guards.ts) is for throwing 403 — not appropriate here (we want a redirect, not a deny). A direct inline `if (role === 'SUPER_ADMIN') redirect('/admin/bookings')` is the cleanest expression of the intent.

4. **AC-4 (Guest experience on `/my-bookings` is unchanged).** Per BA Decisions §3:
   - For an authenticated guest (`role !== 'SUPER_ADMIN'`), `/my-bookings` renders exactly as today: status sections (Awaiting / Upcoming / Past), `listBookingsForGuest`-sourced data, `<CancelBookingButton>` on PENDING rows, empty state copy preserved verbatim.
   - **Do NOT** modify the `BookingCard`, `DeskGlyph`, or section-partitioning logic.
   - **Do NOT** modify any query helper or schema.

5. **AC-5 (Unauthenticated experience on `/my-bookings` is unchanged).** Per BA Decisions §4:
   - Unauthenticated visitors continue to redirect to `/login?callbackUrl=/my-bookings`.
   - The admin role check **only runs after `requireSession()` succeeds** — execution order matters (BA Decisions §4).
   - The existing E2E test in [tests/e2e/bookings.spec.ts](deskhive/tests/e2e/bookings.spec.ts) (`'GET /my-bookings redirects to /login'`) continues to pass without modification.

6. **AC-6 (Callback-URL flow — extra hop is acceptable).** Per BA Decisions §6:
   - If an admin logs in via a link with `callbackUrl=/my-bookings`, the post-login redirect lands them on `/my-bookings`, which immediately server-side-redirects to `/admin/bookings`. **Do NOT** short-circuit this — one extra hop is acceptable behavior and avoids scattering role checks into the login flow.
   - **Do NOT** modify `loginAction` or the callback-URL same-origin guard from US-3.3.

7. **AC-7 (Admin-context surface audit — Decision §9).** Bundle a small audit into this story:
   - Grep the codebase for any other references to `/my-bookings` or "My bookings" rendered inside admin-context surfaces (admin layout, admin sub-nav, admin sidebar placeholders, admin breadcrumbs, admin empty states). If found, remove.
   - **Expected hits:** likely zero. Story 5.2's `<AdminTabs>` only has Spaces / Bookings / Guests; admin layout / admin pages don't render "My bookings" anywhere. But verify rather than assume.
   - Out-of-scope hits to **ignore**: `actions/booking.ts`'s `revalidatePath('/my-bookings')` (correct — guest writes still need to invalidate the guest page cache), the route file path itself, and the `bookings.spec.ts` test references (those are unauth tests; AC-5 says they stay).

8. **AC-8 (No new toast / banner / error UI).** Per BA Decisions §8 + architectural anti-pattern §"Do NOT add a 'you don't have permission' page":
   - The redirect is silent. No toast, no flash message, no banner saying "Admins don't use My Bookings."
   - **Do NOT** create a `/403` page or a "wrong role" view. The admin lands on a useful destination and continues.

9. **AC-9 (No client-side redirects).** Per architectural anti-pattern §"Do NOT use client-side redirects":
   - Use Next.js `redirect()` from `next/navigation` inside the Server Component.
   - **Do NOT** introduce `useRouter().push()`, `window.location`, `<Navigate>`, or any client-side navigation pattern for this redirect.

10. **AC-10 (No regression in any Phase 1 / 5.x / 6.x flow).** Every flow verified during Epics 0–6.1 must still work:
    - US-1.1–1.3 auth flows (incl. nextCookies plugin) unchanged.
    - US-2.x admin spaces + desks CRUD unchanged. Story 6-1's dollar input still works (`dailyPriceDollars` → `dailyPriceCents` rename seam preserved).
    - US-3.1–3.5 guest browse / book / cancel — guest `/my-bookings` still shows status sections, cancel button still works on PENDING rows.
    - US-4.1–4.3 admin view / confirm / reject — admin `/admin/bookings` still shows the table + filter chips + Confirm/Reject from Story 5.2.
    - Story 5.1 + 5.2 reskins preserved.
    - Footer reads `© 2026 DeskHive` everywhere.
    - 148 unit tests + 31 E2E tests still pass. **No new tests required** (see AC-12 for the reasoning). If E2E tests grow, the dev-agent must justify why.
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

11. **AC-11 (Stop bar — BA browser verification checklist).** Per BA Decisions §"Browser verification checklist" 1–13. All 13 points verified in browser by BA before greenlight. Highlights:
    1. Header as super admin: **no "My bookings" link.**
    2. Header as guest: My bookings link visible (unchanged).
    3. Header as public: unchanged.
    4. `/my-bookings` as admin → URL bar flips to `/admin/bookings`. No content flash.
    5. `/my-bookings` as guest → renders status sections.
    6. `/my-bookings` logged out → redirects to login w/ callbackUrl.
    7. Callback flow as admin → land on `/admin/bookings` (one extra hop).
    8. Callback flow as guest → land on `/my-bookings` (normal).
    9. Admin still can Confirm/Reject from `/admin/bookings`.
    10. Guest still can cancel pending bookings.
    11. No console errors during multi-role navigation.
    12. All unit + E2E tests still pass.
    13. Footer reads `© 2026 DeskHive`.

12. **AC-12 (Automated test coverage — what's added, what's deferred).**
    - **Existing E2E test in `bookings.spec.ts:15`** (`'GET /my-bookings redirects to /login'`) covers AC-5 (unauthenticated case) and continues to pass. **No change.**
    - **No new automated test for the admin-redirect path** in this story. Per BA Decisions §7 ("No tests of empty-state admin behavior on `/my-bookings`") and consistent with Stories 5.1 / 5.2 / 6.1 (no authenticated E2E tests in the suite — every test runs unauthenticated). Adding the test infrastructure to log in as an admin in E2E is a significant scope expansion (Better Auth test fixtures, session-cookie helpers, seed-data orchestration). **Deferred to a follow-up story** if BA decides authenticated E2E coverage is worth the infrastructure cost. For Story 6.2, **BA's browser checklist (AC-11) is the verification mechanism for the admin-redirect path**, matching the precedent set by Stories 5.1 / 5.2 / 6.1.
    - **Header role-variant rendering** — the Header is a Server Component using `headers()` (`next/headers`), which isn't trivially testable in vitest without Next.js infra. Same deferral rationale.

13. **AC-13 (Bundled mojibake cleanup — opportunistic carry-over from Story 5.1).** While auditing the touched files, the dev-agent should grep `my-bookings/page.tsx` (and adjacent files only) for any remaining Cyrillic-locale mojibake artifacts (`в†'`, `вЂ"`, `вЂ¦`, `В·`, `В§`, etc. — see memory `feedback_powershell_utf8_set_content_corrupts.md`). If found, fix in-place via `[System.IO.File]::WriteAllText` + `UTF8Encoding(false)`. **Known hit:** the comment on `my-bookings/page.tsx:183` contains `в†'` (cp1251-recoded `→` arrow). One-character fix; bundle. This is opportunistic — do NOT expand the scope beyond files touched by this story.

14. **AC-14 (Single commit + memory entry).** Per BA Decisions §"Memory note for Phase 2":
    - All Story 6.2 changes land in a single commit on `main` titled exactly `feat: hide My Bookings from admin nav + redirect direct nav (Story 6-2)`. Commit content is only files under `deskhive/` plus the `_bmad-output/` story file + sprint-status update.
    - A small follow-up `docs:` commit may fill in the Change Log hash + BA greenlight after browser-verification + push (Story 5.1 / 5.2 / 6.1 precedent).
    - **Add a memory entry** flagging the role-specific nav variant + server-side wrong-role redirect pattern so Phase 2 work (Space Owner role) follows the same approach. Suggested type: `reference`. Suggested name: `Role-specific nav + wrong-role redirect pattern`. Update `MEMORY.md` index.

## Tasks / Subtasks

- [x] **Task 0 — Prep.**
  - Verify all CI commands on a clean `main` checkout still pass: `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e`. Baseline is 148 unit + 31 E2E from Story 6.1.
  - Read [docs/design/6-2-hide-my-bookings-from-admin-ba-decisions.md](docs/design/6-2-hide-my-bookings-from-admin-ba-decisions.md) end-to-end before touching code.
  - Read [src/components/header.tsx:43-49](deskhive/src/components/header.tsx) (the gate to change) and [src/app/my-bookings/page.tsx:14-22](deskhive/src/app/my-bookings/page.tsx) (the auth check to extend).

- [x] **Task 1 — Header nav: hide "My bookings" for Super Admin** (AC-1):
  - In `src/components/header.tsx`, change the conditional that renders the "My bookings" `<Link>` (line 43-47):
    ```tsx
    {user && role !== 'SUPER_ADMIN' && (
      <Link href="/my-bookings" className="nav-link">
        My bookings
      </Link>
    )}
    ```
  - Update the source-comment block at the top of the file (lines 6–18) to reflect the new admin nav variant. Drop "My bookings" from the `// Super Admin:` line. Add a one-line note pointing to Story 6.2.

- [x] **Task 2 — `/my-bookings`: server-side admin redirect** (AC-2, AC-3, AC-9):
  - In `src/app/my-bookings/page.tsx`, after the existing `requireSession()` try/catch (line 14-22), before the `listBookingsForGuest` call, add:
    ```ts
    // Story 6-2: super admins don't book desks. Send them to their natural
    // workspace at /admin/bookings (BA Decisions §2). Silent server-side
    // redirect — no flash, no toast (Decisions §8).
    const role = (session.user as { role?: string }).role;
    if (role === 'SUPER_ADMIN') {
      redirect('/admin/bookings');
    }
    ```
  - The `redirect` from `next/navigation` is already imported (line 1). No new imports.
  - The `requireRole(session, 'SUPER_ADMIN')` helper from `@/lib/auth/guards` is NOT appropriate here — it throws `AuthError(403)`, but we want a clean 307/302 redirect. Use the direct inline check. Document the choice in the comment.

- [x] **Task 3 — Audit for stale "My bookings" references in admin surfaces** (AC-7):
  - Run a grep across `deskhive/src/app/admin/**` and `deskhive/src/components/**` for `'/my-bookings'`, `"My bookings"`, `'my-bookings'` (case-insensitive, file globs as appropriate). Expected hit count: **0** (header is the only emitter; other admin pages don't link to it). If anything turns up, remove it.
  - Out-of-scope hits to **ignore** explicitly in the audit: `src/actions/booking.ts` revalidatePath calls (correct), `tests/e2e/bookings.spec.ts` unauthenticated test (AC-5 says it stays), `src/db/queries/bookings.ts` source comment (documentation, not UI).

- [x] **Task 4 — Mojibake cleanup on touched files only** (AC-13):
  - After Tasks 1+2 are done, grep `src/app/my-bookings/page.tsx`, `src/app/my-bookings/cancel-booking-button.tsx`, and `src/components/header.tsx` for any cp1251-recoded mojibake (`в†'`, `вЂ"`, `вЂ¦`, `В·`, `В§`, etc.).
  - **Known hit:** `my-bookings/page.tsx:183` has `в†'` in a comment (cp1251-recoded `→`).
  - Fix via `[System.IO.File]::WriteAllText` + `New-Object System.Text.UTF8Encoding $false` (per memory `feedback_powershell_utf8_set_content_corrupts.md`). Byte-verify after write.
  - **Do NOT** expand the audit beyond the three files Task 1+2 touch. Bulk repo-wide mojibake sweeps are out of scope.

- [x] **Task 5 — Local CI parity:**
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 148 + 0 new (no new tests per AC-12).
  - `pnpm build` — clean, route count unchanged (no new pages, no deleted pages).
  - `pnpm test:e2e` — 31 prior tests still pass. The unauthenticated `'GET /my-bookings redirects to /login'` test in `bookings.spec.ts` continues to pass without modification.

- [ ] **Task 6 — Manual verification (BA's eyeball — AC-11 / Verification §1–13).** *(DEFERRED to BA's review pass per Stories 5.1 / 5.2 / 6.1 precedent — dev-agent runs automated suite (typecheck/lint/test/build/test:e2e all green); BA owns the eyeball checklist for the admin-redirect path since no authenticated E2E infrastructure exists.)*

- [x] **Task 7 — Memory + sprint status + single commit** (AC-14):
  - Add memory entry `reference_role_specific_nav_pattern.md` (or similar) flagging:
    - Header role-specific nav variants — pattern for Phase 2's Space Owner role.
    - Server-side wrong-role redirects on role-mismatched routes — pattern for `/owner/*` and reviewing `/admin/*`.
    - Cross-reference Story 6.2 commit.
    Type: `reference`. Update `MEMORY.md` index entry to one line.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - `6-2-hide-my-bookings-from-admin: backlog` → `review`.
    - Update `last_updated` parenthetical.
  - Update this story file's metadata: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 6 (BA's eyeball deferral); fill in Dev Agent Record (Agent Model, Debug Log References table, Completion Notes, File List, Change Log with placeholder hash).
  - Stage `deskhive/...` + the two `_bmad-output/...` files only.
  - Commit: `feat: hide My Bookings from admin nav + redirect direct nav (Story 6-2)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 6 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash (same pattern as Stories 5.1 / 5.2 / 6.1).

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second story of Epic 6 — Phase 1 Polish**. After it lands at `review` and BA greenlights:

- Super admins see a nav without "My bookings" — matches their actual role.
- Direct nav to `/my-bookings` as an admin server-side-redirects to `/admin/bookings`.
- Strict role separation is reinforced as the codebase pattern (memory entry).
- Guest, public, and unauthenticated experiences are unchanged.

Feature scope (Story 6.2 only):
- ✅ Header: hide "My bookings" link in the SUPER_ADMIN nav variant.
- ✅ `/my-bookings`: add server-side admin role check + `redirect('/admin/bookings')`.
- ✅ Audit + remove stale "My bookings" references in admin surfaces (expected: 0 hits).
- ✅ Opportunistic mojibake fix on `my-bookings/page.tsx:183`.
- ✅ Memory entry: role-specific nav + wrong-role redirect pattern for Phase 2.

Out of scope for Story 6.2 (do NOT build):
- ❌ Any change to the guest `/my-bookings` page (BookingCard, sections, queries, empty state copy).
- ❌ Any change to `/admin/bookings` (filter chips, table, Confirm/Reject buttons — Story 5.2's behavior preserved).
- ❌ Any change to login / register / Better Auth flow.
- ❌ Any new role-checking helper or auth-guard utility.
- ❌ Any client-side redirect (`useRouter().push()`, `window.location`).
- ❌ Any toast / banner / 403 page for admins on `/my-bookings`.
- ❌ Any new authenticated E2E test infrastructure (Better Auth test fixtures, login helpers, session-cookie injection). Significant scope; deferred unless BA explicitly asks.
- ❌ Repo-wide mojibake sweep — only the files Tasks 1+2 touch (per AC-13).
- ❌ Phase 1 polish item 6-3 (booking confirmation toast) — separate story.
- ❌ Phase 1 polish item 6-6 (login role-selector functional, related to BA Decisions §"Out of scope"). Cosmetic-only toggle stays from Story 5.2.

### Key decisions

1. **Use the existing `session.user.role` check, not a new helper.** Locked by BA Decisions §5 + anti-pattern §"Do NOT introduce a new role-checking utility". The header already does this on line 49 (`role === 'SUPER_ADMIN'`). `/my-bookings` should do the same inline. The `requireRole()` helper in `lib/auth/guards.ts` throws `AuthError(403)` — wrong shape for a redirect. Inline check is cleaner.

2. **Server-side `redirect()`, not client-side.** Locked by BA anti-pattern §"Do NOT use client-side redirects". The admin should never see guest "My bookings" content even for one render frame. Next.js's `redirect()` from `next/navigation` is already imported in `my-bookings/page.tsx` (the unauthenticated branch uses it on line 19).

3. **Execution order: auth check FIRST, then role check.** Per BA Decisions §4. The `requireSession()` try/catch must run before any `session.user.role` access — otherwise an unauthenticated visitor would NPE on `session.user`. The unauthenticated redirect to `/login?callbackUrl=/my-bookings` is preserved unchanged.

4. **Extra-hop on callbackUrl flow is intentional and acceptable.** BA Decisions §6 explicitly accepts the one extra hop. Adding callback-aware role logic to `loginAction` would scatter role checks and create maintenance debt for Phase 2's multi-tenant work. The `/my-bookings` page's own admin-redirect handles the case cleanly.

5. **No new tests in this story.** Per AC-12: the existing `bookings.spec.ts` unauthenticated test covers AC-5; the admin redirect verification belongs to BA's browser checklist because no authenticated E2E infrastructure exists. Adding that infrastructure (Better Auth fixtures, session-cookie helpers, seed orchestration) is a meaningful side quest — defer unless BA decides authenticated E2E is worth the cost. This matches the Story 5.1 / 5.2 / 6.1 precedent.

6. **Header source-comment block must be updated.** The existing comment at the top of `header.tsx` enumerates the three audience variants verbatim. After this story it lies (Super Admin still has "My bookings" in the comment). Update the comment alongside the code change. Add a one-line "Story 6-2: …" note pointing to the rationale.

7. **Audit is small and expected to find nothing.** Phase 1 admin surfaces (admin layout, admin sub-nav from Story 5.2's `<AdminTabs>`, admin pages) don't link to `/my-bookings`. The `revalidatePath('/my-bookings')` calls in `actions/booking.ts` are correct — they invalidate the guest page cache after guest writes, which is what they should do. Don't chase them.

8. **Mojibake fix is opportunistic and narrow.** Per AC-13: only files Tasks 1+2 touch. The known hit (`my-bookings/page.tsx:183`'s `в†'`) is a single character. Don't sweep the whole repo — that's a separate cleanup. Bundle the touched-file fix to avoid leaving known artifacts behind.

9. **Memory entry establishes the Phase 2 pattern.** The role-specific nav variant + server-side wrong-role redirect is the right approach for Phase 2's multi-tenant rebalance (Space Owner role). Codifying it now in `~/.claude/.../memory/` means future stories follow the same approach rather than inventing alternatives. Per BA Decisions §"Memory note for Phase 2".

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # Epic 6 — Phase 1 Polish (synthetic, post-Epic-5)
  epic-6: in-progress
  6-1-price-input-dollars: review                    # unchanged from Story 6.1
  6-2-hide-my-bookings-from-admin: review            # was: backlog
  6-3-booking-confirmation-toast: backlog            # unchanged
  epic-6-retrospective: optional
```

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
9471224 docs: fill commit hash in Story 6-1 Change Log + record BA greenlight
6e256f6 feat: desk price input accepts dollars, stores cents (Story 6-1)    ← Last feature commit
552c05d docs: fill commit hash in Story 5-2 Change Log + record BA greenlight
c5d830a feat: design reskin — admin screens (Story 5-2)
c4b832b docs: fill commit hash in Story 5-1 Change Log + record BA greenlight
adabba7 feat: design reskin — public screens (Story 5-1)
0583a43 feat: admin reject booking (US-4.3)
...
```

Story 6.2 is the **second Phase 1 polish commit**. Subject: `feat: hide My Bookings from admin nav + redirect direct nav (Story 6-2)`.

### References

- [Source: docs/design/6-2-hide-my-bookings-from-admin-ba-decisions.md](docs/design/6-2-hide-my-bookings-from-admin-ba-decisions.md) — BA decisions document (this story's source of truth).
- [Source: docs/phase2-framing-and-polish-backlog.md §6-2](docs/phase2-framing-and-polish-backlog.md) — original polish item framing ("Option A: strict separation — admins cannot book desks").
- [Source: deskhive/src/components/header.tsx](deskhive/src/components/header.tsx) — the file with the conditional to change (Task 1).
- [Source: deskhive/src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx) — the page that gets the new role-redirect (Task 2).
- [Source: deskhive/src/lib/auth/guards.ts](deskhive/src/lib/auth/guards.ts) — existing role guards; `requireRole()` throws 403 and is NOT used here (we want redirect, not deny).
- [Source: deskhive/tests/e2e/bookings.spec.ts:15](deskhive/tests/e2e/bookings.spec.ts) — unauthenticated `/my-bookings` redirect test (continues to pass; covers AC-5).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats (read before touching any code).
- [_bmad-output/implementation-artifacts/6-1-price-input-dollars.md] — Story 6.1 implementation artifact (template + commit pattern source).
- Dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required reading for the AC-13 mojibake fix.
- Dev-agent memory `project_login_role_selector_cosmetic.md` — the login role-selector remains cosmetic-only and is unaffected by this story (different surface).

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

No issues encountered. All five CI checks passed first try (typecheck / lint / test / build / test:e2e). No new tests, no edge cases surfaced.

### Completion Notes List

**Implementation observations:**

1. **Two-line code change, six-line comment change.** Story 6-2 is the smallest commit of the project so far. The header gate became `{user && role !== 'SUPER_ADMIN' && ...}` (one extra clause). The `/my-bookings` page got a 4-line role check + 5 lines of explanatory comment. Everything else (audit, mojibake, memory, sprint-status) is housekeeping around that core change.

2. **Audit per AC-7 turned up exactly 0 stale references** in admin surfaces, as predicted. The grep on `src/app/admin/**` for `my-bookings` / `My bookings` returned no matches. The grep on `src/components/**` returned only the (now correctly role-gated) Guest-variant link in `header.tsx` plus the new Story 6-2 comments. No removals needed.

3. **Mojibake cleanup per AC-13: 1 fix at `my-bookings/page.tsx:193`** (was line 183 before my role-check insertion bumped the line numbers). The `в†'` (cp1251 reinterpretation of UTF-8 `0xE2 0x86 0x92` → rightwards arrow) is now `→`. Byte-verified `0xE2 0x86 0x92` at offset 6788 after the `WriteAllText` + `UTF8Encoding(false)` pass. The other two touched files (`header.tsx`, `cancel-booking-button.tsx`) had no mojibake. Scope strictly held to "files touched by Tasks 1+2 only" per AC-13.

4. **Inline role check chosen over `requireRole()` helper** — documented in the page's comment. `requireRole(session, 'SUPER_ADMIN')` from `@/lib/auth/guards` throws `AuthError(403)`, which is the right shape for an API-route deny but the wrong shape for a "wrong role, send them somewhere useful" redirect. The inline `if (role === 'SUPER_ADMIN') redirect('/admin/bookings')` is the cleanest expression of the redirect intent and matches the pattern the header uses for its admin-link gate.

5. **Execution order is right** — auth check (`requireSession()` + unauthenticated `redirect('/login?callbackUrl=...')`) runs BEFORE the role check accesses `session.user.role`. An unauthenticated visitor never reaches the role-check line; their `redirect()` already fired in the catch block above.

6. **`AC-12` honored: no new automated tests** for the admin-redirect path. The existing `'GET /my-bookings redirects to /login'` test in `tests/e2e/bookings.spec.ts:15` covers AC-5 (unauthenticated case) and passed without modification. Authenticated E2E infrastructure is a meaningful side quest deferred until BA explicitly asks for it.

7. **All cross-cutting framework choices preserved:** `nextCookies()` plugin (US-1.3), conditional UPDATE pattern (US-2.2), `revalidatePath` for booking writes (still fires correctly for guest writes — admin redirect doesn't affect cache invalidation since admins never trigger guest booking writes), redirect-after-try-catch in Server Actions, layout-level `/admin/*` guard, `callbackUrl` same-origin guard from US-3.3 (now exercises the extra-hop flow for admin callbackUrl per AC-6). Story 5.1 + 5.2 + 6.1 reskins and dollar-input behavior unchanged.

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean (no escapes needed; the apostrophe in `won't` from Story 5.1 was already escaped as `won&apos;t`).
- `pnpm test` — 148 passed + 1 skipped (unchanged from Story 6.1 baseline — no new tests in this story per AC-12).
- `pnpm build` — clean. Route count unchanged at 28.
- `pnpm test:e2e` — 31/31 passed in 10.8s. The unauthenticated `/my-bookings` redirect test continues to pass without modification.

### File List

**Modified (2):**
- `deskhive/src/components/header.tsx` — Added `role !== 'SUPER_ADMIN'` clause to the My-bookings link conditional (line 49). Updated the source-comment block to reflect the new Super Admin nav variant and added a Story 6-2 cross-reference.
- `deskhive/src/app/my-bookings/page.tsx` — Inserted server-side admin redirect after `requireSession()` (lines 24-32). Bundled mojibake fix `в†'` → `→` in the comment on what's now line 193.

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `6-2-hide-my-bookings-from-admin: ready-for-dev` → `review`; `last_updated` parenthetical updated.
- `_bmad-output/implementation-artifacts/6-2-hide-my-bookings-from-admin.md` — Status / tasks / Dev Agent Record / Change Log (this file).

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- `reference_role_specific_nav_pattern.md` — Codifies the header role-variant + server-side wrong-role redirect pattern as the Phase 2 template for the Space Owner role (per AC-14 + BA Decisions §"Memory note for Phase 2").
- `MEMORY.md` — Index updated.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-12 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-12 | Story implemented; admin nav cleaned + server-side redirect added. Single commit per AC-14. | (filled by a small follow-up commit after push, once the hash is stable — same pattern as Stories 5.1 / 5.2 / 6.1) |
