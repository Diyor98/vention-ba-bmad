# Story 8-4: Payment-Driven Emails — BA Decisions

**Story:** 8-4
**Epic:** 8 — Email Infrastructure (Theme C)
**Phase:** 2
**Type:** Integration story — 3 new email templates in `src/lib/email-templates/` + 3 new sender helpers + 3 webhook handler extensions (1 line each, after-DB-write fire-and-forget) + finalize the 8-1 placeholder `TemplateData` / `Subjects` entries. **LAST Phase 2 story; closes Epic 8 + closes Phase 2.**
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date drafted:** 2026-05-19
**Status:** LOCKED 2026-05-19. Ready for dispatch.
**Source:** Phase 2 PRD §4.3 Email Triggers table rows 12–14 (Payment captured / Payment refunded / Payout sent) + §6.5 anti-pattern lock ("don't trigger email sends from inside database transactions; send after commit succeeds") + §7.4 Email Visual Style (shared base template; brand-aligned colors) + NFR-5 ("email sends are non-blocking on the user request") + §8 Epic 8 Story 8-4 + forward-looking flags from Stories 9-5 / 9-6 / 9-7 BA decision docs (each ships a webhook handler with an explicit `// Story 8-4 wires up the email send here` placeholder note).

**Companion / dependency chain (all on `main`):**

- **Theme C — Story 8-1** (Email wrapper + Resend integration) shipped. Provides:
  - `src/lib/email.ts` — the typed seam (`sendEmail({ to, template, data })`); non-throwing per NFR-5; `EMAIL_TEMPLATES_DISABLED` kill-switch; `EMAIL_TEST_RECORD_FILE` sink for E2E.
  - `TemplateName` union ALREADY includes `'payment-receipt' | 'payment-refund' | 'payout-summary'` as 8-1 placeholders.
  - `TemplateData` ALREADY has placeholder shapes for the 3 templates (Story 8-4 refines per Decision §3).
  - `Subjects` ALREADY has placeholder subject lines (`'Your DeskHive receipt'` / `'Refund processed'` / `'Your DeskHive payout'`) — Story 8-4 confirms or refines per Decision §4.
  - `renderTemplate` switch's default branch already throws *"Template not implemented: '<name>'. Implemented in Story 8-4 (payment-*)"* — i.e., the seam is wired for the dev-agent to fill in 3 new switch cases.
- **Theme C — Story 8-2** (Application emails) shipped. Provides the per-template-file pattern in `src/lib/email-templates/application-*.ts` + the `renderTemplate(name, data) → { bodyHtml, previewText }` shape that Story 8-4's templates mirror.
- **Theme C — Story 8-3** (Booking lifecycle emails) shipped. Provides:
  - The `notifyBookingConfirmed(bookingId, callerId)` / `notifyBookingRejected(bookingId, callerId)` / `notifyBookingCancelledByGuest(bookingId, previousStatus)` helpers in `src/lib/bookings.ts` — the **canonical pattern** for "lookup booking dispatch info → call sendEmail with the right recipient + data". Story 8-4's new sender helpers mirror this shape.
  - The `getBookingDispatchInfo(bookingId)` query (single round-trip JOIN booking + space + desk + guest + owner) — Story 8-4's payment-receipt + payment-refund helpers reuse this unchanged.
  - The fire-and-forget call convention (`notify*(...).catch(err => logger.warn(...))`).
- **Theme C — Story 8-POLISH-1** (Email visual polish) shipped. Locks Inter font-stack + hex logo + table-layout + 600px card. Story 8-4 templates inherit this base layout via `renderBaseTemplate` unchanged.
- **Theme B — Story 9-4** (Confirm/reject with capture/cancel) shipped at `32dd63a`. Provides the action-side `confirmBookingAction` that captures the Payment Intent → triggers Stripe to fire `payment_intent.succeeded`. The 8-4 receipt email fires from the 9-5 webhook handler (NOT the action).
- **Theme B — Story 9-5** (Webhook dispatch generalization) shipped at `2950e15`. Provides:
  - `handlePaymentIntentSucceeded` — currently DB-write-only (transitions booking to CONFIRMED+CAPTURED via conditional WHERE; returns `{ handled: true }` on rescue path, `{ idempotent: true }` if 9-4 action won the race).
  - The dispatcher + `WEBHOOK_HANDLERS` map + the 3-stage try-catch pattern.
- **Theme B — Story 9-6** (Guest cancellation with refund) shipped at `bb94bd4` + `428734d`. Provides:
  - `handleChargeRefunded` — currently DB-write-only (transitions booking to CANCELLED+REFUNDED via conditional WHERE).
  - RESOLVED the PRD §4.5 cancel-interpretation open question; the refund flow is end-to-end.
- **Theme B — Story 9-7** (Owner payouts view) shipped at `13835a8` + `9944e82`. Provides:
  - `handlePayoutPaid` — audit-only (no DB writes; returns `{ handled: true }` so `webhook_events` row inserts; **BA Decision §4 semantic-stretch note: "handled" = "recorded for audit", NOT "DB state transitioned"**). Story 8-4 attaches the payout email at this handler's tail.
  - The `webhook_events` audit row IS the load-bearing trail for 8-4 to hook into.

Story 8-4 is the **integration story across Themes B + C**. It cannot dispatch until all 9 dependencies above are on `main` (they are).

**After 8-4 ships, Epic 8 (Theme C) is COMPLETE + Phase 2 is COMPLETE.** Trigger the Epic 8 retrospective + the Phase 2 retrospective per the BMad standard.

---

## Context

**Phase 2 PRD §4.3 — the locked email triggers for Story 8-4:**

| Event | Recipient | Subject | Trigger |
|---|---|---|---|
| Payment captured | Guest | "Receipt for your DeskHive booking" | Stripe `payment_intent.succeeded` webhook |
| Payment refunded | Guest | "Refund processed" | Stripe `charge.refunded` webhook |
| Payout sent | Space Owner | "Payout sent" | Stripe Connect `payout.paid` webhook (test mode simulated) |

**Phase 2 PRD §6.5 — load-bearing anti-pattern (carried into 8-4):**

> **Do NOT** trigger email sends from within database transactions. Send after commit succeeds.

The 9-5 / 9-6 webhook handlers do NOT use transactions; the email send happens AFTER the conditional UPDATE returns successfully. The 9-7 `handlePayoutPaid` handler does no DB writes; the email send fires AFTER the audit log line. Pattern is structurally compatible.

**Phase 2 PRD NFR-5 — load-bearing failure-mode lock (carried into 8-4):**

> Email sends are non-blocking on the user request. If Resend is unavailable, the user request still succeeds; email is queued for retry via a simple background mechanism (TBD: in-memory queue with restart-loss tolerance is acceptable for Phase 2).

8-4 interprets "user request" as "webhook handler response to Stripe" — same fire-and-forget pattern as 8-3's `notify*(...).catch(...)` in Server Actions. **Email failures NEVER cause the webhook handler to return non-200.** See Decision §5.

**Phase 2 PRD §8 Epic 8 Story 8-4 — locked AC:**

> Implement 3 email templates (Section 4.3 rows 12–14)
> Wire to Stripe webhook handlers (Story 9-5)
> AC: each Stripe webhook event fires the correct email, idempotent on duplicate webhooks

**The 3 handler integration points (load-bearing — all already exist in `webhooks.ts`):**

