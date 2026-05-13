# Story 8.1: Email Wrapper + Resend Integration + Base Template

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **DeskHive developer wiring transactional emails downstream (Stories 8-2 / 8-3 / 8-4)**,
I want **a typed `sendEmail({ to, template, data })` service module backed by Resend, a shared base HTML template, a non-throwing fire-and-forget caller contract, an env-driven per-template kill switch, and a CLI test-send capability**,
so that **Theme C's downstream stories swap in real template content (application emails, booking emails, payment emails) without re-litigating the plumbing, and so that an email pipeline outage never breaks a user request.**

> Story 8.1 is the **first story of Epic 8 — Email Infrastructure (Theme C)**. Source of truth: [docs/design/8-1-email-wrapper-resend-integration-ba-decisions.md](docs/design/8-1-email-wrapper-resend-integration-ba-decisions.md). All decisions locked.

> **Infrastructure-only.** Zero UI surface, zero new routes, zero changes to Story 7-2's notification stubs (those get replaced in 8-2). Adds **one** new dependency (`resend`). Adds **one** new env-driven CLI script (`pnpm send-test-email`).

> **Caller contract:** `sendEmail` is non-throwing and non-blocking. Callers fire-and-forget; email failures do NOT roll back the originating user request. Phase 2 PRD NFR-5 + BA Decisions §4.

> **Design refinement window noted:** Makhbuba may deliver Phase 2 email design tokens within 24-48 hours. Story 8-1's base template uses current Phase 1 brand tokens (indigo `#4F46E5`, hexagon logo, `© 2026 DeskHive` footer) as a sensible default. Stories 8-2 / 8-3 / 8-4 incorporate any refinements when they ship real template content. BA Decisions §6 explicitly accepts this trade-off.

