# Story 8-3: Booking Emails — BA Decisions

**Story:** 8-3
**Epic:** 8 — Email Infrastructure (Theme C)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Wednesday, May 13, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §4.3 (FR-EMAIL rows 4-11) and §8 Epic 8, Story 8-3

---

## Context

Story 8-2 wired application emails to the 3 Server Actions in `src/lib/applications.ts`, replacing the notification stubs from Story 7-2. The pattern is now well-codified:

- One file per template in `src/lib/email-templates/<name>.ts`
- `renderBaseTemplate({ bodyHtml, previewText })` wrapping shared layout
- `escapeHtml` for user-supplied interpolation
- `EMAIL_TEST_RECORD_FILE` + `waitForRecordedEmail` for E2E verification
- `notify*` seam functions in service modules, called fire-and-forget from Server Actions
- Transactional voice: no exclamation marks, no emojis
- No-internal-notes-in-user-emails principle (triple-layer defense: type system + unit + E2E)
- `BETTER_AUTH_URL` for CTA links

This story applies that pattern at scale: **8 booking email templates** across 4 booking-state transitions (requested, confirmed, rejected, cancelled) × 2 recipient variants (guest, owner). Phase 1's existing booking Server Actions (`createBookingAction`, `confirmBookingAction`, `rejectBookingAction`, `cancelBookingAction`) get email-instrumented via new `notify*` functions in `src/lib/bookings.ts` (or wherever Phase 1 located the booking service module).

**Bob's diagnostic during dispatch surfaced 6 BA-level decisions** (NULL-owner recipient, cancellation actor scope, subject collision, owner lookup, wiring location, CTA strategy). All locked in this doc — see Decisions §1 through §8.

**Designer status:** Makhbuba's Phase 2 designs may arrive within 24-48 hours. 8-3 ships with the current base template (from 8-1) and the voice rules from 8-2. If her designs propose specific email styling, the single seam to update is `renderBaseTemplate` — 8-3's 8 templates inherit any changes automatically without re-shipping this story.

---

## Scope

**In scope:**

- Eight real HTML email templates, replacing 8 placeholder entries in Story 8-1's template registry:
  - `booking-requested-guest` → guest who just submitted booking request (status=PENDING)
  - `booking-requested-owner` → space owner when a guest requests their space (status=PENDING)
  - `booking-confirmed-guest` → guest when owner/admin confirms (status=PENDING→CONFIRMED)
  - `booking-confirmed-owner` → space owner when admin confirms on their behalf (Phase 1 path); fired only if owner ≠ confirming actor (Decision §6)
  - `booking-rejected-guest` → guest when owner/admin rejects (status=PENDING→REJECTED)
  - `booking-rejected-owner` → owner when admin rejects on their behalf; fired only if owner ≠ rejecting actor (Decision §6)
  - `booking-cancelled-guest` → guest who just cancelled their own booking
  - `booking-cancelled-owner` → owner when guest cancels a CONFIRMED booking (Decision §2)
- Six new `notify*` functions in `src/lib/bookings.ts` (or equivalent Phase 1 service module):
  - `notifyBookingRequested(booking)` — fires BOTH guest + owner emails internally
  - `notifyBookingConfirmed(booking, actorUserId)` — fires guest email always; owner email only if owner ≠ actor (Decision §6)
  - `notifyBookingRejected(booking, actorUserId)` — fires guest email always; owner email only if owner ≠ actor (Decision §6)
  - `notifyBookingCancelledByGuest(booking)` — fires guest email always; owner email only if previous status was CONFIRMED (Decision §3) and owner_id is not NULL (Decision §1)
