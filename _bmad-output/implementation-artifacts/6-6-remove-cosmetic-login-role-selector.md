# Story 6.6: Remove Cosmetic Login Role Selector

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product team aligning the auth UX with DeskHive's actual auth model**,
I want **the cosmetic Guest/Admin toggle removed from `/login`**,
so that **the login screen stops misrepresenting the auth model (one login flow for all roles; role determined by the account, not by pre-auth selection) and we don't carry a fake affordance into Phase 2.**

> Story 6.6 is a follow-up polish item in **Epic 6 — Phase 1 Polish**. Source of truth: [docs/design/6-6-remove-cosmetic-login-role-selector-ba-decisions.md](docs/design/6-6-remove-cosmetic-login-role-selector-ba-decisions.md). Designer Makhbuba Komilova confirmed on 2026-05-12 via Teams that the toggle was a demo affordance and is not required ("Это для демо, можно делать без переключателя"). All decisions locked.

> **Presentation-layer deletion only.** No schema changes. No new Server Actions. No new query helpers. No changes to Better Auth, session handling, or the `loginAction` Server Action. The register page is untouched. Phase 2's multi-tenant theme will introduce the correct post-auth role-switching pattern (Airbnb model — one login, then "Switch to hosting" in the authenticated header dropdown) when the Space Owner role exists.

> **Supersedes Story 5.2 Decision #8** (the prior "treat the toggle as cosmetic-only" decision). The toggle is now removed, not preserved-as-cosmetic.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–8 + Browser verification checklist.

1. **AC-1 (Remove the toggle JSX from `<LoginForm>`).** In [src/app/(public)/login/login-form.tsx](deskhive/src/app/%28public%29/login/login-form.tsx):
   - Delete the entire `<div className="role-seg" role="group" aria-label="Sign in as">` block (lines 35–88, the wrapper plus both `<button>` children with their `<span>` icons and labels).
   - Delete the `useState<Role>` line + the `Role` type alias.
   - Remove `useState` from the React imports (`useActionState` from `react` stays — `useFormStatus` stays from `react-dom`).
   - Update the leading source comment (lines 9–17): replace the "cosmetic-only role selector" rationale with a one-paragraph Story 6.6 note explaining the toggle was removed because pre-auth role selection misrepresents the auth model; the correct post-auth role-switch lives in Phase 2's multi-tenant theme.

