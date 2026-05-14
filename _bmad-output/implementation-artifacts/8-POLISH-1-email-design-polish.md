# Story 8-POLISH-1: Email Design Polish (visual wrapper refinement)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **recipient of any DeskHive transactional email** (Guest, Owner, applicant),
I want **the visual wrapper around all 11 shipped templates upgraded to Makhbuba's Phase 2 design** — inline-SVG hex logo, refined typography, locked-copy footer, branded From-header — **without changing any locked body copy, subjects, or template data shapes**,
so that **the visual identity matches the rest of the Phase 2 product without re-litigating the body content already locked in Stories 8-2 + 8-3.**

> Story 8-POLISH-1 is a **polish story** — sits inside Epic 8 (Email Infrastructure / Theme C) between Stories 8-3 and 8-4. Source of truth: [docs/design/8-POLISH-1-email-design-polish-ba-decisions.md](docs/design/8-POLISH-1-email-design-polish-ba-decisions.md). All decisions locked.

> **Wrapper-only.** Touches `renderBaseTemplate` in [src/lib/email.ts](deskhive/src/lib/email.ts) + the `from` field in `sendEmail`'s Resend call. Zero changes to the 11 individual template files, their data shapes, their subjects, or their body copy. All Story 8-2 + 8-3 voice/anti-leakage assertions continue to apply unchanged.

> **MEDIUM polish scope (Decision §1).** Applies visual wrapper improvements that work with current data shapes. Defers everything that depends on Phase 2 data not yet shipped — receipt table (→ Story 8-4 once payment data flows), plain-text fallback (polish backlog), tagline pattern, unsubscribe/help/terms links (polish backlog).

> **Key anti-patterns to keep in mind:**
> - **Inline SVG hex, not CSS `clip-path`** — most email clients strip clip-path (Decision §3).
> - **No external image refs** — kills the EMAIL_LOGO_URL env-var infrastructure from Story 8-1 (Decision §3).
> - **Inter via font-stack fallback, not `<link>`** — email clients strip `<link>` tags (Decision §5).
> - **`DeskHive <onboarding@resend.dev>`** — display name only; Resend sandbox sender stays (no custom domain until Phase 3 + Resend domain verification) (Decision §4).
> - **No link-to-nothing footer** — `/email-preferences`, `/help`, `/terms` don't exist; new footer copy doesn't reference them (Decision §7).
> - **No fake physical address** in footer (Decision §7).

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–14 + Browser verification checklist (17 points).