- Wire the 4 Server Actions (`createBookingAction`, `confirmBookingAction`, `rejectBookingAction`, `cancelBookingAction`) to call the relevant `notify*` function post-commit (after the DB mutation succeeds, never before)
- Each email wrapped via `renderBaseTemplate({ bodyHtml, previewText })`
- Authenticated E2E tests using 7-PREP-1 fixtures — verify each booking-state transition fires the right templates with the right recipients (mock via `EMAIL_TEST_RECORD_FILE` per 8-2's pattern)
- Unit tests per template (subject + body render correctness, escaping, voice rules, no-internal-notes assertions)
- New owner-recipient lookup helper (Decision §5)
- Memory entry updating the email service pattern with the booking-specific conventions

**Out of scope:**

- Payment emails (Story 8-4)
- Stripe webhook handling or actual refund processing (Theme B)
- Refund OUTCOME content in cancellation emails (Decision §7 — Story 8-4 owns refund email)
- Admin-cancel flow (no `adminCancelBookingAction` exists today; Phase 2 doesn't add one)
- Owner-cancel flow (Phase 2 PRD FR-REFUND-4 notes "Space Owners can always refund a confirmed booking unilaterally" but explicitly defers UI/flow to Stripe Connect work in Epic 9)
- A `booking-cancelled-by-admin` template (no admin-cancel path exists)
- Backfilling NULL-owner spaces (Decision §1 — left as-is)
- New booking fields, new states, schema changes
- New seed data (existing seed has enough variety: PENDING / CONFIRMED / REJECTED bookings on owner@deskhive.local's space from 7-5 Decision §10)
- New routes
- Modifying Phase 1 booking Server Action signatures
- Modifying Phase 1 `/my-bookings` or `/admin/bookings` or `/owner/bookings` UI
- Modifying Story 7-5's booking confirm/reject scope branching
- Resend webhooks (Phase 3 candidate)
- Per-user notification preferences (Phase 3)
- Email tracking, A/B testing, unsubscribe links
- Localization

---

## Decisions

### Decision 1: NULL-owner spaces — skip owner email entirely

Phase 1 admin-owned spaces have `space.owner_id IS NULL`. Story 7-5 left these in place (Decision §10 backfilled only `owner@deskhive.local`'s seeded space).

**Decision:** if `booking.space.owner_id IS NULL`, skip the owner-side email send. Guest still gets all their guest-side emails.

**Implementation pattern:**

```typescript
// Inside notifyBookingRequested(booking)
if (booking.space.owner_id) {
  const owner = await db.query.users.findFirst({ where: eq(users.id, booking.space.owner_id) })
  if (owner) {
    sendEmail({ to: owner.email, template: 'booking-requested-owner', data: {...} })
  }
}
// Guest send fires regardless
sendEmail({ to: guest.email, template: 'booking-requested-guest', data: {...} })
```

**Reasoning:**
- NULL-owner spaces are legacy data — no real-world "owner" exists to notify
- Phase 2 demo focuses on owner-owned spaces; legacy data is background
- Broadcasting to SUPER_ADMINs would be inbox spam on legacy data
- Backfilling is more work for marginal benefit (it's a data artifact, not a code concern)

### Decision 2: Owner email on guest-initiated cancellation — only for CONFIRMED bookings

When a guest cancels their own booking via `cancelBookingAction`:

- **PENDING cancellation:** No owner email. The desk was never promised; this is window-shopping behavior.
- **CONFIRMED cancellation:** Owner gets `booking-cancelled-owner`. The desk was promised; owner planned around it; deserves notification.

**Implementation pattern:**

```typescript
// Inside notifyBookingCancelledByGuest(booking, previousStatus)
sendEmail({ to: guest.email, template: 'booking-cancelled-guest', data: {...} })  // always

if (previousStatus === 'CONFIRMED' && booking.space.owner_id) {
  const owner = await db.query.users.findFirst(...)
  if (owner) {
    sendEmail({ to: owner.email, template: 'booking-cancelled-owner', data: {...} })
  }
}
```

`previousStatus` is captured BEFORE the cancellation mutation in the Server Action — the booking row's `status` will already be CANCELLED by the time `notify*` runs.

**Reasoning:**
- Mirrors Phase 2 PRD §4.5's refund logic (refunds only apply to CONFIRMED bookings)
- PENDING cancellations are noise, CONFIRMED cancellations are signal
- Owner inbox stays clean of meaningless events

### Decision 3: Confirmed/Rejected emails — fired by who, sent to whom

In Phase 1, both Owner and Super Admin can call `confirmBookingAction` / `rejectBookingAction`. After Story 7-5, Owner is scoped to their own spaces; Super Admin retains platform-wide access.

**Decision: the recipient logic depends on who the actor is**

When an OWNER confirms/rejects a booking on their own space:
- Guest gets `booking-confirmed-guest` or `booking-rejected-guest`
- Owner does NOT receive `booking-confirmed-owner` / `booking-rejected-owner` (they just performed the action — no point emailing themselves)

When a SUPER_ADMIN confirms/rejects on someone else's space:
- Guest gets `booking-confirmed-guest` or `booking-rejected-guest`
- Owner gets `booking-confirmed-owner` or `booking-rejected-owner` (informational — "an admin handled this for you")

**Implementation pattern:**

```typescript
// Inside notifyBookingConfirmed(booking, actorUserId)
sendEmail({ to: guest.email, template: 'booking-confirmed-guest', data: {...} })  // always

if (booking.space.owner_id && booking.space.owner_id !== actorUserId) {
  const owner = await db.query.users.findFirst(...)
  if (owner) {
    sendEmail({ to: owner.email, template: 'booking-confirmed-owner', data: {...} })
  }
}
```

This naturally combines with Decision §1 (NULL-owner skip) — both conditions in one branch.

**Reasoning:**
- Self-notification is silly (owner just clicked Confirm; they know it happened)
- Admin-on-behalf-of-owner IS meaningful (owner discovers this in email)
- The actor check is cheap (`actorUserId` is already in the Server Action's session context)

### Decision 4: Email-sending code location — `notify*` functions in `src/lib/bookings.ts`

Mirrors Story 7-2 / 8-2 pattern. The Phase 1 booking service module (likely `src/lib/bookings.ts` or `src/db/queries/bookings.ts` — Amelia inspects and picks the right file) gets new `notify*` functions added.

**Server Action call pattern:**

```typescript
// Inside confirmBookingAction
const result = await db.transaction(async (tx) => { ... })  // existing atomic logic
notifyBookingConfirmed(booking, session.userId)
  .then((r) => { /* fire and forget */ })
// Server Action returns success regardless of email outcome
```

The `notify*` functions can `await sendEmail` internally; the Server Action wraps the entire notify call in fire-and-forget. Email failure does NOT roll back the booking confirmation.

**Anti-pattern explicitly forbidden:** do NOT add inline `sendEmail` calls directly in Server Actions. Always go through `notify*` seam functions for consistency with Story 7-2 + 8-2.

### Decision 5: Owner-recipient lookup pattern

The booking row references `space_id`, which references `owner_id`. To get the owner's email for the notification, we need a join.

**Decision:** add a helper `getBookingWithOwnerEmail(bookingId)` (or extend existing booking queries) that returns `{ booking, space, owner }` in a single query. Used inside `notify*` functions.

**Why not reuse Story 7-5's `listBookingsForOwner`?** That query returns a LIST scoped by owner_id; this is a single-booking lookup with the owner joined. Different shape.

**Why not pass the data in?** Server Actions could pass the joined data, but that requires every action to do the join. Centralizing in the `notify*` function is cleaner — single owner-lookup pattern for all 4 notification flows.

**Amelia's call on the exact query shape** — Drizzle's `.with({ space: { with: { owner: true } }})` pattern, or a hand-rolled join, whichever is idiomatic to the Phase 1 codebase.

### Decision 6: Subject lines — locked verbatim per template, with threading

Following 8-2's deliberate-collision pattern for inbox threading.

**Guest-side subjects** (all share the same subject per-booking, so they thread):

> `[DeskHive] Your booking at {{spaceName}}`

This is the **same string** for `booking-requested-guest`, `booking-confirmed-guest`, `booking-rejected-guest`, `booking-cancelled-guest`. The template renders the same subject; the body content differs per state.

Result: Gmail threads all 4 emails under one conversation.

**Owner-side subjects** (similarly threaded):

> `[DeskHive] Booking on {{spaceName}} — {{bookingDate}}`

Same string for `booking-requested-owner`, `booking-confirmed-owner`, `booking-rejected-owner`, `booking-cancelled-owner`. Includes `bookingDate` so owners managing multiple bookings on the same space can distinguish threads.

**Format:** date renders as `Wed, Aug 27` (short weekday + month + day, no year). Consistent with Story 7-5's bookings table format.

### Decision 7: Cancellation emails — NO refund mention in 8-3

Phase 2 PRD §4.5 locks the refund POLICY (full refund 24+ hours before, no refund within 24h). But refund DELIVERY happens via Stripe webhooks in Theme B (Epic 9), and the refund EMAIL is owned by Story 8-4 (`payment-refund` template).

**Decision:** 8-3's cancellation emails do NOT mention refund outcome. They're pure cancellation notifications:

- `booking-cancelled-guest`: "Your booking has been cancelled. The booking is no longer active."
- `booking-cancelled-owner`: "A guest has cancelled their booking. The desk is now available for that date."

When Theme B + 8-4 ship, the user receives a SEPARATE `payment-refund` email (or a "no refund applies" variant) covering the money movement. Both emails thread under the guest-side booking subject so they're in one conversation.

**Anti-pattern explicitly forbidden:** do NOT add text like "A full refund will be issued" or "No refund applies" in 8-3 templates. That's 8-4's territory.

### Decision 8: CTA buttons — universal pattern

Every booking email (all 8) gets a CTA button.

- **Guest emails:** CTA label `View booking` → links to `{{BETTER_AUTH_URL}}/my-bookings`
- **Owner emails:** CTA label `View bookings` → links to `{{BETTER_AUTH_URL}}/owner/bookings`

Same button style as Story 8-2's CTAs (indigo button via inline CSS in `renderBaseTemplate`).

**Why universal:**
- Predictable recipient experience
- Simpler template code (no conditional CTA branches)
- Even "closing" events (rejected, cancelled) benefit from a "View booking" CTA — recipient can reference the booking for their records

### Decision 9: Email copy — locked verbatim

#### `booking-requested-guest`

**Subject:** `[DeskHive] Your booking at {{spaceName}}`

**Preview text:** `We've received your booking request and the host will review it shortly.`

**Body:**

```
<p>Hi {{guestName}},</p>

<p>We've received your booking request for <strong>{{deskLabel}}</strong> at <strong>{{spaceName}}</strong> on <strong>{{bookingDate}}</strong>. The host will review it and confirm soon.</p>

<p>You'll receive another email when the booking is confirmed or if there's an issue.</p>

<p><!-- CTA --></p>
<a href="{{BETTER_AUTH_URL}}/my-bookings" style="...">View booking</a>

<p>Thanks,<br>The DeskHive team</p>
```

**Template data:** `{ guestName, spaceName, deskLabel, bookingDate }`

---

#### `booking-requested-owner`

**Subject:** `[DeskHive] Booking on {{spaceName}} — {{bookingDate}}`

**Preview text:** `A guest has requested to book {{deskLabel}} on {{bookingDate}}.`

**Body:**

```
<p>Hi {{ownerName}},</p>

<p>A guest has requested to book <strong>{{deskLabel}}</strong> at <strong>{{spaceName}}</strong> on <strong>{{bookingDate}}</strong>. Please review and confirm or reject the request from your bookings page.</p>

<p><!-- CTA --></p>
<a href="{{BETTER_AUTH_URL}}/owner/bookings" style="...">View bookings</a>

<p>Thanks,<br>The DeskHive team</p>
```

**Template data:** `{ ownerName, spaceName, deskLabel, bookingDate }`

**Note: guest's name and email NOT included.** Owner needs to know what to act on, not who the guest is until they decide. Privacy-light minimalism. If owners later request guest names in the email for context, that's a polish backlog item.

---

#### `booking-confirmed-guest`

**Subject:** `[DeskHive] Your booking at {{spaceName}}`

**Preview text:** `Your booking is confirmed. See you on {{bookingDate}}.`

**Body:**

```
<p>Hi {{guestName}},</p>

<p>Your booking is confirmed. You're set for <strong>{{deskLabel}}</strong> at <strong>{{spaceName}}</strong> on <strong>{{bookingDate}}</strong>.</p>

<p>If you need to cancel, you can do so from your bookings page. Please note our cancellation policy: full refund 24+ hours before the booking date, no refund within 24 hours.</p>

<p><!-- CTA --></p>
<a href="{{BETTER_AUTH_URL}}/my-bookings" style="...">View booking</a>

<p>Thanks,<br>The DeskHive team</p>
```

**Template data:** `{ guestName, spaceName, deskLabel, bookingDate }`

**Cancellation policy mention:** the policy is a Phase 2 PRD §4.5 lock; informing the guest at confirmation time is honest and useful. Not a refund promise — just policy disclosure.

---

#### `booking-confirmed-owner`

**Subject:** `[DeskHive] Booking on {{spaceName}} — {{bookingDate}}`

**Preview text:** `An admin confirmed a booking on your behalf.`

**Body:**

```
<p>Hi {{ownerName}},</p>

<p>An admin confirmed a booking on <strong>{{spaceName}}</strong> for <strong>{{deskLabel}}</strong> on <strong>{{bookingDate}}</strong>. No action needed from you.</p>

<p><!-- CTA --></p>
<a href="{{BETTER_AUTH_URL}}/owner/bookings" style="...">View bookings</a>

<p>Thanks,<br>The DeskHive team</p>
```

**Template data:** `{ ownerName, spaceName, deskLabel, bookingDate }`

**Only fires when admin (not owner) confirms** — Decision §3.

---

#### `booking-rejected-guest`

**Subject:** `[DeskHive] Your booking at {{spaceName}}`

**Preview text:** `Unfortunately, the host wasn't able to confirm your booking.`

**Body:**

```
<p>Hi {{guestName}},</p>

<p>We're sorry — the host wasn't able to confirm your booking for <strong>{{deskLabel}}</strong> at <strong>{{spaceName}}</strong> on <strong>{{bookingDate}}</strong>.</p>

<p>You're welcome to browse other spaces or try a different date.</p>

<p><!-- CTA --></p>
<a href="{{BETTER_AUTH_URL}}" style="...">Browse spaces</a>

<p>Thanks,<br>The DeskHive team</p>
```

**Template data:** `{ guestName, spaceName, deskLabel, bookingDate }`

**CTA exception:** the rejected template's CTA is `Browse spaces` (linking to homepage `/`) rather than `/my-bookings`. Soft engagement, mirrors 8-2's `application-rejected` pattern.

---

#### `booking-rejected-owner`

**Subject:** `[DeskHive] Booking on {{spaceName}} — {{bookingDate}}`

**Preview text:** `An admin rejected a booking on your behalf.`

**Body:**

```
<p>Hi {{ownerName}},</p>

<p>An admin rejected a booking on <strong>{{spaceName}}</strong> for <strong>{{deskLabel}}</strong> on <strong>{{bookingDate}}</strong>. No action needed from you.</p>

<p><!-- CTA --></p>
<a href="{{BETTER_AUTH_URL}}/owner/bookings" style="...">View bookings</a>

<p>Thanks,<br>The DeskHive team</p>
```

**Template data:** `{ ownerName, spaceName, deskLabel, bookingDate }`

**Only fires when admin (not owner) rejects** — Decision §3.

---

#### `booking-cancelled-guest`

**Subject:** `[DeskHive] Your booking at {{spaceName}}`

**Preview text:** `Your booking has been cancelled.`

**Body:**

```
<p>Hi {{guestName}},</p>

<p>Your booking for <strong>{{deskLabel}}</strong> at <strong>{{spaceName}}</strong> on <strong>{{bookingDate}}</strong> has been cancelled.</p>

<p>If a refund applies, you'll receive a separate email when it's processed.</p>

<p><!-- CTA --></p>
<a href="{{BETTER_AUTH_URL}}" style="...">Browse spaces</a>

<p>Thanks,<br>The DeskHive team</p>
```

**Template data:** `{ guestName, spaceName, deskLabel, bookingDate }`

**Refund mention is deliberately vague** — "If a refund applies, you'll receive a separate email." This honors Decision §7 (no refund outcome in 8-3) while setting expectation that another email is coming when Stripe processes the refund. When Theme B + 8-4 are unwired, the line still reads honestly ("when it's processed" is conditional and patient).

**CTA: Browse spaces** (soft re-engagement, mirrors rejected).

---

#### `booking-cancelled-owner`

**Subject:** `[DeskHive] Booking on {{spaceName}} — {{bookingDate}}`

**Preview text:** `A guest cancelled their booking. The desk is available again.`

**Body:**

```
<p>Hi {{ownerName}},</p>

<p>A guest has cancelled their confirmed booking for <strong>{{deskLabel}}</strong> at <strong>{{spaceName}}</strong> on <strong>{{bookingDate}}</strong>. The desk is available for that date again.</p>

<p><!-- CTA --></p>
<a href="{{BETTER_AUTH_URL}}/owner/bookings" style="...">View bookings</a>

<p>Thanks,<br>The DeskHive team</p>
```

**Template data:** `{ ownerName, spaceName, deskLabel, bookingDate }`

**Only fires when** (a) booking was previously CONFIRMED and (b) `space.owner_id IS NOT NULL` — Decision §2 + §1.

---

### Decision 10: Voice consistency — same rules as 8-2

Inherits 8-2's transactional voice rule, enforced by the regex unit tests Amelia codified there:

- No exclamation marks
- No emojis
- "Thanks," not "Thanks!" or "Cheers!"
- "The DeskHive team"
- Warm, declarative, not chirpy

Apply the same regex test to all 8 new templates.

### Decision 11: E2E test coverage using 7-PREP-1 fixtures

**At minimum 6 new E2E tests** in `tests/e2e/booking-emails.spec.ts` (new file) or extending existing booking specs:

1. **Guest creates booking → both `booking-requested-guest` and `booking-requested-owner` fire**
   - Use `authenticatedPage('guest')`
   - Submit booking on `owner@deskhive.local`'s seeded space
   - Assert both templates recorded with correct recipients

2. **Owner confirms own booking → only `booking-confirmed-guest` fires (NO `booking-confirmed-owner`)**
   - Use `authenticatedPage('owner')`
   - Confirm a PENDING booking on owner's own space
   - Assert `booking-confirmed-guest` recorded; assert `booking-confirmed-owner` NOT recorded (Decision §3 verification)

3. **Admin confirms a booking on owner's space → both confirmed templates fire**
   - Use `authenticatedPage('admin')`
   - Confirm a PENDING booking on owner@deskhive.local's space
   - Assert both `booking-confirmed-guest` AND `booking-confirmed-owner` recorded

4. **Guest cancels PENDING booking → only `booking-cancelled-guest` fires**
   - Use `authenticatedPage('guest')` with a PENDING booking
   - Cancel
   - Assert `booking-cancelled-guest` recorded; assert `booking-cancelled-owner` NOT recorded (Decision §2 verification)

5. **Guest cancels CONFIRMED booking → both cancelled templates fire**
   - Same as #4 but with a CONFIRMED booking
   - Assert both templates recorded

6. **NULL-owner space booking → no owner email regardless of action**
   - Use one of the Phase 1 seeded spaces with `owner_id IS NULL` (e.g., `Space Paris`, `Space Miami`, `Space Tashkent`)
   - Use `authenticatedPage('guest')`, create a booking
   - Assert `booking-requested-guest` recorded; assert `booking-requested-owner` NOT recorded (Decision §1 verification)

**Mocking pattern:** `EMAIL_TEST_RECORD_FILE` JSONL approach from 8-2 (Bob's pattern). Mock Resend at the spec level; assert via `waitForRecordedEmail`.

### Decision 12: Unit test coverage

For each of the 8 templates, 4-5 tests:

1. Render produces non-empty subject + body
2. Body contains `guestName` / `ownerName` (HTML-escaped)
3. HTML special chars in interpolated data are escaped (`<script>` → `&lt;script&gt;`)
4. Voice regex test: no `!`, no emoji codepoints
5. Templates that intentionally omit fields (e.g., guest name in `booking-requested-owner`) tested to NOT include them

Plus 3 tests on the `notify*` functions:

6. `notifyBookingCancelledByGuest` skips owner send when previousStatus = PENDING (Decision §2)
7. `notifyBookingConfirmed` skips owner send when actor === owner (Decision §3)
8. Any `notify*` skips owner send when `space.owner_id IS NULL` (Decision §1)

**Target unit test count after this story:** ~285-300 (from 256 baseline).

### Decision 13: Memory entry update

Extend the existing memory file `reference_email_service_pattern.md` (8-1, 8-2) with:

- The "owner-side recipient = NULL → skip" rule (Decision §1)
- The "self-action → skip own notification" rule (Decision §3)
- The "previousStatus-aware notify functions" pattern for state-transition emails (Decision §2)
- The threaded-subject pattern for multi-state lifecycle emails (Decision §6)
- The "refund details belong to payment emails, not state-transition emails" boundary (Decision §7)

If the existing memory file is getting unwieldy, Amelia may split into `reference_booking_emails.md` — her call.

---

## Architectural anti-patterns forbidden

- **Do NOT** broadcast owner-side emails to SUPER_ADMINs for NULL-owner spaces — skip entirely (Decision §1)
- **Do NOT** fire `booking-confirmed-owner` or `booking-rejected-owner` when the owner is the acting party (Decision §3)
- **Do NOT** fire `booking-cancelled-owner` when the booking was PENDING (Decision §2)
- **Do NOT** mention refund outcome in cancellation emails (Decision §7)
- **Do NOT** include guest names in owner-side request emails beyond what's necessary (Decision §9 — `booking-requested-owner` does NOT include guest name)
- **Do NOT** modify Phase 1 booking Server Action signatures (only call new `notify*` from inside them)
- **Do NOT** modify Story 7-5's owner-scope branching (Decisions §3 actor-check is additive, not replacing)
- **Do NOT** modify the booking schema or add new fields
- **Do NOT** add inline `sendEmail` calls in Server Actions — use `notify*` seam (Decision §4)
- **Do NOT** introduce exclamation marks or emojis in any template (Decision §10)
- **Do NOT** hardcode URLs — use `BETTER_AUTH_URL` (Decision §8)
- **Do NOT** add admin-cancel templates, owner-cancel templates, or any Phase 3 flows
- **Do NOT** add per-user notification preferences
- **Do NOT** add Resend webhook handling
- **Do NOT** introduce new dependencies
- **Do NOT** modify Story 8-2 application notify functions or templates
- **Do NOT** add real-delivery E2E tests — mock via `EMAIL_TEST_RECORD_FILE`
- **Do NOT** add new seed data — existing seed has variety

---

## Browser verification checklist

After Amelia completes the dev story:

### Setup

- Dev server running on `localhost:3000`
- `RESEND_API_KEY` set in `.env.local`
- `TEST_EMAIL_RECIPIENT` set to BA's real email
- `EMAIL_TEST_RECORD_FILE` left **unset** for real delivery
- Re-run `pnpm db:seed` to ensure clean test data
- Resend dashboard (https://resend.com/emails) open in a tab

### Checks

1. **All unit tests pass** — `pnpm test` runs clean. Target ~285-300 (was 256).

2. **All E2E tests pass** — `pnpm test:e2e` runs clean. Target ~55 (was 49, +6 from Decision §11).

3. **Typecheck + lint clean**.

4. **Build 36 routes unchanged**.

5. **`git diff --stat`** shows zero entries under `src/app/`, `drizzle/`, `scripts/seed.ts`. Only `src/lib/bookings.ts` (notify functions), new templates in `src/lib/email-templates/`, tests, memory file.

6. **Flow A — Guest requests booking on owner's space** — log in as `guest@deskhive.local`, book a desk on owner@deskhive.local's seeded space. Resend dashboard shows TWO sends: `booking-requested-guest` to guest, `booking-requested-owner` to owner.

7. **Flow B — Owner confirms own booking** — log in as `owner@deskhive.local`, switch to hosting, confirm a PENDING booking on `/owner/bookings`. Resend dashboard shows ONE send: `booking-confirmed-guest`. Verify `booking-confirmed-owner` does NOT appear (Decision §3 verification — owner doesn't email themselves).

8. **Flow C — Admin confirms a booking on owner's space** — log in as `admin@deskhive.local`, go to `/admin/bookings`, confirm a PENDING booking on owner's space. Resend dashboard shows TWO sends: `booking-confirmed-guest` to guest, `booking-confirmed-owner` to owner.

9. **Flow D — Owner rejects own booking** — analogous to B, one send (`booking-rejected-guest`), no owner self-email.

10. **Flow E — Admin rejects on owner's space** — analogous to C, two sends.

11. **Flow F — Guest cancels PENDING booking** — log in as guest, cancel a PENDING booking. Resend dashboard shows ONE send: `booking-cancelled-guest`. Verify NO `booking-cancelled-owner` (Decision §2 verification).

12. **Flow G — Guest cancels CONFIRMED booking** — same as F but with a CONFIRMED booking. Resend dashboard shows TWO sends: `booking-cancelled-guest`, `booking-cancelled-owner`.

13. **Flow H — Booking on NULL-owner space** — log in as guest, book a desk on `Space Paris` (or any Phase 1 seeded space with NULL owner). Resend dashboard shows ONE send: `booking-requested-guest`. Verify NO `booking-requested-owner` (Decision §1 verification).

14. **Threading verification (visual)** — open BA's inbox after running flow A. The guest-side request email should appear. Run flow B (or C). The confirmation email should THREAD under the same subject `[DeskHive] Your booking at Seeded Owner Coworks`. Verify Gmail/whatever client groups them as one conversation.

15. **Email body content checks (open from inbox or Resend dashboard):**
    - `booking-confirmed-guest` contains cancellation policy text ("full refund 24+ hours before...")
    - `booking-cancelled-guest` contains "If a refund applies, you'll receive a separate email"
    - `booking-cancelled-guest` does NOT contain any "full refund" or "no refund" definitive language (Decision §7)
    - All emails contain `© 2026 DeskHive` footer
    - All emails have the CTA button (View booking / View bookings / Browse spaces per template)
    - No exclamation marks anywhere
    - No emojis anywhere

16. **Email failure does NOT break user flow** — set `RESEND_API_KEY=invalid`, restart, try Flow A. Booking creation succeeds, toast appears, DB row exists. Console logs email failure. (Decision §4 regression.)

17. **Kill switch works** — set `EMAIL_TEMPLATES_DISABLED=booking-confirmed-owner`, restart, try Flow C. `booking-confirmed-guest` lands; `booking-confirmed-owner` does NOT (kill switch silences). Resend dashboard confirms.

18. **Phase 1 + Theme A + 8-1 + 8-2 regression** — quick smoke:
    - Application flow (Story 7-3 + 7-4) still fires correct emails (Story 8-2 regression)
    - Owner CRUD spaces (Story 7-5)
    - Mode switching (Story 7-1)
    - Admin platform-wide bookings page still works

19. **No console errors during all flows**

20. **`pnpm send-test-email`** still works (Story 8-1 CLI regression)

---

## Files likely touched

Estimate, not directive.

- `src/lib/bookings.ts` (or wherever Phase 1 located it) — add `notify*` functions; possibly add `getBookingWithOwnerEmail` helper
- `src/actions/booking.ts` — wire `notify*` calls into existing Server Actions; pass `actorUserId` to `notifyBookingConfirmed` / `notifyBookingRejected`; capture `previousStatus` before `notifyBookingCancelledByGuest`
- `src/lib/email-templates/booking-requested-guest.ts` (new)
- `src/lib/email-templates/booking-requested-owner.ts` (new)
- `src/lib/email-templates/booking-confirmed-guest.ts` (new)
- `src/lib/email-templates/booking-confirmed-owner.ts` (new)
- `src/lib/email-templates/booking-rejected-guest.ts` (new)
- `src/lib/email-templates/booking-rejected-owner.ts` (new)
- `src/lib/email-templates/booking-cancelled-guest.ts` (new)
- `src/lib/email-templates/booking-cancelled-owner.ts` (new)
- `src/lib/email-templates/index.ts` — barrel export updates
- `src/lib/email.ts` — register the 8 template names + data shapes in `TemplateName` / `TemplateData` types (the 8-3 placeholders already exist from 8-1; just wire them to the new render functions)
- `src/lib/email-templates/booking-emails.test.ts` (new) — unit tests
- `tests/e2e/booking-emails.spec.ts` (new) — E2E coverage
- Memory file update — `reference_email_service_pattern.md` per Decision §13

**No changes to:**
- `src/app/` (any page route)
- `drizzle/` (schema)
- `scripts/seed.ts`
- `src/db/queries/` core query files (unless `getBookingWithOwnerEmail` lives there per Decision §5)
- Better Auth configuration
- Story 7-2 application notification stubs / Story 8-2 application templates
- Story 7-5 owner-scoped booking action logic (only ADDING actor-check inside notify functions)
- `src/lib/email.ts` core API (only data-shape additions)

---

## CI baseline target after this story

Current baseline (end of 8-2):
- Unit tests: 256
- E2E tests: 49
- Build routes: 36

After Story 8-3:
- Unit tests: **~285-300** (+30-40 new from Decision §12)
- E2E tests: **~55** (+6 new from Decision §11)
- Build routes: 36 (unchanged)

---

## Memory note for Phase 2 continuation

This story:

- Completes the booking lifecycle email coverage end-to-end
- Establishes the self-action-skip rule for owner-actor cases (Decision §3) — pattern reusable in 8-4 (e.g., owner doesn't email themselves about their own payout)
- Establishes the previous-status-aware notification pattern (Decision §2) — useful for any future state-transition emails
- Locks the "refund outcome belongs in 8-4, not 8-3" boundary

**After 8-3 ships:**
- Theme C is 3/4 stories done
- Story 8-4 (payment emails) is the last Theme C story, BUT depends on Theme B's webhook handlers (Story 9-5)
- Recommended next dispatch: **Story 9-1** (Stripe SDK wrapper) — kicks off Theme B; Themes B and C are independent until Story 8-4 needs 9-5's webhook
- Stripe account creation should happen before 9-1 (test mode keys needed for SDK verification)

**Design refinement opportunity:** if Makhbuba's Phase 2 designs arrive between now and Story 8-4, the base template `renderBaseTemplate` is the single seam — 8-3's 8 templates inherit any changes automatically.

---

**End of BA decisions document.**