2. **AC-2 (Remove `.role-seg` CSS from `globals.css`).** In [src/app/globals.css](deskhive/src/app/globals.css):
   - Delete the entire Story 5-2 role-selector CSS block (lines 1369–1428: from the `/* ==== Story 5-2 — Login role-selector (cosmetic only). ==== */` header through the `.role-seg .role-text .sub { ... }` rule).
   - Boundary check: the block sits between the admin.css `.table.compact tbody td` rule (line 1367, KEEP) and the Story 6-3 Toast palette block (line 1430, KEEP). The deletion must not touch either neighbor.
   - **Write the file via `[System.IO.File]::WriteAllText` with `UTF8Encoding(false)`** per dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` if the PowerShell path is used; alternatively use the `Edit` tool, which is safe in this codebase.

3. **AC-3 (No-stray-references audit — Decision §4).** Per BA Decisions §4 ("Err on the side of removing. Dead CSS is debt."):
   - Grep `deskhive/src/**` for `role-seg`, `role-icon`, `role-text` (case-insensitive). Expected hit count after AC-1 + AC-2 land: **0** (the only callers were the deleted `<LoginForm>` JSX and the deleted CSS block).
   - Grep `deskhive/tests/**` for any test that asserts on the toggle (e.g., looks for `Guest` / `Admin` button text, `Sign in as` label, `role-seg` selector). Expected: **0**. If any are found, remove them per Decision §7.
   - **`data-role="guest"` / `data-role="admin"` attribute selectors** in the deleted CSS block are gone with the block — no separate cleanup needed.

4. **AC-4 (No replacement visual — Decision §2).** Do NOT add an illustration, tagline, brand graphic, decorative element, hr divider, or any other visual element to "fill" the space the toggle vacates. The login form alone is the design after this story. Minor `margin-bottom` / `padding-top` tweaks on the existing form are acceptable IF the post-removal layout looks broken; do not over-engineer.

5. **AC-5 (Preserve simplified login-page header — Decision §3).** Story 5-2 Decision #8 included a header simplification on `/login` (only "Sign up" visible). That part of Decision #8 stays. Only the toggle itself is removed.
   - **Current state check before changing anything:** as of Story 5-2 the header simplification was scope-deferred (per Story 5-2's AC-9 "scope-defer the per-page header simplification and document it in Dev Notes"). If the header simplification was never actually shipped, this AC is a no-op — don't backport it as part of Story 6.6. **Dev-agent must verify before touching `<Header>`.**

6. **AC-6 (No schema / Server Action / query helper / Better Auth changes — Decision §5).** Per BA Decisions §5 + anti-patterns §"Do NOT modify Better Auth flow":
   - `loginAction` byte-for-byte unchanged.
   - `<Header>` component unchanged (see AC-5 caveat — if header simplification was never shipped, leave it as-is).
   - Register page unchanged.
   - Better Auth integration, `nextCookies()` plugin, callback URL logic, session handling — all untouched.

7. **AC-7 (No regression in any Phase 1 / 5.x / 6.x flow — Decision §6).** Every flow verified during Epics 0–6.3 must still work:
   - US-1.1–1.3 auth flows (incl. nextCookies plugin) unchanged.
   - US-2.x admin spaces + desks CRUD unchanged. Story 6.1's dollar input still works.
   - US-3.1–3.5 guest browse / book / cancel. Story 6.3's booking confirmation toast on `/spaces/[id]` still fires correctly (success + error).
   - US-4.1–4.3 admin view / confirm / reject. Story 5.2 admin reskin preserved.
   - Story 6.2 admin redirect on `/my-bookings` continues to work.
   - 166 unit tests + 31 E2E baseline still pass. **No new tests added** per Decision §7. Tests count should NOT change (or decrease by 0 — there are no toggle tests to remove per the AC-3 audit).
   - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

8. **AC-8 (No client-side state for the toggle remains).** Per BA Decisions §1 ("permanent deletion"):
   - After AC-1: no `useState<Role>`, no `setRole`, no `role === 'guest'` / `role === 'admin'` conditionals anywhere in `<LoginForm>`.
   - Verify by typecheck: TypeScript should not surface any unused imports or unused state variables after the removal.

9. **AC-9 (Memory update — Decision §8).** Replace the existing `~/.claude/.../memory/project_login_role_selector_cosmetic.md` entry with a new entry codifying:
   - The pre-auth toggle is removed as of Story 6.6 (commit hash filled by AC-12 follow-up).
   - DeskHive uses **one login flow for all roles**; role is determined by the user account, not pre-auth selection. This matches the Airbnb model (locked as Phase 2's multi-tenant inspiration).
   - **Phase 2 introduces a post-auth role switcher** in the authenticated header dropdown (e.g., "Switch to hosting" / "Switch to space owner") when the Space Owner role exists. Phase 2 should NOT reintroduce a pre-auth toggle.
   - File anchor: rename to `project_login_single_form_post_auth_role_switch.md` per BA Decisions §8 suggestion. Update `MEMORY.md` index to point to the renamed file and rewrite the one-line description.
   - Delete the old `project_login_role_selector_cosmetic.md` file (its content is superseded).

10. **AC-10 (Stop bar — BA browser verification checklist).** All 13 points from BA Decisions §"Browser verification checklist" verified in browser by BA before greenlight. Highlights:
    1. `/login` renders without the toggle — no Guest/Admin segmented control visible.
    2. Login page composition matches the BA-locked list: header (logo + Sign up if simplified per Story 5.2, otherwise full nav) + "Welcome back" + subtitle + email + password + "Log in" + footer link "New to DeskHive? Create an account" + page footer "© 2026 DeskHive".
    3. Visual rhythm acceptable (form does not look broken).
    4. Login as guest → browse spaces with guest nav.
    5. Login as super admin → admin area with admin nav (no "My bookings" per Story 6.2).
    6. Logout returns to public state.
    7. Register flow unchanged.
    8. `callbackUrl` works for both roles (incl. Story 6.2 admin → `/admin/bookings` redirect via the extra-hop pattern).
    9. Story 6.3 booking toast still works.
    10. Story 6.1 desk price form still works.
    11. No console errors.
    12. Footer `© 2026 DeskHive` everywhere.
    13. Unit + E2E tests pass; no toggle tests existed to remove.

11. **AC-11 (No new automated tests — Decision §7).** Per BA Decisions §7 + anti-pattern §"Do NOT add tests asserting the toggle is absent":
    - No new vitest or Playwright tests added in this story. The browser checklist (AC-10) verifies absence.
    - The AC-3 audit removes any pre-existing toggle test (expected: zero hits).

12. **AC-12 (Single commit + memory rename).** Per BA Decisions §"Memory note for Phase 2":
    - All Story 6.6 changes land in a single commit on `main` titled exactly `feat: remove cosmetic login role selector (Story 6-6)`. Commit content is only files under `deskhive/` plus the `_bmad-output/` story file + sprint-status update.
    - A small follow-up `docs:` commit may fill in the Change Log hash + BA greenlight after browser-verification + push (Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3 precedent).
    - The memory rename (delete old, write new, update index) is OUT OF TREE (`~/.claude/.../memory/`) — not part of the commit. Update happens alongside the code change but lives in the dev-agent's local memory store.

## Tasks / Subtasks

- [x] **Task 0 — Prep + audit.**
  - Verify all CI commands on a clean `main` checkout still pass: `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e`. Baseline is 166 unit + 31 E2E from Story 6.3.
  - Read [docs/design/6-6-remove-cosmetic-login-role-selector-ba-decisions.md](docs/design/6-6-remove-cosmetic-login-role-selector-ba-decisions.md) end-to-end.
  - Re-read [src/app/(public)/login/login-form.tsx](deskhive/src/app/%28public%29/login/login-form.tsx) lines 9–88 (the toggle's leading comment, state, and JSX) — this is what gets deleted in Task 1.
  - Re-read [src/app/globals.css](deskhive/src/app/globals.css) lines 1369–1428 (the role-seg CSS block) — this is what gets deleted in Task 2. Verify the boundary: line 1367 (`.table.compact tbody td`) STAYS; line 1430 (Story 6-3 Toast palette block) STAYS.
  - **AC-5 caveat check:** read the existing [src/components/header.tsx](deskhive/src/components/header.tsx) to confirm whether the Story 5-2 login-page header simplification ("only Sign up visible") actually shipped or was deferred. If deferred, Task 1's comment update does NOT mention "preserve the simplification" because there's nothing to preserve. Document the finding in Completion Notes.
  - Grep `deskhive/src/**` and `deskhive/tests/**` for `role-seg`, `role-icon`, `role-text`, `Guest.*Admin`, `Sign in as`, `Manage spaces`, `Book a desk`. Expected: hits only in the two files being deleted-from. Document the audit result in Completion Notes (expected zero stray hits per AC-3).

- [x] **Task 1 — Remove toggle from `<LoginForm>`** (AC-1, AC-8):
  - In `src/app/(public)/login/login-form.tsx`:
    - Delete lines 35–88 (the entire `<div className="role-seg">` block including both buttons, icons, and labels). Verify the deletion ends cleanly before `<div className="mb-4">` for the email field.
    - Delete the `type Role = 'guest' | 'admin';` line (line 17 area).
    - Delete the `const [role, setRole] = useState<Role>('guest');` line.
    - Update the React import: `useActionState, useState` → `useActionState` (drop `useState`).
    - Replace the leading source-comment block (lines 9–17) with a brief Story 6.6 note. Suggested wording: `// Story 6-6 removed the cosmetic Guest/Admin toggle that Story 5-2 shipped // here. DeskHive uses one login flow for all roles; role is determined by // the user account, not by pre-auth selection. Phase 2's multi-tenant theme // will add a post-auth role switcher (Airbnb model) in the authenticated // header dropdown, NOT a pre-auth toggle.`
  - Verify `pnpm typecheck` clean after the change — there should be no unused-import warnings.

- [x] **Task 2 — Remove role-seg CSS from `globals.css`** (AC-2):
  - In `src/app/globals.css`, delete the entire Story 5-2 role-selector block (from the `/* ==== Story 5-2 — Login role-selector (cosmetic only). ==== */` header through the closing `}` of `.role-seg .role-text .sub { ... }`).
  - Sanity check: the line immediately BEFORE the deletion should now be `.table.compact tbody td { padding-top: 0.5rem; padding-bottom: 0.5rem; }`; the line immediately AFTER should be the `/* ==== Story 6-3 — Toast palette (sonner) ==== */` header.
  - Use `Edit` tool with the full block as `old_string` and an empty `new_string` — or if the PowerShell path is used (e.g. for a multi-file rewrite), follow the `[System.IO.File]::WriteAllText` + `UTF8Encoding(false)` pattern from memory `feedback_powershell_utf8_set_content_corrupts.md` to avoid the Cyrillic-locale UTF-8 corruption.

- [x] **Task 3 — Stray-reference audit** (AC-3):
  - After Tasks 1 + 2, re-run the grep from Task 0's audit prep. Confirm the hit count is now **zero** across `deskhive/src/**` and `deskhive/tests/**`.
  - If any stray hit remains (unlikely — the audit prep already verified the toggle is isolated to the two files), remove it.
  - Document the post-removal grep result in Completion Notes.

- [x] **Task 4 — Memory update** (AC-9):
  - In `~/.claude/projects/c--Users-Ixtiyor-Ziyayev-Desktop-vention-ba-bmad/memory/`:
    - Create new file `project_login_single_form_post_auth_role_switch.md` with type `project` (or `reference` if the dev-agent judges it as more reference-shaped). Content per AC-9 + BA Decisions §8.
    - Delete the old file `project_login_role_selector_cosmetic.md` (its content is superseded by the new file).
    - Update `MEMORY.md` index: replace the old line `[Login role-selector is cosmetic-only](project_login_role_selector_cosmetic.md) — Guest/Admin toggle on /login is visual; ...` with a new line pointing to the renamed file with a one-line description matching the new content (e.g., `[Login: single form, post-auth role switch](project_login_single_form_post_auth_role_switch.md) — One login flow; pre-auth Guest/Admin toggle removed Story 6-6; Phase 2 adds post-auth switcher per Airbnb model.`).
  - **Verify** by reading `MEMORY.md` after the change — the old file should not appear in the index; the new one should.

- [x] **Task 5 — Local CI parity** (AC-7):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — 166 passed + 1 skipped (unchanged — Decision §7 says no new tests, AC-3 audit confirms no existing toggle tests).
  - `pnpm build` — clean. Route count unchanged at 28.
  - `pnpm test:e2e` — 31/31 pass. The unauthenticated `/login` redirect test continues to pass.

- [ ] **Task 6 — Manual verification (BA's eyeball — AC-10 / Verification §1–13).** *(DEFERRED to BA's review pass per Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3 precedent — dev-agent runs the automated suite (typecheck/lint/test/build/test:e2e all green); BA owns the 13-point browser checklist.)*

- [x] **Task 7 — Sprint status + single commit** (AC-12):
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - Add `6-6-remove-cosmetic-login-role-selector: review` under the Epic 6 block (after `6-3-booking-confirmation-toast`).
    - Update `last_updated` parenthetical.
  - Update this story file's metadata: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 6 (BA's eyeball deferral); fill in Dev Agent Record (Agent Model, Debug Log References if any, Completion Notes incl. the AC-5 header-simplification verification finding, File List, Change Log row with placeholder hash).
  - Stage `deskhive/...` + the two `_bmad-output/...` files only (memory files are out-of-tree, NOT staged per AC-12).
  - Commit: `feat: remove cosmetic login role selector (Story 6-6)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 6 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash (same pattern as Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3).

## Dev Notes

### What gets built and what's deliberately out of scope

This is a small, surgical removal story closing out the pre-auth-toggle cosmetic-only compromise from Story 5.2. After it lands at `review` and BA greenlights:

- `/login` has no role toggle.
- DeskHive's auth model is no longer misrepresented by the login UI.
- The `project_login_role_selector_cosmetic.md` memory entry is superseded by `project_login_single_form_post_auth_role_switch.md`, codifying the Airbnb-model post-auth role-switch pattern for Phase 2.

Feature scope (Story 6.6 only):
- ✅ Delete the toggle JSX from `<LoginForm>`.
- ✅ Delete the `role-seg` CSS block from `globals.css`.
- ✅ Grep-audit for stray references (expected zero).
- ✅ Memory rename + index update.
- ✅ No-regression check across Epic 0–6.3 flows via CI suite.

Out of scope (do NOT build):
- ❌ Post-auth role switcher / "Switch to hosting" affordance — Phase 2 multi-tenant theme.
- ❌ Replacement visual element on the login page (illustration, tagline, brand graphic) — explicit BA anti-pattern.
- ❌ Changes to the register page (no toggle there to begin with).
- ❌ Changes to `loginAction`, Better Auth config, session handling, callback URL logic.
- ❌ Changes to `<Header>` — the Story 5-2 login-header simplification ("only Sign up visible") was scope-deferred at that time. **Dev-agent verifies its current state** during Task 0 audit prep; preserves whatever currently ships. Do NOT backport the simplification as part of this story.
- ❌ New automated tests asserting absence — over-specification per Decision §7.
- ❌ Feature-flag-gated removal — explicit BA anti-pattern (Decision §1: permanent deletion).
- ❌ Updates to `docs/design/` files — Makhbuba owns those artifacts (BA Decisions §"Out of scope").

### Key decisions

1. **Permanent deletion, no feature flag.** Locked by BA Decisions §1 + anti-pattern §"Do NOT introduce a feature flag". Phase 2 will add the correct post-auth pattern in the correct place (authenticated header dropdown); preserving dead UI on the login screen would create two surfaces to remove later.

2. **Supersedes Story 5-2 Decision #8.** The previous "treat the toggle as cosmetic-only" decision is explicitly overridden. The memory entry `project_login_role_selector_cosmetic.md` is renamed and rewritten in Task 4 to capture the supersession.

3. **CSS block is self-contained.** The Story 5-2 role-seg CSS block (`globals.css` lines 1369–1428) is bounded by two unrelated blocks (admin.css density modifier above, Story 6-3 toast palette below). Deletion is a single contiguous edit with no spillover risk. The audit in AC-3 confirms zero stray references.

4. **AC-5 header simplification caveat.** Story 5-2's AC-9 explicitly deferred the per-page header simplification (showing only "Sign up" on `/login`). The dev-agent must verify the current state of `<Header>` before any comment-writing in Task 1 — the leading comment block in `<LoginForm>` should not claim "Story 6-3 preserves the simplified header" if the simplification was never shipped. Document the finding in Completion Notes.

5. **No new tests.** BA Decisions §7 explicitly forbids "tests asserting the toggle is absent" as over-specification. The AC-3 audit also confirms no existing toggle tests to remove (the toggle had no functional effect; nothing should have asserted on it).

6. **Memory rename, not in-place update.** BA Decisions §8 suggests the new anchor name `project_login_single_form_post_auth_role_switch.md`. Renaming (rather than updating in place) keeps the memory file's title accurately describing its current content. The MEMORY.md index gets a new pointer + new one-line description.

7. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, `revalidatePath` for booking writes, redirect-after-try-catch in Server Actions, layout-level `/admin/*` guard, Story 6.2's admin-redirect on `/my-bookings`, Story 6.3's toast-in-context booking success/error/cancel flow, Story 6.1's dollar-input desk price seam, Story 5.1 + 5.2 reskins.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # Epic 6 — Phase 1 Polish (synthetic, post-Epic-5)
  epic-6: in-progress
  6-1-price-input-dollars: review                          # unchanged
  6-2-hide-my-bookings-from-admin: review                  # unchanged
  6-3-booking-confirmation-toast: review                   # unchanged
  6-6-remove-cosmetic-login-role-selector: review          # NEW
  epic-6-retrospective: optional
```

Update the `last_updated` parenthetical at top of file.

(Items 6-4 was closed as "could not reproduce" during BA investigation. Item 6-5 awaits manager input per the original backlog. Item 6-6 was added on 2026-05-12 post-designer confirmation.)

### Recent commits

```
c8055bb docs: fill commit hash in Story 6-3 Change Log + record BA greenlight
71ab26c feat: booking confirmation toast (Story 6-3)                              ← Last feature commit
6a4c741 docs: fill commit hash in Story 6-2 Change Log + record BA greenlight
be3e16a feat: hide My Bookings from admin nav + redirect direct nav (Story 6-2)
9471224 docs: fill commit hash in Story 6-1 Change Log + record BA greenlight
6e256f6 feat: desk price input accepts dollars, stores cents (Story 6-1)
552c05d docs: fill commit hash in Story 5-2 Change Log + record BA greenlight
c5d830a feat: design reskin — admin screens (Story 5-2)
...
```

Story 6.6 is the **fourth Phase 1 polish commit** (and likely the last before Phase 2 PRD work begins). Subject: `feat: remove cosmetic login role selector (Story 6-6)`.

### References

- [Source: docs/design/6-6-remove-cosmetic-login-role-selector-ba-decisions.md](docs/design/6-6-remove-cosmetic-login-role-selector-ba-decisions.md) — BA decisions document (this story's source of truth).
- [Source: docs/phase2-framing-and-polish-backlog.md](docs/phase2-framing-and-polish-backlog.md) — original polish backlog (item 6-6 added post-designer confirmation).
- [Source: deskhive/src/app/(public)/login/login-form.tsx](deskhive/src/app/%28public%29/login/login-form.tsx) — the file with the toggle to delete (Task 1).
- [Source: deskhive/src/app/globals.css](deskhive/src/app/globals.css) lines 1369–1428 — the CSS block to delete (Task 2).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats (read before touching any code).
- [_bmad-output/implementation-artifacts/5-2-design-reskin-admin-screens.md] — Story 5.2 (where the cosmetic toggle was introduced; Decision #8 is now superseded).
- [_bmad-output/implementation-artifacts/6-3-booking-confirmation-toast.md] — Story 6.3 (most recent commit + memory pattern source).
- Dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required reading if PowerShell file rewrites happen (AC-2's CSS deletion can use either `Edit` or PowerShell; the memory documents the latter's pitfall).
- Dev-agent memory `project_login_role_selector_cosmetic.md` — TO BE REPLACED in Task 4.
- Dev-agent memory `reference_role_specific_nav_pattern.md` — Story 6.2's pattern (still applies; the post-auth role-switch pattern Phase 2 will introduce is a sibling pattern, not a replacement).

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

No issues encountered. Smallest commit in Epic 6 — pure deletion + memory rename. All five CI checks passed first try.

### Completion Notes List

**BA-required decision-point answers:**

1. **AC-5 header-simplification finding:** ✅ **Verified — the Story 5-2 per-page login-header simplification was never shipped.** The `<Header>` Server Component at `deskhive/src/components/header.tsx` lines 72–81 still renders both "Log in" AND "Sign up" links in its Public (logged out) variant, exactly as Story 5-2 documented in its AC-9 scope-deferral. Per Story 6.6 AC-5: this is a no-op. The new Story 6-6 comment in `<LoginForm>` does NOT claim "preserve the simplified header" — there is no simplification to preserve. `<Header>` was not touched in this story.

2. **AC-3 audit result:** ✅ **Zero stray references** across `deskhive/` after Tasks 1+2. Pre-removal grep returned 15 hits (10 in `globals.css`, 5 in `login-form.tsx`) — all in the two files being deleted-from. Post-removal grep returned 0 hits. Tests directory clean both before and after (no toggle test ever existed, matching Decision §7's expectation).

3. **Memory rename outcome:** ✅ Old file `project_login_role_selector_cosmetic.md` deleted; new file `project_login_single_form_post_auth_role_switch.md` created with the locked content (one-login model, Airbnb-inspired Phase 2 post-auth switcher, anti-patterns for Phase 2 to avoid); `MEMORY.md` index line replaced with the new pointer + one-line description. Verified the old file is gone via `ls`.

**Implementation observations worth carrying forward:**

1. **CSS block boundary held cleanly.** The deleted `.role-seg` block (`globals.css` formerly lines 1369–1428) sat between the admin.css density modifier (line 1367) and the Story 6-3 toast palette (then line 1430). Post-removal verification: line 1367 unchanged (`.table.compact tbody td { ... }`), line 1370 now the Story 6-3 toast palette header. Single contiguous deletion, no spillover.

2. **`useState` import dropped cleanly.** The toggle was the only consumer of `useState` in `<LoginForm>`. Removing the state line + the import in the same edit kept typecheck clean (no unused-import lint warning). `useActionState` stays from `react`; `useFormStatus` stays from `react-dom` (used by `<SubmitButton>`).

3. **Comment block rewrite was load-bearing.** The previous comment (lines 9–17 of the original file) documented the toggle as "cosmetic-only" and pointed at an open question. Leaving that comment in place after the deletion would be misleading to the next reader. The new Story 6-6 comment explicitly documents: (a) the toggle was removed, (b) why pre-auth selection misrepresents the auth model, (c) Phase 2's post-auth pattern is the correct home for role switching.

4. **Memory rename rather than in-place update.** The old filename (`project_login_role_selector_cosmetic.md`) no longer described its content after the removal. Per BA Decisions §8 suggestion, renamed to `project_login_single_form_post_auth_role_switch.md` — the filename now matches the codified pattern.

5. **No new tests added** (BA Decisions §7). The browser checklist (AC-10) is the verification mechanism for absence. No test infrastructure expanded.

6. **All cross-cutting framework choices preserved:** `nextCookies()` plugin (US-1.3), conditional UPDATE pattern, `revalidatePath` for booking writes, redirect-after-try-catch in Server Actions, layout-level `/admin/*` guard, Story 6.2's admin-redirect on `/my-bookings`, Story 6.3's toast-in-context booking flow (success/error/cancel), Story 6.1's dollar-input desk seam, Story 5.1 + 5.2 reskins. `loginAction` and Better Auth integration byte-for-byte unchanged.

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean.
- `pnpm test` — 166 passed + 1 skipped (unchanged from Story 6.3 baseline — no new tests added per Decision §7, no existing tests to remove per the AC-3 audit).
- `pnpm build` — clean. Route count unchanged at 28.
- `pnpm test:e2e` — 31/31 passed in 20.7s.

### File List

**Modified (2):**
- `deskhive/src/app/(public)/login/login-form.tsx` — Deleted the 54-line `<div className="role-seg">` block (toggle JSX with both buttons, icons, labels). Deleted the `type Role = 'guest' | 'admin'` alias and the `const [role, setRole] = useState<Role>('guest')` line. Removed `useState` from the React imports. Rewrote the leading source-comment block (lines 9–17 of the original) into a 5-line Story 6-6 note documenting the removal, the one-login model, and the Phase 2 forward pointer.
- `deskhive/src/app/globals.css` — Deleted the entire Story 5-2 `.role-seg` CSS block (formerly lines 1369–1428: header comment + 8 selector rules). Boundary preserved: admin.css density modifier on line 1367 unchanged; Story 6-3 toast palette block now begins on line 1370 (was 1430).

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Added `6-6-remove-cosmetic-login-role-selector: review` to the Epic 6 block (after `6-3-booking-confirmation-toast`). Updated `last_updated` parenthetical.
- `_bmad-output/implementation-artifacts/6-6-remove-cosmetic-login-role-selector.md` — Status / tasks / Dev Agent Record / Change Log (this file).

**Memory (out-of-tree, in `~/.claude/projects/.../memory/` — NOT staged per AC-12):**
- **Deleted:** `project_login_role_selector_cosmetic.md` — superseded by the new file below.
- **Created:** `project_login_single_form_post_auth_role_switch.md` — codifies DeskHive's one-login model + history of the 5-2 → 6-6 evolution + Phase 2 post-auth role-switch plan (Airbnb model) + anti-patterns for Phase 2 to avoid.
- **Updated:** `MEMORY.md` — index line replaced with new pointer + one-line description.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-12 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-12 | Story implemented; toggle JSX + CSS deleted, `<Header>` left untouched (AC-5 confirmed no simplification ever shipped), memory entry renamed. Single commit per AC-12. | `48c8f2e` |
| 2026-05-12 | Browser-verified by BA against AC-10 13-point checklist; greenlit. Smallest commit in Epic 6 (pure deletion + memory rename, zero new logic). | (this follow-up) |
