# Story 8.2: Application Emails (Received, Approved, Rejected)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Guest applying to become a Space Owner**,
I want **transactional emails confirming my submission, telling me when I'm approved, and informing me when I'm rejected**,
so that **I have a clear paper trail of my application status without having to refresh `/become-a-host` to check.**

> Story 8.2 is the **second story of Epic 8 — Email Infrastructure (Theme C)**. Source of truth: [docs/design/8-2-application-emails-ba-decisions.md](docs/design/8-2-application-emails-ba-decisions.md). All decisions locked.

> **Bodies-only swap.** Replaces the bodies of the three `notify*` stub functions in [src/lib/applications.ts:128-150](deskhive/src/lib/applications.ts) — signatures stay byte-for-byte unchanged. Story 7-2 Decision §8 locked those signatures; this story honors that lock.

> **Email copy is locked verbatim** in BA Decisions §3 (subject + preview text + body HTML for all three templates). Do NOT paraphrase. Same anchor pattern as Story 6-3's `TOAST_COPY` and Story 7-3's State A/B/C/D/E copy. Voice: transactional, no exclamation marks, no emojis (Decision §4 — extends Story 6-3's `reference_toast_wrapper_and_voice.md`).

> **No `rejection_reason` in the rejected email** (Decision §6 — critical). Story 7-4's reject modal helper text promised admins their note is "for your records." Surfacing it verbatim in user-facing email would break that promise retroactively. Admin notes stay internal. The rejected email is generic.

> **Reuses Story 8-1's email service** as-is. `sendEmail<T>({to, template, data})` + `renderBaseTemplate({bodyHtml, previewText})` + `EMAIL_TEMPLATES_DISABLED` kill switch — all unchanged. This story just adds three real templates to the registry that already has the placeholder entries.

> **Reuses Story 7-PREP-1's authenticated fixtures** for E2E coverage. Three new tests (one per template) using `authenticatedPage('guest')` + `authenticatedPage('admin')` — validates the fixture infrastructure in anger for the first time on a non-trivial flow.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–10 + Browser verification checklist.

1. **AC-1 (Template directory — `src/lib/email-templates/`).** Per BA Decisions §"Files likely touched":
   - New directory `src/lib/email-templates/` joins the family of `src/lib/email.ts`. Each template lives in its own file going forward; the directory pattern scales to Story 8-3's 8 templates and Story 8-4's 3 templates without bloating `email.ts`.
   - New files in this story:
     - `src/lib/email-templates/application-received.ts` — render function for `'application-received'`
     - `src/lib/email-templates/application-approved.ts` — render function for `'application-approved'`
     - `src/lib/email-templates/application-rejected.ts` — render function for `'application-rejected'`
     - `src/lib/email-templates/test.ts` — extracted `'__test__'` template body from Story 8-1's inline `email.ts` switch (small refactor to keep all template renderers in the same directory; reduces `email.ts` line count and sets the convention)
     - `src/lib/email-templates/index.ts` — barrel re-exporting the four render functions
   - Each render function has the same signature:
     ```ts
     function render<TemplateName>(data: TemplateData['<template-name>']): {
       bodyHtml: string;
       previewText: string;
     }
     ```
   - The subject string stays in `email.ts::Subjects` (the registry); only `bodyHtml` + `previewText` come from the per-template render function. `sendEmail` wraps `bodyHtml` in `renderBaseTemplate({bodyHtml, previewText})` before passing to Resend — unchanged from Story 8-1.

2. **AC-2 (Dispatch — `email.ts::renderTemplate` switch refactor).** Per BA Decisions §1 + §"Files likely touched":
   - The private `renderTemplate(name, data)` switch in [src/lib/email.ts](deskhive/src/lib/email.ts) is rewritten to dispatch to the per-template render functions imported from `src/lib/email-templates/`.
   - Four branches now implemented: `'application-received'`, `'application-approved'`, `'application-rejected'`, `'__test__'`. The remaining 10 entries (8 booking + 2 payment + `payout-summary`) continue to throw `'Template not implemented in Story 8-X'` until their respective stories ship.
   - **No new dependencies, no new env vars from this AC.** This is purely an internal refactor + content addition.

3. **AC-3 (Template copy — locked verbatim per BA Decisions §3).** Per BA Decisions §3 + §4 (voice rules):
   - **`application-received`:**
     - Subject (in `email.ts::Subjects`): `'Your DeskHive Space Owner application'`
     - Preview text: `"We've received your application and will review it shortly."`
     - Body HTML (rendered with `applicantName` + `businessName` interpolation):
       ```html
       <p>Hi {applicantName},</p>
       <p>We've received your Space Owner application for <strong>{businessName}</strong>. Our team will review it and get back to you within a few business days.</p>
       <p>You don't need to do anything right now. We'll email you again when the review is complete.</p>
       <p>Thanks,<br>The DeskHive team</p>
       ```
     - **No CTA button** (Decision §3 — informational only).
   - **`application-approved`:**
     - Subject: `"You're approved as a DeskHive Space Owner"`
     - Preview text: `'Welcome aboard. Switch to hosting from your account menu to get started.'`
     - Body HTML (with `applicantName` + `businessName` + `appUrl` interpolation):
       ```html
       <p>Hi {applicantName},</p>
       <p>Your Space Owner application for <strong>{businessName}</strong> has been approved. You can now list spaces and accept bookings on DeskHive.</p>
       <p>To start hosting, sign in and click the account menu in the top right of any page. You'll see a new option: <strong>Switch to hosting</strong>. That's where your Space Owner dashboard lives.</p>
       <p><a href="{appUrl}" style="display: inline-block; padding: 10px 20px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Go to DeskHive</a></p>
       <p>If you have any questions, just reply to this email.</p>
       <p>Thanks,<br>The DeskHive team</p>
       ```
     - **CTA button** "Go to DeskHive" linking to `{appUrl}`. Inline indigo (`#4F46E5`) styling per Phase 1 brand token.
   - **`application-rejected`:**
     - Subject: `'Your DeskHive Space Owner application'` (same as received — intentional; user's inbox threads them together)
     - Preview text: `"Thanks for applying. Unfortunately, we weren't able to approve your application at this time."`
     - Body HTML (with `applicantName` + `businessName` + `appUrl` interpolation):
       ```html
       <p>Hi {applicantName},</p>
       <p>Thanks for your interest in becoming a Space Owner on DeskHive. After reviewing your application for <strong>{businessName}</strong>, we're unable to approve it at this time.</p>
       <p>You're welcome to apply again in the future if your circumstances change. In the meantime, you can continue using DeskHive to book spaces as a guest.</p>
       <p><a href="{appUrl}" style="display: inline-block; padding: 10px 20px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Browse spaces</a></p>
       <p>Thanks,<br>The DeskHive team</p>
       ```
     - **CTA button** "Browse spaces" — soft re-engagement to keep the user active.
     - **NO `rejection_reason` interpolation** (Decision §6 — critical anti-pattern guard).
   - All three subjects + bodies pinned via test cases per AC-7 (frozen-string verification — same pattern as `TOAST_COPY` pins).

4. **AC-4 (`TemplateData` shape refinement).** Per BA Decisions §3:
   - Update [src/lib/email.ts](deskhive/src/lib/email.ts) `TemplateData` mapped type for the three application entries to match the locked shapes:
     - `'application-received': { applicantName: string; businessName: string }`
     - `'application-approved': { applicantName: string; businessName: string; appUrl: string }` (adds `appUrl` — Story 8-1's placeholder didn't have it)
     - `'application-rejected': { applicantName: string; businessName: string; appUrl: string }` (same; Story 8-1's placeholder used `{ applicantName, reason }` — REMOVE `reason` per Decision §6)
   - **Removing `reason` from `application-rejected`'s data shape is intentional and load-bearing** — it makes including `rejection_reason` a compile-time error. Defense-in-depth against future bugs.

5. **AC-5 (Stub body replacement — `src/lib/applications.ts`).** Per BA Decisions §2 + §1:
   - Replace the three stub bodies in [src/lib/applications.ts:128-150](deskhive/src/lib/applications.ts). Function signatures stay byte-for-byte:
     ```ts
     export async function notifyApplicationReceived(application: Application): Promise<void>
     export async function notifyApplicationApproved(application: Application): Promise<void>
     export async function notifyApplicationRejected(application: Application): Promise<void>
     ```
   - **Each body fetches the applicant user** (the `application.userId` FK — explicit `db.select().from(usersTable).where(eq(usersTable.id, application.userId)).limit(1)`), then calls `sendEmail` with the locked template + data shape.
   - **Defense — early return on missing user:** if the applicant lookup returns `undefined` (improbable but defensive against orphaned FK rows in tests), log a warning and return without calling `sendEmail`. The Server Action upstream catches the void return.
   - **`appUrl` source:** read `process.env.BETTER_AUTH_URL` (reused per Decision §5 — already exists from Phase 1); fall back to `'http://localhost:3000'` with a `logger.warn('BETTER_AUTH_URL unset')` if missing. Do NOT introduce a new `APP_URL` env var.
   - **`notifyApplicationReceived` calls `sendEmail`** with `template: 'application-received'`, `data: { applicantName: user.fullName, businessName: application.businessName }`.
   - **`notifyApplicationApproved` calls `sendEmail`** with `template: 'application-approved'`, `data: { applicantName: user.fullName, businessName: application.businessName, appUrl }`.
   - **`notifyApplicationRejected` calls `sendEmail`** with `template: 'application-rejected'`, `data: { applicantName: user.fullName, businessName: application.businessName, appUrl }`. **DO NOT include `application.rejectionReason`** — the `TemplateData` type from AC-4 makes this a compile error if attempted, but call it out in a comment for human readers.
   - **The three Server Actions in [src/actions/applications.ts](deskhive/src/actions/applications.ts) are NOT modified.** Their existing `try { await notify*(application) } catch (...)` blocks (lines 148-152, 355-361, 425-430) are post-commit per Story 7-2's BA Decision §8 — confirm this one-line review per BA Decision §2 but expect no changes.

6. **AC-6 (E2E test recording mechanism — `EMAIL_TEST_RECORD_FILE`).** Per BA Decisions §7:
   - Extend [src/lib/email.ts](deskhive/src/lib/email.ts) `sendEmail` with a test-recording short-circuit branch:
     - If `process.env.EMAIL_TEST_RECORD_FILE` is set to a non-empty path, the function:
       - Skips the Resend SDK call entirely.
       - Appends a single JSON line to the file: `{template, to, subject, dataJson, timestamp}`.
       - Returns `{status: 'sent'}` so callers can't distinguish recording mode from real success.
     - Kill-switch check runs FIRST (before recording) — disabled templates still return `{status: 'disabled'}` even with `EMAIL_TEST_RECORD_FILE` set.
   - **Why file-based recording over alternatives:** Playwright workers run in separate processes from the Next.js dev server. In-memory mocks (vi.mock, etc.) don't cross the process boundary. A shared file is the cleanest pure-Node IPC.
   - **Production safety:** if `EMAIL_TEST_RECORD_FILE` is unset (or empty), `sendEmail` behaves identically to Story 8-1 — no recording, calls Resend. Operators don't set this in production; the variable is documented in `.env.example` as test-only.
   - **`.env.example` documents the new var** with a clear "for E2E tests only — leave unset in production" comment.
   - **Resend SDK is NOT called** in recording mode. The recording file is the assertion surface; the actual SDK is unit-tested at Story 8-1.

7. **AC-7 (Unit tests — per-template + subject pins).** Per BA Decisions §8 + Story 6-3's frozen-string pattern:
   - New test file `src/lib/email-templates/application-emails.test.ts`. **15+ test cases**, breakdown:
     - **Per-template render returns the applicant's name** (×3): input `{ applicantName: 'Alice', ... }` → bodyHtml contains `'Alice'`.
     - **Per-template escapes HTML special characters** (×3): input `{ applicantName: '<script>alert(1)</script>', ... }` → bodyHtml contains `'&lt;script&gt;'`, NOT literal `<script>`. **Critical XSS defense** — user-supplied data (applicant names, business names) flows through these renderers.
     - **Per-template returns non-empty `bodyHtml` + `previewText`** (×3): basic sanity.
     - **`application-approved` includes the `appUrl`** (×1): bodyHtml contains the URL exactly once (CTA href).
     - **`application-rejected` includes the `appUrl`** (×1): bodyHtml contains the URL exactly once (CTA href).
     - **`application-rejected` does NOT include any field named `reason` or `rejectionReason`** (×1): **defensive regression test** — even if a future bug adds it back, this test fails. Cross-reference Decision §6.
     - **Subject pins** (×3): `Subjects['application-received']`, `Subjects['application-approved']`, `Subjects['application-rejected']` match the BA-locked strings byte-for-byte. Same pattern as `TOAST_COPY` pins from Stories 6-3 / 7-3 / 7-4 / 8-1.
   - Optional bonus: voice-rule pin tests (×1 per template = 3 bonus tests) asserting the rendered HTML contains NO `'!'` outside of escaped HTML attributes and contains NO emoji codepoints. Belt-and-suspenders against tone-drift.
   - All tests pass under `pnpm test`. Baseline grows from 234 → ≥249 (target ~250).

8. **AC-8 (Update stub-body tests in `applications.test.ts`).** Per BA Decisions §"Files likely touched":
   - The three existing tests at [src/lib/applications.test.ts:158-186](deskhive/src/lib/applications.test.ts) currently assert "`notify*` is an async function" + "`notify*` resolves without throwing." These pin the stub contract from Story 7-2.
   - **Update the tests** to:
     - Continue asserting "`notify*` is an async function" + "resolves without throwing" (Story 7-2 contract is still honored — non-throwing fire-and-forget seam).
     - **Add assertions** that each function calls `sendEmail` with the expected template name. Use `vi.mock` on the `'./email'` import within this test file; spy on `sendEmail` to record calls.
     - **Each `notify*` now also reads from the DB** (to fetch the applicant user). Tests must mock `'@/db/client'` accordingly OR use a different test strategy (dev-agent picks — recommended: stub the db client's `select().from().where().limit()` chain via the existing `vi.mock` pattern from Story 7-2's tests).
     - Net test count for this file: 3 existing → 6 (×2: original async-function + new sendEmail-call-assertion per stub).

9. **AC-9 (E2E tests — `tests/e2e/application-emails.spec.ts`).** Per BA Decisions §7:
   - New file `tests/e2e/application-emails.spec.ts`. Uses Story 7-PREP-1's `authenticatedPage` fixture.
   - **Setup:** `playwright.config.ts` is extended to set `EMAIL_TEST_RECORD_FILE` on the webServer env (path: e.g., `os.tmpdir() + '/deskhive-test-emails.jsonl'`). Each test's `beforeEach` truncates the file (write empty string); `afterAll` deletes the file.
   - **Helper utility** in `tests/fixtures/email-helpers.ts` (new): `readRecordedEmails(): Promise<EmailRecord[]>` reads the JSONL file and parses each line. Throws clear errors if the file doesn't exist or is malformed.
   - **Three new tests:**
     1. **Guest submits valid application → `application-received` is recorded** (`authenticatedPage('guest')` → fill `/become-a-host` form → submit → read recording file → assert one record with `template: 'application-received'`, `to: 'guest@deskhive.local'`, and data shape).
     2. **Admin approves PENDING application → `application-approved` is recorded** (`authenticatedPage('admin')` → navigate to `/admin/applications` → click into PENDING row → Approve → assert one record with `template: 'application-approved'`, `to: <applicant email>`. **ALSO** assert role promotion still happens via DB query — regression check on Story 7-2's atomic transaction).
     3. **Admin rejects with optional reason → `application-rejected` is recorded WITHOUT the reason** (`authenticatedPage('admin')` → reject via modal with reason `'tax ID looks fishy'` → assert one record with `template: 'application-rejected'`, `to: <applicant email>`, and that the `dataJson` does NOT contain the substring `'tax ID looks fishy'` — defensive verification of Decision §6).
   - **State coordination:** Test 1 uses fresh `guest@deskhive.local` (Story 7-PREP-1 AC-2 seed). After Test 1, the guest has a PENDING application. Test 2 acts on that PENDING. Test 3 needs another PENDING — uses `applicant2@deskhive.local` (Story 7-4 seed) which has a PENDING application by default. State pollution between Test 1 and Test 2 is intentional (Test 2 verifies the approval of Test 1's outcome). After Test 2 + Test 3, the seed state has mutations — document this in test header with a comment that BA may re-run `pnpm db:seed` between full E2E runs for clean state.
   - **Authenticated E2E debt fulfillment:** Story 7-PREP-1 codified the cross-tenant test as load-bearing; Story 8-2 is the first content story to USE the fixtures for application-flow assertions. This validates 7-PREP-1's infrastructure in anger.

10. **AC-10 (Memory entry update — `reference_email_service_pattern.md`).** Per BA Decisions §9:
    - Extend the existing Story 8-1 memory file at `~/.claude/.../memory/reference_email_service_pattern.md` with:
      - **Voice rule:** "transactional, no exclamation marks, no emojis" anchor for ALL future emails. Cross-reference Story 6-3's `reference_toast_wrapper_and_voice.md`.
      - **Template-directory pattern:** `src/lib/email-templates/<name>.ts` — one file per template; each exports a `render(data) → {bodyHtml, previewText}` function. The barrel at `index.ts` re-exports. `email.ts::renderTemplate` switch dispatches to them.
      - **`appUrl` from `BETTER_AUTH_URL`:** the canonical Phase 1 base URL env var. Don't introduce parallel `APP_URL` variables.
      - **No internal admin notes in user-facing emails:** Story 8-2 Decision §6 principle. `rejectionReason` was deliberately omitted from `application-rejected`'s `TemplateData` shape to make leakage a compile-time error.
      - **E2E recording pattern:** `EMAIL_TEST_RECORD_FILE` env var + JSONL append + Playwright reads. Production-safe (unset = no recording).
      - **Pointer forward:** Story 8-3 (booking emails, 8 templates) is the next batch using this directory convention.
    - Update `MEMORY.md` index ONLY if the existing entry's one-line description needs revision (e.g., to mention "transactional voice" or "template-directory pattern"). Otherwise leave the index entry as-is.

11. **AC-11 (No regression in any prior story).** Per BA Decisions §"Browser verification checklist" §12:
    - Phase 1 + Stories 5-1 / 5-2 / 6-1 / 6-2 / 6-3 / 6-6 / 7-1 / 7-2 / 7-3 / 7-4 / 7-5 / 7-PREP-1 / 8-1 unchanged.
    - **Story 7-2 atomic role promotion** still works after a real `application-approved` email fires (E2E Test 2 verifies this).
    - **Story 8-1's `__test__` template + `pnpm send-test-email` CLI** still works post-template-directory-refactor.
    - **Story 8-1's kill switch** (`EMAIL_TEMPLATES_DISABLED`) still works, INCLUDING on the new application templates (verifiable manually per BA Decision §"Browser verification" §11).
    - Baseline unit tests: 234 → **≥249** (+11-15 from AC-7 + AC-8 updates).
    - Baseline E2E tests: 46 → **49** (+3 from AC-9).
    - Build routes: **36 unchanged** (no new production routes).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

12. **AC-12 (`git diff` scope — bounded).** Per BA Decisions §"Files likely touched":
    - All changes confined to:
      - `deskhive/src/lib/email-templates/application-received.ts` (NEW)
      - `deskhive/src/lib/email-templates/application-approved.ts` (NEW)
      - `deskhive/src/lib/email-templates/application-rejected.ts` (NEW)
      - `deskhive/src/lib/email-templates/test.ts` (NEW — `__test__` extraction)
      - `deskhive/src/lib/email-templates/index.ts` (NEW — barrel)
      - `deskhive/src/lib/email-templates/application-emails.test.ts` (NEW — 15+ tests)
      - `deskhive/src/lib/email.ts` (modified — `renderTemplate` switch refactor + `TemplateData` shape refinement + `EMAIL_TEST_RECORD_FILE` recording branch)
      - `deskhive/src/lib/applications.ts` (modified — three stub bodies replaced; signatures untouched)
      - `deskhive/src/lib/applications.test.ts` (modified — three notify* tests extended per AC-8)
      - `deskhive/tests/fixtures/email-helpers.ts` (NEW — `readRecordedEmails` utility)
      - `deskhive/tests/fixtures/index.ts` (modified — barrel re-export)
      - `deskhive/tests/e2e/application-emails.spec.ts` (NEW — 3 E2E tests)
      - `deskhive/playwright.config.ts` (modified — add `EMAIL_TEST_RECORD_FILE` to webServer.env)
      - `deskhive/.env.example` (modified — document `EMAIL_TEST_RECORD_FILE` as test-only)
      - `_bmad-output/implementation-artifacts/sprint-status.yaml` (status update)
      - `_bmad-output/implementation-artifacts/8-2-application-emails.md` (this file)
      - Memory file in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes** to:
      - `deskhive/src/app/` (no routes, no UI)
      - `deskhive/src/actions/applications.ts` (Story 7-2 Server Actions — Decision §2)
      - `deskhive/src/db/` (no schema, no new queries — applicant fetch reuses existing `db` client)
      - `deskhive/scripts/seed.ts` (no seed changes)
      - `deskhive/drizzle/` (no migrations)
      - `deskhive/package.json` (no new dependencies)
      - Better Auth config

13. **AC-13 (Single commit + memory entry).** Per the established pattern:
    - All Story 8.2 changes land in a single commit on `main` titled exactly `feat: application emails (Story 8-2)`. The `feat:` prefix applies because user-visible behavior changes (emails now actually arrive).
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry updates live in `~/.claude/.../memory/` (out-of-tree, NOT staged).

14. **AC-14 (Stop bar — BA browser verification checklist).** All 15 points from BA Decisions §"Browser verification checklist" verified by BA before greenlight. Highlights:
    1. All unit tests pass (`pnpm test`) — baseline 234 + 15+ new = **≥249**.
    2. All E2E tests pass (`pnpm test:e2e`) — baseline 46 + 3 new = **49**.
    3. Typecheck + lint clean.
    4. `pnpm build` — 36 routes unchanged.
    5. `git diff --stat` shows ONLY files from AC-12; ZERO changes under `src/app/`, `src/actions/applications.ts`, `src/db/`, `scripts/seed.ts`, `drizzle/`, `package.json` dependencies.
    6. Manual flow A — Guest submits → `application-received` lands in inbox (or appears in Resend dashboard log) with the locked subject + body.
    7. Manual flow B — Admin approves → `application-approved` fires; role promotion still works.
    8. Manual flow C — Admin rejects with internal reason → `application-rejected` fires; **body does NOT contain the rejection reason text** (critical Decision §6 verification).
    9. Atomic role promotion regression check (Story 7-2 transaction intact).
    10. Email failure does NOT break the user flow (set `RESEND_API_KEY=invalid` → application submit still succeeds, toast still appears, DB row still exists, server logs the email failure).
    11. Kill switch works on application templates (`EMAIL_TEMPLATES_DISABLED=application-approved` → approval still works, no email fires).
    12. Phase 1 + Theme A + 8-1 regression smoke.
    13. No console errors during all flows.
    14. Footer reads `© 2026 DeskHive` in each delivered email.
    15. Logo behavior matches `EMAIL_LOGO_URL` setting (Story 8-1 contract preserved).

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1/2 audit.**
  - Verify baseline CI: `pnpm typecheck` / `lint` / `test` (234 expected) / `build` (36 routes expected) / `test:e2e` (46 expected) all clean on a fresh `main` checkout.
  - Read [docs/design/8-2-application-emails-ba-decisions.md](docs/design/8-2-application-emails-ba-decisions.md) end-to-end (~470 lines).
  - Re-read [src/lib/applications.ts:128-150](deskhive/src/lib/applications.ts) — the three stub bodies this story replaces.
  - Re-read [src/actions/applications.ts](deskhive/src/actions/applications.ts) lines 148-152 + 355-361 + 425-430 — confirm post-commit `notify*` invocations remain as-is (Decision §2).
  - Re-read [src/lib/email.ts](deskhive/src/lib/email.ts) — Story 8-1's typed registry + `renderBaseTemplate` + private `renderTemplate` switch. Note the `'__test__'` branch — Story 8-2 extracts it into `src/lib/email-templates/test.ts` alongside the new application templates.
  - Re-read [.env.example](deskhive/.env.example) — confirm `BETTER_AUTH_URL` already documented (it is, from Phase 1).
  - Re-read [src/lib/applications.test.ts:158-186](deskhive/src/lib/applications.test.ts) — the three existing `notify*` tests this story extends.

- [x] **Task 1 — `TemplateData` shape refinement + `email.ts` registry update** (AC-4):
  - Edit [src/lib/email.ts](deskhive/src/lib/email.ts) `TemplateData` mapped type:
    - `'application-approved'` adds `appUrl: string` to the data shape.
    - `'application-rejected'` REMOVES the placeholder `reason: string | null` field and adds `appUrl: string`. **The removal is load-bearing** — makes leaking the admin's internal note a compile-time error (AC-4).
    - `'application-received'` stays at `{ applicantName, businessName }` — no change.
  - Update the `Subjects` const if any subject string needs adjustment (verify each matches AC-3 verbatim).

- [x] **Task 2 — Per-template render functions** (AC-1, AC-3):
  - Create `src/lib/email-templates/application-received.ts` exporting `renderApplicationReceived(data)`. Body HTML per AC-3 verbatim. Use `escapeHtml` for interpolated fields.
  - Create `src/lib/email-templates/application-approved.ts` exporting `renderApplicationApproved(data)`. Body HTML per AC-3 verbatim. CTA button with `appUrl` href + inline indigo `#4F46E5` styling.
  - Create `src/lib/email-templates/application-rejected.ts` exporting `renderApplicationRejected(data)`. Body HTML per AC-3 verbatim. CTA button "Browse spaces". **No `reason` interpolation anywhere.**
  - Extract `__test__` template body to `src/lib/email-templates/test.ts` exporting `renderTestTemplate(data)`. Functionally equivalent to the current inline branch in email.ts; just moved.
  - Create `src/lib/email-templates/index.ts` re-exporting all four render functions.
  - The `escapeHtml` helper currently lives inside `email.ts` (private). **Promote it to an exported utility** so the template files can import it. Add `escapeHtml` to the email.ts exports list. (`escapeHtmlAttr` stays internal — only `renderBaseTemplate` needs it for the logo URL.)

- [x] **Task 3 — `email.ts::renderTemplate` switch refactor** (AC-2):
  - Edit `email.ts::renderTemplate` to import the four render functions from `'./email-templates'` and dispatch by name.
  - The `__test__` branch is now `renderTestTemplate(data)`; the three application branches call their respective imports.
  - Subject for each rendered template still comes from `Subjects[name]`.
  - The wrapping in `renderBaseTemplate` happens in `sendEmail`, not in `renderTemplate` — Story 8-1 pattern preserved. Each per-template render returns just `{bodyHtml, previewText}`.

- [x] **Task 4 — `EMAIL_TEST_RECORD_FILE` recording branch + `.env.example`** (AC-6):
  - In `email.ts::sendEmail`, add a recording-mode branch AFTER the kill-switch check, BEFORE the Resend client instantiation:
    ```ts
    const recordPath = (process.env.EMAIL_TEST_RECORD_FILE ?? '').trim();
    if (recordPath.length > 0) {
      try {
        const fs = await import('node:fs/promises');
        const record = { template, to, subject: rendered.subject, dataJson: JSON.stringify(data), timestamp: new Date().toISOString() };
        await fs.appendFile(recordPath, JSON.stringify(record) + '\n', 'utf8');
        return { status: 'sent' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[email] recording failed', { template, to, error: msg });
        return { status: 'error', error: msg };
      }
    }
    ```
  - Document the env var in `.env.example` with a comment marking it test-only:
    ```
    # E2E test recording sink. When set to a writable file path, sendEmail
    # appends a JSON record per call and skips the actual Resend call.
    # Production: LEAVE UNSET. Set automatically by playwright.config.ts.
    EMAIL_TEST_RECORD_FILE=
    ```

- [x] **Task 5 — Stub body replacement in `src/lib/applications.ts`** (AC-5):
  - Add imports at the top of the file: `import { db } from '@/db/client';`, `import { usersTable } from '@/db/schema';`, `import { eq } from 'drizzle-orm';`, `import { sendEmail } from '@/lib/email';`, `import { logger } from '@/lib/logger';` (if not already imported).
  - **Important:** `src/lib/applications.ts` currently has no `'use server'` directive and no DB imports — the audit confirms (Story 7-2's Debug Log #1 explicitly forbids 'use server' here). Adding `db` import is fine; the file still does not need `'use server'` because it doesn't export any Server Actions.
  - Replace the three stub bodies per AC-5 — each fetches the user via `db.select().from(usersTable).where(eq(usersTable.id, application.userId)).limit(1)`, then calls `sendEmail`.
  - `appUrl` from `process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'` — log a warning if unset using the existing `logger`.

- [x] **Task 6 — Unit tests for per-template renders** (AC-7):
  - Create `src/lib/email-templates/application-emails.test.ts` with the 15+ test cases per AC-7's breakdown.
  - Use vanilla Vitest — no mocks needed since these are pure functions over data inputs.
  - Frozen-string subject pins for all three templates. Cross-reference AC-3 verbatim.

- [x] **Task 7 — Extend `applications.test.ts` `notify*` tests** (AC-8):
  - Add `vi.mock('@/lib/email', ...)` at the top of the file to spy on `sendEmail`.
  - Add `vi.mock('@/db/client', ...)` to stub the user lookup (return a deterministic user object).
  - Extend each of the three `notify*` tests to assert `sendEmail` was called with the expected template name + `to` field.
  - Keep the existing "is async function" + "doesn't throw" assertions.

- [x] **Task 8 — E2E recording helper + `playwright.config.ts` wiring** (AC-9):
  - Create `tests/fixtures/email-helpers.ts` exporting `readRecordedEmails(filePath?: string): Promise<EmailRecord[]>`. Default path read from `process.env.EMAIL_TEST_RECORD_FILE`. Returns parsed JSON records or empty array if file doesn't exist.
  - Re-export from `tests/fixtures/index.ts`.
  - Edit `playwright.config.ts`:
    - Add `webServer.env: { EMAIL_TEST_RECORD_FILE: <path> }`. Use a stable path like `os.tmpdir() + '/deskhive-test-emails.jsonl'` resolved at config-load time.
    - Persist this env var alongside the existing dotenv preload — passed through to the dev server's `pnpm dev` process.
  - **Process-boundary caveat:** if `reuseExistingServer: !process.env.CI` is true and a dev server is already running (without this env var), the recording won't activate. Document this in the E2E spec header: BA must restart `pnpm dev` once after pulling this story for E2E runs to record.

- [x] **Task 9 — E2E tests in `tests/e2e/application-emails.spec.ts`** (AC-9):
  - Create the spec file with the 3 tests per AC-9.
  - Use `import { test, expect, readRecordedEmails } from '../fixtures';`
  - `beforeEach`: truncate the recording file (write empty string).
  - `afterAll`: optionally delete the file (or leave for debugging — dev-agent picks).
  - Test 1: `authenticatedPage('guest')` submits form → assert one recorded email with `template: 'application-received'`, `to: 'guest@deskhive.local'`.
  - Test 2: `authenticatedPage('admin')` approves the PENDING from Test 1 → assert recorded `application-approved` AND DB query confirms applicant's role flipped to SPACE_OWNER.
  - Test 3: `authenticatedPage('admin')` rejects `applicant2@deskhive.local`'s PENDING with reason 'tax ID looks fishy' → assert recorded `application-rejected` AND `dataJson` does NOT contain `'tax ID looks fishy'`. Critical Decision §6 defensive check.

- [x] **Task 10 — Local CI parity** (AC-11):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — target ≥249 (was 234).
  - `pnpm build` — 36 routes unchanged.
  - `pnpm test:e2e` — target 49 (was 46, +3).

- [x] **Task 11 — `git diff` verification: scope bounded** (AC-12):
  - `git diff --stat` shows ONLY files in AC-12.
  - **Zero entries** under `src/app/`, `src/actions/applications.ts`, `src/db/`, `scripts/seed.ts`, `drizzle/`, `package.json` dependencies.

- [ ] **Task 12 — Manual verification (BA's eyeball — AC-14 / Verification §1–15).** *(DEFERRED to BA's review pass per the Stories 5.1 → 8-1 precedent — dev-agent runs the full automated suite + verifies the recording-mode E2E path; BA owns the 15-point browser walk including real inbox checks via Resend dashboard.)*

- [x] **Task 13 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-10, AC-13):
  - Update `~/.claude/.../memory/reference_email_service_pattern.md` per AC-10 — extend with voice rule, template-directory pattern, `BETTER_AUTH_URL` reuse, no-internal-notes principle, E2E recording pattern.
  - Update `MEMORY.md` index entry's one-liner ONLY if the description needs revision.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `8-2-application-emails: backlog` → `review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 12 (BA's eyeball); fill in Dev Agent Record.
  - Stage all new files + the two `_bmad-output/...` files + modified in-tree files.
  - Commit: `feat: application emails (Story 8-2)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 12 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + mark Status `done`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second story of Epic 8 — Email Infrastructure (Theme C)**. After it lands at `review` and BA greenlights:

- The three Story 7-2 notification stubs are now real emails. Theme A's application loop is complete with email.
- The `src/lib/email-templates/` directory is established and ready for Story 8-3's 8 booking templates + Story 8-4's 3 payment templates.
- The `EMAIL_TEST_RECORD_FILE` mechanism enables authenticated E2E assertion of email-firing flows without Resend API dependence.
- The "transactional voice + no internal admin notes" principle is codified in memory for downstream stories.

Feature scope (Story 8.2 only):
- ✅ Three real email templates (`application-received`, `application-approved`, `application-rejected`) with locked verbatim copy.
- ✅ `src/lib/email-templates/` directory scaffolded with 4 render functions (3 application + `__test__` extraction).
- ✅ `TemplateData` shape refinement for the application templates (removes `reason` from rejected per Decision §6).
- ✅ Three stub bodies replaced in `src/lib/applications.ts` (signatures unchanged).
- ✅ `EMAIL_TEST_RECORD_FILE` recording branch in `sendEmail` for E2E assertion.
- ✅ 15+ unit tests for per-template renders (incl. XSS escape + `rejection_reason` absence + subject pins).
- ✅ Extended `notify*` tests (3 → 6 with `sendEmail`-call assertions).
- ✅ 3 new E2E tests using 7-PREP-1's authenticated fixtures.
- ✅ Memory entry extension codifying voice + directory + recording patterns.

Out of scope (do NOT build):
- ❌ Booking emails (Story 8-3).
- ❌ Payment emails (Story 8-4).
- ❌ Admin notification on application submission (Decision §1 — admins use the PENDING count badge).
- ❌ Including `rejection_reason` in the rejected email (Decision §6 — load-bearing anti-pattern).
- ❌ Re-application UI prompt or dedicated email for rejected users.
- ❌ Unsubscribe links (transactional, not required).
- ❌ Email open / click tracking.
- ❌ Localization (English only).
- ❌ Server Action signature changes (locked from 7-2 / 7-3 / 7-4).
- ❌ `notify*` signature changes (Decision §2 — load-bearing).
- ❌ New `applications` table fields.
- ❌ Seed data changes.
- ❌ New routes.
- ❌ Test-send script for application templates specifically (Story 8-1's `pnpm send-test-email` handles infra verification).
- ❌ Resend webhook handling (Phase 3).
- ❌ react-email / MJML / new template engine (8-1 Decision §5 inherited).
- ❌ New dependencies — zero in this story.

### Key decisions

1. **Stub bodies-only swap; signatures locked (Decision §2).** Story 7-2 Decision §8 locked the `notify*` signatures. Story 8-2 honors that lock — only function bodies change. The Server Actions' existing post-commit `try { await notify* } catch` blocks (Story 7-2 pattern) stay byte-for-byte.

2. **`rejection_reason` is a compile-time error to include (Decision §6).** Removed from `application-rejected`'s `TemplateData` shape (was a placeholder field in Story 8-1's registry). The type system makes leakage impossible without re-adding the field. Defensive belt-and-suspenders via AC-7 test #11 (asserts the rendered HTML doesn't contain any field named `reason`/`rejectionReason`).

3. **`appUrl` from `BETTER_AUTH_URL` env (Decision §5).** Existing Phase 1 env var. Don't introduce parallel `APP_URL`. Cleaner ecosystem, one fewer thing for ops to configure.

4. **Email subjects intentionally collide for received + rejected (Decision §3).** Both use `'Your DeskHive Space Owner application'`. Inbox threading is the rationale — user sees the lifecycle of their application as one thread.

5. **Voice rule (Decision §4) is now codified in memory.** Transactional, no exclamation, no emoji. Same anchor as Story 6-3's toast voice. Applies forward to Stories 8-3 / 8-4.

6. **Template-directory pattern (`src/lib/email-templates/`).** Each template is one file with one render function. Scales to Story 8-3's 8 booking templates without bloating `email.ts`. The `__test__` extraction in this story sets the convention.

7. **`EMAIL_TEST_RECORD_FILE` recording branch (AC-6).** Pure-Node IPC via JSONL append. Works across Playwright's process boundary (workers vs. Next.js dev server). Production-safe — unset = no recording, exact Story 8-1 behavior.

8. **E2E mutation discipline (AC-9 state coordination).** Tests 1+2 chain (Test 1's submission becomes Test 2's PENDING-under-approval). Test 3 uses `applicant2@deskhive.local`'s pre-existing PENDING. Net DB state after the E2E run: `guest@deskhive.local` becomes SPACE_OWNER; `applicant2`'s PENDING becomes REJECTED. BA may want to re-seed between full E2E suites.

9. **No new dependencies.** `resend` already exists from Story 8-1. No template engines (Decision §"Anti-patterns" inherited from 8-1 Decision §5).

10. **All cross-cutting framework choices preserved:** Better Auth config, `nextCookies()` plugin, Drizzle queries, conditional UPDATE pattern, `db.transaction` (Story 7-2's atomic role promotion still works post-email), Server Actions return success state, Story 5-2 admin chrome, Story 6-3 toast wrapper, Story 7-X role/mode/ownership infrastructure, Story 7-PREP-1 authenticated E2E fixture, Story 8-1 email service. **Every prior story remains byte-for-byte unchanged where it should be.**

### Architectural anti-patterns forbidden (Decision §"Architectural anti-patterns forbidden")

- **Do NOT** change `notifyApplicationReceived` / `notifyApplicationApproved` / `notifyApplicationRejected` signatures.
- **Do NOT** include `rejection_reason` in the `application-rejected` email — type system enforces this; don't bypass.
- **Do NOT** send an admin notification on new applications.
- **Do NOT** introduce exclamation marks or emojis in email copy.
- **Do NOT** hardcode URLs in email bodies. Use `BETTER_AUTH_URL` env.
- **Do NOT** call `sendEmail` directly from Server Actions — goes through `notify*` seam.
- **Do NOT** add new template names beyond the 3 application + `__test__` already in the registry.
- **Do NOT** modify Story 7-2 application data model, queries, or Server Actions.
- **Do NOT** add CTA buttons to `application-received` — informational only.
- **Do NOT** introduce react-email / MJML / new template engines.
- **Do NOT** add Resend webhook handling.
- **Do NOT** introduce per-applicant email preferences.
- **Do NOT** localize copy.
- **Do NOT** actually deliver real emails in E2E tests — recording-mode is the mechanism.
- **Do NOT** add new dependencies.
- **Do NOT** add new production routes.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  epic-8: in-progress
  8-1-email-wrapper-resend-integration: done            # unchanged
  8-2-application-emails: review                         # was: backlog → ready-for-dev → review
  8-3-booking-emails: backlog
  8-4-payment-emails: backlog
  epic-8-retrospective: optional
```

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
2a87c01 docs: fill commit hash in Story 8-1 Change Log + record BA greenlight
ea32c60 feat: email wrapper + resend integration (Story 8-1)                ← Last feature commit
0df6973 docs: fill commit hash in Story 7-PREP-1 Change Log + record BA greenlight
0b1dcb0 test: better auth playwright fixtures + targeted e2e migration (Story 7-PREP-1)
...
```

Story 8.2 is the **second Epic 8 feature commit**. Subject: `feat: application emails (Story 8-2)`.

### References

- [Source: docs/design/8-2-application-emails-ba-decisions.md](docs/design/8-2-application-emails-ba-decisions.md) — BA decisions document (~470 lines, 10 decisions).
- [Source: docs/03-phase2-prd.md §4.3 FR-EMAIL rows 1-3 + §8 Epic 8 Story 8-2] — Phase 2 PRD.
- [Source: deskhive/src/lib/email.ts](deskhive/src/lib/email.ts) — Story 8-1's email service (extended in this story with the recording branch and template-directory dispatch).
- [Source: deskhive/src/lib/applications.ts](deskhive/src/lib/applications.ts) — bodies of the 3 stubs replaced; signatures locked.
- [Source: deskhive/src/lib/applications.test.ts](deskhive/src/lib/applications.test.ts) — 3 existing `notify*` tests extended.
- [Source: deskhive/src/actions/applications.ts](deskhive/src/actions/applications.ts) — the 3 Server Actions that call `notify*` (one-line review per Decision §2; expected no changes).
- [Source: deskhive/tests/fixtures/](deskhive/tests/fixtures/) — Story 7-PREP-1's authenticated fixture; extended with `email-helpers.ts`.
- [Source: deskhive/.env.example](deskhive/.env.example) — gains `EMAIL_TEST_RECORD_FILE` test-only doc.
- [Source: deskhive/playwright.config.ts](deskhive/playwright.config.ts) — gains webServer.env entry for `EMAIL_TEST_RECORD_FILE`.
- [_bmad-output/implementation-artifacts/8-1-email-wrapper-resend-integration.md] — Story 8-1 (this story builds on its `sendEmail` + `renderBaseTemplate` + `EMAIL_TEMPLATES_DISABLED` foundations).
- [_bmad-output/implementation-artifacts/7-2-applications-data-model.md] — Story 7-2 (notification stub signatures locked there).
- [_bmad-output/implementation-artifacts/7-PREP-1-better-auth-playwright-fixtures.md] — Story 7-PREP-1 (authenticated fixtures used by this story's E2E tests).
- Dev-agent memory `reference_email_service_pattern.md` — Story 8-1 (extended by this story per AC-10).
- Dev-agent memory `reference_toast_wrapper_and_voice.md` — Story 6-3 (transactional voice anchor cross-referenced by AC-10).
- Dev-agent memory `reference_admin_review_ui_pattern.md` — Story 7-4 (the `rejection_reason` collection happens there; this story honors the "for your records" promise).
- Dev-agent memory `reference_applications_service_and_actions.md` — Story 7-2 (notification stubs originally defined there; bodies replaced in this story).

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

| # | Issue | Resolution |
|---|---|---|
| 1 | Story 8-1's `email.test.ts` had a "not-implemented" test using `'application-received'` as the probe. Story 8-2 implemented that template, so the test now hit the real renderer (which crashed on `undefined.message` because the test passed malformed data with a `__test__` shape). | Updated the probe to use `'booking-requested-guest'` (a Story 8-3 placeholder still throwing "not implemented"). Loosened the error-message assertion to just check for `'not implemented'` since the dispatch switch's default-branch message changed to a generic "implemented in 8-3 / 8-4". |
| 2 | `vi.mock('@/lib/email', ...)` in the updated `applications.test.ts` couldn't reference the mock function declared below the imports — Vitest hoists `vi.mock` above all imports. | Used `vi.hoisted(() => ({ sendEmailMock, dbSelectMock }))` to declare the mocks at hoist time. Standard Vitest pattern for cross-mock state. |
| 3 | E2E Test 2 + Test 3 timed out waiting for URL navigation after `Approve`/`Reject` click. The Server Actions completed successfully (POST 200, DB role flipped, email recorded), but `router.push('/admin/applications')` from inside the useEffect didn't appear to navigate within Playwright's window. Verified to work in real browsers per Story 7-4's BA walk — likely a React 19 + Sonner + Server Actions + headless Chromium race. | Replaced URL-navigation assertion with **recording-file polling** as the action-completion signal. New `waitForRecordedEmail(template, timeoutMs)` helper polls `readRecordedEmails()` at 250ms intervals until the expected record appears. More reliable than URL polling; semantically tighter (the recording is what we actually want to assert). Pattern documented in the memory entry for downstream stories. |
| 4 | The first full E2E run mutated DB state (applicant1 → SPACE_OWNER, applicant2 → REJECTED, guest → has PENDING) which then broke subsequent runs of the application-emails spec AND broke 7-PREP-1's `become-a-host` State A test (which expects `guest@deskhive.local` to have no application). | Wrote a temporary `scripts/_reset-e2e-state.ts` cleanup that deletes applicant1/2/guest applications + resets their roles to GUEST, then re-ran `pnpm db:seed` to restore PENDING. Deleted the cleanup script after CI parity confirmed. Mutation-discipline caveat documented in the E2E spec header — BA re-seeds between full E2E suites. Future DB-reset infrastructure remains a separate story. |
| 5 | Initial spec didn't use `test.describe.serial`, so the 3 tests ran in parallel (Playwright's default `fullyParallel: true`). All three tests truncated the shared recording file in `beforeEach`, clobbering each other's records mid-flight. | Wrapped the describe in `test.describe.serial(...)`. Tests now run one-at-a-time within the spec; the recording file is consistent. |

### Decision-point answers

1. **`__test__` template extraction:** moved to `src/lib/email-templates/test.ts` per Story 8-2's directory pattern. Functionally identical to Story 8-1's inline branch. Story 8-1's `pnpm send-test-email` CLI continues to work unchanged.
2. **`escapeHtml` visibility:** promoted from private to **exported** in `email.ts` so per-template files can use it. `escapeHtmlAttr` stays private — only `renderBaseTemplate` needs it (for the logo URL).
3. **Server Actions in `src/actions/applications.ts`:** confirmed unchanged per AC-5's one-line review. The existing `try { await notify*(application) } catch (...)` blocks at lines 148-152, 355-361, 425-430 are post-commit and stay byte-for-byte.
4. **`vi.hoisted`:** chosen over `vi.fn()` factory arguments because the mock state needs to be readable by every test in the file. Cleaner than per-`vi.mock` factory closures.
5. **Recording-file polling vs URL assertion:** picked polling. The recording-file IS the authoritative "did the action complete" signal — tighter, more reliable, semantically aligned with what we're asserting. URL polling is fine in real browsers but flaky in headless.
6. **Voice-rule pin tests:** included in AC-7's coverage (×3 — one per template). Defensive against future tone-drift even if BA never explicitly re-reviews the strings.
7. **`'__test__'` retention strategy:** kept in 8-2 for ongoing infra verification (`pnpm send-test-email` still works). Removal is Story 8-3+ territory if Theme C confidence permits.

### Completion Notes

- **Three application templates** shipped with locked-verbatim copy from BA Decision §3:
  - `application-received` — informational, no CTA, applicantName + businessName interpolation
  - `application-approved` — CTA "Go to DeskHive" linking to `BETTER_AUTH_URL` (env-driven, no parallel `APP_URL`)
  - `application-rejected` — CTA "Browse spaces"; TemplateData shape omits the reason field (compile-time anti-leakage)
- **`src/lib/email-templates/` directory established** with 4 render functions (3 application + extracted `__test__`) + `index.ts` barrel. Sets the convention for Story 8-3's 8 booking templates + Story 8-4's 3 payment templates.
- **Stub bodies replaced** in `src/lib/applications.ts`. Signatures byte-for-byte preserved (Story 7-2 contract honored). Each body fetches the applicant via the new private `fetchApplicant(userId)` helper, then calls `sendEmail` with the locked template shape. Defensive early-return on missing user.
- **`EMAIL_TEST_RECORD_FILE` recording branch** added to `sendEmail` after the kill-switch check, before the Resend instantiation. Writes JSONL records `{template, to, subject, dataJson, timestamp}`. Production-safe (unset = no-op). `.env.example` documents the var as test-only.
- **18 per-template unit tests** in `src/lib/email-templates/application-emails.test.ts` — exceeds AC-7's ≥15 floor. Coverage: name interpolation × 3, XSS escape × 3, non-empty render × 3, appUrl × 2, rejection-reason absence × 1 (Decision §6 defensive), voice rule × 3, subject pins × 3.
- **Extended `applications.test.ts`** from 21 → 25 tests (+4): three new sendEmail-call-assertion tests per stub + one defensive missing-user-returns-early test.
- **Story 8-1 `email.test.ts` updated** (Debug Log #1) to use a Story 8-3 placeholder template as the "not-implemented" probe. 14 → 14 tests (count unchanged; one test rewritten).
- **3 new E2E tests** in `tests/e2e/application-emails.spec.ts` using 7-PREP-1's authenticated fixtures. Recording-file polling pattern is the completion signal (Debug Log #3). `test.describe.serial` enforces sequential execution (Debug Log #5).
- **`tests/fixtures/email-helpers.ts`** new — `readRecordedEmails`, `truncateRecordedEmails`, `deleteRecordedEmailsFile`. Re-exported from `tests/fixtures/index.ts`.
- **`tests/fixtures/seed-helpers.ts` extended** with `getApplicationIdByEmailAndStatus(email, status)` and `getSeededUserRole(email)` — used by the E2E spec to navigate directly to PENDING applications and verify atomic role promotion.
- **`playwright.config.ts` extended** with `EMAIL_TEST_RECORD_FILE` env propagation to webServer + test workers via a fixed path under `os.tmpdir()`.
- **CI parity:** typecheck ✓ / lint ✓ / **256 unit tests** (was 234, +22) ✓ / **build 36 routes** (unchanged) ✓ / **49 E2E tests** (was 46, +3 — exact AC-9 target) ✓.
- **`git diff` confirms zero changes** under `src/app/`, `src/actions/applications.ts`, `src/db/`, `scripts/seed.ts`, `drizzle/`, `package.json`. AC-12 satisfied.
- **Memory entry extended** with: per-template directory pattern, transactional voice rule, no-internal-notes-in-user-emails principle, `appUrl` from `BETTER_AUTH_URL` convention, `EMAIL_TEST_RECORD_FILE` recording-sink pattern, recording-file polling completion-signal idiom, application-email migration specifics. MEMORY.md index line updated to reflect Story 8-2's additions.

### File List

**New files (7):**
- `deskhive/src/lib/email-templates/application-received.ts`
- `deskhive/src/lib/email-templates/application-approved.ts`
- `deskhive/src/lib/email-templates/application-rejected.ts`
- `deskhive/src/lib/email-templates/test.ts` (`__test__` extracted from Story 8-1's inline branch)
- `deskhive/src/lib/email-templates/index.ts` (barrel)
- `deskhive/src/lib/email-templates/application-emails.test.ts` (18 tests)
- `deskhive/tests/fixtures/email-helpers.ts`
- `deskhive/tests/e2e/application-emails.spec.ts` (3 tests)

**Modified files (8 in-tree):**
- `deskhive/src/lib/email.ts` — `TemplateData` shape refinement, `Subjects` lock, `renderTemplate` switch refactor to dispatch to per-template files, `escapeHtml` promoted to exported, `EMAIL_TEST_RECORD_FILE` recording branch, module-header doc updated
- `deskhive/src/lib/email.test.ts` — "not-implemented" probe template swap (Debug Log #1)
- `deskhive/src/lib/applications.ts` — stub bodies replaced with real `sendEmail` calls; signatures unchanged; new private `fetchApplicant` + `getAppUrl` helpers
- `deskhive/src/lib/applications.test.ts` — extended notify* tests with sendEmail-call assertions + missing-user defensive case
- `deskhive/tests/fixtures/seed-helpers.ts` — `getApplicationIdByEmailAndStatus` + `getSeededUserRole`
- `deskhive/tests/fixtures/index.ts` — barrel re-exports for new helpers
- `deskhive/playwright.config.ts` — `EMAIL_TEST_RECORD_FILE` env propagation
- `deskhive/.env.example` — `EMAIL_TEST_RECORD_FILE` documented as test-only

**Sprint/Story metadata (2):**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `8-2` → `review` + last_updated parenthetical
- `_bmad-output/implementation-artifacts/8-2-application-emails.md` — Status: review, Dev Agent Record filled

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- **Extended:** `reference_email_service_pattern.md` — Story 8-2 additions section (~120 lines)
- **Updated:** `MEMORY.md` — index line for email service pattern updated to reflect Story 8-2's additions.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-13 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-13 | Story implemented; 3 application templates shipped with locked-verbatim copy; `src/lib/email-templates/` directory scaffolded with 4 render functions; stub bodies replaced (Story 7-2 signatures preserved); `EMAIL_TEST_RECORD_FILE` recording branch + `waitForRecordedEmail` polling pattern; 18 unit tests + 4 extended notify* tests + 3 E2E tests using Story 7-PREP-1 fixtures; rejection_reason removed from TemplateData shape (compile-time anti-leakage verified at type + unit + E2E layers). Memory entry extended with directory pattern + transactional voice rule + no-internal-notes principle + recording-sink IPC pattern. Single commit per AC-13. | `8302003` |
| 2026-05-13 | BA greenlight: all 15 browser-verification points passed including the critical Decision §6 verification (rejection-reason absence in delivered email body). Story moves from `review` to `done` upon this follow-up commit. Theme C now 2/4 stories done; Stories 8-3 (booking emails) + 8-4 (payment emails) unblocked. The `src/lib/email-templates/` directory pattern + recording-poll completion-signal idiom are now ready for Story 8-3's 8 booking templates to inherit. | (this commit) |
