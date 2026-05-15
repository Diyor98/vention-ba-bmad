# Story 8-2: Application Emails — BA Decisions

**Story:** 8-2
**Epic:** 8 — Email Infrastructure (Theme C)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Wednesday, May 13, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §4.3 (FR-EMAIL rows 1-3) and §8 Epic 8, Story 8-2

---

## Context

Story 7-2 created three notification stub functions in `src/lib/applications.ts`:
- `notifyApplicationReceived(application)` — no-op stub
- `notifyApplicationApproved(application)` — no-op stub
- `notifyApplicationRejected(application)` — no-op stub

These are called from the three application Server Actions (`createApplicationAction`, `approveApplicationAction`, `rejectApplicationAction`) but currently do nothing — Phase 2 explicitly deferred email until Epic 8.

Story 8-1 just shipped the email service seam:
- `sendEmail<T>({to, template, data})` — typed, non-throwing, fire-and-forget
- `renderBaseTemplate({bodyHtml, previewText})` — shared header/footer wrapper
- 14-entry template registry with 3 placeholder entries for application emails:
  - `application-received`
  - `application-approved`
  - `application-rejected`

This story makes those three application templates real — wires them up, defines the copy, and tests them end-to-end via the authenticated Playwright fixtures from 7-PREP-1.

**Designer status:** Makhbuba is expected to send Phase 2 designs within 24-48 hours. Story 8-2 ships with current Phase 1 tokens (indigo primary, hexagon-or-wordmark, `© 2026 DeskHive` footer). If her designs propose specific email refinements when they arrive, the base template (`renderBaseTemplate`) is the single seam — adjusting tokens there cascades to all 3 emails without touching this story's content.

---

## Scope

**In scope:**

- Three real HTML email templates, replacing the placeholders from Story 8-1's registry:
  - `application-received` — sent to applicant when they submit
  - `application-approved` — sent to applicant when admin approves
  - `application-rejected` — sent to applicant when admin rejects