> **Logo strategy (BA-revised 2026-05-13 pre-dispatch):** Phase 1's CSS-clip-path hexagon doesn't render in email clients. Story 8-1 ships **hosted-PNG-with-env-var-seam-and-wordmark-fallback** (BA's preferred path over inline SVG — Option 1 from the pre-dispatch Q&A):
> - Commits `deskhive/public/email-assets/logo-deskhive.png` (22×22 indigo `#4F46E5` hexagon, ~1 KB) — the asset.
> - Introduces `EMAIL_LOGO_URL` env variable — the seam.
> - `renderBaseTemplate` reads it: when set to a valid HTTPS URL, emits `<img src="${EMAIL_LOGO_URL}" alt="DeskHive" width="22" height="22">`. When unset (Phase 2 default during local dev), emits only the "DeskHive" wordmark text with no `<img>` tag (no broken-image icon).
> - Deploy activates the logo via one env-var update; zero retrofit in Stories 8-2+. PNG is universally email-safe across all major clients (Gmail, Apple Mail, Outlook, web clients).

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–12 + Browser verification checklist.

1. **AC-1 (`resend` SDK dependency).** Per BA Decisions §"In scope":
   - Add `resend` to `dependencies` in [package.json](deskhive/package.json) (latest stable, currently `^4.x`).
   - Run `pnpm install` and commit the updated `pnpm-lock.yaml`.
   - **No other new dependencies** (Decision §"Anti-patterns" — no util libraries, no template engines).

2. **AC-2 (`src/lib/email.ts` service module — typed seam with template registry).** Per BA Decisions §1 + §12:
   - New file `src/lib/email.ts`. Single-file seam; joins the family of `src/lib/money.ts`, `src/lib/toast.ts`, `src/lib/applications.ts`.
   - **No `'use server'`** — this is a pure module, callable from Server Actions, Server Components, API routes, and CLI scripts. (Story 7-1's debug-log lesson: 'use server' files can only export async functions; const objects + type unions need a non-server module.)
   - **Block-comment header** documenting (per Decision §12):
     - How to add a new template (extend `TemplateName` union → extend `TemplateData` mapped type → implement `renderTemplate(name, data)` branch).
     - The caller contract: fire-and-forget, never throw, ignore return value by default.
     - Env variables the module reads: `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_TEMPLATES_DISABLED`.
     - Kill-switch behavior (Decision §7).
   - **Typed template registry** per Decision §1's exact shape:
     - `TemplateName` discriminated union enumerating ALL 14 template entries (the 13 future templates from Stories 8-2/8-3/8-4 + `'__test__'`). Each entry has a comment marking which story owns it.
     - `TemplateData` mapped type with the data shape per template. Placeholder entries for the 13 future templates (e.g., `'application-received': { applicantName: string; businessName: string }` as a plausible shape — Stories 8-2/8-3/8-4 confirm or refine at consumption time). `'__test__': { message: string }`.
     - `Subjects` const object with the per-template subject string. `'__test__'` subject is locked verbatim by Decision §9: `'[DeskHive] Test email from Story 8-1'`. Future template subjects are placeholders.
   - **`sendEmail<T extends TemplateName>(args: { to: string; template: T; data: TemplateData[T] })`** signature per Decision §1:
     - Returns `Promise<{ status: 'sent' | 'disabled' | 'error'; error?: string }>`. **Never throws.**
     - **Kill-switch check first** (Decision §7): reads `process.env.EMAIL_TEMPLATES_DISABLED` (comma-separated). If the template is in the list, return `{ status: 'disabled' }` immediately without calling Resend.
     - Constructs the email body via `renderTemplate(name, data)` (a private switch-on-name function — for 8-1 only the `'__test__'` branch renders real content; others throw a "Story 8-X template not yet implemented" error caught by the outer try/catch and surfaced as `{ status: 'error' }`).
     - Wraps the body in `renderBaseTemplate({ bodyHtml, previewText })` (AC-4).
     - Calls Resend's `resend.emails.send({ from, to, subject, html })` inside try/catch. Reads `from` from `process.env.EMAIL_FROM_ADDRESS` (default `onboarding@resend.dev` per Decision §3).
     - On success: returns `{ status: 'sent' }`.
     - On Resend error: logs full error via `console.error('[email] send failed', { template, to, error })` and returns `{ status: 'error', error: <message> }`. **Never re-throws.**
     - On missing `RESEND_API_KEY`: returns `{ status: 'error', error: 'RESEND_API_KEY not configured' }` (defense — the underlying Resend client constructor may throw here; catch and convert).
   - **No global Resend client export** (Decision §1). The `Resend` import and instantiation live inside `email.ts`; nothing else in the codebase imports from `'resend'`.

3. **AC-3 (Email-rendering primitives — `renderBaseTemplate` + private `renderTemplate`).** Per BA Decisions §5 + §6 (revised pre-dispatch 2026-05-13 for hosted-PNG logo strategy):
   - Exported function `renderBaseTemplate({ bodyHtml, previewText }: { bodyHtml: string; previewText: string }): string`:
     - Returns the full `<!DOCTYPE html><html>...` HTML wrapping the bodyHtml in a header + body slot + footer layout.
     - **Header — env-driven logo with wordmark fallback:**
       - Reads `process.env.EMAIL_LOGO_URL`.
       - When set to a non-empty HTTPS URL → emits `<img src="${escapeHtmlAttr(EMAIL_LOGO_URL)}" alt="DeskHive" width="22" height="22" style="vertical-align: middle; ...">` followed by the "DeskHive" wordmark text.
       - When unset (or empty) → emits ONLY the "DeskHive" wordmark text with no `<img>` tag. **No broken-image icon, no placeholder.**
       - Defensive: the URL value passes through `escapeHtmlAttr` (use the existing `escapeHtml` helper or a sibling) to prevent attribute-injection in case the env value contains quotes. Defense-in-depth even though env values are operator-controlled.
       - **Universal email-client support** is the point of choosing PNG over inline SVG (Gmail strips SVG; PNG works everywhere).
     - Body: white background, max-width `600px` table-centered, inline-CSS-only typography (no `<style>` blocks, no external stylesheets — email-client compatibility).
     - Footer: `© 2026 DeskHive` text only. **No unsubscribe link** (Decision §"Anti-patterns" — transactional emails in Phase 2 don't require one).
     - `previewText` rendered as a hidden inline `<div>` at the top of the body for inbox-preview line (standard transactional email pattern).
   - Private function `renderTemplate(name: TemplateName, data: TemplateData[typeof name]): { bodyHtml: string; subject: string; previewText: string }`:
     - Switch on `name`. For 8-1, only the `'__test__'` branch is implemented:
       - bodyHtml: `<p>This is a test email from the DeskHive email service. If you're seeing this, the email pipeline works.</p><p>Message: <strong>${escapeHtml(data.message)}</strong></p><p>Sent at ${new Date().toISOString()}.</p>`
       - subject: verbatim from Decision §9: `'[DeskHive] Test email from Story 8-1'`
       - previewText: `'Test email from DeskHive — pipeline verification'`
     - All other branches: `throw new Error('Template not implemented in Story 8-1: <name>. Implemented in Story 8-2/8-3/8-4.')` — the caller-side catch in `sendEmail` converts this to `{ status: 'error' }`.
   - **`escapeHtml` helper** (private): tiny utility to escape `&<>"'` in user-supplied template data. Defensive — even though 8-1 only renders the `__test__` template with a controlled `message` field, the helper sets the pattern for downstream stories that interpolate user-supplied content (applicant names, business names, etc.).
   - **Inline CSS only** (Decision §6). No `<style>` blocks. No external stylesheets. One paragraph style, one heading style, one button style (CTA in indigo `#4F46E5`).

4. **AC-4 (Test-send CLI script — `scripts/send-test-email.ts`).** Per BA Decisions §8 + §9:
   - New file `scripts/send-test-email.ts`. Loads `.env.local` + `.env` at the top (same pattern as `scripts/seed.ts`).
   - Reads `TEST_EMAIL_RECIPIENT` from env. If unset, log a clear error message and exit non-zero.
   - Calls `sendEmail({ to: TEST_EMAIL_RECIPIENT, template: '__test__', data: { message: 'Hello from Story 8-1!' } })`.
   - Logs the result to console (`{status, error?}`). Exit code 0 on `'sent'` or `'disabled'`; non-zero on `'error'`.
   - **Anti-pattern reminder:** no test-only API route. CLI only (Decision §8 — same principle as Story 7-PREP-1 Decision §2).
   - Wire into [package.json](deskhive/package.json) scripts as `"send-test-email": "tsx scripts/send-test-email.ts"`. Mirrors the existing `db:seed` pattern.

5. **AC-5 (Environment variables — extend `.env.example`).** Per BA Decisions §2 + §3 + §7 (+ BA-revised logo strategy 2026-05-13):
   - Edit [.env.example](deskhive/.env.example):
     - `RESEND_API_KEY` — required at runtime when sending. Document: obtained from Resend dashboard (free tier sufficient for Phase 2).
     - `TEST_EMAIL_RECIPIENT` — required only when running `pnpm send-test-email`. Document: set to your own email for BA verification.
     - `EMAIL_FROM_ADDRESS` — optional. Default: `onboarding@resend.dev` (Resend's sandbox sender). Phase 2 doesn't have a verified custom domain; this default works out-of-the-box.
     - `EMAIL_TEMPLATES_DISABLED` — optional. Comma-separated list of template names to kill-switch off (e.g., `EMAIL_TEMPLATES_DISABLED=__test__` or `=booking-confirmed-owner,payment-receipt`).
     - **`EMAIL_LOGO_URL` (NEW per BA pre-dispatch revision)** — optional. Public HTTPS URL of the DeskHive logo PNG (the committed asset at `public/email-assets/logo-deskhive.png`, accessible via `${DEPLOY_URL}/email-assets/logo-deskhive.png`). When unset, the base template renders the "DeskHive" wordmark only — no `<img>` tag. Document: leave unset for local dev (no `pnpm send-test-email` localhost-reachability needed); for deploys, set to `https://<deploy-url>/email-assets/logo-deskhive.png`.
   - **No `.env.local` changes committed** (gitignored by Phase 1 convention).

6. **AC-6 (Unit tests — `src/lib/email.test.ts`, 5+ cases minimum).** Per BA Decision §10:
   - New file `src/lib/email.test.ts`. Uses Vitest. Mocks `resend` via `vi.mock('resend', ...)` at the top of the file (same pattern as `src/lib/toast.test.ts`'s `vi.mock('sonner', ...)`).
   - **Required test cases:**
     1. **Happy path** — call `sendEmail({ to: 'x@y.com', template: '__test__', data: { message: 'hi' } })`. Assert the mocked `resend.emails.send` was called with `from` (env value or default), `to: 'x@y.com'`, `subject: '[DeskHive] Test email from Story 8-1'`, `html` containing `'hi'` AND `'© 2026 DeskHive'`. Return value is `{ status: 'sent' }`.
     2. **Resend error path** — mock `resend.emails.send` to throw `new Error('Resend API down')`. Call `sendEmail`. Assert return value is `{ status: 'error', error: <string containing 'Resend API down'> }`. **Assert the test itself does NOT need a try/catch** (no throw escapes from `sendEmail`).
     3. **Kill-switch path** — set `process.env.EMAIL_TEMPLATES_DISABLED = '__test__'` (via vitest's env setup or inline before the call), call `sendEmail`. Assert `resend.emails.send` was NOT called. Return value is `{ status: 'disabled' }`. Reset the env var in `afterEach`.
     4. **Type safety (compile-time)** — at minimum, a `// @ts-expect-error` line in the test file demonstrating that passing wrong `data` shape for a template fails to compile. E.g., `sendEmail({ to: 'x', template: '__test__', data: { wrongField: 'x' } })` → `// @ts-expect-error: data shape mismatch`. The fact that `pnpm typecheck` passes proves the assertion.
     5. **Base template renders (wordmark-only fallback)** — with `EMAIL_LOGO_URL` unset (or empty), call `renderBaseTemplate({ bodyHtml: '<p>hi</p>', previewText: 'preview' })`. Assert the output contains `'<p>hi</p>'`, `'DeskHive'` (wordmark text), `'© 2026 DeskHive'` (footer), `'preview'` (previewText block), and **does NOT contain `<img`** (no broken image tag when URL unset).
     6. **Base template renders (with hosted logo URL)** — set `process.env.EMAIL_LOGO_URL = 'https://example.com/logo.png'`, call `renderBaseTemplate(...)`. Assert the output contains `'<img'` AND `'https://example.com/logo.png'` AND `'alt="DeskHive"'`. Reset env var in `afterEach`.
   - **Optional bonus:** subject-string pin tests (similar to Story 7-3/7-4's TOAST_COPY pins) for `Subjects.__test__`. The BA Decision §9 explicitly locks this string — a pin makes intentional changes obvious.

7. **AC-7 (Error handling rules — non-throwing, observable, non-blocking).** Per BA Decisions §4:
   - `sendEmail` returns a structured result. **Never throws.** Every internal exception is caught and converted to `{ status: 'error', error: <message> }`.
   - On send failure, log via `console.error('[email] send failed', { template, to, errorMessage })`. Production log scrapers (Vercel / Neon log surfaces) catch this.
   - Callers — Stories 8-2 / 8-3 / 8-4 — invoke `sendEmail` and ignore the result by default. The BA Decision §4 example pattern (for Story 8-2's eventual use):
     ```typescript
     // inside approveApplicationAction (Story 8-2 swap-in)
     await db.transaction(async (tx) => { ... });
     sendEmail({ to: applicant.email, template: 'application-approved', data: {...} })
       .then((r) => { if (r.status === 'error') console.warn('email failed', r.error); });
     // Server Action returns success regardless of email outcome.
     ```
   - **Story 8-1 itself does NOT wire any caller.** The pattern is documented in the `email.ts` header comment and in the memory entry for downstream stories to adopt.

8. **AC-8 (No changes to Story 7-2 notification stubs).** Per BA Decisions §"Anti-patterns":
   - [src/lib/applications.ts:128-150](deskhive/src/lib/applications.ts) — the three stubs (`notifyApplicationReceived`, `notifyApplicationApproved`, `notifyApplicationRejected`) remain byte-for-byte unchanged.
   - Their signatures are locked (per Story 7-2 BA Decision §8). Story **8-2** swaps the bodies to call `sendEmail`. Story 8-1's role is to make `sendEmail` exist; nothing more.

9. **AC-9 (No production routes added).** Per BA Decisions §8 + §"Anti-patterns":
   - `pnpm build` after 8-1 produces **36 routes — unchanged** from Story 7-PREP-1.
   - The CLI script lives in `scripts/`, not in `src/app/`. No `/api/test/email` or similar.
   - This is the same "no backdoor route" principle from Story 7-PREP-1 Decision §2.

10. **AC-10 (Memory entry — `reference_email_service_pattern.md`).** Per BA Decision §11:
    - New memory file codifies:
      - The `sendEmail<T>` API + typed template registry (`TemplateName` + `TemplateData` mapped type).
      - The "fire and forget, never throw, never block" caller contract.
      - The base-template wrapping pattern (`renderBaseTemplate({ bodyHtml, previewText })`).
      - The `EMAIL_TEMPLATES_DISABLED` kill-switch env variable + the principle ("env-var kill switch is enough; no DB field, no admin UI toggle").
      - The Phase 1 service-module convention pointer (`src/lib/money.ts`, `src/lib/toast.ts`, `src/lib/applications.ts`, now `src/lib/email.ts`).
      - The Resend SDK encapsulation rule (only `email.ts` imports `from 'resend'`).
      - The contract for Stories 8-2 / 8-3 / 8-4: add to `TemplateName` union → add `TemplateData` entry → implement render branch → wire the caller fire-and-forget.
      - Pointer to the `__test__` template as the canonical example.
      - The "no backdoor test-only route; CLI script is the test mechanism" rule (sibling to Story 7-PREP-1's no-backdoor stance).
    - Update `MEMORY.md` index with a one-line pointer.

11. **AC-11 (No regression in any prior story).** Every flow verified through Story 7-PREP-1 must still work:
    - Phase 1 + Stories 5-1 / 5-2 / 6-1 / 6-2 / 6-3 / 6-6 / 7-1 / 7-2 / 7-3 / 7-4 / 7-5 / 7-PREP-1 unchanged.
    - Baseline unit tests: 220 → **225+** (+5 minimum from AC-6).
    - Baseline E2E tests: 46 unchanged (no E2E in 8-1).
    - Baseline build routes: 36 unchanged.
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

12. **AC-12 (`git diff` scope — `src/lib/email.{ts,test.ts}` + script + env + lockfile + logo asset + memory).** Per BA Decisions §"Files likely touched" (+ BA-revised logo strategy 2026-05-13):
    - All changes confined to:
      - `deskhive/package.json` — `resend` dependency + new script entry
      - `deskhive/pnpm-lock.yaml` — lockfile update from `pnpm install`
      - `deskhive/src/lib/email.ts` (NEW)
      - `deskhive/src/lib/email.test.ts` (NEW)
      - `deskhive/scripts/send-test-email.ts` (NEW)
      - `deskhive/.env.example` — **5** new vars documented (RESEND_API_KEY, TEST_EMAIL_RECIPIENT, EMAIL_FROM_ADDRESS, EMAIL_TEMPLATES_DISABLED, **EMAIL_LOGO_URL**)
      - `deskhive/public/email-assets/logo-deskhive.png` (NEW — 22×22 indigo `#4F46E5` hexagon PNG; the asset referenced by `EMAIL_LOGO_URL` once deployed)
      - `_bmad-output/implementation-artifacts/sprint-status.yaml` (new Epic 8 section + 8-1 entry)
      - `_bmad-output/implementation-artifacts/8-1-email-wrapper-resend-integration.md` (this file)
      - Memory file in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes** to:
      - `deskhive/src/app/` (no UI surface, no routes)
      - `deskhive/src/actions/` (no caller wiring in 8-1)
      - `deskhive/src/lib/applications.ts` (stubs unchanged — AC-8)
      - `deskhive/src/db/` (no schema, no queries)
      - `deskhive/scripts/seed.ts` (no seed changes)
      - `deskhive/tests/` (no E2E in 8-1)
      - `deskhive/drizzle/` (no migrations)
      - Better Auth config

13. **AC-13 (Single commit + memory entry).** Per the established pattern:
    - All Story 8.1 changes land in a single commit on `main` titled exactly `feat: email wrapper + resend integration (Story 8-1)`. The `feat:` prefix applies because the email infrastructure is a new platform capability (even though it's invisible until 8-2/8-3/8-4 wire callers).
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry + index update live in `~/.claude/.../memory/` (out-of-tree, NOT staged).

14. **AC-14 (Stop bar — BA browser verification checklist).** All 15 points from BA Decisions §"Browser verification checklist" verified by BA before greenlight. Highlights:
    1. `resend` listed in `package.json` dependencies; `pnpm install` clean.
    2. All unit tests pass (`pnpm test`) — baseline 220 + 5+ new email tests = **225+**.
    3. All E2E tests pass (`pnpm test:e2e`) — baseline 46 unchanged.
    4. Typecheck + lint clean.
    5. `pnpm send-test-email` succeeds, an email lands in BA's inbox within ~30 seconds.
    6. Email subject is `[DeskHive] Test email from Story 8-1` (verbatim, Decision §9).
    7. Email body contains the test message, the DeskHive header, and `© 2026 DeskHive` footer.
    8. Email is from `onboarding@resend.dev` (or whatever `EMAIL_FROM_ADDRESS` is set to).
    9. Kill-switch verified: setting `EMAIL_TEMPLATES_DISABLED=__test__` and re-running the script results in no email landing + console log indicating disabled.
    10. Error path verified: setting `RESEND_API_KEY=invalid` and re-running results in non-fatal console error + no email landing.
    11. `pnpm build` clean, **36 routes** (unchanged).
    12. `git diff --stat` shows ONLY files from AC-12 — zero `src/app/`, zero `src/actions/`, zero `src/lib/applications.ts` changes.
    13. Existing flows unchanged (Phase 1 booking + Story 7-X application flows).
    14. No console errors during normal app usage.
    15. Footer in the test email reads `© 2026 DeskHive`.

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1/2 audit.**
  - Verify baseline CI: `pnpm typecheck` / `lint` / `test` (220 expected) / `build` (36 routes expected) / `test:e2e` (46 expected) all clean on a fresh `main` checkout.
  - Read [docs/design/8-1-email-wrapper-resend-integration-ba-decisions.md](docs/design/8-1-email-wrapper-resend-integration-ba-decisions.md) end-to-end (~410 lines).
  - Re-read [src/lib/applications.ts:121-150](deskhive/src/lib/applications.ts) — the 3 notification stubs whose signatures Story 8-2 will respect when swapping bodies. **Confirm they are NOT touched in this story.**
  - Re-read [src/lib/toast.ts](deskhive/src/lib/toast.ts) — the canonical Phase 1 service-module pattern (`sonner` import inside the module; nothing else imports it). `email.ts` mirrors this.
  - Re-read [src/lib/money.ts](deskhive/src/lib/money.ts) — module-header-comment convention.
  - Re-read [scripts/seed.ts](deskhive/scripts/seed.ts) lines 1-4 — the dotenv loading pattern the CLI script reuses.
  - Re-read [.env.example](deskhive/.env.example) — confirm the 3 existing vars; the 4 new vars get appended.
  - Inspect [src/app/globals.css](deskhive/src/app/globals.css) lines 23-29 + 443-447 — note primary indigo `#4F46E5` (= `--color-brand-600`) + the hexagon clip-path. Decide on the inline-SVG hexagon for the email base template (CSS clip-path doesn't render in email clients).

- [x] **Task 1 — Install `resend` dependency** (AC-1):
  - `cd deskhive && pnpm add resend`. Verify `package.json` `dependencies` lists `resend` at latest stable.
  - Commit-stage `package.json` + `pnpm-lock.yaml`.

- [x] **Task 2 — Author `src/lib/email.ts` — types + render primitives + sendEmail** (AC-2, AC-3, AC-7):
  - Module header block comment per AC-2 documentation requirements (call out all 5 env vars including `EMAIL_LOGO_URL`).
  - Export `TemplateName` discriminated union with all 14 entries (13 future + `'__test__'`). Comment each entry with its owning story.
  - Export `TemplateData` mapped type with placeholder shapes per Decision §1 (e.g., `'application-received': { applicantName: string; businessName: string }`; full list in Decision §1 of the BA doc).
  - Export `Subjects` const object with the per-template subject string. `'__test__'` verbatim: `'[DeskHive] Test email from Story 8-1'`. Other entries can be placeholder strings since they're unused in 8-1.
  - Export `renderBaseTemplate({ bodyHtml, previewText })` returning the full HTML wrapper. **Header reads `EMAIL_LOGO_URL`:** when set, emit `<img>`; when unset, emit wordmark text only.
  - Private `renderTemplate(name, data)` switch: `'__test__'` branch is implemented; all others throw `'Template not implemented in Story 8-1'`.
  - Private `escapeHtml(s)` helper (for body content) + private `escapeHtmlAttr(s)` helper (for attribute values like the logo URL). Both are tiny string-replace functions — defense-in-depth even though env values are operator-controlled.
  - Export `async function sendEmail<T extends TemplateName>(args)` — non-throwing, kill-switch first, Resend call inside try/catch, structured return shape.

- [x] **Task 2.5 — Generate + commit the logo PNG asset** (AC-12, BA-revised logo strategy):
  - Create the file `deskhive/public/email-assets/logo-deskhive.png` — 22×22 px, single solid hexagon shape in indigo `#4F46E5` matching Phase 1's CSS clip-path (`polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)`).
  - **Dev-agent picks generation method.** Constraints: no new runtime/dev dependencies (Decision §10). Acceptable options:
    - PowerShell + `System.Drawing.Common` (Windows-native, dev-time only — runs once, output committed).
    - One-off `npx` invocation of a generator (no dep added to `package.json`).
    - Hand-crafted PNG bytes (smallest output but error-prone).
    - Any non-persistent tool — only the final PNG file is committed.
  - File size target: ≤ 2 KB. Background transparent. Indigo hex `#4F46E5` for the hexagon fill.
  - Note: this PNG is the asset that `EMAIL_LOGO_URL` references once a deploy URL exists. Local dev test sends will NOT render the logo (since `EMAIL_LOGO_URL` is unset by default in `.env.local`); production/staging deploys activate it via env-var config.

- [x] **Task 3 — Author `src/lib/email.test.ts` — 6+ Vitest cases** (AC-6):
  - `vi.mock('resend', ...)` at top.
  - Happy path / error path / kill-switch / type-safety (`// @ts-expect-error`) / base-template-renders-wordmark-only (EMAIL_LOGO_URL unset) / base-template-renders-with-logo (EMAIL_LOGO_URL set).
  - Optional bonus: subject-string pin for `Subjects.__test__`.
  - All tests pass under `pnpm test`. Baseline grows from 220 → 226+ (one more than original target due to the added logo-fork test).

- [x] **Task 4 — Author `scripts/send-test-email.ts` CLI** (AC-4):
  - dotenv preload at top (mirrors `scripts/seed.ts:1-4`).
  - Read `TEST_EMAIL_RECIPIENT`. Error + exit non-zero if unset.
  - Call `sendEmail({ to, template: '__test__', data: { message: 'Hello from Story 8-1!' } })`.
  - Log result. Exit 0 on `'sent'` or `'disabled'`; non-zero on `'error'`.

- [x] **Task 5 — Wire `package.json` script** (AC-4):
  - Add `"send-test-email": "tsx scripts/send-test-email.ts"` to the `scripts` section.

- [x] **Task 6 — Extend `.env.example` with 4 new vars** (AC-5):
  - Append section for email config: `RESEND_API_KEY`, `TEST_EMAIL_RECIPIENT`, `EMAIL_FROM_ADDRESS`, `EMAIL_TEMPLATES_DISABLED`. Each with a brief inline comment.

- [x] **Task 7 — Local CI parity** (AC-11):
  - `pnpm typecheck` clean (the `TemplateData[T]` mapped-type safety must compile).
  - `pnpm lint` clean.
  - `pnpm test` — target ≥226 (was 220, +6 from AC-6 including the new logo-fork test; bonus tests welcome).
  - `pnpm build` — 36 routes unchanged.
  - `pnpm test:e2e` — 46 unchanged.

- [x] **Task 8 — `git diff` verification: no production-code surface changes** (AC-12):
  - `git diff --stat` shows ONLY the files listed in AC-12. **Zero entries** under `src/app/`, `src/actions/`, `src/lib/applications.ts`, `src/db/`, `scripts/seed.ts`, `tests/`, `drizzle/`.

- [ ] **Task 9 — Manual verification (BA's eyeball — AC-14 / Verification §1–15).** *(DEFERRED to BA's review pass per the Stories 5.1 → 7-PREP-1 precedent — dev-agent runs the full automated suite + runs `pnpm send-test-email` to confirm Resend integration end-to-end; BA owns the 15-point verification checklist including inbox-rendering checks.)*

- [x] **Task 10 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-10, AC-13):
  - Create `~/.claude/.../memory/reference_email_service_pattern.md` per AC-10. Type: `reference`. Cross-reference Phase 1 service-module siblings (`src/lib/toast.ts`, `src/lib/money.ts`, `src/lib/applications.ts`).
  - Update `MEMORY.md` index.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: add a new `epic-8` section after the `epic-7-retrospective` line, with `8-1-email-wrapper-resend-integration: review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 9 (BA's eyeball); fill in Dev Agent Record.
  - Stage all new files + the two `_bmad-output/...` files + `package.json` + `pnpm-lock.yaml` + `.env.example`.
  - Commit: `feat: email wrapper + resend integration (Story 8-1)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 9 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + mark Status `done`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **first story of Epic 8 — Email Infrastructure (Theme C)**. After it lands at `review` and BA greenlights:

- A typed `sendEmail({ to, template, data })` function exists, backed by Resend.
- A shared base HTML template (`renderBaseTemplate`) is ready for downstream story templates to slot into.
- The kill-switch env variable is in place for emergency template silencing.
- A CLI test-send script (`pnpm send-test-email`) verifies the pipeline end-to-end with a real email landing in BA's inbox.
- Stories 8-2 / 8-3 / 8-4 can ship template content + caller wiring without re-litigating the infra.

Feature scope (Story 8.1 only):
- ✅ `resend` SDK dependency installed.
- ✅ `src/lib/email.ts` — typed registry + `sendEmail` + `renderBaseTemplate` (env-driven logo) + `escapeHtml` + `escapeHtmlAttr`.
- ✅ `src/lib/email.test.ts` — 6+ Vitest cases (incl. logo-rendering fork).
- ✅ `scripts/send-test-email.ts` — CLI test send.
- ✅ `package.json` script wiring.
- ✅ `.env.example` — 5 new vars documented (incl. `EMAIL_LOGO_URL`).
- ✅ `public/email-assets/logo-deskhive.png` — committed asset (22×22 indigo hexagon PNG).
- ✅ Memory entry codifying the email-service pattern + caller contract + env-driven-logo pattern.
- ✅ ONE actual template implementation: `'__test__'` (for BA pipeline verification).

Out of scope (do NOT build):
- ❌ Real application emails — Story 8-2.
- ❌ Real booking emails — Story 8-3.
- ❌ Real payment emails — Story 8-4.
- ❌ Stripe webhook integration — Epic 9 (Theme B).
- ❌ Custom sender domain (`noreply@deskhive.com`) — Decision §3 uses `onboarding@resend.dev`.
- ❌ Multi-language support (ru/uz) — English only.
- ❌ Retry queue (even in-memory) — fire-and-forget; revisit if Resend reliability shaky.
- ❌ Email open / click tracking.
- ❌ A/B testing for email content.
- ❌ Unsubscribe link infrastructure — flagged for Phase 3.
- ❌ react-email / MJML / any template engine — Decision §5 explicit anti-pattern; template literals only.
- ❌ Production routes — Decision §8.
- ❌ Test-only API routes (no `/api/test/email`) — Decision §8; CLI is the test mechanism.
- ❌ Changes to Story 7-2 notification stubs — AC-8; Story 8-2's job.
- ❌ Modifications to existing Server Actions to call email — per-flow stories (8-2/8-3/8-4).
- ❌ Seed data changes.
- ❌ Database schema changes.
- ❌ E2E test changes.
- ❌ UI changes — pure infra, zero user-visible surface.

### Key decisions

1. **Template literals over react-email / MJML (Decision §5).** Phase 1 philosophy: no new dependencies until forced. 13 templates total across 8-2/8-3/8-4 is small enough that template literals don't bottleneck. If maintenance gets ugly at 8-3 or 8-4, introduce react-email in a polish story. Trial-as-needed, not preempt.

2. **`onboarding@resend.dev` as sender (Decision §3).** Phase 2 is test-mode posture (Stripe test mode, no real payments). Sender matches that posture. Custom domain is a deployment-time concern when DeskHive launches with a verified domain; one env-var update, no code change.

3. **Fire-and-forget, never throw (Decision §4).** `sendEmail` returns a structured result. Callers in 8-2/8-3/8-4 invoke it without try/catch and ignore the result (or log on `'error'`). Email failures never roll back user-facing operations. Phase 2 PRD NFR-5 is the contract.

4. **CLI script, not test-only route (Decision §8).** Mirrors the no-backdoor principle from Story 7-PREP-1 Decision §2. `pnpm send-test-email` runs once during BA verification; never touches the production route surface. Same shape as `pnpm db:seed`.

5. **Env-var kill switch, not DB field (Decision §7).** Cheap to build now, hard to retrofit under fire. If a buggy template ships in 8-2/8-3/8-4 and spams users, env var update + redeploy is the rollback. DB field or admin UI is over-engineering for Phase 2 small-volume.

6. **`'__test__'` template is the only renderer in 8-1 (Decision §9).** All other template branches in `renderTemplate` throw "not implemented" — caught by `sendEmail`'s try/catch and converted to `{ status: 'error' }`. This keeps the typed registry complete while leaving real content for 8-2/8-3/8-4.

7. **`renderBaseTemplate` separation (Decision §6).** The base wrapper is a single shared layout for all transactional emails. Stories 8-2/8-3/8-4 call it to wrap their per-template body. Centralizes header + footer + branding; per-template content is just the body HTML.

8. **Resend SDK encapsulation (Decision §1).** Only `email.ts` imports from `'resend'`. No global client export. Downstream stories don't see the Resend API surface — they see `sendEmail`. Swapping providers (e.g., Postmark, SendGrid) in Phase 3 means changing one file.

9. **Inline CSS only (Decision §6).** Email clients strip `<style>` blocks and external stylesheets. All styling lives inline on each element. One paragraph style, one heading style, one button style — kept simple to minimize cross-client breakage.

10. **All cross-cutting framework choices preserved:** Better Auth config, `nextCookies()` plugin, Drizzle queries, conditional UPDATE pattern, `db.transaction`, Server Actions return success state, Story 5-2 admin chrome, Story 6-3 toast wrapper, Story 7-X role/mode/ownership infrastructure, Story 7-PREP-1 authenticated E2E fixture. **Every prior story remains byte-for-byte unchanged.**

### Email rendering quirks — logo strategy (BA-revised 2026-05-13 pre-dispatch)

Phase 1's hexagon logo is a CSS `clip-path` — won't render in email clients (all major clients strip `clip-path`). Story 8-1 ships **hosted-PNG-with-env-var-seam + wordmark-only fallback**, the BA's preferred path over inline SVG (which Gmail strips).

**Why hosted PNG over inline SVG:**

- **PNG is universally email-safe** across all major clients (Gmail web + mobile, Apple Mail, Outlook desktop + web, Yahoo, ProtonMail). Has been since the mid-1990s.
- **Inline SVG is patchy:** Apple Mail renders, Gmail strips for security, Outlook desktop renders via Word's HTML engine with broken fallback.
- **Inline base64 PNG `data:` URIs** were also considered; Gmail strips `data:` URIs in `<img src>` for the same security reason. Same patchy support as inline SVG.

**Why hosted-with-env-var-seam over hard-coded URL:**

- Phase 2 has no production domain yet (BA Decision §3 — using `onboarding@resend.dev` for exactly this reason). The "where does the PNG live" question is genuinely open.
- The env-var seam (`EMAIL_LOGO_URL`) defers that decision to deploy-time without blocking 8-1's pipeline verification.
- Once any deploy URL exists (Vercel preview, Railway staging, production), one env-var update activates the logo. Zero retrofit in Stories 8-2+.

**Local-dev test send behavior:**

- `EMAIL_LOGO_URL` is unset in `.env.local` by default. Running `pnpm send-test-email` produces an email with the "DeskHive" wordmark text only — no `<img>` tag, no broken-image icon.
- This is acceptable for 8-1 pipeline verification: BA confirms the email lands, subject is correct, body renders, footer reads `© 2026 DeskHive`. Logo-rendering check is a deploy-time concern.

**Deploy activation:**

- Commit `deskhive/public/email-assets/logo-deskhive.png` (22×22 indigo `#4F46E5` hexagon, ≤2 KB) — the asset is in the repo from Story 8-1 onwards.
- On any deploy with a public URL, set `EMAIL_LOGO_URL=https://<deploy-url>/email-assets/logo-deskhive.png` in the deploy environment.
- Subsequent emails render the logo correctly across all clients.

**Stories 8-2/8-3/8-4 inherit this seam unchanged.** They use the same `renderBaseTemplate` wrapper; the logo just appears for them once `EMAIL_LOGO_URL` is set in the deploy environment.

### Architectural anti-patterns forbidden (Decision §"Architectural anti-patterns forbidden")

- **Do NOT** add a custom domain for sender address.
- **Do NOT** add a test-only API route. CLI is the test mechanism.
- **Do NOT** introduce react-email, MJML, or any template engine.
- **Do NOT** make `sendEmail` throw. Always return structured result.
- **Do NOT** wrap `sendEmail` callers in try/catch — they fire and forget.
- **Do NOT** block user requests on email sends. Async-only.
- **Do NOT** export the Resend client globally. `email.ts` is the only file that imports `resend`.
- **Do NOT** add a per-template kill switch as a DB field or admin UI. Env variable only.
- **Do NOT** add unsubscribe links.
- **Do NOT** add open / click tracking.
- **Do NOT** add multi-language support.
- **Do NOT** modify Story 7-2 application notification stubs. Those get replaced in 8-2.
- **Do NOT** modify Phase 1 booking flow or admin UI.
- **Do NOT** ship any real templates beyond `'__test__'`.
- **Do NOT** install any dependency beyond `resend`.
- **Do NOT** seed test data.
- **Do NOT** add a retry queue.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates: add a new section after the `epic-7-retrospective` line:

```yaml
  # ─────────────────────────────────────────────────────────────────
  # Epic 8 — Email Infrastructure (Theme C)
  # Source: docs/03-phase2-prd.md §8 Epic 8
  # Independent of Theme B (Payments, Epic 9) until Story 8-4.
  # ─────────────────────────────────────────────────────────────────
  epic-8: in-progress
  8-1-email-wrapper-resend-integration: review  # was: backlog → ready-for-dev → review
  8-2-application-emails: backlog
  8-3-booking-emails: backlog
  8-4-payment-emails: backlog
  epic-8-retrospective: optional
```

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
0df6973 docs: fill commit hash in Story 7-PREP-1 Change Log + record BA greenlight
0b1dcb0 test: better auth playwright fixtures + targeted e2e migration (Story 7-PREP-1) ← Last commit
6e5b8a1 docs: fill commit hash in Story 7-5 Change Log + close Epic 7
3fd797d feat: owner dashboard + space management (Story 7-5)
3b2ac9c docs: fill commit hash in Story 7-4 Change Log + record BA greenlight
...
```

Story 8.1 is the **first Epic 8 feature commit**. Subject: `feat: email wrapper + resend integration (Story 8-1)`.

### References

- [Source: docs/design/8-1-email-wrapper-resend-integration-ba-decisions.md](docs/design/8-1-email-wrapper-resend-integration-ba-decisions.md) — BA decisions document (~410 lines, 12 decisions).
- [Source: docs/03-phase2-prd.md §8 Epic 8 Story 8-1] — Phase 2 PRD.
- [Source: deskhive/src/lib/applications.ts](deskhive/src/lib/applications.ts) — Story 7-2 stubs (untouched in 8-1; replaced in 8-2).
- [Source: deskhive/src/lib/toast.ts](deskhive/src/lib/toast.ts) — Phase 1 service-module convention this story mirrors.
- [Source: deskhive/src/lib/money.ts](deskhive/src/lib/money.ts) — module-header-comment convention.
- [Source: deskhive/scripts/seed.ts](deskhive/scripts/seed.ts) lines 1-4 — dotenv preload pattern reused in the CLI script.
- [Source: deskhive/.env.example](deskhive/.env.example) — extended with 4 new email vars.
- [Source: deskhive/package.json](deskhive/package.json) — gains `resend` dependency + `send-test-email` script.
- [Source: deskhive/src/app/globals.css](deskhive/src/app/globals.css) lines 23-29 + 443-447 — primary indigo `#4F46E5` + hexagon clip-path.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [_bmad-output/implementation-artifacts/7-PREP-1-better-auth-playwright-fixtures.md] — Story 7-PREP-1 (no-backdoor-route principle this story mirrors for the CLI test-send).
- [_bmad-output/implementation-artifacts/7-2-applications-data-model.md] — Story 7-2 (notification stub signatures locked there; 8-1 honors).
- Dev-agent memory `reference_toast_wrapper_and_voice.md` — Story 6-3's toast-wrapper pattern this story echoes.
- Dev-agent memory `reference_applications_service_and_actions.md` — Story 7-2's notification stub anchors.
- Phase 2 PRD NFR-5 — "Email sends are non-blocking on the user request."

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

| # | Issue | Resolution |
|---|---|---|
| 1 | Initial `email.test.ts` had a "compile-time type safety" case that asserted `sendMock.toHaveBeenCalled()` at runtime. But with the deliberately malformed `data: { wrongField: 'x' }` (the `@ts-expect-error` payload), `renderTemplate`'s `__test__` branch reads `testData.message` → `undefined` → `escapeHtml(undefined).replace` throws. The outer `sendEmail` catch surfaces it as `{status: 'error'}` and Resend is NOT called, so the original runtime assertion was wrong. | Rewrote the test to focus on the actual contract: the `@ts-expect-error` directive proves the compile-time guarantee; the runtime assertion now just verifies `sendEmail` returns a valid `SendEmailResult` (any of `'sent' \| 'disabled' \| 'error'`) — i.e., that the non-throwing contract holds even with malformed data. 14/14 tests pass. |

### Decision-point answers

1. **Resend SDK version:** installed `resend@^6.12.3` (latest stable). The SDK exposes `new Resend(apiKey).emails.send({ from, to, subject, html })` returning `{ data, error }` — wrapper handles both `result.error` (Resend's structured error) and thrown exceptions.
2. **Logo PNG generation method (AC-2.5):** PowerShell + `System.Drawing` (Windows-native, no new deps). Rendered at 4× supersample (88×88) then downscaled to 22×22 with HighQualityBicubic for clean anti-aliased edges. Output: 615 bytes (well under the 2 KB target). One-off dev-time tool — only the PNG is committed.
3. **Test count (AC-6 target ≥6):** shipped **14 unit tests** (more than 2× the target). Coverage: happy path + Resend-throws + Resend-returns-error + kill-switch ON + kill-switch unrelated templates + missing API key + not-implemented template + type safety (`@ts-expect-error`) + base-template wordmark fallback + base-template with logo URL + empty-URL treated as unset + previewText escaping + attribute injection escaping + subject-pin verbatim.
4. **`escapeHtml` vs `escapeHtmlAttr`:** kept them as separate private helpers, even though for now they're identical. Sets the right shape for downstream stories — body content vs. attribute values can diverge if HTML5 attribute-encoding rules tighten in the future, and the two call sites read more clearly with named helpers.
5. **`__test__` template fate in 8-2:** deferred — not an 8-1 decision per BA §9. Recommend 8-2 keeps it for ongoing infra verification; removing it costs nothing if/when 8-2 decides otherwise.
6. **CI parity strictness on E2E:** confirmed 46 unchanged (no email-touching paths exist yet; 8-2/8-3/8-4 will inherit the fixture from 7-PREP-1 to test the email-firing flows).

### Completion Notes

- **`src/lib/email.ts` shipped** with the full typed registry (14 templates: 13 placeholder + `'__test__'`), `sendEmail<T>` non-throwing wrapper, `renderBaseTemplate` with env-driven logo seam, private `renderTemplate` switch, `escapeHtml` / `escapeHtmlAttr` helpers, and exhaustive module header documenting the caller contract + env vars.
- **14 Vitest cases in `email.test.ts`** — exceeds AC-6 target of ≥6. Pattern mirrors `src/lib/toast.test.ts`'s `vi.mock('sonner', ...)` approach.
- **`scripts/send-test-email.ts` CLI** — fires `'__test__'` to `TEST_EMAIL_RECIPIENT`, surfaces `{sent | disabled | error}` with appropriate exit codes. Mirrors `scripts/seed.ts`'s dotenv-preload pattern.
- **`public/email-assets/logo-deskhive.png` committed** — 22×22 indigo `#4F46E5` hexagon, 615 bytes. Generated via PowerShell `System.Drawing` (one-off, no new deps). Verified visually in the editor: clean hexagon shape, transparent background.
- **`.env.example` extended** with 5 new email vars (`RESEND_API_KEY`, `TEST_EMAIL_RECIPIENT`, `EMAIL_FROM_ADDRESS`, `EMAIL_TEMPLATES_DISABLED`, `EMAIL_LOGO_URL`). Each with inline-comment documentation. Includes the deploy-time `EMAIL_LOGO_URL` activation example.
- **`package.json` scripts +1 entry** — `"send-test-email": "tsx scripts/send-test-email.ts"`. Parallel to existing `"db:seed"`.
- **Story 7-2 stubs untouched** (AC-8) — `src/lib/applications.ts:128-150` byte-for-byte preserved. Story 8-2's job to swap the bodies.
- **CI parity:** typecheck ✓ / lint ✓ / **234 unit** (was 220, +14) ✓ / build **36 routes** (unchanged) ✓ / **46 E2E** (unchanged) ✓ / `git diff` shows ZERO changes under `src/app/`, `src/actions/`, `src/lib/applications.ts`, `src/db/`, `scripts/seed.ts`, `tests/`, `drizzle/`.
- **Memory entry** `reference_email_service_pattern.md` codifies: typed registry pattern + fire-and-forget caller contract + `EMAIL_TEMPLATES_DISABLED` kill switch + env-driven logo seam + Resend SDK encapsulation rule + downstream contract for Stories 8-2/8-3/8-4 + the no-backdoor-route principle (sibling to Story 7-PREP-1).
- **BA verification deferred per Task 9** — automation is fully green; the 15-point browser walk (incl. `pnpm send-test-email` + inbox check + kill-switch + error-path verification) is the BA's pass.

### File List

**New files (6):**
- `deskhive/src/lib/email.ts` — service module (typed registry + sendEmail + renderBaseTemplate)
- `deskhive/src/lib/email.test.ts` — 14 Vitest cases
- `deskhive/scripts/send-test-email.ts` — CLI test-send tool
- `deskhive/public/email-assets/logo-deskhive.png` — 22×22 indigo hexagon, 615 bytes
- `_bmad-output/implementation-artifacts/8-1-email-wrapper-resend-integration.md` — story file
- `~/.claude/.../memory/reference_email_service_pattern.md` (out-of-tree)

**Modified files (4 in-tree):**
- `deskhive/package.json` — `resend@^6.12.3` dependency + `send-test-email` script entry
- `deskhive/pnpm-lock.yaml` — lockfile update
- `deskhive/.env.example` — 5 new email vars documented
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `8-1` → `review` + last_updated parenthetical

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- **Created:** `reference_email_service_pattern.md`
- **Updated:** `MEMORY.md` — index appended with the new entry.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-13 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-13 | Story implemented; `src/lib/email.ts` shipped with typed template registry (14 entries) + `renderBaseTemplate` (env-driven logo + wordmark fallback) + non-throwing `sendEmail` + `EMAIL_TEMPLATES_DISABLED` kill switch + `'__test__'` template + 14 Vitest cases + CLI `pnpm send-test-email` + logo PNG asset (615 bytes) + 5 new env vars + `resend@^6.12.3` dep. Memory entry codifies the pattern + caller contract + downstream contract for 8-2/8-3/8-4. Single commit per AC-13. | `ea32c60` |
| 2026-05-13 | BA greenlight: all 15 browser-verification points passed including `pnpm send-test-email` inbox check, kill-switch verification, and error-path verification. Story moves from `review` to `done` upon this follow-up commit. Email service seam is operational; Stories 8-2 / 8-3 / 8-4 can ship real template content + caller wiring without re-litigating the plumbing. | (this commit) |
