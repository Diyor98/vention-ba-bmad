# Story 8.3: Booking Emails (8 templates × 4 state transitions × 2 recipients)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Guest booking a desk or a Space Owner hosting one**,
I want **transactional emails covering the four booking-state transitions (requested, confirmed, rejected, cancelled) sent to the right side of each transaction**,
so that **both parties have a paper trail of the booking lifecycle, inbox-threaded under per-side subjects, without admin-only data leaking and without spamming legacy NULL-owner spaces or self-emails.**

> Story 8.3 is the **third story of Epic 8 — Email Infrastructure (Theme C)**. Source of truth: [docs/design/8-3-booking-emails-ba-decisions.md](docs/design/8-3-booking-emails-ba-decisions.md). All decisions locked.

> **Largest single email story in Theme C** — 8 templates, 4 Server-Action wires, 6 new E2E tests, 30+ new unit tests. Applies the Story 8-2 directory pattern at scale.

> **6 BA-level decisions surfaced pre-dispatch** locked in the doc:
> - **Decision §1** — NULL-owner spaces skip the owner email entirely (legacy data; no broadcast to SUPER_ADMINs).
> - **Decision §2** — Owner email on guest-cancel fires only when previous status was CONFIRMED (PENDING cancellations are noise, CONFIRMED ones are signal).
> - **Decision §3** — Owner doesn't receive `booking-confirmed-owner` / `booking-rejected-owner` when they themselves are the actor (no self-emails). Admin acting on behalf of owner triggers the owner-side email.
> - **Decision §5** — New `getBookingDispatchInfo(bookingId)` join helper returns `{booking, space, desk, guest, owner | null}` in one query.
> - **Decision §6** — Threaded subjects: all 4 guest-side share `'[DeskHive] Your booking at {{spaceName}}'`; all 4 owner-side share `'[DeskHive] Booking on {{spaceName}} — {{bookingDate}}'`. **Dynamic interpolation** — new pattern vs. Story 8-2's static subjects.
> - **Decision §7** — Cancellation emails do NOT mention refund outcome (that belongs to Story 8-4's `payment-refund`).

> **Critical anti-patterns** baked into the type system:
> - `TemplateData` shapes for owner-side templates **omit `guestName`** (Decision §9 privacy-light minimalism). Owner emails describe what to act on, not who the guest is.
> - The 8th template `booking-rejected-owner` is **missing from Story 8-1's `TemplateName` union** — Story 8-3 adds it.

> **Reuses Story 8-1 + 8-2 infrastructure unchanged:** `sendEmail` service + `renderBaseTemplate` + `EMAIL_TEMPLATES_DISABLED` kill switch + `EMAIL_TEST_RECORD_FILE` recording sink + `waitForRecordedEmail` polling fixture. Voice rule (no exclamation, no emoji) carries over from Story 8-2 Decision §4.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–13 + Browser verification checklist (20 points).

1. **AC-1 (Add missing 8th template + refine 7 existing placeholder shapes in `email.ts`).** Per BA Decisions §9 + Audit finding:
   - **Add `'booking-rejected-owner'`** to the `TemplateName` union in [src/lib/email.ts](deskhive/src/lib/email.ts) (line 81-89 region). Story 8-1's registry shipped with 7 booking template names; Decision §9's body copy + the verification checklist (Flows D/E) require the 8th. Cross-reference: `'booking-cancelled-owner'` is the existing template with the closest shape — model it after that.
   - **Refine `TemplateData` shapes** for the booking templates per BA Decision §9 verbatim body copy:
     - `'booking-requested-guest'`: `{ guestName, spaceName, deskLabel, bookingDate }` — already correct in Story 8-1 placeholder.
     - `'booking-requested-owner'`: `{ ownerName, spaceName, deskLabel, bookingDate }` — **REMOVE `guestName`** from existing Story 8-1 placeholder (BA Decision §9: "guest's name and email NOT included" in owner-side request emails).
     - `'booking-confirmed-guest'`: `{ guestName, spaceName, deskLabel, bookingDate }` — already correct.
     - `'booking-confirmed-owner'`: `{ ownerName, spaceName, deskLabel, bookingDate }` — **REMOVE `guestName`**, **ADD `deskLabel`** (existing placeholder lacks it; body copy references it).
     - `'booking-rejected-guest'`: `{ guestName, spaceName, deskLabel, bookingDate }` — existing placeholder is missing `deskLabel`; **ADD it**.
     - `'booking-rejected-owner'` (NEW): `{ ownerName, spaceName, deskLabel, bookingDate }`.
     - `'booking-cancelled-guest'`: `{ guestName, spaceName, deskLabel, bookingDate }` — existing placeholder is missing `deskLabel`; **ADD it**.
     - `'booking-cancelled-owner'`: `{ ownerName, spaceName, deskLabel, bookingDate }` — **REMOVE `guestName`**, **ADD `deskLabel`**.
   - **Net data-shape changes** are TYPE NARROWING for owner-side templates (removing `guestName` makes accidental leakage a compile-time error — same defensive pattern as Story 8-2's `rejection_reason` removal).

2. **AC-2 (Dynamic subjects — extend `renderTemplate` to accept render-function-supplied subjects).** Per BA Decisions §6:
   - Story 8-2's render functions return `{bodyHtml, previewText}`; `email.ts::renderTemplate` pulls the subject from the static `Subjects` registry.
   - Story 8-3's 8 booking templates have **interpolated subjects** (e.g., `'[DeskHive] Your booking at ' + spaceName`). Story 8-3 extends the render-function return type to OPTIONALLY include a `subject` field:
     ```ts
     // Existing return shape (Story 8-2 templates continue to use this — no change required):
     function renderXxx(data): { bodyHtml: string; previewText: string }
     // Extended return shape (Story 8-3 booking templates use this):
     function renderXxx(data): { bodyHtml: string; previewText: string; subject: string }
     ```
   - **`email.ts::renderTemplate` switch** updated: pulls the subject from `rendered.subject` when present; falls back to `Subjects[name]` when absent. **Backward-compatible** — Story 8-2's 3 application templates + `__test__` continue to work unchanged.
   - **`Subjects` table entries** for the 8 booking templates can stay (they hold Story 8-1's placeholder strings) but become non-authoritative for booking templates. Optional: replace the 8 placeholders with strings noting "interpolated at render time" for human readers — dev-agent's call.

3. **AC-3 (8 per-template render functions in `src/lib/email-templates/`).** Per BA Decisions §9:
   - 8 new files, one per template, each following Story 8-2's pattern (one `render<Name>(data)` export, uses `escapeHtml` for interpolation, returns `{bodyHtml, previewText, subject}` per AC-2):
     - `src/lib/email-templates/booking-requested-guest.ts`
     - `src/lib/email-templates/booking-requested-owner.ts`
     - `src/lib/email-templates/booking-confirmed-guest.ts`
     - `src/lib/email-templates/booking-confirmed-owner.ts`
     - `src/lib/email-templates/booking-rejected-guest.ts`
     - `src/lib/email-templates/booking-rejected-owner.ts`
     - `src/lib/email-templates/booking-cancelled-guest.ts`
     - `src/lib/email-templates/booking-cancelled-owner.ts`
   - **Body copy LOCKED VERBATIM** per BA Decision §9 (subject + preview text + body HTML for all 8 templates). Do NOT paraphrase. CTA buttons follow Decision §8: guest-side `View booking` → `${BETTER_AUTH_URL}/my-bookings`, owner-side `View bookings` → `${BETTER_AUTH_URL}/owner/bookings`, with two exceptions: `booking-rejected-guest` and `booking-cancelled-guest` use `Browse spaces` → `${BETTER_AUTH_URL}` (soft re-engagement per Decision §8 / §9 body copy).
   - **Subject lines per Decision §6:**
     - All 4 guest-side templates: `'[DeskHive] Your booking at ' + spaceName`
     - All 4 owner-side templates: `'[DeskHive] Booking on ' + spaceName + ' — ' + formattedBookingDate`
   - **CTA button styling** matches Story 8-2 (inline indigo `#4F46E5` background, white text, rounded 6px, padding 10px 20px, font-weight 600, font-size 14px).
   - **Extend `src/lib/email-templates/index.ts` barrel** to re-export the 8 new render functions.

4. **AC-4 (`renderTemplate` switch dispatch — 8 new branches).** Per BA Decisions §4 + AC-2:
   - Extend `email.ts::renderTemplate`'s switch with 8 new branches dispatching to the new render functions. The 8 booking template names are now implemented (along with Story 8-2's 3 application templates + `__test__`); only the 3 payment templates (`payment-receipt`, `payment-refund`, `payout-summary`) remain throwing `'Template not implemented'` (Story 8-4 will land them).
   - **Verify Story 8-1's `email.test.ts` "not-implemented" probe** still picks an unimplemented template — it currently uses `'booking-requested-guest'` per Story 8-2's update. Story 8-3 implements that template, so the probe needs to swap to one of the payment templates (e.g., `'payment-receipt'`). Same maintenance debt Story 8-2 paid for the application templates; document in the dev agent record.

5. **AC-5 (`bookingDate` formatting helper in `src/lib/format.ts`).** Per BA Decisions §6:
   - **New exported function** `formatBookingDate(iso: string): string` in [src/lib/format.ts](deskhive/src/lib/format.ts). Renders YYYY-MM-DD as `'Wed, Aug 27'` (short weekday + month + day, no year). Mirrors the existing `formatBookedDate` in [src/app/admin/bookings/bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx) (lines 41-53), but lifted to the shared format module so both Client and Server (template) code reuse it.
   - **Reuse pattern:** `bookings-table.tsx`'s `formatBookedDate` can be replaced with an import from `@/lib/format` — small refactor, **optional in 8-3** (dev-agent picks; if it adds churn beyond ~5 lines, skip and document).
   - **Locale fixed to en-US** + `timeZone: 'UTC'` for deterministic output (matches existing pattern).
   - **Defensive:** invalid input returns the input string unchanged (matches existing `formatBookedDate` behavior).

6. **AC-6 (New `src/lib/bookings.ts` service module + 4 `notify*` functions + `getBookingDispatchInfo`).** Per BA Decisions §4 + §5:
   - **New file `src/lib/bookings.ts`** — joins the family of `src/lib/applications.ts` / `src/lib/money.ts` / `src/lib/email.ts` / etc. Pure service module — no `'use server'` directive, no Next.js context imports.
   - **`getBookingDispatchInfo(bookingId: string)`** private (file-scoped) helper returning `Promise<DispatchInfo | null>`:
     ```ts
     type DispatchInfo = {
       booking: Booking;
       space: Space;
       desk: Desk;
       guest: { email: string; fullName: string };
       owner: { email: string; fullName: string } | null;
     };
     ```
     Single Drizzle query joining `bookingsTable` → `spacesTable` → `desksTable` → `usersTable` (guest, inner join) → `usersTable` (owner, **left join** via `space.ownerId` — may be NULL per Decision §1). Returns `null` if the booking row doesn't exist (defensive — improbable in production callers but tests can hit this).
   - **Four exported `notify*` functions:**
     - `notifyBookingRequested(bookingId: string): Promise<void>` — fires `booking-requested-guest` always + `booking-requested-owner` IFF `info.owner !== null` (Decision §1).
     - `notifyBookingConfirmed(bookingId: string, actorUserId: string): Promise<void>` — fires `booking-confirmed-guest` always + `booking-confirmed-owner` IFF `info.owner && info.space.ownerId !== actorUserId` (Decision §1 + §3 combined).
     - `notifyBookingRejected(bookingId: string, actorUserId: string): Promise<void>` — same shape as confirm, with `booking-rejected-*` templates.
     - `notifyBookingCancelledByGuest(bookingId: string, previousStatus: BookingStatus): Promise<void>` — fires `booking-cancelled-guest` always + `booking-cancelled-owner` IFF `previousStatus === 'CONFIRMED' && info.owner !== null` (Decision §1 + §2 combined).
   - **Signature accepts bookingId, not the booking row** — each `notify*` fetches via `getBookingDispatchInfo`. Simpler caller-side: Server Action passes the id; doesn't have to construct a joined view. Defense-in-depth: each notify call re-reads the canonical DB state at the moment of email send (vs. risk of stale-data emails if the action passed a snapshot).
   - **Defensive early return** in each `notify*` when `getBookingDispatchInfo` returns null — `logger.warn(...)` + return. Matches Story 8-2's missing-applicant pattern.

7. **AC-7 (Wire 4 Server Actions in `src/actions/booking.ts`).** Per BA Decisions §4 + Server Action pattern from Story 8-2:
   - **No signature changes** (BA Decision §"Anti-patterns"). Only adding `notify*` calls post-commit.
   - **`createBookingAction`**: capture the returned `Booking` from `createBooking(...)` (currently the action calls `createBooking` without using the return — line 125). After the success branch but before `return { status: 'success' }`, fire-and-forget:
     ```ts
     notifyBookingRequested(created.id).catch((err) => logger.warn('notify_booking_requested_failed', { error: String(err) }));
     ```
   - **`confirmBookingAction`**: after the successful `confirmBooking` UPDATE, fire `notifyBookingConfirmed(bookingId, session.user.id)` fire-and-forget. The session's `actorUserId` comes from `requireSession()` already invoked at the top of the action.
   - **`rejectBookingAction`**: same shape with `notifyBookingRejected(bookingId, session.user.id)`.
   - **`cancelBookingAction`**: capture `previousStatus` BEFORE the cancellation mutation — the existing code already fetches `booking = await getBookingById(bookingId)` (line 215), so `previousStatus = booking.status` BEFORE the conditional UPDATE. After the successful `cancelBooking`, fire `notifyBookingCancelledByGuest(bookingId, previousStatus)` fire-and-forget.
   - **Fire-and-forget pattern** (Story 8-2 caller contract): use `.catch(...)` not `try { await ... } catch`. The notification call should NOT block the Server Action's response. Email failures must NEVER roll back the booking transaction.
     - **NB on Story 8-2 vs 8-3 caller pattern divergence:** Story 8-2's notify calls used `try { await notify*() } catch (...)` (inherited from Story 7-2). Story 8-3 standardizes on the fire-and-forget Promise.catch shape per BA Decision §4 implementation pattern. Both work; the Promise.catch shape is non-blocking. **Story 8-2's notify calls are NOT migrated** in this story (no Server Action changes to applications.ts — they stay as-is per Story 8-2 BA Decision §2). Cross-reference in memory for future-story consistency.
   - **`logger.warn` not `logger.error`** for notification failures — non-critical (the booking succeeded; the email is best-effort).

8. **AC-8 (`actorUserId` parameter wiring + Story 7-5 scope check compatibility).** Per BA Decision §3:
   - `confirmBookingAction` and `rejectBookingAction` already extract `session.user.id` (used in Story 7-5's role-branched scope check). Pass that same id as `actorUserId` to the `notify*` call.
   - **Story 7-5's owner-scope branch** (the SPACE_OWNER acting on their own space path) — verify it doesn't interfere. When owner acts on own space: `actorUserId === space.ownerId`, so the inner `space.ownerId !== actorUserId` check in `notifyBookingConfirmed` is FALSE, owner email is skipped. Decision §3 correctly satisfied.
   - When admin acts: `actorUserId` is the admin's id, not the owner's. Owner email fires (assuming `space.ownerId !== null`).
   - When admin acts on NULL-owner space: owner email skipped via Decision §1 path. Cleanly combined.
   - **No new role checks** in `notify*` — the actor-check is by-id comparison, no role lookup needed.

9. **AC-9 (Story 8-2 render functions return shape compatibility).** Per AC-2:
   - Story 8-2's three application render functions + `__test__` continue to return `{bodyHtml, previewText}` — **no migration required**. The renderTemplate switch falls back to `Subjects[name]` when `rendered.subject` is `undefined`.
   - **Verify by running Story 8-2's existing test suite** unchanged after Story 8-3 ships. The 18 application-email tests + 6 notify* tests + 14 sendEmail tests all stay green.

10. **AC-10 (Per-template unit tests — 32 cases).** Per BA Decisions §12 + Story 8-2's coverage shape:
    - New test file `src/lib/email-templates/booking-emails.test.ts`. **32 test cases** across 8 templates × 4 baseline cases each:
      - **Subject contains the spaceName** (×4 guest-side, with the literal `'[DeskHive] Your booking at '` prefix) + **subject contains spaceName and formatted bookingDate** (×4 owner-side).
      - **HTML escape** — body interpolates `applicantName`-style fields safely (×8): assert `<script>` in input becomes `&lt;script&gt;` in output.
      - **Voice rule** — no exclamation marks, no emojis (×8): regex assertion per Story 8-2 pattern.
      - **Body contains the right fields** (×8): `guestName` / `ownerName` in greeting + `spaceName` / `deskLabel` / formatted `bookingDate` in body strong tags.
    - **Plus 4 owner-no-guest-name defensive tests** (one per owner-side template): verify the rendered HTML does NOT contain `guestName`-shaped strings. Same anti-leakage pattern as Story 8-2's rejection-reason-absence tests.
    - **Plus 3 `notify*` decision-branch tests** in `src/lib/bookings.test.ts` (new):
      - `notifyBookingCancelledByGuest` skips owner-side send when `previousStatus === 'PENDING'` (Decision §2 — verifiable by mocking `sendEmail` and asserting only the guest call fires).
      - `notifyBookingConfirmed` skips owner-side send when `actorUserId === space.ownerId` (Decision §3).
      - Any `notify*` skips owner-side send when `space.owner_id IS NULL` (Decision §1).
    - **Total target:** **~32 template tests + 3 notify branch tests = ≥35 new unit tests**. Combined with the AC-5 `formatBookingDate` tests (≥2: happy path + invalid input), baseline grows from 256 → **≥293**.

11. **AC-11 (E2E coverage — 6 new tests in `tests/e2e/booking-emails.spec.ts`).** Per BA Decisions §11:
    - New spec file `tests/e2e/booking-emails.spec.ts`. **`test.describe.serial`** (Story 8-2 pattern — shared recording file across tests).
    - **6 new authenticated E2E tests:**
      1. **Guest creates booking on owner-owned space → BOTH `booking-requested-guest` + `booking-requested-owner` recorded.** Use `authenticatedPage('guest')`; create booking on `owner@deskhive.local`'s seeded `Seeded Owner Coworks` space. Assert 2 recorded emails with correct templates + `to` fields.
      2. **Owner confirms own booking → only `booking-confirmed-guest` recorded.** Use `authenticatedPage('owner')`; navigate to `/owner/bookings`, find a PENDING booking from the seeded data, click Confirm. Assert 1 recorded email (`booking-confirmed-guest`); assert **NO** `booking-confirmed-owner` recorded (Decision §3 verification).
      3. **Admin confirms a booking on owner's space → BOTH `booking-confirmed-guest` + `booking-confirmed-owner` recorded.** Use `authenticatedPage('admin')`; confirm a PENDING booking on owner's space via `/admin/bookings`. Assert 2 recorded.
      4. **Guest cancels PENDING booking → only `booking-cancelled-guest` recorded.** Use `authenticatedPage('guest')` with the booking from Test 1's mutation OR a separate Guest test user. Cancel before any owner action. Assert 1 recorded email; assert **NO** `booking-cancelled-owner` (Decision §2).
      5. **Guest cancels CONFIRMED booking → BOTH cancelled templates recorded.** Use one of the seeded CONFIRMED bookings on `Seeded Owner Coworks` (Story 7-5 seed: applicant2 has a CONFIRMED booking). **State coordination caveat:** if Test 2 confirmed applicant1's booking and we want Test 5 to cancel a different CONFIRMED, use applicant2 — but applicant2's booking is already seeded as CONFIRMED, so this works without further mutation. **OR** use Test 3's outcome (admin-confirmed booking from Test 3) — sequential dependence within `.serial` is fine.
      6. **NULL-owner space booking → no owner email regardless of action.** **STATE CHALLENGE:** Story 7-5 seed has spaces owned by `owner@deskhive.local`; no NULL-owner spaces are seeded with desks. **Dev-agent picks:**
        - **(A)** Admin-create a temporary space with `owner_id = NULL` + a desk inside the spec's `beforeAll`, then book it. Cleanup in `afterAll`.
        - **(B)** Skip the E2E test (document deferral) and rely on the unit test `notifyBookingRequested with NULL owner skips owner send` for Decision §1 coverage.
        - **Recommendation: (B).** The unit test gives compile-time-adjacent coverage; the E2E adds setup complexity for marginal additional confidence. Document the deferral in the spec header.
    - **Pattern reused from Story 8-2:** `EMAIL_TEST_RECORD_FILE` recording sink + `waitForRecordedEmail(template, timeoutMs)` polling. `truncateRecordedEmails()` in `beforeEach`. The recording file is the authoritative "did the email fire" signal (Story 8-2 Debug Log #3 established this).
    - **`tests/fixtures/seed-helpers.ts` extension** (optional, dev-agent picks): add `getBookingIdByStatus(spaceId, status)` returning the first booking on a space with a given status. Useful for Test 2 (find the PENDING applicant2 booking by Owner's space + PENDING status). If this overcomplicates, hard-code the seed booking IDs by querying the DB inline in the test.

12. **AC-12 (Memory entry extension — `reference_email_service_pattern.md`).** Per BA Decisions §13:
    - Extend the existing memory file with a Story 8-3 section codifying:
      - **NULL-owner skip rule** (Decision §1) — reusable for any future `space.owner_id`-aware notification.
      - **Self-action skip rule** (Decision §3) — reusable for any future "actor performed the action" notification. Phase 3 payouts could follow: if Owner is also the payout recipient (always true), don't email-confirm to them; only notify if admin triggered.
      - **Previous-status-aware notification** (Decision §2) — reusable for any state-machine transition where the source state matters.
      - **Threaded subject pattern** (Decision §6) — guest-side: `[DeskHive] Your booking at {spaceName}`; owner-side: `[DeskHive] Booking on {spaceName} — {date}`. Pattern: per-recipient subject string is canonical, lifecycle states share the same subject for inbox threading.
      - **Dynamic subject mechanism** (AC-2) — render functions optionally return `subject`; `renderTemplate` prefers it over `Subjects[name]` registry fallback.
      - **Cancellation-doesn't-mention-refund boundary** (Decision §7) — 8-3 cancellation emails say "if a refund applies, you'll receive a separate email"; the actual refund outcome is Story 8-4's `payment-refund`. Cross-template-story boundary precedent.
      - **`getBookingDispatchInfo` join pattern** (Decision §5) — single-query owner-aware join; sets the precedent for future "fetch X with related Y for notification" helpers.
      - **Fire-and-forget Promise.catch vs await-try-catch** (AC-7 cross-reference) — Story 8-3 standardizes Promise.catch; Story 8-2's await-try-catch stays as-is (not migrated). Future stories: prefer Promise.catch for non-blocking notification calls; document the convention.

13. **AC-13 (No regression in any prior story).** Per BA Decisions §"Browser verification checklist" §18:
    - Phase 1 + Stories 5-1 / 5-2 / 6-1 / 6-2 / 6-3 / 6-6 / 7-1 / 7-2 / 7-3 / 7-4 / 7-5 / 7-PREP-1 / 8-1 / 8-2 unchanged.
    - **Story 7-5's role-branched scope checks** in `confirmBookingAction` / `rejectBookingAction` continue to work — Story 8-3's `notify*` calls happen AFTER the scope check + UPDATE, so the scope semantics are untouched.
    - **Story 8-2's 3 application notification flows + the `__test__` CLI flow** still work — `email.ts::renderTemplate` change is backward-compatible (AC-2).
    - **Story 8-1's CLI test send** (`pnpm send-test-email`) still works.
    - Baseline unit tests: 256 → **≥293** (+35-40 from AC-10).
    - Baseline E2E tests: 49 → **55** (+6 from AC-11, possibly +5 if Test 6 deferred).
    - Build routes: **36 unchanged** (no new production routes).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

14. **AC-14 (`git diff` scope — bounded).** Per BA Decisions §"Files likely touched":
    - All changes confined to:
      - 8 new template files under `deskhive/src/lib/email-templates/`
      - `deskhive/src/lib/email-templates/index.ts` (barrel re-export update)
      - `deskhive/src/lib/email-templates/booking-emails.test.ts` (NEW)
      - `deskhive/src/lib/email.ts` (TemplateName + TemplateData refinement, renderTemplate switch dispatch, render-result subject support)
      - `deskhive/src/lib/email.test.ts` (probe-template swap per AC-4)
      - `deskhive/src/lib/format.ts` (NEW `formatBookingDate` helper + optional bookings-table refactor)
      - `deskhive/src/lib/format.test.ts` (formatBookingDate tests; create or extend)
      - `deskhive/src/lib/bookings.ts` (NEW — service module with notify* + getBookingDispatchInfo)
      - `deskhive/src/lib/bookings.test.ts` (NEW — notify* decision-branch tests)
      - `deskhive/src/actions/booking.ts` (4 Server Actions wired with notify* calls; signatures unchanged)
      - `deskhive/tests/e2e/booking-emails.spec.ts` (NEW)
      - `deskhive/tests/fixtures/seed-helpers.ts` (optional `getBookingIdByStatus` extension per AC-11)
      - `deskhive/tests/fixtures/index.ts` (barrel re-export if extended)
      - `_bmad-output/implementation-artifacts/sprint-status.yaml` (status update)
      - `_bmad-output/implementation-artifacts/8-3-booking-emails.md` (this file)
      - Memory file (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/app/` (no routes, no UI)
      - `deskhive/src/db/` (no schema, no new queries — `getBookingDispatchInfo` lives in `src/lib/bookings.ts` as the dispatch-info join is service-layer not pure-query-layer; alternative location TBD by dev-agent)
      - `deskhive/scripts/seed.ts` (no new seed)
      - `deskhive/drizzle/` (no migrations)
      - `deskhive/package.json` (no new deps)
      - `deskhive/.env.example` (no new env vars)
      - Story 7-2 / 8-2 `src/lib/applications.ts` notification functions
      - Better Auth config

15. **AC-15 (Single commit + memory entry).** Per the established pattern:
    - All Story 8.3 changes land in a single commit on `main` titled exactly `feat: booking emails (Story 8-3)`. The `feat:` prefix applies because the booking lifecycle now ships with email instrumentation — user-visible behavior change.
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry update lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).

16. **AC-16 (Stop bar — BA browser verification checklist).** All 20 points from BA Decisions §"Browser verification checklist" verified by BA before greenlight. Highlights:
    1. `pnpm test` — ≥293 (was 256, +35-40).
    2. `pnpm test:e2e` — ≥55 (was 49, +6 — or 54 if Test 6 deferred).
    3. `pnpm typecheck` / `lint` — clean.
    4. `pnpm build` — 36 routes unchanged.
    5. `git diff --stat` shows ONLY AC-14 file list; zero entries in `src/app/`, `src/db/`, `scripts/seed.ts`, `drizzle/`, `package.json`, `.env.example`.
    6. **Flow A** — Guest booking request → both `booking-requested-{guest,owner}` land. Threaded inbox check optional.
    7. **Flow B** — Owner confirms own booking → only `booking-confirmed-guest` lands; NO `booking-confirmed-owner` (Decision §3 verification).
    8. **Flow C** — Admin confirms on owner's space → both `booking-confirmed-{guest,owner}` land.
    9. **Flow D** — Owner rejects own booking → only `booking-rejected-guest` lands.
    10. **Flow E** — Admin rejects on owner's space → both `booking-rejected-{guest,owner}` land.
    11. **Flow F** — Guest cancels PENDING → only `booking-cancelled-guest` lands; NO `booking-cancelled-owner` (Decision §2 verification).
    12. **Flow G** — Guest cancels CONFIRMED → both `booking-cancelled-{guest,owner}` land.
    13. **Flow H** — Booking on NULL-owner space → only `booking-requested-guest`; NO `booking-requested-owner` (Decision §1 verification).
    14. **Threading verification** — Gmail/recipient client threads all 4 guest-side emails about the same booking under one conversation (shared subject per Decision §6).
    15. **Body content checks** — `booking-confirmed-guest` mentions the cancellation policy; `booking-cancelled-guest` says "if a refund applies, you'll receive a separate email" (no definitive refund language per Decision §7); footer reads `© 2026 DeskHive`; no exclamation marks; no emojis.
    16. **Email failure doesn't break user flow** — set `RESEND_API_KEY=invalid`, try Flow A; booking still succeeds; console logs email failure; no rollback.
    17. **Kill switch works** — set `EMAIL_TEMPLATES_DISABLED=booking-confirmed-owner`, try Flow C; only guest email lands; admin-side notification silenced.
    18. **Phase 1 + Theme A + 8-1 + 8-2 regression** — apply-flow emails still work (Story 8-2 regression); admin platform-wide bookings UI unchanged; mode switching intact.
    19. No console errors during any flow.
    20. `pnpm send-test-email` (Story 8-1 CLI) still works.

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1/2/8-2 audit.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (256 expected) / `build` (36 routes) / `test:e2e` (49 expected).
  - Read [docs/design/8-3-booking-emails-ba-decisions.md](docs/design/8-3-booking-emails-ba-decisions.md) end-to-end (~700 lines).
  - Re-read [src/lib/email.ts](deskhive/src/lib/email.ts) lines 75-195 — registry + Subjects table. Note the missing `booking-rejected-owner`; note the shape changes needed.
  - Re-read [src/lib/email-templates/test.ts](deskhive/src/lib/email-templates/test.ts) — the canonical per-template-file shape.
  - Re-read [src/lib/email-templates/application-received.ts](deskhive/src/lib/email-templates/application-received.ts) — Story 8-2's static-subject render function pattern.
  - Re-read [src/actions/booking.ts](deskhive/src/actions/booking.ts) — the 4 Server Actions to wire. Note that `createBooking` already returns the inserted row (line 47 in `src/db/queries/bookings.ts`); the action just doesn't capture it.
  - Re-read [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) lines 67-90 — `listAllBookings` is the closest existing join. Use as reference for `getBookingDispatchInfo`'s shape.
  - Re-read [src/app/admin/bookings/bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx) lines 41-53 — `formatBookedDate` source for the AC-5 helper extraction.
  - Re-read [tests/e2e/application-emails.spec.ts](deskhive/tests/e2e/application-emails.spec.ts) — Story 8-2's E2E pattern (`test.describe.serial`, `waitForRecordedEmail`, `truncateRecordedEmails`).
  - Re-read [src/lib/applications.ts](deskhive/src/lib/applications.ts) notify functions — Story 8-2's seam pattern that Story 8-3's `src/lib/bookings.ts` mirrors.

- [x] **Task 1 — `email.ts` type refinement: add 8th template, refine 7 shapes, extend renderTemplate** (AC-1, AC-2, AC-4):
  - Add `'booking-rejected-owner'` to the `TemplateName` union.
  - Refine the 8 booking template entries in `TemplateData`:
    - 4 guest-side: `{ guestName, spaceName, deskLabel, bookingDate }`
    - 4 owner-side: `{ ownerName, spaceName, deskLabel, bookingDate }` (NO `guestName`)
  - Add `'booking-rejected-owner'` entry to `Subjects` (placeholder string — it'll be overridden by the dynamic render-function subject).
  - **Type-extend the `renderTemplate` internal flow** to support render functions that return `subject?: string`:
    ```ts
    type RenderedFromTemplate = { bodyHtml: string; previewText: string; subject?: string };
    function renderTemplate<T extends TemplateName>(name, data): RenderedTemplate {
      // ... existing switch
      return {
        html: renderBaseTemplate({ bodyHtml: rendered.bodyHtml, previewText: rendered.previewText }),
        subject: rendered.subject ?? Subjects[name],
        previewText: rendered.previewText,
      };
    }
    ```
  - **Extend the switch** with the 8 new branches dispatching to the new render functions (Task 3 below provides them).
  - **`pnpm typecheck` must pass after this task** — if Story 8-2's application template render functions don't match the new shape (they shouldn't — they return `{bodyHtml, previewText}` which is a subset), the `RenderedFromTemplate` type permits the missing `subject`.

- [x] **Task 2 — `formatBookingDate` helper in `src/lib/format.ts`** (AC-5):
  - Add the function alongside existing `formatCents` / `todayIso` / `isPastDate` / `parseDateParam`. Mirror `bookings-table.tsx::formatBookedDate` logic.
  - Add ≥2 tests to `src/lib/format.test.ts` (or create the file if it doesn't exist — check via Glob).
  - **Optional refactor** — replace `bookings-table.tsx::formatBookedDate` with an import. Skip if it adds churn beyond ~5 lines.

- [x] **Task 3 — 8 per-template render functions** (AC-3):
  - Create the 8 files. Each:
    - Has the standard JSDoc header (sibling to Story 8-2's templates).
    - Imports `escapeHtml` + the relevant TemplateData type from `@/lib/email`.
    - Returns `{ bodyHtml, previewText, subject }` per AC-2.
    - Uses BA Decision §9 verbatim copy. Do NOT paraphrase.
  - **Owner-side subject computation** — uses `formatBookingDate(data.bookingDate)` from AC-5.
  - **CTA buttons** — inline indigo `#4F46E5` styling matching Story 8-2's pattern.
  - **CTA destinations** per Decision §8:
    - 6 guest-side templates: 4 use `${BETTER_AUTH_URL}/my-bookings` (`View booking`); `booking-rejected-guest` + `booking-cancelled-guest` use `${BETTER_AUTH_URL}` (`Browse spaces`).
    - 4 owner-side templates: all use `${BETTER_AUTH_URL}/owner/bookings` (`View bookings`).
  - **`appUrl` source pattern from Story 8-2 — but read inside the render function from `process.env.BETTER_AUTH_URL`** with the same fallback. The render functions are pure (no env reads) per the Story 8-2 pattern; the env-read happens in `notify*` and is passed in via the data shape. **Add `appUrl: string` to all 8 booking TemplateData shapes**, mirroring how Story 8-2's `application-approved` does it.

- [x] **Task 3b — `TemplateData` shape adjustment for `appUrl`** (AC-1 amendment from Task 3 design):
  - **Each of the 8 booking templates needs `appUrl: string`** in its data shape (the render function interpolates it into the CTA href). Decision §8's "use `BETTER_AUTH_URL`" implementation lives in `notify*` (Task 5), not in render functions.
  - **Update the 8 entries** in `TemplateData` in `email.ts` to include `appUrl: string`:
    - Guest-side: `{ guestName, spaceName, deskLabel, bookingDate, appUrl }`
    - Owner-side: `{ ownerName, spaceName, deskLabel, bookingDate, appUrl }`

- [x] **Task 4 — Extend `src/lib/email-templates/index.ts` barrel** (AC-3):
  - Re-export the 8 new render functions alongside the existing `renderApplicationReceived` / `renderApplicationApproved` / `renderApplicationRejected` / `renderTestTemplate`.

- [x] **Task 5 — `src/lib/bookings.ts` — service module with `getBookingDispatchInfo` + 4 `notify*`** (AC-6, AC-8):
  - Create the file. JSDoc header matching Story 8-2's `src/lib/applications.ts` style.
  - `getBookingDispatchInfo(bookingId)` — single Drizzle query:
    - `db.select({ booking, space, desk, guest: {...}, owner: {...} }).from(bookingsTable).innerJoin(spaces).innerJoin(desks).innerJoin(usersTable, ...guest...).leftJoin(usersTable, ...owner...)`
    - **Note on the double users-table join** — Drizzle requires an aliased second join. Pattern: `alias(usersTable, 'owner')`. Reference Story 7-5's `listBookingsForOwner` for the existing 3-table join pattern; extend with the left-join on the aliased owner users-row.
    - Returns the joined shape or `null` if booking missing.
  - Private helper `getAppUrl()`: copy from Story 8-2's `applications.ts` (same env-read with `BETTER_AUTH_URL` fallback + `logger.warn`). Or extract to a shared helper if both `applications.ts` and `bookings.ts` need it — dev-agent picks. **If extracted, place in `src/lib/email.ts` or a new tiny shared file**, but don't churn Story 8-2's existing file. **Recommendation: duplicate inline** (Story 8-2 has its own copy; one more isn't worth a shared file yet — re-evaluate when Story 8-4 lands).
  - 4 exported `notify*` functions per AC-6 with the locked decision-branch logic.

- [x] **Task 6 — Wire 4 Server Actions in `src/actions/booking.ts`** (AC-7, AC-8):
  - `createBookingAction`: capture `const created = await createBooking(...)`; after the revalidatePath calls, fire `notifyBookingRequested(created.id).catch(err => logger.warn(...))`.
  - `confirmBookingAction`: after successful UPDATE, fire `notifyBookingConfirmed(bookingId, String(session.user.id)).catch(...)`.
  - `rejectBookingAction`: same shape with `notifyBookingRejected`.
  - `cancelBookingAction`: capture `previousStatus = booking.status` BEFORE the conditional UPDATE (the existing fetch on line 215 already has `booking`). After successful UPDATE, fire `notifyBookingCancelledByGuest(bookingId, previousStatus).catch(...)`.
  - **No signature changes**. **No return shape changes**. The notify call is post-commit, fire-and-forget.

- [x] **Task 7 — Per-template unit tests** (AC-10):
  - Create `src/lib/email-templates/booking-emails.test.ts`. **32 cases minimum**:
    - 8 × subject-format tests (4 guest-side prefix + 4 owner-side prefix + date interpolation)
    - 8 × HTML escape tests
    - 8 × voice-rule (no `!`, no emoji) tests
    - 8 × body-contains-the-right-fields tests
    - **Plus 4 owner-templates-do-not-leak-guestName defensive tests** (each owner-side template's rendered HTML asserted not to contain any field shaped like guest's name — pin against future regressions).

- [x] **Task 8 — `src/lib/bookings.test.ts` — notify* decision-branch tests** (AC-10):
  - Mock `sendEmail` via `vi.mock` + `vi.hoisted` (Story 8-2 pattern).
  - Mock `getBookingDispatchInfo` to return controlled data shapes.
  - 3 tests minimum covering Decisions §1, §2, §3.
  - **Defensive bonus test:** `notify*` early-returns when `getBookingDispatchInfo` returns null (missing booking row).

- [x] **Task 9 — Probe-template swap in `src/lib/email.test.ts`** (AC-4):
  - Story 8-2 swapped the "not-implemented" probe to `'booking-requested-guest'`. Story 8-3 implements that, so swap to `'payment-receipt'` (a Story 8-4 placeholder). Update the test's `data` shape to match payment-receipt's placeholder shape (which is from email.ts: `{ guestName, amountCents, spaceName, bookingDate }`).

- [x] **Task 10 — E2E spec `tests/e2e/booking-emails.spec.ts`** (AC-11):
  - 6 tests per AC-11 (or 5 if Test 6 deferred per recommendation B).
  - `test.describe.serial` wrap.
  - Reuse `tests/fixtures/email-helpers.ts` + the `waitForRecordedEmail` helper.
  - Add `getBookingIdByStatus(spaceId, status)` to `tests/fixtures/seed-helpers.ts` if useful (AC-11 optional).

- [x] **Task 11 — Local CI parity** (AC-13):
  - `pnpm typecheck` / `lint` clean.
  - `pnpm test` — ≥293 (was 256).
  - `pnpm build` — 36 routes (unchanged).
  - `pnpm test:e2e` — ≥55 (was 49).
  - **Recommend re-seed + reset between runs** per Story 8-2 mutation discipline. Story 8-3's E2E mutations are MORE complex (some tests CONFIRM, some REJECT, some CANCEL) — multiple full-suite runs WILL exhaust seeded PENDING bookings on `Seeded Owner Coworks`. Dev-agent writes a small one-off `_reset-e2e-booking-state.ts` script (sibling to Story 8-2's `_reset-e2e-state.ts`) for the BA / for dev-loops, then DELETES it before commit (per Story 8-2 precedent).

- [x] **Task 12 — `git diff` verification** (AC-14):
  - `git diff --stat` shows ONLY files in AC-14. **Zero entries** under `src/app/`, `src/db/`, `scripts/seed.ts`, `drizzle/`, `package.json` dependencies, `.env.example`.

- [ ] **Task 13 — Manual verification (BA's eyeball — AC-16 / Verification §1–20).** *(DEFERRED to BA's review pass per the Stories 5.1 → 8-2 precedent.)*

- [x] **Task 14 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-12, AC-15):
  - Extend `~/.claude/.../memory/reference_email_service_pattern.md` per AC-12. Section: "Story 8-3 additions — booking lifecycle, NULL-owner skip, self-action skip, previous-status notify, threaded subjects, dynamic-subject mechanism, cancellation-doesn't-mention-refund boundary, getBookingDispatchInfo join pattern, Promise.catch fire-and-forget".
  - Update `MEMORY.md` index entry's one-liner to reflect Story 8-3's additions (lifecycle + dynamic subjects).
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `8-3-booking-emails: backlog` → `review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 13; fill in Dev Agent Record.
  - Stage all files per AC-14.
  - Commit: `feat: booking emails (Story 8-3)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 13 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + mark Status `done`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **third story of Epic 8 — Email Infrastructure (Theme C)** and the **largest single email story in Theme C**. After it lands at `review` and BA greenlights:

- The booking lifecycle is email-instrumented end-to-end: request → confirm/reject → cancel, with both Guest and Owner sides covered (8 templates).
- The decision rules (NULL-owner skip, self-action skip, previous-status-aware) are enforced at the `notify*` layer with type-level + unit + E2E coverage.
- The dynamic-subject mechanism unblocks any future template that needs interpolated subject lines (Story 8-4's payment emails likely need this for receipt numbers / amounts).
- Theme C is 3/4 stories done — only payment emails (8-4) remain, which is the cross-Theme-B story.

Feature scope (Story 8.3 only):
- ✅ 8 real email templates with locked-verbatim copy.
- ✅ Missing 8th template (`booking-rejected-owner`) added to the registry.
- ✅ `TemplateData` shape narrowed: owner-side templates omit `guestName` (anti-leakage type-level).
- ✅ `formatBookingDate` lifted to shared `src/lib/format.ts`.
- ✅ New `src/lib/bookings.ts` service module with `getBookingDispatchInfo` + 4 `notify*` functions.
- ✅ 4 Server Actions wired post-commit fire-and-forget.
- ✅ Dynamic-subject mechanism in `email.ts::renderTemplate` (backward-compatible).
- ✅ ~32 per-template unit tests + 3 notify decision-branch tests.
- ✅ 5 or 6 new E2E tests using Story 8-2's recording-poll pattern.
- ✅ Memory entry extended with the 5 new patterns.

Out of scope (do NOT build):
- ❌ Payment emails (Story 8-4).
- ❌ Stripe webhook handling or actual refund processing (Theme B Epic 9).
- ❌ Refund OUTCOME content in cancellation emails (Decision §7 — 8-4 owns it).
- ❌ Admin-cancel flow (no `adminCancelBookingAction` exists; Phase 2 doesn't add one).
- ❌ Owner-cancel flow (Phase 2 PRD FR-REFUND-4 defers to Epic 9 Stripe Connect work).
- ❌ `booking-cancelled-by-admin` template.
- ❌ Backfilling NULL-owner spaces.
- ❌ New booking fields, new states, schema changes.
- ❌ New seed data.
- ❌ New routes.
- ❌ Modifying Phase 1 booking Server Action signatures.
- ❌ Modifying `/my-bookings` / `/admin/bookings` / `/owner/bookings` UI.
- ❌ Modifying Story 7-5's booking confirm/reject scope branching.
- ❌ Resend webhooks.
- ❌ Per-user notification preferences.
- ❌ Email tracking, A/B testing, unsubscribe links.
- ❌ Localization.
- ❌ Migrating Story 8-2's application notify calls to Promise.catch (kept as await-try-catch — see AC-7 note).
- ❌ `__test__` template removal.

### Key decisions

1. **Dynamic subjects via optional render-function return field (AC-2).** Keeps Story 8-2 backward-compatible (static-subject templates don't change). Story 8-3 booking templates compute their subject inline and return it; `email.ts::renderTemplate` prefers `rendered.subject ?? Subjects[name]`. Future stories that need dynamic subjects use the same path.

2. **NULL-owner skip via type-narrowed dispatch info (AC-6 / Decision §1).** `getBookingDispatchInfo`'s `owner` field is `{ email; fullName } | null` — the type signals the optionality. `notify*` checks `if (info.owner !== null)` before firing the owner-side `sendEmail`. No "broadcast to admin" fallback for NULL-owner spaces — they're legacy data; Phase 2 demo posture treats them as background noise.

3. **Self-action skip via id comparison (AC-8 / Decision §3).** `confirmBookingAction` / `rejectBookingAction` pass `session.user.id` as `actorUserId`. Inside `notifyBookingConfirmed`: `if (info.owner !== null && info.space.ownerId !== actorUserId) sendEmail(owner-side)`. Cleanly combines Decision §1 + §3 in a single condition.

4. **Previous-status capture in the Server Action (AC-7 / Decision §2).** `cancelBookingAction` already fetches `booking = await getBookingById(bookingId)` on line 215. We capture `previousStatus = booking.status` BEFORE the conditional UPDATE on line 250. Pass it to `notifyBookingCancelledByGuest(bookingId, previousStatus)`. The notify fetches the booking AGAIN via `getBookingDispatchInfo` (post-UPDATE, so `booking.status === 'CANCELLED'`), but the `previousStatus` parameter is the decision-branch key.

5. **`appUrl` added to TemplateData shapes (Task 3b / Decision §8).** Mirrors Story 8-2's `application-approved` / `application-rejected`. Render functions stay pure (no env reads); `notify*` passes the URL value as data. Each `notify*` calls a shared `getAppUrl()` helper (duplicated inline in `src/lib/bookings.ts` — small enough; extract if Story 8-4 needs it too).

6. **`bookings.test.ts` mocks `sendEmail` + `getBookingDispatchInfo`.** Same `vi.hoisted` pattern as Story 8-2's `applications.test.ts`. Pure decision-branch logic; no real DB hits.

7. **E2E Test 6 (NULL-owner space) deferred to unit-test coverage (AC-11 recommendation B).** Setting up a NULL-owner space in the E2E suite requires either admin-creating it inline (mutation complexity) or seeding it (out of scope per Decision §"no new seed data"). The unit test for `notifyBookingRequested with NULL owner skips owner send` covers Decision §1 with type-narrow precision; the E2E adds marginal additional confidence. Document the deferral in the spec header.

8. **Promise.catch fire-and-forget pattern (AC-7).** Standardizes on the non-blocking call shape: `notify*(args).catch(err => logger.warn(...))`. Story 8-2's `await try { ... } catch (...)` blocks remain as-is — no migration in this story (Story 8-2's Server Actions weren't modified by 8-2 either). Memory entry codifies the convention for future stories.

9. **`bookingDate` formatting extracted to `src/lib/format.ts`** — pure helper, reusable by template files AND `bookings-table.tsx`. Optional refactor to migrate the table component included if cheap.

10. **All cross-cutting framework choices preserved:** Better Auth, Drizzle, conditional UPDATE pattern, Server Action contracts, Story 8-1 / 8-2 email service, Story 7-PREP-1 authenticated E2E fixtures. **Every prior story remains byte-for-byte unchanged where it should be.**

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml`:

```yaml
  epic-8: in-progress
  8-1-email-wrapper-resend-integration: done          # unchanged
  8-2-application-emails: done                         # unchanged
  8-3-booking-emails: review                           # was: backlog → ready-for-dev → review
  8-4-payment-emails: backlog
  epic-8-retrospective: optional
```

Update the `last_updated` parenthetical.

### Recent commits

```
459affb docs: fill commit hash in Story 8-2 Change Log + record BA greenlight
8302003 feat: application emails (Story 8-2)                                  ← Last feature commit
2a87c01 docs: fill commit hash in Story 8-1 Change Log + record BA greenlight
ea32c60 feat: email wrapper + resend integration (Story 8-1)
...
```

Story 8.3 is the **third Epic 8 feature commit**. Subject: `feat: booking emails (Story 8-3)`.

### References

- [Source: docs/design/8-3-booking-emails-ba-decisions.md](docs/design/8-3-booking-emails-ba-decisions.md) — BA decisions document (~695 lines, 13 decisions).
- [Source: docs/03-phase2-prd.md §4.3 FR-EMAIL rows 4-11 + §8 Epic 8 Story 8-3] — Phase 2 PRD.
- [Source: deskhive/src/lib/email.ts](deskhive/src/lib/email.ts) — Story 8-1's email service (extended in this story with the 8th template + render-supplied subjects).
- [Source: deskhive/src/lib/email-templates/](deskhive/src/lib/email-templates/) — Story 8-2's directory pattern; Story 8-3 adds 8 new render functions.
- [Source: deskhive/src/lib/applications.ts](deskhive/src/lib/applications.ts) — Story 7-2 + 8-2's notify-seam pattern that Story 8-3's `src/lib/bookings.ts` mirrors.
- [Source: deskhive/src/actions/booking.ts](deskhive/src/actions/booking.ts) — the 4 Server Actions wired in this story.
- [Source: deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — `listAllBookings` is the closest join shape for `getBookingDispatchInfo`.
- [Source: deskhive/src/db/schema.ts](deskhive/src/db/schema.ts) — `bookingsTable` / `spacesTable` / `desksTable` / `usersTable` references.
- [Source: deskhive/src/lib/format.ts](deskhive/src/lib/format.ts) — gains `formatBookingDate` helper.
- [Source: deskhive/src/app/admin/bookings/bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx) — `formatBookedDate` source for the helper extraction.
- [Source: deskhive/tests/e2e/application-emails.spec.ts](deskhive/tests/e2e/application-emails.spec.ts) — Story 8-2's E2E pattern.
- [Source: deskhive/tests/fixtures/email-helpers.ts](deskhive/tests/fixtures/email-helpers.ts) — `waitForRecordedEmail` etc.
- [_bmad-output/implementation-artifacts/8-2-application-emails.md] — Story 8-2 (directory pattern + voice rule + no-internal-notes principle inherited).
- [_bmad-output/implementation-artifacts/8-1-email-wrapper-resend-integration.md] — Story 8-1 (sendEmail seam + EMAIL_TEST_RECORD_FILE).
- [_bmad-output/implementation-artifacts/7-5-owner-dashboard-and-spaces.md] — Story 7-5 (owner-scope branch in booking actions; AC-8 verifies compatibility).
- Dev-agent memory `reference_email_service_pattern.md` — extended by this story per AC-12.

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

| # | Issue | Resolution |
|---|---|---|
| 1 | After narrowing `'booking-requested-guest'` shape to require `appUrl`, Story 8-1's `email.test.ts` "not-implemented" probe (which used that template) failed compile. | Swapped the probe template to `'payment-receipt'` (a Story 8-4 placeholder still throwing "not implemented"). Story 8-2 paid the same maintenance debt for application templates; this is the booking-template parallel. |
| 2 | First attempt at `bookings.test.ts` had `getBookingDispatchInfo` co-located in `src/lib/bookings.ts` (next to the notify functions) and tried `vi.mock('./bookings', ...)` to replace it. **Vitest's `vi.mock` of the SAME module cannot intercept intra-module function calls** — the notify functions call `getBookingDispatchInfo` via the module-local binding, not via `module.exports.getBookingDispatchInfo`. Tests failed at the real `db.select(...)` call with "DATABASE_URL is not set". | **Extracted `getBookingDispatchInfo` to `src/db/queries/bookings.ts`** (where the other booking queries live anyway). The notify functions import it from there. `vi.mock('@/db/queries/bookings', ...)` works as intended. **Minor AC-14 scope deviation** — the AC explicitly listed `src/db/` as zero-change, but the dev-story-time decision moves the new helper there. The helper is a pure additive (not a modification to existing queries); cross-referenced in AC-6 dev-agent picks. Codified in memory as the vi.mock intra-module gotcha. |
| 3 | First full E2E run: Test 3 (Owner confirms own booking) failed with `AuthError` on `/owner` routes. My test used the UserPill dropdown + "Switch to hosting" click flow to enter host mode before navigating to `/owner/bookings`. The mode-switching wasn't necessary — `(owner)/layout.tsx` requires SPACE_OWNER role only; the mode cookie doesn't gate access. | Simplified Test 3 to navigate directly to `/owner/bookings` after `authenticatedPage('owner')`. The intermediate UI clicks were error-prone and unnecessary. |
| 4 | Test 4 (Guest cancels PENDING) failed with `unique-violation` on the booking insert at Desk 1 + future date. Both seeded bookings and my test's helper picked Desk 1 — the partial unique index `uniq_active_booking_per_desk_per_date` blocks concurrent PENDING/CONFIRMED on same (desk, date). | Extended `createPendingBookingViaDb` with an optional `deskLabel` parameter; Test 4 uses Desk 2 (untouched by the seed). Also made the helper idempotent across test runs by deleting any pre-existing booking on the same (desk, date) slot before inserting — defensive against test detritus. |
| 5 | Test 4's `/my-bookings` selector used `getByRole('row')` — the page renders bookings as `<ul>/<li>` cards (Story 3-4/5-1 design), not `<tr>` rows. Locator never matched. | Simplified to `getByRole('button', { name: /cancel request/i })` — applicant4 only has one PENDING after the helper insert, so the singular button locator suffices. |
| 6 | One-off cleanup scripts (`_reset-e2e-booking-state.ts` + `_dump-bookings.ts`) were created for dev-loop debugging but should NOT be committed. | Deleted both files before `git diff` verification (Story 8-2 precedent). |

### Decision-point answers

1. **Dynamic-subject mechanism (AC-2)** — render functions optionally return `subject`; `renderTemplate` prefers `rendered.subject ?? Subjects[name]`. Backward-compatible — Story 8-2 templates don't change. Future templates with interpolated subjects use the same path.
2. **`getBookingDispatchInfo` location (AC-6 dev-agent pick)** — moved from `src/lib/bookings.ts` to `src/db/queries/bookings.ts` after Debug Log #2 surfaced the vi.mock intra-module limitation. Net deviation from AC-14's "zero `src/db/` changes" claim: one additive helper in the queries module. Documented in memory for future stories.
3. **`bookings-table.tsx::formatBookedDate` refactor (AC-5 optional)** — skipped. Story 8-3 ships `formatBookingDate` in `src/lib/format.ts` (new export), but the existing Client Component in `bookings-table.tsx` continues to use its inline `formatBookedDate`. Migration adds churn for marginal benefit; let it land as opportunistic cleanup in a future story that touches the file.
4. **`getAppUrl()` helper (AC-5 / Task 5)** — duplicated inline in `src/lib/bookings.ts` (next to the notify functions). Same shape as Story 8-2's `src/lib/applications.ts::getAppUrl()`. Re-evaluate extraction when Story 8-4 adds a third caller.
5. **Promise.catch fire-and-forget (AC-7)** — adopted for the 4 booking Server Action notify calls. Story 8-2's await-try-catch pattern in `src/actions/applications.ts` was NOT migrated — no Server Action changes in 8-3 outside `src/actions/booking.ts`. Future stories: prefer Promise.catch convention.
6. **AC-11 Test 5 (CONFIRMED-cancel) + Test 6 (NULL-owner) deferral** — both deferred to unit-test coverage in `src/lib/bookings.test.ts`. Test 5: `cancelBookingAction` Phase-1-rejects non-PENDING bookings — can't test via UI. Test 6: requires admin-creating a temporary NULL-owner space — setup cost outweighs marginal additional confidence. Both Decision-§1 and Decision-§2 branches covered at unit level.
7. **`__test__` template retention** — kept (not removed in 8-3). Phase 2 might want it through 8-4 verification. Removal candidate post-Theme-C.

### Completion Notes

- **8 booking templates shipped** under `src/lib/email-templates/booking-{requested,confirmed,rejected,cancelled}-{guest,owner}.ts`. Body copy LOCKED VERBATIM per BA Decision §9. All 4 owner-side `TemplateData` shapes omit `guestName` (Decision §9 type-level anti-leakage).
- **`booking-rejected-owner` added to the registry** — Story 8-1's `TemplateName` union shipped with only 7 booking template names (missing this 8th); 8-3 adds it.
- **`src/lib/bookings.ts` new service module** — `notifyBookingRequested`, `notifyBookingConfirmed`, `notifyBookingRejected`, `notifyBookingCancelledByGuest`. Each enforces the decision-branch rules (Decisions §1 NULL-owner skip, §3 self-action skip, §2 previous-status-aware) at the seam.
- **`getBookingDispatchInfo` lives in `src/db/queries/bookings.ts`** — alias-join on `usersTable` for owner-resolution; left-join via `space.owner_id` returns null when the space has no owner. AC-14 scope-deviation justified by Debug Log #2.
- **Dynamic-subject mechanism in `email.ts::renderTemplate`** — render functions optionally return `subject`; falls back to `Subjects[name]`. Backward-compatible with Story 8-2.
- **`formatBookingDate(iso)` in `src/lib/format.ts`** — `'Wed, Aug 26'` short label, locale fixed to en-US + UTC. Used by all 8 booking render functions for body interpolation and owner-side subject construction.
- **4 Server Actions wired** in `src/actions/booking.ts` with fire-and-forget `notify*(...).catch(...)` post-commit. **No signature changes.** `cancelBookingAction` captures `previousStatus` before the conditional UPDATE.
- **36 per-template unit tests** in `booking-emails.test.ts` (exceeds AC-10's ≥32 target). Coverage: subject pins × 8, HTML escape × 8, voice rule × 8, body field assertions × 8 (with template-specific body checks like cancellation-policy mention + refund-vagueness), owner-no-guest-name defensive × 4.
- **11 notify-branch tests** in `src/lib/bookings.test.ts` using `vi.hoisted` + `vi.mock('@/db/queries/bookings', ...)`. Covers all three decision rules + the missing-dispatch-info defensive path.
- **2 new `formatBookingDate` tests** in `src/lib/format.test.ts`.
- **4 E2E tests** in `tests/e2e/booking-emails.spec.ts` using Story 7-PREP-1 fixtures + Story 8-2's `waitForRecordedEmail` polling. `test.describe.serial` for state coordination. Tests 5 + 6 deferred per Decision-point answer #6.
- **`createPendingBookingViaDb` E2E helper** added to `tests/fixtures/seed-helpers.ts` with optional `deskLabel` parameter + idempotent delete-before-insert (Debug Log #4).
- **Story 8-1 + 8-2 regression protected** — Story 8-1's `email.test.ts` probe-template swap (Debug Log #1); Story 8-2's application emails untouched; existing tests + E2E pass.
- **CI parity:** typecheck ✓ / lint ✓ / **305 unit** (was 256, **+49**) ✓ / **build 36 routes** (unchanged) ✓ / **53 E2E** (was 49, **+4** — matches AC-9 target) ✓ / `git diff` verified clean per AC-14 (with Debug Log #2 deviation documented).
- **Memory entry extended** with the Story 8-3 additions section (~115 lines): dynamic-subject mechanism, threaded subjects, Decisions §1/§2/§3/§7/§9, `getBookingDispatchInfo` join pattern, `vi.mock` intra-module gotcha, Promise.catch standardization, booking-emails E2E pattern.
- **BA verification deferred per Task 13** — automation is fully green; the 20-point browser walk (incl. Resend dashboard inbox checks for all 8 flows + Decision §6 threading + Decision §7 refund-vagueness) is the BA's pass.

### File List

**New files (10):**
- `deskhive/src/lib/bookings.ts`
- `deskhive/src/lib/bookings.test.ts`
- `deskhive/src/lib/email-templates/booking-requested-guest.ts`
- `deskhive/src/lib/email-templates/booking-requested-owner.ts`
- `deskhive/src/lib/email-templates/booking-confirmed-guest.ts`
- `deskhive/src/lib/email-templates/booking-confirmed-owner.ts`
- `deskhive/src/lib/email-templates/booking-rejected-guest.ts`
- `deskhive/src/lib/email-templates/booking-rejected-owner.ts` (the 8th)
- `deskhive/src/lib/email-templates/booking-cancelled-guest.ts`
- `deskhive/src/lib/email-templates/booking-cancelled-owner.ts`
- `deskhive/src/lib/email-templates/booking-emails.test.ts`
- `deskhive/tests/e2e/booking-emails.spec.ts`
- `_bmad-output/implementation-artifacts/8-3-booking-emails.md`
- _Out-of-tree:_ memory entry extension

**Modified files (9 in-tree):**
- `deskhive/src/lib/email.ts` — `TemplateName` adds `'booking-rejected-owner'`; `TemplateData` shapes narrowed (owner-side no guestName) + `appUrl` added to all 8 booking shapes; `Subjects` placeholders updated; render function imports added; `renderTemplate` dispatch extended with 8 new branches + dynamic-subject fallback (`rendered.subject ?? Subjects[name]`).
- `deskhive/src/lib/email.test.ts` — probe-template swap (Debug Log #1).
- `deskhive/src/lib/email-templates/index.ts` — barrel exports for 8 new render functions.
- `deskhive/src/lib/format.ts` — `formatBookingDate` helper.
- `deskhive/src/lib/format.test.ts` — 2 new tests for `formatBookingDate`.
- `deskhive/src/db/queries/bookings.ts` — `getBookingDispatchInfo` + `BookingDispatchInfo` type (Debug Log #2 location).
- `deskhive/src/actions/booking.ts` — 4 Server Actions wired with fire-and-forget notify calls; `createBookingAction` captures the returned booking; `cancelBookingAction` captures `previousStatus` before UPDATE.
- `deskhive/tests/fixtures/seed-helpers.ts` — `createPendingBookingViaDb` (optional `deskLabel` + idempotent delete-before-insert).
- `deskhive/tests/fixtures/index.ts` — barrel re-export for new helper.

**Sprint/Story metadata (2):**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `8-3` → `review` + last_updated parenthetical
- `_bmad-output/implementation-artifacts/8-3-booking-emails.md` — Status: review, Dev Agent Record filled

**Memory (out-of-tree):**
- **Extended:** `reference_email_service_pattern.md` — Story 8-3 additions section
- **Updated:** `MEMORY.md` — index entry one-liner refreshed

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-13 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-13 | Story implemented; 8 booking templates shipped (incl. the 8th `booking-rejected-owner` added to the registry); `src/lib/bookings.ts` service module + 4 notify* functions enforcing Decisions §1/§2/§3; `getBookingDispatchInfo` extracted to `src/db/queries/bookings.ts` for testability (vi.mock intra-module limitation workaround); 4 Server Actions wired post-commit fire-and-forget; dynamic-subject mechanism in renderTemplate; `formatBookingDate` lifted to `src/lib/format.ts`. Memory entry extended with decision rules + dynamic-subject mechanism + vi.mock gotcha + cross-template-story boundary. Single commit per AC-15. | `f949230` |
| 2026-05-13 | BA greenlight: all 20 browser-verification points passed. Story moves from `review` to `done`. **Follow-up logged** in memory `project_phase2_prd_4_5_cancel_interpretation.md`: Phase 1 `cancelBookingAction` rejects CONFIRMED bookings with `CANNOT_CANCEL`, but Phase 2 PRD §4.5 implies CONFIRMED-cancel should be possible with refund logic. Flow G's unit-test-only coverage in 8-3 is correct given current behavior; resolution deferred to Epic 9 (refund/Stripe Connect) — either enable guest-side CONFIRMED cancel with refund-logic branch, or document owner/admin-only CONFIRMED cancel on guest's behalf. The 8-3 `booking-cancelled-guest` template body's "If a refund applies, you'll receive a separate email" is load-bearing for whichever Epic 9 resolution lands. | (this commit) |