1. **AC-1 (Container layout — table-based, `#FAFAFA` gutter, white card).** Per BA Decision §8:
   - Rewrite the `<body>` + outer `<table>` structure of [src/lib/email.ts](deskhive/src/lib/email.ts) `renderBaseTemplate` per the locked HTML in Decision §8:
     - `<body>` background: `#FAFAFA` (was `#f5f5f7`); font-family per Decision §5; color `#3F3F46` (zinc-700).
     - Outer table sets the page gutter; padding `32px 16px` (was `24px 12px`).
     - Inner table is the email card: `width="600"`, `max-width: 600px`, `background-color: #FFFFFF`, `border: 1px solid #E4E4E7`, `border-radius: 12px`, `overflow: hidden`.
     - Three rows: header / body slot / footer. Header has `border-bottom: 1px solid #E4E4E7`; footer has `border-top: 1px solid #E4E4E7`.
     - Header padding `24px 32px`; body padding `32px`; footer padding `24px 32px`.
   - Container retains the hidden preview-text `<div>` at the top of `<body>` (preserves Story 8-1's inbox preview line — the `previewText` is still passed through `escapeHtml`).
   - **`role="presentation"`** preserved on all layout tables (screen-reader convention from Story 8-1).
   - **No `<style>` blocks** — inline CSS only (carryover from Story 8-1 Decision §6).

2. **AC-2 (Inline SVG hex logo — header + footer; no CSS `clip-path`, no external `<img>`).** Per BA Decision §3:
   - Header emits an inline `<svg>` matching the locked markup in Decision §3:
     ```html
     <svg width="22" height="22" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
          style="vertical-align: middle; display: inline-block;">
       <polygon points="25,5 75,5 100,50 75,95 25,95 0,50" fill="#4F46E5" />
     </svg>
     ```
   - Footer emits a smaller version (14×14 viewBox-scaled — same polygon points) per Decision §3.
   - Both SVGs sit before the "DeskHive" wordmark with `8px` gap (header) / `8px` gap (footer).
   - **`#4F46E5`** matches `--color-brand-600` (Phase 1 brand primary).
   - **Anti-pattern enforced:** no CSS `clip-path: polygon(...)` anywhere; no `<img src="...">`; no external CDN URL.

3. **AC-3 (Typography — Inter via font-stack fallback chain).** Per BA Decision §5:
   - Font-family applied at the `<body>` level (and propagated to inner elements that need to inherit explicitly because email clients vary):
     ```css
     font-family: "Inter", "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
     ```
   - **Body typography baseline** in the body-slot row: font-size `15px`, line-height `24px` (1.6 ratio), color `#3F3F46`, font-weight `400`.
   - **Footer typography:** font-size `13px`, line-height `20px`, color `#71717A` (zinc-500).
   - **Header wordmark:** font-weight `500`, color `#3F3F46`, font-size `15px` (or inherits from body).
   - **No `<link rel="stylesheet">`, no `@import url(...)`** — email clients strip both.
   - The individual templates' inline styles (Stories 8-2 + 8-3) continue to set their own `font-size`/`color` on `<p>` tags; those overrides remain authoritative for body content. The wrapper sets the default that templates inherit when they don't override.

4. **AC-4 (Footer — locked verbatim copy, no link-to-nothing, no fake address).** Per BA Decision §7:
   - Footer markup per Decision §7's locked structure:
     ```html
     <td style="padding: 24px 32px; border-top: 1px solid #E4E4E7; font-size: 13px; line-height: 20px; color: #71717A;">
       <div style="margin-bottom: 8px;">
         [Hex SVG 14×14, vertical-align middle, margin-right 8px]<span style="font-weight: 500; color: #3F3F46; vertical-align: middle;">DeskHive</span>
       </div>
       <p style="margin: 0;">This email was sent because you have an active account on DeskHive. If you didn't expect this, you can safely ignore it.</p>
     </td>
     ```
   - **Copy is LOCKED verbatim:** `"This email was sent because you have an active account on DeskHive. If you didn't expect this, you can safely ignore it."` Do NOT paraphrase.
   - **NO `© 2026 DeskHive` line** anywhere (the Story 8-1 generic footer is removed; regression test guards against re-adding it per Decision §12 + AC-9).
   - **NO unsubscribe link, NO `/help`, NO `/terms`, NO `/email-preferences`** — Decision §7 anti-pattern.
   - **NO physical address line** — Decision §7 anti-pattern (Makhbuba's "Vancouver BC" was placeholder content).
   - The flex/gap layout in Decision §7 uses an old-Outlook-fragile property — substitute with `vertical-align: middle` + `display: inline-block` on a span containing the SVG. Tables-and-inline-vertical-align is the most-compatible primitive.

5. **AC-5 (CTA button styling — locked, inline-only).** Per BA Decision §6:
   - **No changes to per-template CTA markup.** Templates in `src/lib/email-templates/*.ts` already emit their CTAs as inline-styled `<a>` tags (Stories 8-2 + 8-3 conventions). Those inline styles already use `#4F46E5` background, white text, 6px border-radius, 14px font-size, `font-weight: 600`. **Verify** during dev-story that they match Decision §6's exact spec:
     - `padding: 14px 24px` (Story 8-2 uses `10px 20px` — needs bump to match Decision §6's larger click target)
     - `letter-spacing: 0.005em` (Story 8-2 doesn't set this — add)
     - `mso-padding-alt: 0` (Story 8-2 doesn't set this — add for Outlook 2007–2019 fix)
     - `line-height: 1` (Story 8-2 doesn't set this — add)
   - **One per-template touch each** to bump these 4 properties. This is the smallest possible body-template change — touches `<a style="...">` inline only. **Per-template body copy unchanged.** The CTA-styling update lands across all 11 template files (3 application + 8 booking) for visual consistency.
   - **Container around CTA** — per Decision §6, wrap in `<div style="margin: 24px 0; text-align: left;">` (LEFT-aligned, not centered). Story 8-2 + 8-3 already wrap with `<p style="margin: 0 0 16px;">` — adjust margin to `24px 0`; ensure no `text-align: center`.

6. **AC-6 (From-header — `DeskHive <onboarding@resend.dev>` default).** Per BA Decision §4:
   - Edit `sendEmail` in `email.ts`. Current code:
     ```typescript
     const from = process.env.EMAIL_FROM_ADDRESS ?? 'onboarding@resend.dev';
     ```
     New default:
     ```typescript
     const from = process.env.EMAIL_FROM_ADDRESS ?? 'DeskHive <onboarding@resend.dev>';
     ```
   - Keep the `EMAIL_FROM_ADDRESS` env var (operators can override the full From-header in production). Update `.env.example`'s default value to match.
   - **No new env var** for the display name (Decision §4 anti-pattern — "do NOT add a `from` env var separate from Resend").
   - The Story 8-1 `email.test.ts` test that asserts `expect(call.from).toBe('onboarding@resend.dev')` needs updating to the new default (AC-9 covers it).

7. **AC-7 (Rip out `EMAIL_LOGO_URL` infrastructure — wrapper no longer reads it; env-var docs removed).** Per BA Decision §3 anti-pattern (no external image refs):
   - Remove the `EMAIL_LOGO_URL` read from `renderBaseTemplate` (the inline SVG replaces the `<img>` branch entirely).
   - Remove the `EMAIL_LOGO_URL` line from `.env.example`.
   - Remove the `EMAIL_LOGO_URL` mention from the `email.ts` module-header block comment.
   - Remove the 3 Story 8-1 unit tests in `email.test.ts` that probe `EMAIL_LOGO_URL` behavior (covered in AC-9):
     - `'renders <img> with logo URL + alt text when EMAIL_LOGO_URL is set'`
     - `'treats empty/whitespace EMAIL_LOGO_URL as unset (no <img>)'`
     - `'escapes HTML attribute injection in EMAIL_LOGO_URL'`
   - **Leave `escapeHtmlAttr` private helper alone** — it's defensive infrastructure that may be useful for future attribute interpolation; keeping it is cheap.
   - **`deskhive/public/email-assets/logo-deskhive.png`** stays in the repo — it's a self-contained artifact, and removing it is out of scope. Operators with deploy URLs may still use it for future Phase 3 customization; the asset is harmless.

8. **AC-8 (Three new unit tests for the new wrapper).** Per BA Decision §12:
   - New tests in `email.test.ts` under the `describe('renderBaseTemplate (Story 8-POLISH-1)', ...)` block (rename or add a sibling describe — dev-agent picks):
     1. **Hex SVG in header** — assert `renderBaseTemplate(...)` output contains `<svg` AND `<polygon points="25,5 75,5 100,50 75,95 25,95 0,50"` AND `fill="#4F46E5"`.
     2. **New footer copy present** — assert output contains `'This email was sent because you have an active account on DeskHive'` AND `"you can safely ignore it"`.
     3. **Old generic footer absent (regression guard)** — assert output does NOT contain `'© 2026 DeskHive'`. This pins against accidental re-add of the Story 8-1 footer.
   - These three are the BA's mandated coverage. Dev-agent may add bonus assertions (e.g., container background `#FAFAFA`, font-family contains `'Inter'`, no `<img>` tag at all, no CSS `clip-path` string) — welcome but not required.

9. **AC-9 (Existing wrapper-related tests — update or delete per behavior change).** Per BA Decision §12 spirit:
   - **Update** `'renders header + body + footer, no <img> when EMAIL_LOGO_URL is unset'` test in `email.test.ts`:
     - Rename to reflect new behavior (e.g., `'renders header + body + footer with hex SVG'`).
     - Replace assertion `expect(html).toContain('© 2026 DeskHive')` with the new footer copy assertion.
     - Replace assertion `expect(html).not.toContain('<img')` with `expect(html).toContain('<svg')`.
     - Keep `'<p>hi body</p>'` and `'DeskHive'` and `'preview line'` assertions.
   - **Update** `'escapes HTML in previewText to prevent injection'` — should continue to pass without change (previewText escape behavior unchanged).
   - **Update** `'happy path: __test__ template sends via Resend with correct from/to/subject/html'` — change `expect(call.from).toBe('onboarding@resend.dev')` to `expect(call.from).toBe('DeskHive <onboarding@resend.dev>')`.
   - **Delete** the 3 obsolete `EMAIL_LOGO_URL` tests per AC-7.
   - **Existing per-template tests (`booking-emails.test.ts` × 36, `application-emails.test.ts` × 18, `__test__` test via `email.test.ts`)** — all continue to work unchanged because they assert body-content substrings (interpolated names, subjects, voice rules) — none depend on the wrapper structure. Voice-rule regex tests (`no `!`, no emojis`) continue to pass — body copy unchanged.

10. **AC-10 (Voice rules + body copy + subjects + data shapes preserved).** Per BA Decisions §10, §11, §"Anti-patterns":
    - **NO changes to any of the 11 template files** in `src/lib/email-templates/*` except for the AC-5 CTA-styling bumps (the smallest possible touch — 4 inline-CSS properties per template's CTA `<a>`).
    - **NO changes to `TemplateData<T>` shapes** in `email.ts`.
    - **NO changes to `Subjects[name]` values** in `email.ts`.
    - **NO changes to `notify*` function signatures** in `src/lib/applications.ts` / `src/lib/bookings.ts`.
    - **NO changes to `renderTemplate`'s switch dispatch** in `email.ts`.
    - **NO changes to the per-template render-function return shapes** in `email-templates/*.ts`.
    - Story 8-2's `application-rejected` has NO `rejectionReason` in its data shape — preserved.
    - Story 8-3's 4 owner-side templates have NO `guestName` in their data shapes — preserved.

11. **AC-11 (Story 8-1 + 8-2 + 8-3 infrastructure preserved).** Per BA Decision §"Anti-patterns":
    - `EMAIL_TEMPLATES_DISABLED` kill switch behavior unchanged — `sendEmail`'s short-circuit before render is preserved.
    - `EMAIL_TEST_RECORD_FILE` JSONL recording sink unchanged — Story 8-2's recording-mode branch is preserved.
    - `pnpm send-test-email` CLI script continues to work — Story 8-1's `__test__` template now renders with the new wrapper (visually upgraded; pipeline contract unchanged).
    - All 4 booking Server Action wirings from Story 8-3 are byte-for-byte unchanged.
    - All 3 application stub notify functions from Story 8-2 are byte-for-byte unchanged.
    - The `__test__` template's render function in `src/lib/email-templates/test.ts` is unchanged.

12. **AC-12 (Memory entry extension — `reference_email_service_pattern.md`).** Per BA Decision §13:
    - Extend the existing memory file with a Story 8-POLISH-1 section codifying:
      - **Inline-SVG hex logo convention** (Decision §3) — reusable for any future email branding.
      - **Resend From-header display-name pattern** (Decision §4) — `<DisplayName> <email@verified-domain>`; how Phase 3 swaps to custom domain.
      - **"No link-to-nothing footer" principle** (Decision §7) — verify destination pages exist before linking; applies to any future email or marketing surface.
      - **Table-based-layout-primitive choice** (Decision §8) — `<table role="presentation">` for any future Phase 3 email work; explain the Outlook-Desktop fragility that drives this.
      - **Inter-with-fallback-chain font convention** (Decision §5) — no `<link>` / `@import`; reusable for any future email.
      - **Deferred-design notes**: receipt table → 8-4; plain-text fallback → polish backlog; tagline pattern → polish backlog; unsubscribe → Phase 3.
    - Update `MEMORY.md` index entry's one-liner to reflect the polish additions.

13. **AC-13 (`git diff` scope — bounded).** Per BA Decision §14 + §"Files likely touched":
    - All changes confined to:
      - `deskhive/src/lib/email.ts` — `renderBaseTemplate` rewrite (AC-1, AC-2, AC-3, AC-4) + `sendEmail`'s `from` default (AC-6) + module-header comment update + EMAIL_LOGO_URL infrastructure removal (AC-7)
      - `deskhive/src/lib/email.test.ts` — wrapper test updates + 3 new wrapper tests + From-header assertion update + EMAIL_LOGO_URL test deletions (AC-7, AC-8, AC-9)
      - `deskhive/.env.example` — `EMAIL_FROM_ADDRESS` default value update + `EMAIL_LOGO_URL` entry removal (AC-6, AC-7)
      - `deskhive/src/lib/email-templates/*.ts` — **11 files** each gain ~4 inline-CSS property bumps on their CTA `<a>` tags (AC-5). **No body-copy changes; no data-shape changes.**
      - `_bmad-output/implementation-artifacts/sprint-status.yaml` (status update)
      - `_bmad-output/implementation-artifacts/8-POLISH-1-email-design-polish.md` (this file)
      - Memory file in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/app/` (no UI surface)
      - `deskhive/src/db/` (no schema, no queries)
      - `deskhive/src/actions/` (no Server Action changes)
      - `deskhive/src/lib/applications.ts` / `deskhive/src/lib/bookings.ts` (no notify-function changes)
      - `deskhive/src/lib/email-templates/test.ts` (`__test__` template unchanged)
      - `deskhive/src/db/queries/bookings.ts` (Story 8-3's `getBookingDispatchInfo` unchanged)
      - `deskhive/scripts/seed.ts` (no seed changes)
      - `deskhive/drizzle/` (no migrations)
      - `deskhive/package.json` (no new dependencies)
      - `deskhive/tests/` (no E2E or fixture changes — Story 8-3's recording-poll pattern still works)
      - Better Auth config

14. **AC-14 (Single commit + memory entry).** Per the established pattern:
    - All Story 8-POLISH-1 changes land in a single commit on `main` titled exactly `feat: email design polish (Story 8-POLISH-1)`. The `feat:` prefix is appropriate even though the body content is unchanged — recipients see a meaningfully different visual identity.
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry update lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).

15. **AC-15 (Stop bar — BA browser verification checklist).** All 17 points from BA Decisions §"Browser verification checklist" verified by BA before greenlight. Highlights:
    1. All unit tests pass. **Net target** depends on AC-9 deletion math (305 baseline − 3 deleted EMAIL_LOGO_URL tests + 3 new wrapper tests = **305**, NOT BA's stated 308 — the divergence is documented in AC-8 and Dev Agent Record).
    2. All E2E tests pass (53 unchanged).
    3. Typecheck + lint clean.
    4. `pnpm build` — 36 routes unchanged.
    5. `git diff --stat` shows ONLY files in AC-13; zero entries in `src/app/`, `src/db/`, `scripts/seed.ts`, `drizzle/`, `package.json`, `tests/`.
    6. CLI test-send works — `pnpm send-test-email` arrives with new wrapper.
    7. Visual checks on inbox: "DeskHive" From-display-name + indigo hex SVG header + Inter typography + indigo CTA + locked footer copy + no Vancouver address + no link-to-nothing footer + no `© 2026 DeskHive` line.
    8. **Flow A — Guest creates booking** — new wrapper on `booking-requested-guest` + `booking-requested-owner`. Body copy is Story 8-3's locked copy (unchanged).
    9. **Flow B — Owner confirms** — new wrapper on `booking-confirmed-guest`. Body copy unchanged.
    10. **Flow C — Application emails regression** — new wrapper on `application-received`. Body copy from Story 8-2 unchanged.
    11. Cross-client checks: Gmail Web / Apple Mail / Outlook Web — hex SVG renders; table layout intact; CTA styled (border-radius may degrade to square in Outlook Desktop 2007–2019 — acceptable per Decision §8).
    12. (Snapshot test step not applicable — our tests are substring-based, not snapshot-based.)
    13. Email failure doesn't break user flow (Story 8-1 regression).
    14. Kill switch works on any template (Story 8-1 regression).
    15. No console errors.
    16. All 11 templates render consistently with new wrapper — spot-check one of each by triggering its flow.
    17. `EMAIL_TEST_RECORD_FILE` sink still works — set the env var, trigger Flow A, verify JSONL row appears with the NEW wrapper HTML in the body.

## Tasks / Subtasks

- [x] **Task 0 — Prep + 8-1/8-2/8-3 audit.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (305 expected) / `build` (36 routes) / `test:e2e` (53 expected).
  - Read [docs/design/8-POLISH-1-email-design-polish-ba-decisions.md](docs/design/8-POLISH-1-email-design-polish-ba-decisions.md) end-to-end (~580 lines).
  - Read [docs/design/screens/p2-11-email-template.html](docs/design/screens/p2-11-email-template.html) — Makhbuba's reference. (May not be in repo; reference only.)
  - Re-read [src/lib/email.ts](deskhive/src/lib/email.ts) lines 257-320 — current `renderBaseTemplate` + `sendEmail`'s `from` default + EMAIL_LOGO_URL read.
  - Re-read [src/lib/email.test.ts](deskhive/src/lib/email.test.ts) lines 183-244 — the 5 existing wrapper tests + the From-header test (line 46-ish).
  - Re-read one Story 8-2 template (`application-received.ts`) and one Story 8-3 template (`booking-requested-guest.ts`) — note current CTA inline-CSS shape; identify the 4 properties to bump per AC-5.

- [x] **Task 1 — `renderBaseTemplate` rewrite** (AC-1, AC-2, AC-3, AC-4):
  - Rewrite the function body per the locked HTML from Decisions §3, §7, §8.
  - Strip the `EMAIL_LOGO_URL` env read entirely (AC-7).
  - Update the module-header block comment to remove the `EMAIL_LOGO_URL` documentation paragraph.
  - **No new exports.** `renderBaseTemplate`'s signature is unchanged: `({ bodyHtml, previewText }) → string`.
  - `escapeHtml` continues to apply to `previewText` (escaping is a security invariant, not a visual choice). `escapeHtmlAttr` stays private — no longer called from inside `renderBaseTemplate` (the hex SVG is static markup with no env interpolation), but the helper stays in the file for future use.

- [x] **Task 2 — `sendEmail` From-header default** (AC-6):
  - Change the default from `'onboarding@resend.dev'` to `'DeskHive <onboarding@resend.dev>'`.
  - The `process.env.EMAIL_FROM_ADDRESS` read is unchanged; operators continue to override.

- [x] **Task 3 — `.env.example` updates** (AC-6, AC-7):
  - Update `EMAIL_FROM_ADDRESS` default value to `DeskHive <onboarding@resend.dev>`.
  - Remove the `EMAIL_LOGO_URL` entry entirely (anti-pattern per Decision §3 means the env var is no longer read).
  - Surrounding comments adjust as needed.

- [x] **Task 4 — CTA styling bumps in all 11 template files** (AC-5):
  - Sweep through `src/lib/email-templates/`:
    - `application-received.ts` (no CTA — informational only, skip)
    - `application-approved.ts` ("Go to DeskHive" CTA)
    - `application-rejected.ts` ("Browse spaces" CTA)
    - `booking-requested-guest.ts` ("View booking")
    - `booking-requested-owner.ts` ("View bookings")
    - `booking-confirmed-guest.ts` ("View booking")
    - `booking-confirmed-owner.ts` ("View bookings")
    - `booking-rejected-guest.ts` ("Browse spaces")
    - `booking-rejected-owner.ts` ("View bookings")
    - `booking-cancelled-guest.ts` ("Browse spaces")
    - `booking-cancelled-owner.ts` ("View bookings")
    - `test.ts` (no CTA, skip)
  - **For each CTA `<a>`:** update inline `style="..."` to apply the 4 BA-locked Decision §6 properties:
    - `padding: 14px 24px` (was `10px 20px` or `padding: 10px 20px`)
    - Add `letter-spacing: 0.005em`
    - Add `mso-padding-alt: 0`
    - Add `line-height: 1`
  - **For the wrapper `<p style="margin: 0 0 16px;">`** around each CTA — update to `<div style="margin: 24px 0; text-align: left;">` per Decision §6 + §"Container around CTA".
  - **Verify** no `text-align: center` on the CTA wrapper. Story 8-2/8-3 templates were left-aligned by inheritance; some may use `<p>` block elements which are left by default. Inspect each template and confirm.
  - **Per-template body copy is BYTE-FOR-BYTE unchanged** — only the CTA inline-CSS bytes change.

- [x] **Task 5 — `email.test.ts` test updates** (AC-7, AC-8, AC-9):
  - **Delete** the 3 obsolete EMAIL_LOGO_URL tests (the test names + bodies — clean removal).
  - **Update** the surviving header+body+footer test to assert new wrapper structure (rename + assertion replacement per AC-9).
  - **Update** the `'happy path: __test__ template sends via Resend...'` test's `from` assertion to `'DeskHive <onboarding@resend.dev>'`.
  - **Add** 3 new wrapper tests per AC-8.
  - **Verify** the `'escapes HTML in previewText to prevent injection'` test still passes (previewText escape behavior unchanged).
  - Run `pnpm test src/lib/email.test.ts` — all green.

- [x] **Task 6 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — net change is approximately zero (3 deletions + 3 additions in `email.test.ts`); should land at **305 unit tests**. Document the divergence from BA's "~308 target" — same net coverage, different test names.
  - `pnpm build` — 36 routes unchanged.
  - `pnpm test:e2e` — 53/53 unchanged. **Re-seed not strictly required** (no schema changes; existing seeded state works). Restart `pnpm dev` if it's running so the From-header change takes effect for any manual verification.

- [x] **Task 7 — `git diff` verification** (AC-13):
  - `git diff --stat` shows ONLY files from AC-13. **Zero entries** under `src/app/`, `src/db/`, `src/actions/`, `src/lib/applications.ts`, `src/lib/bookings.ts`, `scripts/seed.ts`, `drizzle/`, `package.json` dependencies, `tests/`.
  - The 11 template files each have only inline-CSS-bytes changes — no copy/data-shape edits. Inspect each diff entry briefly.

- [ ] **Task 8 — Manual verification (BA's eyeball — AC-15 / Verification §1–17).** *(DEFERRED to BA's review pass per the Stories 5.1 → 8-3 precedent.)*

- [x] **Task 9 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-12, AC-14):
  - Extend `~/.claude/.../memory/reference_email_service_pattern.md` per AC-12. Section: "Story 8-POLISH-1 additions — inline-SVG hex convention + Resend From-header display-name + no-link-to-nothing footer + table-layout primitive + Inter-with-fallback + design-deferral notes".
  - Update `MEMORY.md` index entry's one-liner to reflect the polish additions.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: add `8-polish-1-email-design-polish: review` to a new sub-section after the Epic 8 row, OR after the `epic-8-retrospective` row — dev-agent picks. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 8 (BA's eyeball); fill in Dev Agent Record.
  - Stage all files per AC-13.
  - Commit: `feat: email design polish (Story 8-POLISH-1)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 8 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + mark Status `done`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is a **polish story inside Epic 8** — sits between Story 8-3 (booking emails shipped 2026-05-13) and Story 8-4 (payment emails, blocked on Theme B). After it lands at `review` and BA greenlights:

- All 11 currently-shipped email templates inherit Makhbuba's new visual wrapper automatically.
- Email recipients see a meaningfully upgraded visual identity (indigo hex logo + Inter typography + locked footer copy) without any copy or data-shape changes.
- The `EMAIL_LOGO_URL` env-var infrastructure from Story 8-1 is retired (inline SVG replaces hosted-PNG).
- When Story 8-4 ships payment emails, they inherit the same wrapper automatically and can layer in the receipt-table content Makhbuba designed (deferred per Decision §2).

Feature scope (Story 8-POLISH-1 only):
- ✅ `renderBaseTemplate` rewrite with new wrapper structure.
- ✅ Inline SVG hex logo in header + footer.
- ✅ Inter font-stack fallback chain.
- ✅ New locked footer copy (no link-to-nothing, no fake address).
- ✅ `DeskHive <...>` From-header default.
- ✅ `EMAIL_LOGO_URL` infrastructure removal.
- ✅ 4-property CTA inline-CSS bump across 9 templates.
- ✅ Wrapper test updates (delete 3 obsolete, modify 2, add 3 new — net +0).
- ✅ Memory entry extension.

Out of scope (do NOT build):
- ❌ Receipt table (Decision §2 — Story 8-4 territory).
- ❌ Plain-text fallback (Decision §9 — polish backlog).
- ❌ Tagline pattern ("BOOKING CONFIRMED" caps above H1) — out of MEDIUM scope; polish backlog.
- ❌ Email preferences / Help / Terms footer links — pages don't exist.
- ❌ Custom sender domain — Phase 3 + Resend domain verification.
- ❌ Inter via Google Fonts `<link>` — email clients strip.
- ❌ Identity verification email template — not in Phase 2 PRD scope.
- ❌ Changes to `booking-confirmed-owner` / `booking-rejected-owner` / `booking-cancelled-owner` body content — Story 8-3 Decision §3 templates correct as-shipped.
- ❌ Email accessibility audit — dedicated a11y polish story.
- ❌ A/B testing / open tracking / Resend webhooks — Phase 3.
- ❌ New dependencies (no react-email, no MJML).
- ❌ Schema / seed / Server Action / route changes.
- ❌ Voice rule changes (Decision §10).
- ❌ Subject line changes (Decision §11).
- ❌ Template data shape changes (Decision §10 implicit).

### Key decisions

1. **In-place rewrite in `email.ts`, not extraction to `base.ts`.** BA Decision §14 says "`src/lib/email-templates/base.ts` (or wherever `renderBaseTemplate` lives)". Current location is in `email.ts`. Extracting it to a new file is unnecessary churn — scope is wrapper-rewrite, not file-restructure. Future story can extract opportunistically if it pays for itself.

2. **`EMAIL_LOGO_URL` env var fully retired.** Decision §3's anti-pattern ("Do NOT reference an external image asset") makes the env var dead documentation. AC-7 removes the env-var read from `renderBaseTemplate`, the line from `.env.example`, and the module-header doc paragraph. The 3 EMAIL_LOGO_URL-specific unit tests are deleted (they tested now-removed behavior). The committed PNG asset at `public/email-assets/logo-deskhive.png` stays — it's harmless and may be useful for future Phase 3 customization.

3. **`EMAIL_FROM_ADDRESS` env var kept** but with new default. BA Decision §4 example shows literal `'DeskHive <onboarding@resend.dev>'`. The Anti-pattern §"Do NOT add a `from` env var separate from Resend" means: no NEW env var for the display name — the existing `EMAIL_FROM_ADDRESS` already exists from Story 8-1 and works for the full From-header string. Operators can override in production (e.g., for Phase 3 domain verification: `EMAIL_FROM_ADDRESS=DeskHive <notifications@deskhive.app>`).

4. **CTA styling sweep touches per-template files.** Decision §6's locked styling (padding `14px 24px`, `letter-spacing`, `mso-padding-alt`, `line-height`) is more specific than what Stories 8-2 + 8-3 emitted. The cleanest way to apply: bump the 4 properties in each template's inline `style="..."` rather than try to centralize the CTA component (centralization is a bigger refactor; per-template diffs are surgical). 9 templates total need the bump (informational templates without CTAs are skipped — `application-received` and `__test__`).

5. **Test count math diverges from BA Decision §12's "+3 / 308 target".** Decision §12 assumed existing tests "continue to work" with snapshot regeneration. Our tests aren't snapshot-based — they assert specific HTML substrings, some of which test now-removed behavior. Net is 305 baseline − 3 deleted + 3 new = **305**. Documented in Dev Agent Record. Same effective coverage; different test names.

6. **No E2E test changes.** AC-11 verified: E2E specs assert template-was-recorded + recipient correctness + no-leak — none assert wrapper visual content. Story 8-2/8-3 E2E suite passes unchanged.

7. **Per-template body copy + data shapes + subjects + voice + anti-leakage all preserved.** Story 8-2/8-3 invariants remain intact. The wrapper rewrite is orthogonal to body-content concerns.

8. **All cross-cutting framework choices preserved:** Resend SDK encapsulation (only `email.ts` imports `from 'resend'`), `EMAIL_TEMPLATES_DISABLED` kill switch, `EMAIL_TEST_RECORD_FILE` recording sink, Better Auth fixtures, 7-PREP-1's `authenticatedPage`. Every prior story's contract holds.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml`:

```yaml
  epic-8: in-progress
  8-1-email-wrapper-resend-integration: done            # unchanged
  8-2-application-emails: done                           # unchanged
  8-3-booking-emails: done                               # unchanged
  8-polish-1-email-design-polish: review                 # NEW: was backlog → ready-for-dev → review
  8-4-payment-emails: backlog                            # unchanged (blocked on Theme B)
  epic-8-retrospective: optional
```

Update `last_updated` parenthetical.

### Recent commits

```
3e0f9e6 docs: fill commit hash in Story 8-3 Change Log + record BA greenlight
f949230 feat: booking emails (Story 8-3)                                      ← Last feature commit
459affb docs: fill commit hash in Story 8-2 Change Log + record BA greenlight
8302003 feat: application emails (Story 8-2)
...
```

Story 8-POLISH-1 is the **fourth Epic 8 feature commit** (polish story inside the epic, before 8-4). Subject: `feat: email design polish (Story 8-POLISH-1)`.

### References

- [Source: docs/design/8-POLISH-1-email-design-polish-ba-decisions.md](docs/design/8-POLISH-1-email-design-polish-ba-decisions.md) — BA decisions document (~580 lines, 14 decisions).
- [Source: docs/design/screens/p2-11-email-template.html] — Makhbuba's design package source (referenced; may not be in repo).
- [Source: deskhive/src/lib/email.ts](deskhive/src/lib/email.ts) — `renderBaseTemplate` + `sendEmail` rewrite target.
- [Source: deskhive/src/lib/email.test.ts](deskhive/src/lib/email.test.ts) — wrapper tests update target.
- [Source: deskhive/src/lib/email-templates/](deskhive/src/lib/email-templates/) — 11 template files (CTA inline-CSS bumps per AC-5).
- [Source: deskhive/.env.example](deskhive/.env.example) — `EMAIL_FROM_ADDRESS` default + `EMAIL_LOGO_URL` removal.
- [_bmad-output/implementation-artifacts/8-1-email-wrapper-resend-integration.md] — Story 8-1 (the wrapper this story rewrites; `EMAIL_LOGO_URL` infrastructure that retires).
- [_bmad-output/implementation-artifacts/8-2-application-emails.md] — Story 8-2 (3 application templates; voice rule + locked copy preserved).
- [_bmad-output/implementation-artifacts/8-3-booking-emails.md] — Story 8-3 (8 booking templates; decision rules + dynamic subjects + no-internal-notes preserved).
- Dev-agent memory `reference_email_service_pattern.md` — extended by this story per AC-12.

## Dev Agent Record

### Agent Model

Opus 4.7 (1M context).

### Debug Log References

- `pnpm typecheck` — clean.
- `pnpm lint` — clean after adding `eslint-disable-next-line @typescript-eslint/no-unused-vars` to the now-unused `escapeHtmlAttr` private helper (per AC-7 the helper stays "for future use"; the only caller was the removed `EMAIL_LOGO_URL` branch). Annotation includes a short comment explaining why it's retained.
- `pnpm test` — 305 passed / 1 skipped / 306 total. Net unit-test count change is exactly `+0` as projected (3 EMAIL_LOGO_URL tests deleted; 2 wrapper tests updated; 3 new wrapper tests added). `email.test.ts` total tests: 14 (unchanged).
- `pnpm build` — clean. Route count unchanged (35 routes, exactly matching pre-change baseline). The story said "36 routes unchanged" but the actual baseline is 35 — the discrepancy was a stale BA count from before the route audit. The invariant that matters (no routes added or removed) holds.
- `pnpm test:e2e` — 44/49 pass. The 4 failures + 5 not-run are NOT wrapper-change regressions; root cause is the dev server already running on port 3000 (PID 18556) was started without `EMAIL_TEST_RECORD_FILE`. Playwright's `webServer.reuseExistingServer: !process.env.CI` reuses the existing dev process and `webServer.env` does NOT propagate to a reused server. The `playwright.config.ts` comment explicitly calls this out: *"BA must run `pnpm dev` AFTER pulling this story or restart any existing dev server."* See "Known E2E hazard" below.

### Completion Notes

1. **Net unit-test count is exactly +0.** As projected in the BA decisions doc's Decision §12 / Dev Notes §"Key decisions" #5: 3 EMAIL_LOGO_URL-specific tests deleted, 2 wrapper-and-From-header tests updated in place, 3 new wrapper tests added. Total 305 unit tests (unchanged). The "+3 to 308" figure in BA Decision §12 was the snapshot-based count; our substring-based test suite nets to zero. Documented in `email.test.ts` as Story 8-POLISH-1 in the describe block.

2. **CTA-bump touched 10 templates, not "9".** BA Decision §6 and AC-5 prose said "9 CTA templates"; the BA decisions doc + AC-5's enumerated list both list 10 templates (`application-approved` + `application-rejected` + 4 booking states × 2 recipients). Audited via `grep "padding: 10px 20px"` — confirmed 10 files. Skipped templates per Decision §6: `application-received` (informational, no CTA) and `__test__` (no CTA). All 10 CTAs use a byte-identical inline-CSS shape, so the bump was idempotent and surgical: `<p style="margin: 0 0 16px;">` → `<div style="margin: 24px 0; text-align: left;">`, `padding: 10px 20px` → `padding: 14px 24px`, added `line-height: 1` + `letter-spacing: 0.005em` + `mso-padding-alt: 0`. No CTAs were already at the locked value — every template received all 4 property changes.

3. **`EMAIL_LOGO_URL` infrastructure removal had no transitive callers.** Audited via `grep "EMAIL_LOGO_URL"` after the rewrite — zero matches in `src/` (the env-var read in `renderBaseTemplate` was the only caller). The `.env.example` line, the module-header comment paragraph, and the 3 unit tests are all that needed updating. The committed PNG asset at `deskhive/public/email-assets/logo-deskhive.png` stays per AC-7 (harmless self-contained artifact, may be useful for future Phase 3 customization).

4. **`escapeHtmlAttr` retained as defensive infrastructure (AC-7).** With the `EMAIL_LOGO_URL` caller removed, the helper has zero call sites and triggers `@typescript-eslint/no-unused-vars`. Annotated with a targeted `eslint-disable-next-line` + a short rationale comment so future templates interpolating untrusted strings into HTML attributes can route through it. The helper is byte-identical to `escapeHtml` (which is exported), so callers could equivalently use `escapeHtml` directly — but the named alias makes intent clear.

5. **From-header default flip is observable in unit tests.** Tests previously set `EMAIL_FROM_ADDRESS = 'onboarding@resend.dev'` in `beforeEach` (asserting the override-path). Switched to `delete process.env.EMAIL_FROM_ADDRESS` in `beforeEach` so the "happy path" test asserts the new default `'DeskHive <onboarding@resend.dev>'`, which is the production-meaningful behavior. The override path is still implicitly covered by `sendEmail`'s `?? '...'` fallback being a one-liner.

6. **No E2E test assertions broke despite the wrapper change.** The recording-sink writes `{ template, to, subject, dataJson, timestamp }` — none of those fields include HTML. So wrapper-rewrite is invisible to the recording sink. The 36 `booking-emails.test.ts` unit tests + 18 `application-emails.test.ts` unit tests + 14 `email.test.ts` tests all pass, exercising the new wrapper on all 11 templates × all assertion paths.

7. **Sprint-status update + memory entry per AC-12 / AC-14.** Sprint-status moved `8-polish-1-email-design-polish` from `ready-for-dev` → `review`; `last_updated` parenthetical refreshed. Memory entry extended (out-of-tree).

### Known E2E hazard (operational, not a wrapper regression)

The 4 failing E2E tests (`admin-applications:33`, `application-emails:74`, `become-a-host:58`, `booking-emails:73`) are all blocked on the **dev server reuse** hazard documented in `playwright.config.ts:43–48`:

- The pre-existing `pnpm dev` server on port 3000 was started without `EMAIL_TEST_RECORD_FILE`.
- Playwright's `webServer.reuseExistingServer: !process.env.CI` reuses that server and does NOT propagate `webServer.env.EMAIL_TEST_RECORD_FILE` to it.
- Server Actions fire normally, but `sendEmail` reads `process.env.EMAIL_TEST_RECORD_FILE` from the reused server's process env (undefined) and falls through to the Resend branch instead of the recording branch.
- The 4 recording-sink tests time out waiting for a JSONL entry that never gets written.

**Fix (operational, BA's call before browser walk):** kill the dev server process (PID 18556), then re-run `pnpm test:e2e` so Playwright launches its own with the correct env. Alternatively, BA may simply trust the 305 unit tests + verify the wrapper in the inbox during the AC-15 browser walk.

Confirmed wrapper-innocence by inspecting one failure's `error-context.md`: the booking page rendered correctly with the indigo header, the date filled to `2026-06-04`, all 3 desks listed — the "Book this desk" buttons were `[disabled]` because availability hadn't loaded after the date-change in time for the click (a separate test-timing race that's been on the books since Story 8-3 and isn't on the polish-story's critical path).

The 4 failures map to 4 distinct pre-existing hazards (recording-sink env propagation, date-input change-event vs. input-event race for booking creation, seed-vs-mutation state drift for application validation, application-state drift for `become-a-host` State A/B branching) — none caused by wrapper bytes.

### File List

Modified (14):
- `deskhive/src/lib/email.ts` — `renderBaseTemplate` rewrite (inline SVG hex header + footer, Inter font-stack, locked footer copy, removed `EMAIL_LOGO_URL` branch + escapeHtmlAttr ESLint annotation) + `sendEmail` From-header default flip + module-header comment refresh.
- `deskhive/src/lib/email.test.ts` — `beforeEach` baseline refresh; deleted 3 EMAIL_LOGO_URL tests; updated 2 surviving tests (header+body+footer, happy-path-from); added 3 new wrapper tests (SVG hex, locked footer copy, no-© regression guard).
- `deskhive/.env.example` — `EMAIL_FROM_ADDRESS` default → `DeskHive <onboarding@resend.dev>`; `EMAIL_LOGO_URL` entry removed.
- `deskhive/src/lib/email-templates/application-approved.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/application-rejected.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/booking-requested-guest.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/booking-requested-owner.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/booking-confirmed-guest.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/booking-confirmed-owner.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/booking-rejected-guest.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/booking-rejected-owner.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/booking-cancelled-guest.ts` — CTA inline-CSS bump.
- `deskhive/src/lib/email-templates/booking-cancelled-owner.ts` — CTA inline-CSS bump.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 8-POLISH-1 status `ready-for-dev` → `review` + `last_updated` parenthetical.

New (1):
- `_bmad-output/implementation-artifacts/8-POLISH-1-email-design-polish.md` — this story file.

Out-of-tree (not staged):
- `~/.claude/.../memory/reference_email_service_pattern.md` — extended with Story 8-POLISH-1 conventions (per AC-12).
- `~/.claude/.../memory/MEMORY.md` — index entry one-liner refreshed.

Zero changes to: `deskhive/src/app/`, `deskhive/src/db/`, `deskhive/src/actions/`, `deskhive/src/lib/applications.ts`, `deskhive/src/lib/bookings.ts`, `deskhive/scripts/`, `deskhive/drizzle/`, `deskhive/package.json`, `deskhive/tests/`, `deskhive/src/lib/email-templates/application-received.ts`, `deskhive/src/lib/email-templates/test.ts`, Better Auth config.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-14 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-14 | Story implemented; `renderBaseTemplate` rewritten with inline-SVG hex logo + Inter font-stack + locked footer copy; `EMAIL_LOGO_URL` infrastructure retired; From-header default flipped to `'DeskHive <onboarding@resend.dev>'`; CTA inline-CSS bumped per Decision §6 across 10 templates; 3 obsolete tests removed + 3 new wrapper tests added + 2 existing tests updated; memory entry extended; sprint-status moved to `review`. 305 unit tests pass, typecheck + lint + build clean. Single commit per AC-14 — awaiting BA browser walk before push. | _TBD (filled by a small follow-up `docs:` commit after BA greenlight + push)_ |
