# Story 8-1: Email Wrapper + Resend Integration + Base Template — BA Decisions

**Story:** 8-1
**Epic:** 8 — Email Infrastructure (Theme C)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Wednesday, May 13, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §8 Epic 8, Story 8-1

---

## Context

Theme A (multi-tenant infrastructure) shipped in Epic 7. The transition story (7-PREP-1) closed the cumulative authenticated-E2E debt and landed Better Auth Playwright fixtures. Theme B (Payments, Epic 9) and Theme C (Email, Epic 8) are now both unblocked.

This story kicks off Theme C — the email infrastructure that downstream stories will reuse:
- Story 8-2: Application emails (replaces 3 notification stubs from Story 7-2: `notifyApplicationReceived`, `notifyApplicationApproved`, `notifyApplicationRejected`)
- Story 8-3: Booking emails (request, confirm, reject, cancel — both Guest-facing and Owner-facing variants, 8 templates total per Phase 2 PRD §4.3)
- Story 8-4: Payment emails (receipt, refund, payout — fired from Stripe webhook handlers in Epic 9)

Story 8-1 does NOT ship any actual email content. It ships the **plumbing**: the Resend SDK wrapper, the typed template registry, the send function with error handling, the base HTML template scaffold (header + footer + branded styling), and a test-send capability used during BA verification.

**Designer status:** Makhbuba was sent the Phase 2 brief yesterday and is expected to deliver designs within 24-48 hours. Story 8-1 has no email-specific design content (just header/footer/button styling at the template-scaffold level), so we proceed with current Phase 1 brand tokens (indigo primary, hexagon logo, `© 2026 DeskHive` footer). Stories 8-2 / 8-3 / 8-4 will incorporate Makhbuba's email designs when they arrive.

---

## Scope

**In scope:**