1. `handlePaymentIntentSucceeded(event)` — extend the success path (after `markBookingConfirmedAndCapturedByPaymentIntent` returns a non-undefined row) to fire the Guest receipt email. Currently exits with `{ handled: true }` immediately after the DB write.
2. `handleChargeRefunded(event)` — extend the success path (after `markBookingCancelledAndRefundedByPaymentIntent` returns a non-undefined row) to fire the Guest refund email. Currently exits with `{ handled: true }` immediately after the DB write.
3. `handlePayoutPaid(event)` — extend the audit-only path to fire the Owner payout email. Currently exits with `{ handled: true }` after the logger.info call only. Owner lookup needs the `stripeAccount` from the event's `account` field → `stripe_connect_accounts.userId` → `users.email + fullName`.

**Theme C closure context:** Stories 8-1 / 8-2 / 8-3 / 8-POLISH-1 are all `done`; 8-4 is the only remaining Theme C story. The 8-1 author already left forward-compatible placeholders in `email.ts` (TemplateName union, TemplateData entries, Subjects entries, the `renderTemplate` switch default throw) — 8-4 is plumbing-and-fill-in-the-blanks, not greenfield design.

**What 8-4 does NOT touch:**

- ❌ `payment_intent.payment_failed` email — no current Phase 2 consumer; `payment_intent.payment_failed` is explicitly unhandled in 9-5's `WEBHOOK_HANDLERS` map per its Decision §10. Phase 3 territory.
- ❌ Marketing emails / newsletters / drip campaigns — Phase 3.
- ❌ In-app email-history / "all your DeskHive emails" inbox — Phase 3.
- ❌ Owner-side "you have a new booking" payment notification — covered by Story 8-3's `booking-requested-owner` (no payment context yet at booking-request time).
- ❌ Stripe-hosted receipt PDF link in the Receipt email — Stripe's `payment_intent.charges.data[].receipt_url` is 3 levels deep + not guaranteed present at `payment_intent.succeeded` time + adds Stripe API surface to the handler (anti-pattern from 9-3 / 9-5 / 9-6 / 9-7's "no Stripe API calls from inside handlers"). 8-4 skips it; users can view payment in `/my-bookings`.
- ❌ Per-payout drill-down (which bookings rolled into this payout?) — Phase 3 (`stripe.payouts.listLineItems` is out of 9-7's scope per its Decision §1 + §3).
- ❌ Email retry-after-failure background queue — PRD NFR-5 says "TBD" + accepts in-memory restart-loss tolerance; strawman explicitly defers an actual queue to Phase 3 (Decision §5 carries this rationale).
- ❌ `webhook_events.email_sent_at` schema column — strawman lock is **NO** (Decision §6 uses Resend's `Idempotency-Key` header for dedup; no schema change). BA may override if compliance demands persistent send-tracking.
- ❌ Multi-currency / locale-aware copy — Phase 2 USD-only; English-only copy per 8-3 carry-forward.

---

## Scope

**In scope:**

- **3 new render functions + 3 new template files** in [src/lib/email-templates/](deskhive/src/lib/email-templates/):
  - `payment-receipt.ts` — `renderPaymentReceipt({ guestName, spaceName, bookingDate, amountCents, appUrl })` per the 8-2 / 8-3 file convention.
  - `payment-refund.ts` — `renderPaymentRefund({ guestName, spaceName, bookingDate, amountCents, appUrl })` (`bookingDate` added per Decision §3).
  - `payout-summary.ts` — `renderPayoutSummary({ ownerName, payoutAmountCents, appUrl })` (`bookingCount` field DROPPED per Decision §3 — Phase 3 if/when `stripe.payouts.listLineItems` lands).
  - Each returns `{ bodyHtml, previewText, subject? }` matching the 8-3 dynamic-subject pattern.
- **3 new exports** from [src/lib/email-templates/index.ts](deskhive/src/lib/email-templates/index.ts) (the barrel).
- **3 new cases** in the [src/lib/email.ts](deskhive/src/lib/email.ts) `renderTemplate` switch (replaces the "not implemented" default throw for these 3 names).
- **Finalize the 3 TemplateData shapes** in `email.ts` (the 8-1 placeholders need minor adjustment — see Decision §3).
- **Finalize the 3 Subject lines** in `email.ts` `Subjects` registry (PRD §4.3 wording carries; minor wordsmithing only — see Decision §4).
- **3 new sender helpers** in [src/lib/bookings.ts](deskhive/src/lib/bookings.ts) (or a new `src/lib/payments-emails.ts` — dev-agent picks):
  - `sendPaymentReceiptEmail({ paymentIntentId, amountCents, eventId })` — looks up the booking via `getBookingByPaymentIntentId` (9-5 helper) + `getBookingDispatchInfo(bookingId)` (8-3 helper) → calls `sendEmail({ template: 'payment-receipt', to: guest.email, data, idempotencyKey: eventId })`.
  - `sendRefundConfirmationEmail({ paymentIntentId, amountCents, eventId })` — mirror.
  - `sendPayoutNotificationEmail({ stripeAccountId, payoutAmountCents, eventId })` — looks up the owner via `getConnectAccountByStripeAccountId` (9-2 helper) + `users` table lookup (need a new tiny helper `getUserById` or reuse existing) → calls `sendEmail({ template: 'payout-summary', to: owner.email, data, idempotencyKey: eventId })`.
  - All 3 are **fire-and-forget** at the caller side (handler `.catch(...)`).
- **3 webhook handler extensions** in [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts):
  - `handlePaymentIntentSucceeded` — append one line: `sendPaymentReceiptEmail({ ... }).catch((err) => logger.warn(...))` AFTER the `markBookingConfirmedAndCapturedByPaymentIntent` non-undefined check, BEFORE returning `{ handled: true }`. Skips on the `idempotent` path (action already won; action-side path will fire its own email — see Decision §7).
  - `handleChargeRefunded` — mirror with `sendRefundConfirmationEmail`.
  - `handlePayoutPaid` — append one line: `sendPayoutNotificationEmail({ ... }).catch((err) => logger.warn(...))` AFTER the `logger.info(...)` call, BEFORE returning `{ handled: true }`. **No DB-state-change discriminator here** — the audit-only handler always emails (the audit row IS the discriminator per 9-7 Decision §4).
- **Resend `Idempotency-Key` header on every email send** — keyed on the Stripe event id (`evt_*`). See Decision §6.
- **Webhook handler idempotency carry-forward**: 9-5 Layer 1 (route-entry `webhook_events.stripe_event_id` check) + Layer 2 (per-handler conditional WHERE) STAY UNCHANGED. Email idempotency is a third layer ABOVE these. See Decision §6.
- **Unit tests** — render-function tests for the 3 new templates (mirrors 8-2/8-3 pattern) + handler-extension tests verifying `sendEmail` called with the right args on the success path AND NOT called on the deferred / idempotent / not-found paths.
- **E2E tests** — 0 new (locked). `EMAIL_TEST_RECORD_FILE` sink + existing patterns from 8-2/8-3 are the verification path if needed; the new templates can be smoke-asserted via the same JSONL recording in any cross-cutting E2E that touches payment flows.
- **Memory entry** — extend `reference_email_service_pattern.md` with the Story 8-4 section + the cross-Theme integration pattern; trigger Epic 8 + Phase 2 retrospectives.

**Out of scope:**

- ❌ Payment-failed email (no current Phase 2 consumer; `payment_intent.payment_failed` is unhandled in 9-5's map per its Decision §10).
- ❌ In-app email-history view — Phase 3.
- ❌ Stripe-hosted receipt PDF link in the email body — see Context anti-patterns above.
- ❌ Per-payout drill-down (which bookings rolled into this payout?) — Phase 3.
- ❌ `webhook_events.email_sent_at` schema column — Decision §6 picks Resend Idempotency-Key over schema-extension; BA may override.
- ❌ Email retry-after-failure background queue — Phase 3.
- ❌ Multi-currency / locale-aware copy — Phase 2 USD-only, English-only.
- ❌ Marketing emails / newsletters — Phase 3.
- ❌ Schema changes / migrations — pure code addition + 3 surgical handler line-additions.

---

## Decisions

### Decision 1: Template & handler integration shape — extend existing handlers in-place (NOT a new dispatcher)

**Locked: extend the 3 existing handlers in `webhooks.ts` in-place. Each gets exactly ONE new line.**

**Rationale:** the alternative ("introduce a new email-dispatcher pattern that listens on `webhook_events` rows out-of-band") is over-engineered for Phase 2 scale. The 3 handlers already exist with explicit `// Story 8-4 wires up the email send here` placeholder notes; 8-4 fills them in.

**Locked handler extension shape** (mirrors 8-3's `notify*(...).catch(...)` fire-and-forget pattern):

```typescript
// handlePaymentIntentSucceeded — extend the success-path return path:
if (!updated) {
  // idempotent path — action already won the race; the action-side caller
  // will fire its own email if needed. Skip the webhook-backstop email
  // to avoid duplicate delivery.
  logger.info('stripe_webhook_payment_intent_succeeded_already_captured', {...});
  return { ok: true, idempotent: true };
}

// First real handle — the backstop rescued the booking. Fire email.
// Idempotency key = Stripe event id (Resend dedups; see BA Decision §6).
sendPaymentReceiptEmail({
  paymentIntentId,
  amountCents: paymentIntent.amount,
  eventId: event.id,
}).catch((err) => {
  logger.warn('payment_receipt_email_failed', {
    eventId: event.id,
    paymentIntentId,
    error: err instanceof Error ? err.message : String(err),
  });
});

return { ok: true, handled: true };
```

**`handleChargeRefunded`** — mirror.

**`handlePayoutPaid`** — append AFTER the `logger.info` (no DB-change discriminator):

```typescript
logger.info('stripe_webhook_payout_paid_acknowledged', {...});
sendPayoutNotificationEmail({
  stripeAccountId: event.account ?? '',
  payoutAmountCents: payout.amount,
  eventId: event.id,
}).catch((err) => {
  logger.warn('payout_notification_email_failed', { ... });
});
return { ok: true, handled: true };
```

**Anti-pattern forbidden:**
- Do NOT introduce a new "email worker" / out-of-band email-dispatcher pattern in 8-4. Phase 3 territory if ever.
- Do NOT block the handler return on the `sendEmail` promise — `.catch(...)` fire-and-forget (NFR-5 carry-forward + 8-3 pattern).
- Do NOT fire the email on the `idempotent` path for the 9-5 / 9-6 handlers — that path means the action already won the race and the action layer is responsible for the email (action-side wiring is out of 8-4's scope; flag for whichever future story wires action-side payment-success emails IF any — strawman locks NONE for Phase 2). See Decision §7.
- Do NOT fire on the `deferred` / `not-found` paths for any handler (no real work happened; no email to send).
- Do NOT add a `payment_intent.payment_failed` handler in 8-4.

---

### Decision 2: 3 new template files + 3 new render functions

**Locked: 3 new files in `src/lib/email-templates/` following the 8-2 / 8-3 per-template-file pattern.**

```
src/lib/email-templates/
  payment-receipt.ts        # NEW — Guest, after capture
  payment-refund.ts         # NEW — Guest, after refund
  payout-summary.ts         # NEW — Owner, after payout settles
```

Each export shape (mirrors 8-3):

```typescript
// payment-receipt.ts
export function renderPaymentReceipt(data: {
  guestName: string;
  spaceName: string;
  bookingDate: string;  // YYYY-MM-DD; formatted at render time via formatBookingDate
  amountCents: number;
  appUrl: string;
}): { bodyHtml: string; previewText: string; subject?: string };
```

The `subject?` field is optional — Decision §4 picks DYNAMIC (interpolated) subjects for these templates following 8-3's pattern.

**Update [src/lib/email-templates/index.ts](deskhive/src/lib/email-templates/index.ts) barrel** — add 3 new exports.

**Update [src/lib/email.ts](deskhive/src/lib/email.ts) `renderTemplate` switch** — add 3 new cases; the default throw stops being reachable.

**Anti-pattern forbidden:**
- Do NOT merge the 3 templates into a single file (file-per-template is the 8-2 / 8-3 lock).
- Do NOT bypass `renderBaseTemplate` (the 8-POLISH-1 visual wrapper is the locked shared shell).
- Do NOT introduce new design tokens / colors / fonts — CC-8 carry-forward.
- Do NOT bundle Phase 3 "payment-failed" or "marketing" template stubs.

---

### Decision 3: `TemplateData` shape refinements (finalize the 8-1 placeholders)

**Background:** Story 8-1 left forward-compatible placeholder shapes in `email.ts`:

```typescript
// Story 8-1 placeholders (current state):
'payment-receipt': { guestName, amountCents, spaceName, bookingDate };
'payment-refund':  { guestName, amountCents, spaceName };
'payout-summary':  { ownerName, payoutAmountCents, bookingCount };
```

**Locked refinements (Story 8-4 finalizes):**

```typescript
'payment-receipt': {
  guestName: string;
  spaceName: string;
  bookingDate: string;   // YYYY-MM-DD ISO; formatted at render via formatBookingDate
  amountCents: number;
  appUrl: string;        // NEW — needed for "View booking" CTA in body
};

'payment-refund': {
  guestName: string;
  spaceName: string;
  bookingDate: string;   // NEW — body copy needs date context per BA wording lock §4
  amountCents: number;
  appUrl: string;        // NEW — needed for "View my bookings" CTA
};

'payout-summary': {
  ownerName: string;
  payoutAmountCents: number;
  appUrl: string;        // NEW — needed for "View payouts" CTA → /owner/payouts
  // bookingCount: number — REMOVED. Phase 2 doesn't expose this from
  // the payout.paid webhook payload + stripe.payouts.listLineItems is
  // explicitly out of 9-7's scope per its Decision §1. Phase 3 if/when
  // the local payouts cache table ships.
};
```

**Why `appUrl` on all three** (8-3 pattern carry-forward): every transactional email gets a "View in DeskHive" CTA at the bottom. Receipt → `/my-bookings`; refund → `/my-bookings`; payout → `/owner/payouts`.

**Why drop `bookingCount` from `payout-summary`** (load-bearing):
- The `payout.paid` webhook event payload does NOT include the count of underlying charges. Stripe exposes this via `stripe.payouts.listLineItems(payoutId)` — a separate API call.
- 9-7 Decision §1 + §3 explicitly carved out `stripe.payouts.listLineItems` as Phase 3 territory.
- Adding the count to the email would require either (a) a Stripe API call from inside the webhook handler (anti-pattern from 9-3 / 9-5 / 9-6 / 9-7), or (b) a local-DB cross-reference against captured-in-window bookings (fragile + computationally expensive in the handler hot path).
- Strawman drops the field; the email copy adjusts to "A payout of $X.XX was sent to your bank" without the count framing.

**Anti-pattern forbidden:**
- Do NOT add a `stripeReceiptUrl` field to `payment-receipt` (anti-pattern from Context — Stripe API call from handler).
- Do NOT add a `bookingCount` to `payout-summary` — Phase 3.
- Do NOT add `userEmail` to any shape (the recipient is the `to` arg to `sendEmail`, not in the data).
- Do NOT leak the Stripe event id or PI id into the email body (security + clutter — internal IDs are not user-meaningful).

---

### Decision 4: Subject line lock (PRD §4.3 verbatim vs polish)

**PRD §4.3 locked subjects (verbatim from the table):**

| Template | PRD subject |
|---|---|
| `payment-receipt` | "Receipt for your DeskHive booking" |
| `payment-refund` | "Refund processed" |
| `payout-summary` | "Payout sent" |

**Locked: use PRD §4.3 verbatim subjects (no polish).** Three reasons:
1. PRD is authoritative; non-verbatim deviation invites cross-doc drift.
2. The 8-1 placeholders in `email.ts` (`'Your DeskHive receipt'` / `'Refund processed'` / `'Your DeskHive payout'`) deviate slightly from PRD; 8-4 corrects them to the PRD-locked strings.
3. Subjects are user-facing — verbatim PRD wording is the safer default; BA may override during lock if a more refined wording is wanted.

**Dynamic subject extension (8-3 pattern carry-forward):** the receipt subject CAN interpolate the space name for inbox-threading clarity. Strawman recommends:

```typescript
// payment-receipt.ts render output:
subject: `Receipt for your DeskHive booking at ${escapeHtml(spaceName)}`;

// payment-refund.ts:
subject: `Refund processed for ${escapeHtml(spaceName)}`;

// payout-summary.ts:
subject: 'Payout sent'; // No dynamic interpolation; the body carries the amount.
```

**Update `Subjects` registry in `email.ts`** to match the PRD verbatim wording as the fallback (used when the render function omits `subject`):

```typescript
'payment-receipt': 'Receipt for your DeskHive booking',
'payment-refund':  'Refund processed',
'payout-summary':  'Payout sent',
```

**Anti-pattern forbidden:**
- Do NOT use the 8-1 placeholder subjects unchanged (they deviate from PRD).
- Do NOT add "[DeskHive]" bracket prefixes (consistent with 8-2's calm-transactional voice; PRD subjects don't carry the prefix).
- Do NOT add an emoji or exclamation point (8-POLISH-1 voice lock — non-celebratory, calm transactional).

---

### Decision 5: Email-send-failure handling — log + move on (handler returns success regardless)

**The question (per BA prompt):**
- (a) Webhook handler returns 500 → Stripe retries → duplicate email risk.
- (b) Webhook handler returns 200 + logs the failure → email is lost forever.
- (c) Add a retry queue (out of Phase 2 scope).

**Locked: (b) — log + move on.**

**Rationale:**
- **NFR-5 explicit lock**: "Email sends are non-blocking on the user request. If Resend is unavailable, the user request still succeeds; email is queued for retry via a simple background mechanism (TBD: in-memory queue with restart-loss tolerance is acceptable for Phase 2)." 8-4 interprets "user request" as "webhook handler response to Stripe."
- **8-3 pattern is identical**: `notifyBookingConfirmed(...).catch(err => logger.warn(...))` from `confirmBookingAction`. Email failures NEVER affect the Server Action's success state. 8-4's webhook handlers inherit this shape.
- **Option (a) is worse than (b)**: returning 500 makes Stripe retry the WHOLE event delivery — which re-fires the DB-write handler logic. The DB writes are idempotent (conditional WHERE handles dedup) — but the email send may have already succeeded on the first delivery before the timeout. Result: duplicate email + duplicate `webhook_events` insert attempt (Layer 1 idempotency check catches this, but the duplicate email is already out). **Worse failure mode than just losing the email.**
- **Option (c) is Phase 3**: a real retry queue requires schema (`email_send_attempts` table) + a polling worker + retry-backoff logic. Out of 8-4 scope.

**Operational consequence accepted:** if Resend has an outage during a Stripe webhook delivery, the affected emails for that delivery window are LOST. Phase 2 demo flow is single-user and Resend's free-tier SLA is high; the loss window is acceptable. Phase 3 may add the retry queue.

**Logger contract for failures:**
- Log key: `payment_receipt_email_failed` / `refund_email_failed` / `payout_email_failed`.
- Fields: `eventId`, the Stripe resource id (`paymentIntentId` / `stripeAccountId`), `error: err.message`.
- Level: `warn` (not `error`) — the system is still working; the email is a notification convenience.

**Anti-pattern forbidden:**
- Do NOT return `{ ok: false, status: 500 }` from the handler on email failure (causes Stripe retry + duplicate email).
- Do NOT block the handler return on the `sendEmail` promise (NFR-5 lock).
- Do NOT add a retry queue / background worker / cron-driven catch-up in 8-4.
- Do NOT add `webhook_events.email_send_attempts` columns (Phase 3).

---

### Decision 6: Idempotency for email sends — Resend `Idempotency-Key` header (NO schema change)

**The question (per BA prompt):**
- (a) Send-tracking column on `webhook_events` (`email_sent_at`).
- (b) Idempotency key on the Resend API call.
- (c) Accept rare duplicates.

**Locked: (b) — Resend `Idempotency-Key` header, keyed on the Stripe event id (`evt_*`).**

**Rationale:**
- Stripe webhook delivery is at-least-once. Layer 1 idempotency check on `webhook_events.stripe_event_id` makes the DB write idempotent. But the email send happens AFTER the route's `webhook_events` insert succeeds — if the route returns 500 on the insert (post-handler-success), Stripe retries the WHOLE event delivery, the handler runs again, and the email tries to send AGAIN.
- The Layer 1 + Layer 2 idempotency model from 9-5 protects the DB but NOT the email. Need a third layer.
- **Resend supports `Idempotency-Key` natively** (it's standard HTTP idempotency-key semantics + Resend's SDK passes it through as a header). Resend dedups server-side for 24h — well above Stripe's webhook retry window.
- Using the Stripe event id (`evt_*`) as the key ties dedup to the canonical source-of-truth identifier. Same Stripe event → same Idempotency-Key → Resend returns the cached send result.

**Why NOT (a) — schema column**:
- Additive `email_sent_at` on `webhook_events` requires schema migration.
- The schema column would need to be set AFTER the email send succeeds — itself a write-after-write race (handler succeeded + webhook_events insert succeeded + email sent + email_sent_at UPDATE fails → next retry re-sends).
- The Resend idempotency-key approach has none of these footguns.

**Why NOT (c) — accept duplicates**:
- Stripe's webhook retry frequency is exponential (1min, 5min, 30min, 2h, 5h, 18h) — duplicates are RARE in practice. But "rare" is not "zero". A Guest receiving 2x receipt emails is a trust-eroding bug worth preventing structurally.

**Locked extension to `sendEmail`** (additive — backwards-compatible with 8-1 / 8-2 / 8-3 callers):

```typescript
// src/lib/email.ts — sendEmail args extension:
export async function sendEmail<T extends TemplateName>(args: {
  to: string;
  template: T;
  data: TemplateData[T];
  idempotencyKey?: string;  // Story 8-4 — passed to Resend's Idempotency-Key header
                             // when present. Callers from Server Actions (8-2/8-3)
                             // omit it (no native dedup key); webhook handlers (8-4)
                             // pass the Stripe event id.
}): Promise<SendEmailResult>;
```

Internal Resend call:

```typescript
const result = await resend.emails.send({
  from, to, subject, html,
}, {
  idempotencyKey: args.idempotencyKey,  // Resend SDK options arg
});
```

**Anti-pattern forbidden:**
- Do NOT introduce `webhook_events.email_sent_at` (out of scope per BA lock).
- Do NOT use the booking id or payment intent id as the idempotency key — the Stripe event id is the canonical dedup boundary (different events for the same PI should each get their own email; same event delivered twice should NOT).
- Do NOT skip the idempotency key on the sender helpers — Decision §1's handler extension is locked to pass the Stripe event id.
- Do NOT add the idempotency key to 8-2 / 8-3's existing callers (those callers don't have a stable webhook-event-id; the Action context generates a new "send attempt" each time, which is correct).

---

### Decision 7: `idempotent` handler-return-path → SKIP the email (action already won)

**Background:** The 9-5 handlers return `{ idempotent: true }` when the action-side caller already wrote the target state. Example flow:

1. Owner clicks Confirm → `confirmBookingAction` captures the PI + writes `(CONFIRMED, CAPTURED)` to the DB.
2. Stripe fires `payment_intent.succeeded` webhook asynchronously.
3. `handlePaymentIntentSucceeded` runs → conditional WHERE filters out the already-updated row → returns `{ idempotent: true }`.
4. Route returns 200 + does NOT insert `webhook_events` (the audit row is only for first-real-handle).

**Question:** does the webhook's `idempotent` path also fire the email? Two options:

- **(a) Fire on idempotent too.** The Guest still got their booking captured; they still deserve a receipt email. Risk: if the action layer ALSO fires the email (which would be the natural action-side wiring), the user gets 2 receipts.
- **(b) Skip on idempotent.** Only fire on `{ handled: true }` (the rescue path — DB write happened HERE). Risk: if the action layer does NOT fire an email (Phase 2 reality — no action-side email is wired in 9-4 / 9-6), the happy path NEVER emails. **This is the failure mode.**

**Locked: (b) — skip on idempotent, BUT only because Phase 2's normal flow path is the webhook handler's `{ handled: true }` path, NOT the `{ idempotent: true }` path.**

**Critical clarification on the 9-5 model:** the 9-5 webhook handlers are the BACKSTOP for the narrow window where the action-side DB write fails. In the normal happy-path:

- Owner clicks Confirm → action calls `paymentIntents.capture` → Stripe API succeeds → action writes `(CONFIRMED, CAPTURED)` to DB → action returns success.
- Stripe fires `payment_intent.succeeded` webhook → handler runs → conditional WHERE filters out (booking is already CONFIRMED+CAPTURED) → returns `{ idempotent: true }` → no email.

Under THIS reading, the email NEVER fires in the normal happy path — only on the rare DB-write-failed rescue path. **That's wrong for Phase 2.**

**REVISED LOCK: action-side email send for the normal happy path + webhook-handler email send only for the rescue path.**

This means 8-4 needs to wire emails in TWO places per template:

1. **`confirmBookingAction` extension** (in `src/actions/booking.ts`) — fire `sendPaymentReceiptEmail` AFTER `markBookingConfirmedAndCaptured` succeeds (normal happy path). Pattern: `sendPaymentReceiptEmail(...).catch(...)` — fire-and-forget, mirrors 8-3's `notifyBookingConfirmed(...).catch(...)` already there.
2. **`cancelBookingAction` extension** (in `src/actions/booking.ts`) — fire `sendRefundConfirmationEmail` AFTER `markBookingCancelledAndRefunded` succeeds (normal happy path of the eligible-refund branch).
3. **Webhook handlers** — fire emails on the `{ handled: true }` rescue path (with the same Resend Idempotency-Key as the action — Decision §6 ensures dedup if both somehow fire).

**For the payout email (`handlePayoutPaid`):** there's no action-side path (payouts are Stripe-initiated, not user-initiated). The webhook handler is the SOLE email source. No `idempotent` distinction needed — `handlePayoutPaid` always returns `{ handled: true }` (audit-only stance from 9-7 Decision §4).

**Anti-pattern forbidden:**
- Do NOT fire the email on BOTH the action AND the webhook `{ handled: true }` without the Resend idempotency-key (would risk duplicates if the action-side email-send happens before the webhook handler runs — same Stripe event id ensures dedup; without the key, double-send is possible).
- Do NOT fire the email on the webhook `{ idempotent: true }` path — assume the action wrote AND emailed; the webhook is purely the audit-trail confirmation.
- Do NOT fire the email on the webhook `{ deferred: true }` / `{ ok: false }` paths (no real work happened).

**Idempotency key alignment** (locked unified-resource-id shape):

- Action-side: `idempotencyKey = 'receipt-' + paymentIntentId` (or `'refund-' + paymentIntentId`).
- Webhook-side rescue path: same key `'receipt-' + paymentIntentId` (or `'refund-' + paymentIntentId`).
- Resend dedups; whichever fires first wins; the other path's send is a no-op.

This unifies the dedup boundary on the Stripe RESOURCE id (PI id / charge id / payout id) rather than the EVENT id (`evt_*`). The Stripe event id approach (Decision §6 strawman framing) would dedup "same event delivered twice" but NOT "action-side fired first, then webhook-side fires for a different event id about the same PI". Resource-id dedup is what we actually want — one receipt per captured PI, regardless of how many Stripe events fire about it.

For `payout-summary` (no action-side caller), the key shape is `'payout-' + payoutId` (still resource-id-shaped; only one caller so dedup matters only for Stripe webhook retries on the same delivery, which Resend handles natively via the same Idempotency-Key header).

**Resend `Idempotency-Key` dedup-response handling (BA lock supplement):**

When Resend's API receives a second `sendEmail` call carrying the same `Idempotency-Key` header, its response shape is one of two patterns — both must be handled correctly by `sendEmail`:

- **If Resend returns a 2xx response on idempotency-dedup** (treats the duplicate as success and returns the previously-sent email's id): no special handling needed in `sendEmail`. The existing fire-and-forget `.catch(...)` pattern from Decisions §5 + §1 works as-is — `sendEmail` returns `{ status: 'sent' }` and the caller logs nothing.
- **If Resend returns a 4xx response specifically for idempotency-dedup** (treats the duplicate as a known-rejected case with a specific error code): `sendEmail`'s implementation MUST detect that specific response code (likely `409 Conflict` or an idempotency-specific code in Resend's `result.error`) and silently treat it as success — return `{ status: 'sent' }` or a new `{ status: 'deduplicated' }` variant — rather than logging it as an error. The duplicate-call is EXPECTED behavior in the dual-path design (Decision §7), NOT a failure. Logging it as an error would generate `warn` lines on every payment-success flow that creates noise in ops dashboards.

**Dev-agent contract:** during implementation, confirm which behavior applies by EITHER reading Resend's API docs (https://resend.com/docs/api-reference + idempotency-key documentation) OR observing actual Resend test-mode responses (send the same key twice + inspect `result` shape). Document the chosen handling in the dev-story DAR + add a unit test covering the dedup-response code path. If Resend's behavior is the 2xx form (most likely per HTTP idempotency-key convention), the existing tests cover it; if the 4xx form, add an explicit test for the dedup-detection-and-silent-success path.

**Anti-pattern forbidden:**
- Do NOT use mixed key shapes between action and webhook callers (would split the dedup namespace and allow duplicates).
- Do NOT fire the email on `{ idempotent: true }` (the other path is the source-of-truth for that PI).
- Do NOT log a `warn` line on Resend's idempotency-dedup response — that's expected behavior in the dual-path design, not a failure (per the supplement above).
- Do NOT skip the dev-agent's confirmation step on Resend's actual dedup-response behavior — silent assumptions about HTTP semantics here would mask a real ops-noise issue.

---

### Decision 8: Sender helper location and shape — extend `src/lib/bookings.ts`

**Rationale:** The 8-3 sender helpers (`notifyBookingConfirmed`, `notifyBookingCancelledByGuest`, etc.) live in `src/lib/bookings.ts`. They're the canonical example of "look up booking dispatch info → call sendEmail with the right recipient + data". 8-4's 3 new helpers mirror this pattern.

**Two options for file location:**

- **(a) Extend `src/lib/bookings.ts`** — adds 3 new exports alongside the existing 8-3 `notify*` helpers. Pro: single home for "booking-related notification orchestration"; consistent with the 8-3 pattern. Con: `bookings.ts` grows from N exports to N+3.
- **(b) New `src/lib/payments-emails.ts`** — separates payment-context emails from booking-context emails. Pro: clearer scope-of-concern separation. Con: payment receipts ARE booking-context (they reference the booking); the line is blurry.

**Locked: (a) — extend `src/lib/bookings.ts`.**

Rationale: the receipt + refund helpers both need `getBookingDispatchInfo(bookingId)` (8-3 helper, lives in `src/db/queries/bookings.ts`) AND the booking's space/desk/date for the email body. The natural home is alongside `notifyBookingConfirmed` et al. The payout helper is a slight outlier (owner-only, no booking context) — strawman adds it to `bookings.ts` for the single-home consistency, but BA may prefer a small `src/lib/payouts.ts` for just that one helper. Dev-agent picks if BA defers.

**Locked helper signatures:**

```typescript
// src/lib/bookings.ts — new exports for Story 8-4:

/**
 * Story 8-4: fires the payment-receipt email after a Payment Intent
 * captures. Called by confirmBookingAction (action-side normal path)
 * AND by handlePaymentIntentSucceeded (webhook-side rescue path).
 * Resend dedups on the idempotencyKey arg per BA Decision §6 + §7.
 */
export async function sendPaymentReceiptEmail(args: {
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<void>;

/** Story 8-4: fires the refund-confirmation email. Mirrors above. */
export async function sendRefundConfirmationEmail(args: {
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<void>;

/**
 * Story 8-4: fires the payout-notification email. No action-side caller
 * (payouts are Stripe-initiated); only handlePayoutPaid calls this.
 * Idempotency key = Stripe event id (only one source).
 */
export async function sendPayoutNotificationEmail(args: {
  stripeAccountId: string;
  payoutAmountCents: number;
  idempotencyKey: string;
}): Promise<void>;
```

Each helper:
1. Looks up the recipient (via existing `getBookingDispatchInfo` or `getConnectAccountByStripeAccountId` + a small `getUserById` helper — see Decision §9).
2. Builds the `data` payload per the refined `TemplateData` shapes (Decision §3).
3. Calls `sendEmail({ to, template, data, idempotencyKey })`.
4. Logs `warn` on failure; throws nothing.

**Anti-pattern forbidden:**
- Do NOT put these helpers in `src/lib/payments/*` (those sub-modules are Stripe SDK wrappers; the email helpers do recipient lookups + content building, not Stripe API calls).
- Do NOT put them in `src/lib/email-templates/` (that directory is template renders only).
- Do NOT inline the helpers in `webhooks.ts` (handlers should stay focused on dispatch + state transitions; the helper abstracts away the DB lookup).

---

### Decision 9: Recipient lookup helpers — reuse 8-3 + add a tiny `getUserById`

**Receipt + refund helpers** reuse [getBookingDispatchInfo](deskhive/src/db/queries/bookings.ts) (8-3 helper) — already returns booking + space + desk + guest + owner in one round-trip JOIN. The new helpers:

1. Look up booking by `payment_intent_id` via `getBookingByPaymentIntentId` (9-5 helper). Gets the booking row.
2. Call `getBookingDispatchInfo(booking.id)`. Gets the email-ready bundle.
3. Compose data shape per Decision §3 + call `sendEmail`.

**Payout helper** does NOT have a booking context. Needs an owner lookup:

1. `getConnectAccountByStripeAccountId(stripeAccountId)` (9-2 helper). Returns `stripe_connect_accounts.userId`.
2. Look up the user record → `users.email + fullName`.

**Helper choice:** does a `getUserById(userId): Promise<{ email; fullName } | null>` query helper already exist? Audit during Task 0 (the better-auth integration likely has something). If not, add a tiny new helper in `src/db/queries/users.ts` (or wherever existing user-lookup helpers live) — single `db.select({ email, fullName }).from(usersTable).where(eq(users.id, userId)).limit(1)`.

**Anti-pattern forbidden:**
- Do NOT add a 2-query lookup when a JOIN exists. If a JOIN-shape `getConnectAccountWithOwner` doesn't already exist, dev-agent picks: extend the existing query OR do a 2-query lookup (the latter is acceptable for the rare-event payout path).
- Do NOT skip the recipient lookup and hardcode an email address (defense against accidental dev-mode leakage).
- Do NOT email the wrong recipient (the receipt + refund go to the Guest at `booking.guestUserId.email`; the payout goes to the Owner at `stripe_connect_accounts.userId.email`).

---

### Decision 10: Unit test coverage — ~12 new tests

**Target after 8-4 ships: 408 + ~12 new = ~420 unit tests.** Per the 9-x precedent, dev-agent may ship +1–3 bonus.

**Test split:**

1. **`src/lib/email-templates/payment-receipt.test.ts`** (NEW) — 1 render test (asserts the body interpolates `guestName`, `spaceName`, `bookingDate`, `formatCents(amountCents)`, `appUrl`; previewText present; subject contains the space name).
2. **`src/lib/email-templates/payment-refund.test.ts`** (NEW) — same shape; verifies the 5–10 business-day timing copy is in the body (consistency with the 9-6 toast lock).
3. **`src/lib/email-templates/payout-summary.test.ts`** (NEW) — same shape; verifies the body does NOT mention a booking count (per the Decision §3 drop).
4. **`src/lib/bookings.test.ts`** extension — 3 new sender-helper tests:
   - `sendPaymentReceiptEmail` happy path — mocks `getBookingByPaymentIntentId` + `getBookingDispatchInfo` + `sendEmail`; asserts the call args including the idempotency key shape.
   - `sendRefundConfirmationEmail` happy path — mirror.
   - `sendPayoutNotificationEmail` happy path — mocks `getConnectAccountByStripeAccountId` + the user-lookup + `sendEmail`.
5. **`src/lib/payments/webhooks.test.ts`** extension — 3 new handler-extension tests:
   - `handlePaymentIntentSucceeded` happy path now ALSO calls `sendPaymentReceiptEmail` with the right idempotency key.
   - `handleChargeRefunded` happy path now ALSO calls `sendRefundConfirmationEmail`.
   - `handlePayoutPaid` happy path now ALSO calls `sendPayoutNotificationEmail`.
6. **`src/lib/payments/webhooks.test.ts`** extension — 3 NEGATIVE handler tests (regression):
   - `handlePaymentIntentSucceeded` on the `idempotent` path does NOT call the email sender.
   - `handlePaymentIntentSucceeded` on the `deferred` (booking-not-found) path does NOT call the email sender.
   - `handleChargeRefunded` on the `idempotent` path does NOT call the email sender.

**Total new: ~12 unit tests.** (3 render + 3 helper + 3 positive handler + 3 negative handler.)

**Mock-boundary pattern carry-forward (split-by-mock-boundary, 9-5 carry-forward):**
- Render tests: no mocks (pure functions).
- Helper tests: mock at `@/db/queries/*` + `@/lib/email` boundaries.
- Handler tests: mock at `@/db/queries/*` + `@/lib/bookings` (for the sender helpers — same boundary as 8-3 handler tests).

**Anti-pattern forbidden:**
- Do NOT write integration tests that hit real Resend in CI.
- Do NOT skip the negative tests — the `idempotent` / `deferred` skip-the-email logic is the load-bearing safety net per Decisions §5 + §7.

---

### Decision 11: E2E test target — 0 new (target 61 unchanged)

**Locked: 0 new E2E tests in 8-4.**

**Rationale:** the Phase 2 payment flow already has E2E coverage via `booking-with-payment.spec.ts` (9-3) + `confirm-booking-phase1-backcompat.spec.ts` (9-4). Adding payment-email assertions to existing specs is the natural extension IF needed — but the `EMAIL_TEST_RECORD_FILE` JSONL sink (8-2 infrastructure) already records every send, and BA walks verify real emails arrive at `marketadteam@gmail.com` from each of the 3 webhook handlers.

**Optional BA override:** add 1 cross-cutting E2E that exercises the booking → capture → receipt-email-recorded path end-to-end using `EMAIL_TEST_RECORD_FILE`. Dev-agent picks if cheap; flag in DAR. Target then moves to 62.

**Anti-pattern forbidden:**
- Do NOT call real Resend API from E2E.
- Do NOT verify email *delivery* in CI (delivery depends on Resend's deliverability infrastructure; out of scope).
- Do NOT add new Playwright fixtures specifically for email — the existing `EMAIL_TEST_RECORD_FILE` sink is the canonical pattern.

---

### Decision 12: PRD §6.5 anti-pattern compliance — DB-first-then-email pattern verified

**PRD §6.5 lock:** *"Do NOT trigger email sends from within database transactions. Send after commit succeeds."*

**8-4 compliance audit (all 6 integration points):**

| Caller | DB write completion → email-send relationship |
|---|---|
| `confirmBookingAction` (action-side receipt) | DB UPDATE returns successfully → `sendPaymentReceiptEmail(...).catch(...)`. ✓ |
| `cancelBookingAction` eligible-refund branch (action-side refund) | DB UPDATE returns successfully → `sendRefundConfirmationEmail(...).catch(...)`. ✓ |
| `handlePaymentIntentSucceeded` rescue path (webhook receipt) | `markBookingConfirmedAndCapturedByPaymentIntent` returns a row → `sendPaymentReceiptEmail(...).catch(...)`. ✓ |
| `handleChargeRefunded` rescue path (webhook refund) | `markBookingCancelledAndRefundedByPaymentIntent` returns a row → `sendRefundConfirmationEmail(...).catch(...)`. ✓ |
| `handlePayoutPaid` (webhook payout) | No DB write (audit-only handler); `logger.info` → `sendPayoutNotificationEmail(...).catch(...)`. ✓ — vacuously compliant. |

**Zero `db.transaction(...)` usage anywhere in the 8-4 code path.** PRD §6.5 satisfied structurally.

**Anti-pattern forbidden:**
- Do NOT introduce `db.transaction(...)` wrappers around the new email-send calls.
- Do NOT block the action / handler return on the email-send promise (NFR-5 + Decision §5 carry-forward).

---

### Decision 13: Memory + Epic 8 + Phase 2 retrospective triggers

**Locked: extend `reference_email_service_pattern.md` with a new Story 8-4 section** covering:

- 3 new templates (`payment-receipt`, `payment-refund`, `payout-summary`) + their render-function file convention + the `TemplateData` shape refinements.
- 3 new sender helpers in `src/lib/bookings.ts` (`sendPaymentReceiptEmail`, `sendRefundConfirmationEmail`, `sendPayoutNotificationEmail`).
- The 6 integration points (2 actions + 3 webhook handlers).
- The 2 idempotency-key shape conventions (action: `'receipt-' + paymentIntentId`; webhook: same key, unified dedup boundary — Decision §6 + §7).
- The `Idempotency-Key` extension to `sendEmail`'s API (additive; non-breaking for 8-2 / 8-3 callers).
- The `idempotent` / `deferred` skip-the-email pattern (load-bearing safety net).
- The PRD §6.5 compliance audit table.
- Cross-reference to memory `reference_stripe_service_pattern.md` for the 6 sub-modules + 7 dispatcher handlers.

**Trigger Epic 8 retrospective.** Theme C (Email Infrastructure) is COMPLETE after 8-4. Optional Epic 8 retrospective workflow becomes available per BMad standard.

**Trigger Phase 2 retrospective.** Phase 2 covers Themes A + B + C (Multi-Tenant + Payments + Email). All three themes complete after 8-4 ships at greenlight. The Phase 2 retrospective is a higher-order optional workflow (BMad standard) capturing themes across all 3 epics.

**Retrospective scope LOCKED: include ALL 9 proposed topics from the Forward-looking flags section** — Phase 2 is the FIRST marketplace-payments + email-integration phase in this project; trimming the topic list would reduce Phase 3 leverage. Each topic captures a transferable pattern that downstream phases will revisit. The Epic 8 retrospective + Phase 2 retrospective workflows both consume this list as the seed agenda; BA may add more topics during the retrospective but the locked floor is 9.

**No new memory file.** The 8-4 additions extend the existing Theme C reference; the Theme B + cross-theme patterns are already in `reference_stripe_service_pattern.md` from 9-7.

**Anti-pattern forbidden:**
- Do NOT spin out a new memory file. Theme C's reference + Theme B's reference cover the surface.
- Do NOT skip the Epic 8 / Phase 2 retrospective triggers — they're the closure markers.

---

### Decision 14: Files likely touched (estimate, not directive)

**New:**
- `deskhive/src/lib/email-templates/payment-receipt.ts` (~50 lines)
- `deskhive/src/lib/email-templates/payment-refund.ts` (~50 lines)
- `deskhive/src/lib/email-templates/payout-summary.ts` (~40 lines)
- `deskhive/src/lib/email-templates/payment-receipt.test.ts` (~30 lines, 1 render test)
- `deskhive/src/lib/email-templates/payment-refund.test.ts` (~30 lines)
- `deskhive/src/lib/email-templates/payout-summary.test.ts` (~30 lines)

**Modified:**
- `deskhive/src/lib/email-templates/index.ts` — add 3 new exports
- `deskhive/src/lib/email.ts` — 3 new switch cases in `renderTemplate`; refined `TemplateData` shapes for 3 templates (add `appUrl`; drop `bookingCount` from `payout-summary`); refined `Subjects` (PRD §4.3 verbatim); added optional `idempotencyKey` arg to `sendEmail`
- `deskhive/src/lib/email.test.ts` — extension to cover the new `idempotencyKey` arg pass-through to Resend
- `deskhive/src/lib/bookings.ts` — 3 new sender helpers (`sendPaymentReceiptEmail`, `sendRefundConfirmationEmail`, `sendPayoutNotificationEmail`)
- `deskhive/src/lib/bookings.test.ts` — 3 new helper tests
- `deskhive/src/db/queries/users.ts` (or wherever user-lookup helpers live) — add tiny `getUserById` helper if not present
- `deskhive/src/actions/booking.ts` — 2 action-side email-send calls (in `confirmBookingAction` happy path + `cancelBookingAction` eligible-refund happy path)
- `deskhive/src/actions/booking.test.ts` — 2 new tests for the action-side email-send calls
- `deskhive/src/lib/payments/webhooks.ts` — 3 handler email-send calls (in `handlePaymentIntentSucceeded` + `handleChargeRefunded` + `handlePayoutPaid` success paths)
- `deskhive/src/lib/payments/webhooks.test.ts` — 6 new handler tests (3 positive + 3 negative)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Epic 8 → done after greenlight + `phase-2: in-progress → done` if that key exists; `8-4-payment-driven-emails: review → done`
- `_bmad-output/implementation-artifacts/8-4-payment-driven-emails.md` — story file (created by `*create-story 8-4`)
- Memory: `~/.claude/.../memory/reference_email_service_pattern.md` (Decision §13)
- Memory: `~/.claude/.../memory/MEMORY.md` (one-liner refresh)

**Zero changes to** (carved-out):
- `deskhive/src/lib/stripe.ts` / `stripe-service.ts` (Story 9-1)
- `deskhive/src/lib/payments/*` — the 6 Stripe sub-modules from Theme B
- `deskhive/src/app/api/stripe/webhook/route.ts` (9-5 thin shell — handler logic lives in `webhooks.ts`)
- `deskhive/src/db/schema.ts` (NO schema changes per Decision §6)
- `deskhive/drizzle/migrations/*` (no migrations)
- `deskhive/src/app/(owner)/owner/*` / `/admin/*` / UI files (no UI changes in 8-4)
- `deskhive/src/lib/toast.ts` (no new toasts)
- `deskhive/scripts/seed.ts`
- `deskhive/.env.example` (no new env vars)

---

## Architectural anti-patterns forbidden (rollup)

1. Floating-point math anywhere (CC-2 carry-forward) — `formatCents` is the lock.
2. Stripe SDK imports outside `src/lib/stripe.ts` + `src/lib/payments/*` sub-modules (CC-3).
3. Resend SDK imports outside `src/lib/email.ts` (CC-4 carry-forward from 8-1).
4. Email sends from inside database transactions (PRD §6.5).
5. Blocking the action / handler return on the email-send promise (NFR-5).
6. Returning 500 from a webhook handler on email-send failure (Decision §5).
7. Stripe receipt-URL fetching from inside webhook handlers (anti-pattern from 9-3 / 9-5 / 9-6 / 9-7 — no Stripe API calls from handlers).
8. Adding `webhook_events.email_sent_at` schema column (Decision §6 picks Resend Idempotency-Key over schema-extension).
9. Adding a retry-queue / background worker for email send failures (Phase 3).
10. New design tokens / colors / fonts for the 3 new templates (CC-8 + 8-POLISH-1 carry-forward).
11. Firing the email on the `{ idempotent: true }` / `{ deferred: true }` / `{ ok: false }` handler paths (Decision §7).
12. Mixed idempotency-key shapes between action-side and webhook-side callers (Decision §7 unifies on `'receipt-' + paymentIntentId` / `'refund-' + paymentIntentId`).
13. Booking-count field in `payout-summary` data shape (Decision §3 drop).
14. Calling real Resend from CI E2E tests (Decision §11).
15. Skipping the negative-path tests (the email-skip logic is the load-bearing safety net).
16. Bundling Phase 3 templates (payment-failed, marketing) into 8-4 — explicitly deferred.

---

## Operator prereqs (BA completes BEFORE dev-story dispatch)

- [ ] **Resend dev API key in `.env.local`** — `RESEND_API_KEY` present (already required from 8-1; reconfirm).
- [ ] **`EMAIL_FROM_ADDRESS` configured** — sandbox `onboarding@resend.dev` is fine for Phase 2 BA walk; production verified-domain sender for Phase 3.
- [ ] **`marketadteam@gmail.com` is the test recipient** — Decisions §5 + §11 + AC carry forward. Verify any prior 8-1/8-2/8-3 BA walks used this address.
- [ ] **`pnpm typecheck` + `pnpm test` + `pnpm test:e2e` baseline green on `main`** — confirms 9-7 BA-walk-fix + Epic 9 closure are stable before 8-4 dispatches.
- [ ] **Stripe `owner@deskhive.local` Connect in REAL state** (not synthetic) — same operator hazard from 9-4 → 9-7. Need at least one captured booking + one materialized payout for the BA walk to exercise all 3 email paths end-to-end.
- [ ] **`stripe listen --forward-to localhost:3000/api/stripe/webhook`** running during BA walk + `STRIPE_WEBHOOK_SECRET` swapped to CLI value + `pnpm dev` restarted (operator pattern from 9-5 / 9-6 / 9-7).
- [ ] **3 test events for BA walk** — `stripe trigger payment_intent.succeeded` + `stripe trigger charge.refunded` + `stripe trigger payout.paid` OR exercise the real flows end-to-end (book → confirm → cancel/refund → wait for payout simulation).
- [ ] **`EMAIL_TEMPLATES_DISABLED` env var unset** (or doesn't contain the 3 new template names) — strawman default; BA may toggle to test the kill-switch.
- [ ] **Optional: `EMAIL_TEST_RECORD_FILE` for any cross-cutting E2E** — JSONL sink path; the existing 8-2 infrastructure handles the recording.

---

## Forward-looking flags

- **Phase 3 templates:**
  - `payment-failed` — wires from a future `payment_intent.payment_failed` handler. No current Phase 2 consumer.
  - `payout-failed` — wires from a future `payout.failed` handler (Phase 3 lifecycle event).
  - Marketing / newsletter / drip campaigns — separate sender + opt-in infrastructure.
- **Phase 3 retry queue** — PRD NFR-5's "TBD: in-memory queue with restart-loss tolerance" upgrade. New schema (`email_send_attempts` table) + polling worker + retry-backoff.
- **Phase 3 in-app email-history** — `/account/emails` view of all transactional emails sent to the current user. Requires the retry queue's schema as a side-benefit.
- **Phase 3 multi-currency / locale-aware copy** — i18n infrastructure.
- **Phase 3 Stripe receipt-URL embed** — once a local `payments` cache table exists OR a lazy `stripe.charges.retrieve` is acceptable in the email-build path. Not 8-4 scope.
- **Phase 3 per-payout drill-down email** — list which bookings rolled into a payout. Depends on `stripe.payouts.listLineItems` + the local payouts cache (9-7 deferred).
- **Phase 3 bookingCount in `payout-summary`** — Decision §3's drop reverts once the cache lands.
- **Epic 8 + Phase 2 retrospective topics** (all 9 LOCKED into the agenda per Decision §13 — Phase 2 is the first marketplace-payments + email-integration phase; trimming reduces Phase 3 leverage):
  - The pre-scaffolded TemplateName / TemplateData / Subjects placeholder pattern from 8-1 — paid off across 8-2 / 8-3 / 8-4 as fill-in-the-blanks integration.
  - The 8-3 `notify*` fire-and-forget pattern — extended cleanly to webhook handlers in 8-4.
  - The `EMAIL_TEST_RECORD_FILE` JSONL sink — load-bearing for E2E tests across all 4 email stories.
  - The PRD §6.5 anti-pattern (no email-from-transactions) — never violated; structural compliance via fire-and-forget.
  - Cross-theme integration (Themes B + C in 8-4) — Theme C's 8-1 scaffolding designed for Theme B's webhook handlers from the start. Successful forward-design example.
  - The Resend Idempotency-Key pattern — Phase 3 carries this forward to any new email path.
  - The unified `'receipt-' + paymentIntentId` / `'refund-' + paymentIntentId` action+webhook idempotency-key shape (Decision §7) — unified-resource-id-dedup pattern for any future "fire from multiple sources" email.