- Replace the three stub function bodies in `src/lib/applications.ts` to actually call `sendEmail`. **Stub signatures unchanged** — only bodies change. This honors Story 8-1's AC-8 commitment.
- Email content (subject + body HTML + preview text) locked verbatim in this doc (Decision §3)
- Each email wrapped via `renderBaseTemplate({ bodyHtml, previewText })` per Story 8-1's pattern
- Authenticated E2E tests using 7-PREP-1's fixtures — verify each Server Action triggers a `sendEmail` call with the right template name and recipient (mock Resend in the test context, don't actually deliver)
- Unit tests for each template's render function (input data → expected HTML)
- Memory entry updating the email service pattern with the "transactional, no exclamation, no emoji" voice rule (matches Story 6-3's toast voice anchor)

**Out of scope:**

- Booking emails (Story 8-3)
- Payment emails (Story 8-4)
- Admin notification when a new application arrives — admins see PENDING count badge on the Applications sub-nav tab (Story 7-4 Decision §1). No email to admin in 8-2.
- Including the admin's internal `rejection_reason` in the rejection email (Decision §6 — generic email only, admin notes stay internal)
- Re-application flow for rejected applicants (Story 7-2 explicitly allows reapply, but no dedicated email or UI prompt for it in this story)
- Unsubscribe links (transactional emails don't legally require)
- Email open / click tracking
- Localization (English only)
- Modifying any Server Action signature
- Modifying Story 7-2's data model, schema, or queries
- Modifying Story 7-3's Guest-facing form
- Modifying Story 7-4's admin review UI
- Modifying the application notification stub signatures (Decision §2)
- Adding new fields to the `applications` table
- New seed data
- New routes
- A "test send" script for these specific templates — Story 8-1's `pnpm send-test-email` infrastructure already handles infra verification; 8-2's verification is via real flows (Guest applies → admin approves → email fires)
- Resend webhook handling for bounce/complaint tracking (Phase 3 candidate)

---

## Decisions

### Decision 1: Recipient — applicant only, not admin

All three emails fire to the **applicant** (the user who submitted the application). Admin receives no email.

**Reasoning:**
- The PRD specifies application-received → applicant, application-approved → applicant, application-rejected → applicant. No row in §4.3 calls for an admin email on application submission.
- Admins discover new applications via the Applications sub-nav tab's PENDING count badge (Story 7-4 Decision §1) — a visual cue that doesn't require email.
- Admin email floods are a Phase 3 problem; Phase 2 keeps the admin's inbox clean.

If the Phase 2 demo reveals admins want "new application" notifications, that's a polish backlog item.

### Decision 2: Wiring — replace stub bodies, keep signatures

The three notification functions in `src/lib/applications.ts` keep their existing signatures:

```typescript
// Signatures locked since Story 7-2 — DO NOT change
export async function notifyApplicationReceived(application: Application): Promise<void>
export async function notifyApplicationApproved(application: Application): Promise<void>
export async function notifyApplicationRejected(application: Application): Promise<void>
```

Story 8-2 only changes the **bodies**:

```typescript
export async function notifyApplicationReceived(application: Application): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, application.user_id) })
  if (!user) return
  await sendEmail({
    to: user.email,
    template: 'application-received',
    data: { applicantName: user.full_name, businessName: application.business_name }
  })
}
```

**Why this matters:**
- Story 7-2's Server Actions call these stubs by name. Changing the signature would break those callers and force changes outside this story's scope.
- The fire-and-forget contract (8-1 Decision §4) means these `notify*` functions can `await sendEmail` internally and still not block the calling Server Action — the Server Action wraps the call in a non-awaited promise.

**The 3 Server Actions need a one-line review** to confirm they're calling the notification functions correctly (they were stubs, calling code was already wired in 7-2). No changes expected, but Amelia confirms each `notify*` invocation is post-commit (i.e., fires after the database mutation succeeds, never before).

### Decision 3: Email copy — locked verbatim

#### `application-received`

**Subject:** `Your DeskHive Space Owner application`

**Preview text:** `We've received your application and will review it shortly.`

**Body (rendered inside `renderBaseTemplate`):**

```html
<p>Hi {{applicantName}},</p>

<p>We've received your Space Owner application for <strong>{{businessName}}</strong>. Our team will review it and get back to you within a few business days.</p>

<p>You don't need to do anything right now. We'll email you again when the review is complete.</p>

<p>Thanks,<br>The DeskHive team</p>
```

**No CTA button.** Informational only.

**Template data:** `{ applicantName: string, businessName: string }`

---

#### `application-approved`

**Subject:** `You're approved as a DeskHive Space Owner`

**Preview text:** `Welcome aboard. Switch to hosting from your account menu to get started.`

**Body:**

```html
<p>Hi {{applicantName}},</p>

<p>Your Space Owner application for <strong>{{businessName}}</strong> has been approved. You can now list spaces and accept bookings on DeskHive.</p>

<p>To start hosting, sign in and click the account menu in the top right of any page. You'll see a new option: <strong>Switch to hosting</strong>. That's where your Space Owner dashboard lives.</p>

<p><!-- CTA button --></p>
<a href="{{appUrl}}" style="...indigo button styles inline...">
  Go to DeskHive
</a>

<p>If you have any questions, just reply to this email.</p>

<p>Thanks,<br>The DeskHive team</p>
```

**CTA button:** "Go to DeskHive" linking to `{{appUrl}}` (the base URL of the app — env variable). Lands them on the homepage where they can sign in if needed and access the user-pill dropdown to switch to hosting.

**Template data:** `{ applicantName: string, businessName: string, appUrl: string }`

**Why no direct `/owner` link?** Story 7-1 made `/owner/*` redirect from Guest mode. An applicant who just got approved is in Guest mode by default (mode cookie is session-level and they may be logged out anyway). Sending them to `/` is the safest landing — works whether they're logged in/out, on/off the host-mode cookie.

---

#### `application-rejected`

**Subject:** `Your DeskHive Space Owner application`

**Preview text:** `Thanks for applying. Unfortunately, we weren't able to approve your application at this time.`

**Body:**

```html
<p>Hi {{applicantName}},</p>

<p>Thanks for your interest in becoming a Space Owner on DeskHive. After reviewing your application for <strong>{{businessName}}</strong>, we're unable to approve it at this time.</p>

<p>You're welcome to apply again in the future if your circumstances change. In the meantime, you can continue using DeskHive to book spaces as a guest.</p>

<p><!-- Soft CTA, optional engagement --></p>
<a href="{{appUrl}}" style="...indigo button styles inline...">
  Browse spaces
</a>

<p>Thanks,<br>The DeskHive team</p>
```

**CTA button:** "Browse spaces" linking to `{{appUrl}}`. Soft engagement to keep the user active on the platform.

**Template data:** `{ applicantName: string, businessName: string, appUrl: string }`

**`rejection_reason` is NOT included** per Decision §6.

---

### Decision 4: Voice — transactional, no exclamation, no emoji

Matches Story 6-3's toast voice anchor (`reference_toast_wrapper_and_voice.md`).

**Tone rules:**
- Plain declarative sentences ("Your application has been approved" — not "Congratulations, you're approved!")
- No exclamation marks anywhere
- No emojis anywhere
- "Thanks," — not "Thanks!" or "Cheers!" or "Best regards"
- "The DeskHive team" — not "Team DeskHive" or "DeskHive 💙"
- Warm but not chirpy. Professional but not stiff.

**Why this matters:** transactional emails (especially rejection) are emotionally sensitive moments. Over-cheerful copy reads as tone-deaf. Generic professional warmth is the right register.

### Decision 5: `appUrl` is environment-driven

The CTA button URLs in approved + rejected emails use a `{{appUrl}}` placeholder that's filled from the `APP_URL` (or equivalent existing) environment variable.

**Why not hardcode:** localhost dev vs. production deploys have different URLs. CTA buttons must point to the right host.

**Env variable:** `APP_URL` (default `http://localhost:3000` for local dev; set to production URL in deploys).

**If `APP_URL` is unset:** falls back to `http://localhost:3000` with a server-side console warning. Don't crash; just log.

This env variable likely already exists somewhere in Phase 1 (used for Better Auth redirects or similar). Amelia reuses the existing variable if found, doesn't create a duplicate.

### Decision 6: NO rejection_reason in the email

Story 7-2 stores `rejection_reason` (TEXT NULLABLE) and Story 7-4's reject modal asks the admin to optionally provide one with the helper text "The reason is for your records. The applicant won't see it directly in the app (they'll receive a notification email in a future release)."

**Decision:** the application-rejected email contains NO `rejection_reason` content. The reason stays internal.

**Reasoning:**
- Story 7-4's modal helper text **already promised admins** the reason is "for your records." Surfacing it verbatim in user-facing email would break that promise retroactively.
- Admin notes are often terse and internal-voice ("incomplete tax info," "looks sketchy," "duplicate of last week's"). Verbatim sharing creates harm.
- Generic rejection emails are the industry norm (employers, schools, marketplaces all do this).
- If a future feature wants to enable "share with applicant" admin-facing checkbox, build it as a Phase 3 feature with explicit consent UX. Not a 8-2 concern.

**Anti-pattern explicitly forbidden:** do NOT add `rejection_reason` to the template data type or include it in the rendered HTML.

### Decision 7: E2E test coverage using 7-PREP-1 fixtures

**At minimum 3 new E2E tests** in `tests/e2e/application-emails.spec.ts` (new file) or extending existing specs:

1. **`Guest submits valid application → application-received email is sent to applicant`**
   - Use `authenticatedPage('guest')` — the plain Guest seed user from 7-PREP-1
   - Mock Resend at the spec level (so we don't actually deliver during CI)
   - Submit the application form
   - Assert `sendEmail` was called with template `'application-received'` and `to` matching the guest's email

2. **`Admin approves PENDING application → application-approved email is sent to applicant`**
   - Use `authenticatedPage('admin')`
   - Navigate to `/admin/applications`, click into a PENDING application, click Approve
   - Assert `sendEmail` was called with `'application-approved'` and the applicant's email
   - Assert role promotion still works (regression check on Story 7-2 atomic transaction)

3. **`Admin rejects application via modal → application-rejected email is sent to applicant`**
   - Use `authenticatedPage('admin')`
   - Navigate to a PENDING application, click Reject, fill optional reason, confirm
   - Assert `sendEmail` was called with `'application-rejected'` and the applicant's email
   - Assert `rejection_reason` was saved to DB but NOT included in the email (test the absence)

**Resend mocking pattern:** the E2E test injects a mock `RESEND_API_KEY=mock` (or similar) that triggers the email service to short-circuit to a test mode that records calls instead of hitting Resend. Amelia decides the cleanest implementation — could be a spy on the `sendEmail` function, could be a Resend mock in test setup, could be a fixture-level interceptor.

**Why mock instead of actually delivering:** E2E tests shouldn't depend on Resend's uptime or count against your Resend quota. Real delivery is verified manually via the BA browser walk (Decision §10).

### Decision 8: Unit test coverage for each template

For each of the 3 templates, in `src/lib/email-templates/application-emails.test.ts` (or wherever the template render functions live):

1. **Render returns HTML containing the applicant's name** — input `{ applicantName: 'Alice', ... }` → output contains `Alice`
2. **Render escapes HTML special chars** — input `{ applicantName: '<script>', ... }` → output contains `&lt;script&gt;`, not literal `<script>`
3. **Render produces a subject and preview text** — both non-empty strings
4. **Approved template includes the appUrl** — output contains the URL
5. **Rejected template does NOT include rejection_reason** — even if accidentally passed in the data object (defensive test against future bugs)

5 tests × 3 templates = ~15 unit tests minimum. Net new unit count target: **~245-250** (from 234 baseline).

### Decision 9: Memory entry update

Extend the existing memory file `reference_email_service_pattern.md` (Story 8-1) with:

- The "transactional, no exclamation, no emoji" voice rule for transactional emails (mirrors `reference_toast_wrapper_and_voice.md`)
- The pattern for adding a new template: register in `TemplateName` + `TemplateData` types, write the render function, wrap in `renderBaseTemplate`, locked-copy approach
- The `appUrl` env-variable convention for CTA buttons
- The "no internal admin notes in user-facing emails" principle (Decision §6)
- A pointer to Stories 8-3 / 8-4 for the next batch of templates

If the existing memory file is getting long, Amelia may split into a new file (e.g., `reference_application_emails_voice.md`) — her call.

### Decision 10: BA browser walk delivers ONE real email per template

This is the manual verification step that automation can't replace.

During BA verification:
1. Run the dev server with `TEST_EMAIL_RECIPIENT` set to your real email
2. Trigger each flow manually in the browser:
   - Log in as `guest@deskhive.local`, apply via `/become-a-host` → expect **application-received** in inbox
   - Log in as `admin@deskhive.local`, approve that application → expect **application-approved** in inbox (BA needs admin permissions to do this, but the email lands in whoever the applicant's email is — so BA may need to temporarily set the seed Guest's email to BA's real address, OR observe via Resend dashboard's "sent emails" log)
   - Reject another PENDING application → expect **application-rejected** in inbox (same caveat)

**Alternative for cleaner verification:** use the Resend dashboard's email log (https://resend.com/emails) to see all sent emails without actually receiving them. Same outcome, less email cleanup.

BA confirms each email:
- Subject matches Decision §3 verbatim
- Body renders correctly (wordmark, body content, footer)
- No HTML escape characters visible
- CTA button (where applicable) clicks through to the right URL
- No emoji or exclamation marks anywhere

---

## Architectural anti-patterns forbidden

- **Do NOT** change the signatures of `notifyApplicationReceived`, `notifyApplicationApproved`, `notifyApplicationRejected` — only the bodies (Decision §2)
- **Do NOT** include `rejection_reason` in the application-rejected email (Decision §6)
- **Do NOT** send an admin notification email when a new application arrives (Decision §1)
- **Do NOT** introduce exclamation marks or emojis into any email copy (Decision §4)
- **Do NOT** hardcode URLs — use `APP_URL` env variable (Decision §5)
- **Do NOT** call `sendEmail` directly from any Server Action — it goes through the `notify*` functions in `src/lib/applications.ts` (existing seam)
- **Do NOT** add new template names to the registry beyond the 3 placeholders that already exist from Story 8-1
- **Do NOT** modify Story 7-2 application data model, queries, or Server Actions (signature-locked from 7-2/7-3/7-4)
- **Do NOT** add a "share rejection reason" admin checkbox (Phase 3 candidate at best)
- **Do NOT** add CTA buttons to the application-received email — it's informational only (Decision §3)
- **Do NOT** introduce react-email, MJML, or any new template engine (8-1 Decision §5 inherited)
- **Do NOT** add Resend webhook handling — bounce/complaint tracking is Phase 3
- **Do NOT** introduce per-applicant email preferences (transactional emails don't need opt-in)
- **Do NOT** localize copy to ru / uz — English only
- **Do NOT** actually deliver real emails in E2E tests — mock at the spec level (Decision §7)

---

## Browser verification checklist

After Amelia completes the dev story:

### Setup

- Dev server running on `localhost:3000`
- `RESEND_API_KEY` set in `.env.local`
- `TEST_EMAIL_RECIPIENT` set to your real email (for BA inbox checks if doing manual delivery)
- Re-run `pnpm db:seed` to ensure clean test data with at least 2 PENDING applications
- Resend dashboard open in another tab (https://resend.com/emails) for monitoring sent emails without inbox spam

### Checks

1. **All unit tests pass** — `pnpm test` runs clean. Target ~245-250 (was 234). New tests in `email-templates/application-emails.test.ts`.

2. **All E2E tests pass** — `pnpm test:e2e` runs clean. Target ~49 (was 46, +3 new from Decision §7).

3. **Typecheck + lint clean** — `pnpm typecheck && pnpm lint` both pass.

4. **Build still 36 routes** — no new production routes added.

5. **`git diff --stat` shows zero `src/app/`, zero `drizzle/`, zero `scripts/seed.ts`, zero `src/db/queries/`** — only `src/lib/applications.ts` (stub bodies), `src/lib/email-templates/*` (new), `tests/*`, memory file, package.json minor (if any).

6. **Manual flow A — Guest submits → application-received** —
   - Log in as `guest@deskhive.local`
   - Navigate to `/become-a-host`, fill in form (business name "BA Verification Cafe"), submit
   - Open Resend dashboard → confirm `application-received` was sent to `guest@deskhive.local`
   - Confirm subject is `Your DeskHive Space Owner application`
   - Confirm body contains "BA Verification Cafe" and "Hi {applicantName}" rendered with the seed user's name
   - Confirm no exclamation marks or emojis in the rendered HTML

7. **Manual flow B — Admin approves → application-approved** —
   - Log in as `admin@deskhive.local`
   - Navigate to `/admin/applications`, click into the PENDING application from flow A, click Approve
   - Confirm toast appears: "Application approved..."
   - Open Resend dashboard → confirm `application-approved` was sent to `guest@deskhive.local`
   - Confirm subject is `You're approved as a DeskHive Space Owner`
   - Confirm body contains the "Switch to hosting" prose and a CTA button "Go to DeskHive"
   - Confirm CTA URL is `http://localhost:3000` (or whatever `APP_URL` is set to)

8. **Manual flow C — Admin rejects → application-rejected** —
   - Use a different PENDING application (re-seed if needed)
   - Click Reject in admin UI, fill in rejection reason "Internal note: tax ID looks incomplete", confirm
   - Confirm toast appears: "Application rejected."
   - Open Resend dashboard → confirm `application-rejected` was sent to that applicant's email
   - Confirm subject is `Your DeskHive Space Owner application`
   - Confirm body contains "we're unable to approve it at this time"
   - **CRITICAL:** confirm body does NOT contain "tax ID looks incomplete" or any part of the internal rejection reason (Decision §6 verification)
   - Confirm CTA button "Browse spaces" appears

9. **Atomic role promotion still works** — after flow B, log in as the just-approved Guest. User-pill dropdown shows "Switch to hosting". Confirms Story 7-2's atomic transaction wasn't disturbed by the email side-effect.

10. **Email failure does NOT break the user flow** — temporarily set `RESEND_API_KEY=invalid` in `.env.local`, restart dev server, repeat flow A (Guest submits application). Application creation succeeds, toast appears, DB row exists. Server console logs an email failure warning. Email obviously doesn't land. **Critical regression check:** user request succeeds even when email fails (Decision §4 + 8-1 Decision §4).

11. **Kill switch works for application emails** — set `EMAIL_TEMPLATES_DISABLED=application-approved`, restart, repeat flow B. Approval succeeds, role promotion works, but no `application-approved` email is sent. Resend dashboard confirms. Server console logs "template disabled."

12. **Phase 1 + Theme A + 8-1 regression** — quick smoke:
   - Book a desk as Guest (no email expected — booking emails are 8-3)
   - Admin confirms a booking (no email expected)
   - Owner switches to hosting (Story 7-1 regression check)
   - `pnpm send-test-email` (Story 8-1 CLI) still works
   - Story 7-3 / 7-4 flows still pass

13. **No console errors during all flows**

14. **Footer reads `© 2026 DeskHive` in each delivered email**

15. **Logo behavior matches `EMAIL_LOGO_URL` env setting** — if unset, wordmark-only (Story 8-1 Decision §6). If set to a hosted PNG URL, real logo renders.

---

## Files likely touched

Estimate, not directive.

- `src/lib/applications.ts` — replace bodies of `notifyApplicationReceived`, `notifyApplicationApproved`, `notifyApplicationRejected` (signatures unchanged)
- `src/lib/email-templates/application-received.ts` (new) — template render function
- `src/lib/email-templates/application-approved.ts` (new) — template render function
- `src/lib/email-templates/application-rejected.ts` (new) — template render function
- `src/lib/email-templates/index.ts` (new or updated) — exports
- `src/lib/email-templates/application-emails.test.ts` (new) — unit tests
- `src/lib/email.ts` — possibly minor update if template registry needs the new render functions wired in (depends on 8-1's exact structure)
- `tests/e2e/application-emails.spec.ts` (new) — E2E coverage
- Memory file — update existing `reference_email_service_pattern.md` per Decision §9
- `.env.example` — document `APP_URL` if not already there

**No changes to:**
- `src/app/` (any page route)
- `drizzle/` (schema)
- `scripts/seed.ts`
- `src/db/queries/`
- Better Auth configuration
- Any existing Server Action signature
- `src/lib/email.ts` core API (the `sendEmail` function signature)
- Story 7-2 / 7-3 / 7-4 Server Actions

---

## CI baseline target after this story

Current baseline (end of 8-1):
- Unit tests: 234
- E2E tests: 46
- Build routes: 36

After Story 8-2:
- Unit tests: **~245-250** (+11-16 new from Decision §8)
- E2E tests: **~49** (+3 new from Decision §7)
- Build routes: 36 (unchanged)

---

## Memory note for Phase 2 continuation

This story:

- Completes the Theme A application loop — the 3 notification stubs from Story 7-2 are now real emails
- Establishes the "transactional voice" rule for all future emails (no exclamation, no emoji, plain declarative)
- Locks the "admin internal notes never appear in user-facing emails" principle (Decision §6)
- Validates 7-PREP-1's authenticated fixtures by being the first story to actually exercise them in anger

**After 8-2 ships:**
- Theme C is 2/4 stories done
- Story 8-3 (booking emails, 8 templates) is next — biggest single email story in Theme C
- Story 8-4 (payment emails) depends on Theme B's webhook handlers (Story 9-5), so sequence Theme B before 8-4

**Suggested next dispatch:** Story 8-3 if you want to keep Theme C momentum, OR Story 9-1 if you want to start Theme B in parallel and come back to 8-3 with more email experience under your belt. Theme B/C are still independent until Story 8-4.

**Design refinement opportunity:** if Makhbuba's Phase 2 designs arrive between now and Story 8-3, the base template in `email.ts` is the single seam to update — 8-2's 3 emails inherit any changes automatically.

---

**End of BA decisions document.**