- New dependency: `resend` (Resend's official Node SDK, latest stable)
- New file `src/lib/email.ts` — the email service module (the seam, same pattern as `src/lib/money.ts`, `src/lib/toast.ts`, `src/lib/applications.ts`)
- Typed template registry: a TypeScript enum or const-object listing every template name that exists across Stories 8-2 / 8-3 / 8-4 (placeholder entries are fine — actual rendering is in those stories)
- Typed send function: `sendEmail({ to, template, data })` with full type safety on the `data` parameter per template
- Error handling: send failures do NOT break the calling user request (per Phase 2 PRD NFR-5 — email is non-blocking)
- Base HTML template (one shared layout): header with DeskHive logo + footer with `© 2026 DeskHive`. Body content slot for downstream templates. Inline CSS only (email-client compatibility).
- Test-send capability: a way to fire a sample email during BA verification (a Server Action or CLI script — Amelia picks)
- Environment variables: `RESEND_API_KEY`, `TEST_EMAIL_RECIPIENT`, `EMAIL_FROM_ADDRESS`, optional `EMAIL_TEMPLATES_DISABLED`
- Unit tests for the email service: send happy path (mocked Resend), send error path, kill-switch behavior, template-data type safety
- Memory entry codifying the email service pattern
- Documentation in `src/lib/email.ts` (or a sibling `README` if needed) explaining how downstream stories add a new template

**Out of scope:**

- Actual application emails (Story 8-2)
- Actual booking emails (Story 8-3)
- Actual payment emails (Story 8-4)
- Stripe webhook integration (Epic 9, Story 9-5)
- A custom sender domain like `noreply@deskhive.com` — using Resend's sandbox sender `onboarding@resend.dev` for MVP (see Decision §3)
- Multi-language support (ru / uz) — English only for Phase 2
- A queue / retry mechanism beyond what Resend itself provides — Phase 2 PRD NFR-5 explicitly accepts "in-memory queue with restart-loss tolerance" but we're not even building that in 8-1
- React-email, MJML, or any template engine beyond template literals (Decision §5)
- Email open / click tracking
- A/B testing infrastructure for email content
- Email preview / staging environment beyond Resend's built-in dashboard
- Bounce / complaint handling beyond Resend's defaults
- Unsubscribe link infrastructure (transactional emails don't legally require unsubscribe in most jurisdictions, but worth flagging for Phase 3)
- Replacing the 3 notification stubs in Story 7-2's applications service (that's Story 8-2)
- Modifying any existing Server Action to call email send (that's per-flow stories: 8-2 / 8-3 / 8-4)
- New seed data
- UI changes — this story has zero user-visible UI surface

---

## Decisions

### Decision 1: Email service module — `src/lib/email.ts` as the single seam

Follows the established Phase 1 + 2 pattern:

```typescript
// src/lib/email.ts
import { Resend } from 'resend'

type TemplateName =
  | 'application-received'      // 8-2
  | 'application-approved'      // 8-2
  | 'application-rejected'      // 8-2
  | 'booking-requested-guest'   // 8-3
  | 'booking-requested-owner'   // 8-3
  | 'booking-confirmed-guest'   // 8-3
  | 'booking-confirmed-owner'   // 8-3
  | 'booking-rejected-guest'    // 8-3
  | 'booking-cancelled-guest'   // 8-3
  | 'booking-cancelled-owner'   // 8-3
  | 'payment-receipt'           // 8-4
  | 'payment-refund'            // 8-4
  | 'payout-summary'            // 8-4
  | '__test__'                  // BA verification only — DELETE in 8-2 if no longer needed

type TemplateData = {
  'application-received': { applicantName: string, businessName: string }
  // ... entries for each template, filled in by 8-2 / 8-3 / 8-4
  '__test__': { message: string }
}

export async function sendEmail<T extends TemplateName>(args: {
  to: string
  template: T
  data: TemplateData[T]
}): Promise<{ status: 'sent' | 'disabled' | 'error', error?: string }> { ... }
```

**Architectural rules:**
- TypeScript-only API. No `any` on the `data` field. Each template's data shape is exhaustively typed.
- The function is async but **non-throwing** — failures return `{ status: 'error', error }` and log to the server console. Calling code never wraps `sendEmail` in try/catch.
- No global Resend client export. Caller never sees the Resend SDK directly. `email.ts` is the only file that imports `resend`.

### Decision 2: Test recipient — env variable `TEST_EMAIL_RECIPIENT`, BA fills in at verification

The `__test__` template fires to whatever email is in the `TEST_EMAIL_RECIPIENT` env variable at runtime. BA sets this locally (e.g., personal email) before running the verification step.

**Why an env variable, not hardcoded:**
- Different developers may want test sends to land in their own inbox
- CI / staging environments can set a shared inbox or null route
- No code change needed to swap recipients

If `TEST_EMAIL_RECIPIENT` is unset, the test-send capability returns `{ status: 'error', error: 'TEST_EMAIL_RECIPIENT not configured' }` — never sends to a default.

### Decision 3: Sender domain — `onboarding@resend.dev` for MVP

Phase 2 is test-mode infrastructure (Stripe test mode, no real payments). Email matches that posture.

**Decision:**
- `EMAIL_FROM_ADDRESS` env variable, defaulted to `onboarding@resend.dev` (Resend's sandbox sender that works out-of-the-box on the free tier with no DNS setup)
- No custom domain (`noreply@deskhive.com`) for Phase 2 — DeskHive doesn't own a verified domain yet
- When DeskHive eventually launches with a real domain, swap the env value. One-line config change, no code rewrite.

Trade-off accepted: recipients see "from onboarding@resend.dev" which is clearly dev-y. Fine for MVP demo.

### Decision 4: Error handling — non-throwing, non-blocking, observable

Per Phase 2 PRD NFR-5: "Email sends are non-blocking on the user request. If Resend is unavailable, the user request still succeeds; email is queued for retry via a simple background mechanism."

Story 8-1 implements the **non-throwing, non-blocking, observable** part. The retry queue is deferred (PRD says in-memory is acceptable; 8-1 doesn't even add that — we'll see if Resend reliability makes it necessary).

**Behavior:**
- `sendEmail` returns a structured result, never throws
- On send failure: log full error to server console (so Vercel/Neon logs catch it) AND return `{ status: 'error', error: '<message>' }`
- Callers in Stories 8-2 / 8-3 / 8-4 ignore the result by default (fire and forget) — the email failure does NOT roll back the booking, application, or payment
- Critical flows (e.g., approving an application) may opt to log a warning if email fails, but never block the user

**Example caller pattern (Story 8-2 will follow this):**

```typescript
// inside approveApplicationAction
await db.transaction(async (tx) => { ... })  // atomic role promotion
sendEmail({ to: applicant.email, template: 'application-approved', data: {...} })
  .then((r) => { if (r.status === 'error') console.warn('email failed', r.error) })
// Server Action returns success regardless of email outcome
```

### Decision 5: Template engine — plain template literals, no new dependency

Two options were considered:
- **react-email** — React components for emails, Resend-recommended, but adds a heavy dependency and a build step
- **MJML** — email-specific markup language, mature, but adds a compiler
- **Template literals** — `\`<html>...<\${data.field}>...</html>\`` — zero new dependencies

**Decision: template literals.**

Reasoning:
- Phase 1 philosophy is "no dependencies, no abstractions until forced." We have 13 templates total across 8-2 / 8-3 / 8-4. Template literals are fine at that scale.
- react-email is genuinely better when you have 30+ templates or need cross-team design collaboration. We don't.
- If Stories 8-2 / 8-3 produce unmaintainable template-literal soup, we can introduce react-email in a later polish story. **Trial it as needed, don't preempt.**
- Email-client compatibility (inline CSS, table layouts where needed) is the same problem under either approach — the engine doesn't change the rendering rules.

The base template (header + footer + body slot) is a single function exported from `email.ts`:

```typescript
function renderBaseTemplate({ bodyHtml, previewText }: { bodyHtml: string, previewText: string }): string {
  // returns full HTML with header (logo + DeskHive name), bodyHtml in the middle, footer with © 2026 DeskHive
}
```

Stories 8-2 / 8-3 / 8-4 call `renderBaseTemplate({ bodyHtml: '<p>...</p>', ... })` to wrap their template content.

### Decision 6: Base HTML template — header + footer + body slot, current brand tokens

Single shared layout. All transactional emails use it.

**Header:**
- DeskHive hexagon logo (use the existing SVG from Phase 1, inline as a base64 data URL or hosted on a stable CDN)
- "DeskHive" wordmark next to logo
- Indigo accent (matches Phase 1 primary color — Amelia confirms the hex from existing Tailwind config)

**Body:**
- White background, max-width ~600px (email-client default), inline CSS for typography
- One paragraph style, one heading style, one button style (CTA in indigo)
- Inline CSS only — no `<style>` blocks, no external stylesheets (email clients strip these)

**Footer:**
- `© 2026 DeskHive` (matches the web footer in Phase 1)
- Optional: small line saying "You're receiving this because [reason]" (Story 8-2 / 8-3 / 8-4 fills in the reason per template)
- No unsubscribe link in Phase 2 (transactional emails don't legally require it in most jurisdictions; flagged for Phase 3)

**No images beyond the logo.** Keeps things fast, accessible, and dark-mode-safe.

**Design refinement window:** Makhbuba may send Phase 2 designs within 24-48 hours. If her designs propose specific email template styling, Story 8-2 (the first story to actually ship email content) is the right place to incorporate those refinements. Story 8-1's base template uses current Phase 1 tokens as a sensible default.

### Decision 7: Per-template kill switch — `EMAIL_TEMPLATES_DISABLED` env variable

Cheap to build now, hard to retrofit under fire. If Stories 8-2 / 8-3 / 8-4 ship a buggy template that fires twice or spams users, we want a one-line env-var update to disable it without a redeploy.

**Behavior:**
- Env variable `EMAIL_TEMPLATES_DISABLED` is a comma-separated list of template names (e.g., `EMAIL_TEMPLATES_DISABLED=booking-confirmed-owner,payment-receipt`)
- When `sendEmail` is called with a template name in the disabled list, it returns `{ status: 'disabled' }` immediately without calling Resend
- Unit test covers this path

**Anti-pattern explicitly forbidden:** do NOT add a per-template kill switch as a database field or admin UI toggle in 8-1. Env variable is enough. Phase 3 candidate if needed.

### Decision 8: Test-send capability — internal-only, not a production route

Story 8-1 needs a way to fire a test send during BA verification. Options:
- **A.** Add a Server Action `sendTestEmailAction()` invocable from a hidden admin page
- **B.** Add a CLI script `pnpm send-test-email`
- **C.** Add a one-off API route at `/api/test/email` (test-mode only, gated by NODE_ENV)

**Decision: Option B (CLI script).** Reasoning:
- Doesn't touch the production route surface (no risk of leaking into production)
- Doesn't add a UI page that has to be hidden/gated
- BA runs `pnpm send-test-email` once during verification, sees the email land, deletes the email, moves on
- Same pattern as `pnpm db:seed` — internal tooling, not user-facing
- The script imports `sendEmail` from `src/lib/email.ts` and fires the `__test__` template to `TEST_EMAIL_RECIPIENT`

**Anti-pattern forbidden:** do NOT add a test-only API route to production code (same principle as 7-PREP-1 Decision §2 — no backdoor routes).

### Decision 9: `__test__` template — special, removable

The `__test__` template is the only template that actually renders content in Story 8-1. It's used exclusively for the BA verification test send.

**Content (locked):**
- Subject: `[DeskHive] Test email from Story 8-1`
- Body: a short HTML paragraph saying "This is a test email from the DeskHive email service. If you're seeing this, the email pipeline works. Sent at <timestamp>."
- Wrapped in the base template (so verification proves the base template renders correctly too)

Story 8-2 may choose to keep the `__test__` template for ongoing infra verification, OR remove it once real templates exist. Amelia's call in 8-2; not a 8-1 decision.

### Decision 10: Unit test coverage

Required tests in `src/lib/email.test.ts`:

1. **Happy path** — mock Resend SDK, call `sendEmail({ to, template: '__test__', data: { message: '...' }})`, assert Resend's `send` was called with the right `from`, `to`, `subject`, `html`. Return value is `{ status: 'sent' }`.
2. **Resend error path** — mock Resend to throw, call `sendEmail`, assert return value is `{ status: 'error', error: '...' }` (no throw escapes).
3. **Kill-switch path** — set `EMAIL_TEMPLATES_DISABLED='__test__'`, call `sendEmail`, assert Resend was NOT called and return value is `{ status: 'disabled' }`.
4. **Type safety (compile-time, not runtime)** — at least one test demonstrating that wrong `data` shape for a template fails to compile. Can be a `// @ts-expect-error` line in a test file or a documented type assertion.
5. **Base template renders** — call `renderBaseTemplate({ bodyHtml: '<p>hi</p>', previewText: 'x' })` and assert the output contains the header, the body, and the `© 2026 DeskHive` footer.

No E2E tests in 8-1 (no UI to exercise). The CLI test-send is BA-verified manually.

### Decision 11: Memory entry codifying the email service pattern

Amelia adds a memory file with:

- The `sendEmail` API and the typed template registry pattern
- The "fire and forget, never throw, never block" rule for callers
- The base-template wrapping pattern (`renderBaseTemplate({ bodyHtml, previewText })`)
- The kill-switch env variable
- The pointer to Phase 1 service-module convention (`src/lib/money.ts`, `src/lib/toast.ts`) — `email.ts` joins this family
- A pointer to Stories 8-2 / 8-3 / 8-4 as the "next places to add templates" and the template-data-shape contract they must follow

Suggested file name: `reference_email_service_pattern.md` (Amelia picks per convention).

### Decision 12: Documentation pattern — comment header in `email.ts`

The `src/lib/email.ts` file opens with a block comment explaining:

- How to add a new template (add to `TemplateName` union, add data shape to `TemplateData`, implement the render function)
- The caller contract (fire-and-forget, ignore result, never throw)
- The env variables this module reads
- The kill-switch behavior

This is in-file documentation — no separate README needed. Downstream story authors (8-2 / 8-3 / 8-4) read the comment at the top of `email.ts` and know what to do.

---

## Architectural anti-patterns forbidden

- **Do NOT** add a custom domain for sender address. Use `onboarding@resend.dev` (Decision §3).
- **Do NOT** add a test-only API route. CLI script is the test mechanism (Decision §8 — same principle as 7-PREP-1 Decision §2).
- **Do NOT** introduce react-email, MJML, or any template engine. Template literals (Decision §5).
- **Do NOT** make `sendEmail` throw. Always return structured result (Decision §4).
- **Do NOT** wrap `sendEmail` callers in try/catch — they fire and forget (Decision §4).
- **Do NOT** block user requests on email sends. Email is async-only (Decision §4, PRD NFR-5).
- **Do NOT** export the Resend client globally. `email.ts` is the only file that imports `resend` (Decision §1).
- **Do NOT** add a per-template kill switch as a DB field or admin UI. Env variable only (Decision §7).
- **Do NOT** add unsubscribe links (Phase 2 transactional emails don't require; flagged for Phase 3).
- **Do NOT** add open / click tracking.
- **Do NOT** add multi-language support. English only.
- **Do NOT** modify Story 7-2 application notification stubs in 8-1. Those get replaced in 8-2.
- **Do NOT** modify Phase 1 booking flow or admin UI. Pure infra story, no UI surface.
- **Do NOT** ship any real templates beyond `__test__` in 8-1. Real content is in 8-2 / 8-3 / 8-4.
- **Do NOT** install any dependency beyond `resend`. No new util libraries.
- **Do NOT** seed test data. No DB changes in this story.
- **Do NOT** add a retry queue. Fire-and-forget for now; revisit if Resend reliability proves shaky.

---

## Browser verification checklist

This is an infrastructure story — most verification is via test suite + CLI test-send. No browser UI to walk.

### Setup

- `pnpm install` runs clean after `resend` is added to `package.json`
- `RESEND_API_KEY` set in `.env.local` (BA gets this from Resend dashboard after creating an account — free tier)
- `TEST_EMAIL_RECIPIENT` set to BA's personal email
- `EMAIL_FROM_ADDRESS` set to `onboarding@resend.dev` (or omit to use default)

### Checks

1. **Dependency installed** — `package.json` lists `resend` in `dependencies`. `pnpm install` completes without errors.

2. **All unit tests pass** — `pnpm test` runs clean. New tests in `src/lib/email.test.ts` (at least 5 per Decision §10) all pass.

3. **All E2E tests pass** — `pnpm test:e2e` runs clean. Baseline unchanged at 46 (8-1 adds no E2E tests).

4. **Typecheck passes** — `pnpm typecheck` clean. The `TemplateData[T]` type safety is enforced.

5. **Lint passes** — `pnpm lint` clean.

6. **CLI test-send works** — run `pnpm send-test-email` (or whatever Amelia named the script). Expected behavior:
   - Console output indicates success
   - BA's inbox (per `TEST_EMAIL_RECIPIENT`) receives a real email within ~30 seconds
   - Email has `[DeskHive] Test email from Story 8-1` as subject
   - Email body renders with: DeskHive logo in header, the test message in the body, `© 2026 DeskHive` in the footer
   - Email is from `onboarding@resend.dev` (or whatever `EMAIL_FROM_ADDRESS` is set to)

7. **Email looks acceptable in inbox** — open it in Gmail or whatever BA uses. Header, body, footer are legible. Logo renders (or shows alt text gracefully). No broken HTML, no missing CSS, no spam folder.

8. **Kill-switch works** — set `EMAIL_TEMPLATES_DISABLED=__test__` in env, re-run `pnpm send-test-email`. No email lands; console output indicates the template was disabled.

9. **Error path works** — temporarily set `RESEND_API_KEY` to an invalid value, re-run the script. Console logs an error; the script exits non-fatally; no email lands.

10. **Build passes** — `pnpm build` runs clean. Build output still 36 routes (8-1 adds zero production routes).

11. **No production routes added** — verify no new `/api/*` or page routes appeared in the build output (Decision §8).

12. **`git diff --stat` shows email module + tests + CLI script + memory + package.json** — and nothing in `/app`, no new pages, no UI changes.

13. **Existing flows unchanged** — quick smoke: log in as guest, browse spaces, book a desk → existing behavior intact, no email tries to fire (because no caller has been wired yet; that's 8-2 / 8-3 / 8-4 work).

14. **No console errors** during normal app usage (email module is dormant until callers wire to it).

15. **Footer reads `© 2026 DeskHive`** in the BA-received test email.

---

## Files likely touched

Estimate, not directive.

- `package.json` + `pnpm-lock.yaml` — add `resend` dependency
- `src/lib/email.ts` (new) — the email service module
- `src/lib/email.test.ts` (new) — unit tests
- `scripts/send-test-email.ts` (new, or similar location) — CLI test-send script
- `package.json` scripts — add `"send-test-email": "tsx scripts/send-test-email.ts"` or equivalent
- `.env.example` — document the new env variables (`RESEND_API_KEY`, `TEST_EMAIL_RECIPIENT`, `EMAIL_FROM_ADDRESS`, `EMAIL_TEMPLATES_DISABLED`)
- Memory file in `~/.claude/.../memory/` — `reference_email_service_pattern.md`

**No changes to:**
- Any page route (`src/app/...`) — pure infra
- Any existing Server Action
- Drizzle schema or migrations
- `scripts/seed.ts`
- Better Auth configuration
- Any existing test file (no migrations, no rewrites)
- The Phase 1 booking flow or admin UI

---

## CI baseline target after this story

Current baseline (end of 7-PREP-1):
- Unit tests: 220
- E2E tests: 46
- Build routes: 36

After Story 8-1:
- Unit tests: **~225-230** (+5-10 new tests in `email.test.ts` per Decision §10)
- E2E tests: 46 (unchanged — no UI surface)
- Build routes: 36 (unchanged — no new production routes)
- New dependency: `resend` (one direct, plus Resend's transitives)

---

## Memory note for Phase 2 continuation

This story establishes the email service seam that Theme C's remaining stories build on:

- **Story 8-2** (Application emails): replaces the 3 notification stubs from Story 7-2 (`notifyApplicationReceived`, `notifyApplicationApproved`, `notifyApplicationRejected`) with real `sendEmail` calls using the registered template names.
- **Story 8-3** (Booking emails): adds 8 templates (booking-requested/confirmed/rejected/cancelled × Guest/Owner variants per Phase 2 PRD §4.3). Wires to the existing Phase 1 booking Server Actions (`confirmBookingAction`, `rejectBookingAction`, etc.) using the fire-and-forget pattern.
- **Story 8-4** (Payment emails): adds 3 templates (payment-receipt, payment-refund, payout-summary). Fired from Stripe webhook handlers in Epic 9 (Theme B). This story technically depends on Theme B being far enough along to have webhook handlers — sequencing TBD when 8-4 is drafted.

**Theme C is independent of Theme B until Story 8-4.** Stories 8-1, 8-2, 8-3 can all ship while Theme B is still in progress.

**Design refinement risk acknowledged:** Makhbuba may send Phase 2 designs within the next 24-48 hours that propose specific email styling. Story 8-1's base template uses Phase 1 brand tokens as a sensible default. Story 8-2 is the right place to incorporate any new design tokens for email — adjust the base template there if needed (a 30-minute task at most).

After 8-1 ships, dispatch order is flexible:
- **8-2 next** if Makhbuba's designs have arrived (incorporate them when adding real content)
- **8-2 next** even if designs haven't arrived (ship with current tokens; polish later)
- **Could also dispatch 9-1 (Stripe SDK wrapper) in parallel** since Themes B and C are independent until 8-4

---

**End of BA decisions document.**
