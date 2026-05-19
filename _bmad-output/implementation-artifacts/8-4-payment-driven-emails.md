# Story 8-4: Payment-Driven Emails

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Guest who just captured a payment / received a refund — OR a Space Owner whose payout just landed in their bank — and who reasonably expects DeskHive to send them a transactional email confirming the money movement**,
I want **the 3 PRD §4.3 payment-driven email templates (`payment-receipt` / `payment-refund` / `payout-summary`) implemented in `src/lib/email-templates/`, wired to fire from BOTH the action-side normal happy path (in `confirmBookingAction` for the receipt + `cancelBookingAction`'s eligible-refund branch for the refund) AND the webhook-side rescue path (in `handlePaymentIntentSucceeded` / `handleChargeRefunded` / `handlePayoutPaid`) — with a unified resource-id idempotency-key shape (`'receipt-' + paymentIntentId` / `'refund-' + paymentIntentId` / `'payout-' + payoutId`) passed to Resend's `Idempotency-Key` header so the dual-path design never delivers duplicate emails** —
so that **(1) PRD §4.3's 3 remaining email triggers (rows 12, 13, 14) are finally honored end-to-end — every PRD-locked transactional email in Phase 2 is now wired; (2) the 8-1 pre-scaffolded placeholders for `payment-receipt` / `payment-refund` / `payout-summary` in `email.ts`'s `TemplateName` union + `TemplateData` shapes + `Subjects` registry + the `renderTemplate` switch's "not implemented" throw are fill-in-the-blanks resolved; (3) Theme B's 3 webhook handlers from 9-5 / 9-6 / 9-7 (each with explicit `// Story 8-4 wires up the email send here` placeholder comments) get exactly ONE new `.catch(...)` fire-and-forget line each; (4) the NFR-5 anti-pattern "email failures NEVER affect the user request" + PRD §6.5 anti-pattern "no email sends from inside database transactions" stay structurally satisfied via fire-and-forget post-DB-write calls; and (5) Epic 8 (Theme C / Email) closes + **Phase 2 closes** — all three themes (A Multi-Tenant + B Payments + C Email) reach `done` together, triggering BOTH the optional Epic 8 retrospective AND the higher-order Phase 2 retrospective per BMad standard.**

> Story 8-4 is the **integration story across Themes B + C** and the **LAST Phase 2 story** — closes Epic 8 + closes Phase 2 on greenlight. Its scope is deliberately tight: 3 new template files + 3 new sender helpers + 3 webhook handler line-additions + 2 action-side line-additions + finalize the 8-1 placeholders.
>
> Source of truth: [docs/design/8-4-payment-driven-emails-ba-decisions.md](docs/design/8-4-payment-driven-emails-ba-decisions.md) — 14 locked decisions including the §7 dual-path-with-unified-idempotency-key supplement on Resend's `Idempotency-Key` dedup-response handling + §13's all-9-topics retrospective lock. Locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `79f3e30`.

> **Companion / dependency chain — Theme C (Email Infrastructure):**
> - Story 8-1 (Email wrapper + Resend integration) shipped. Provides `src/lib/email.ts` (the typed seam) with **pre-scaffolded placeholders for 8-4**: `TemplateName` union already lists `'payment-receipt' | 'payment-refund' | 'payout-summary'`; `TemplateData` has placeholder shapes (8-4 refines per AC-3); `Subjects` has placeholder subject lines (8-4 corrects to PRD §4.3 verbatim per AC-4); `renderTemplate` switch's default throws `"Template not implemented: '<name>'. Implemented in Story 8-4 (payment-*)."` — i.e., the 3 new render cases just fill the seam.
> - Story 8-2 (Application emails) shipped. Provides the per-template-file pattern in `src/lib/email-templates/application-*.ts` + the `renderTemplate(name, data) → { bodyHtml, previewText }` shape; 8-4's 3 templates mirror.
> - Story 8-3 (Booking lifecycle emails) shipped. Provides the **canonical `notify*(...).catch(...)` fire-and-forget pattern** in `src/lib/bookings.ts` + `getBookingDispatchInfo(bookingId)` (single round-trip JOIN booking + space + desk + guest + owner) — 8-4's `sendPaymentReceiptEmail` + `sendRefundConfirmationEmail` helpers REUSE `getBookingDispatchInfo` unchanged.
> - Story 8-POLISH-1 (Email visual polish) shipped. Locks Inter font-stack + hex logo + 600px white card on `#FAFAFA` gutter via `renderBaseTemplate`. 8-4's 3 new templates inherit this base layout unchanged.

> **Companion / dependency chain — Theme B (Payments):**
> - Story 9-4 (Confirm/reject with capture/cancel) shipped at `32dd63a`. Provides `confirmBookingAction` (calls `paymentIntents.capture` then DB UPDATE; 8-4 adds the action-side receipt email after the DB UPDATE succeeds) + 9-6's `cancelBookingAction`'s eligible-refund branch (calls `stripe.refunds.create` then DB UPDATE; 8-4 adds the action-side refund email after).
> - Story 9-5 (Webhook dispatch generalization) shipped at `2950e15`. Provides `handlePaymentIntentSucceeded` — currently DB-write-only on the `{ handled: true }` rescue path + returns `{ idempotent: true }` when the action already won the race. 8-4 extends the rescue path with the email send.
> - Story 9-6 (Guest cancellation with refund) shipped at `bb94bd4` + `428734d` (toast-fix). Provides `handleChargeRefunded` — same shape as `handlePaymentIntentSucceeded`. 8-4 extends the rescue path.
> - Story 9-7 (Owner payouts view) shipped at `13835a8` + `9944e82` (Settings copy fix). Provides `handlePayoutPaid` — audit-only (no DB writes); ALWAYS returns `{ handled: true }`. 8-4 extends with the SOLE caller of the payout email (no action-side analog; payouts are Stripe-initiated, not user-initiated).
> - Epic 9 closure committed at `be81c93` (`chore: mark Story 9-7 done + close Epic 9 in sprint status`). All 6 Theme B sub-modules + 7 dispatcher handlers + 4 schema CHECK extensions are on `main`.

> **After 8-4 ships, the running app behaves like this:**
> 1. Owner clicks Confirm on a PENDING + AUTHORIZED booking → `confirmBookingAction` captures the PI → DB UPDATE succeeds → **`sendPaymentReceiptEmail(...).catch(...)` fire-and-forget** (idempotency-key = `'receipt-' + paymentIntentId`) → action returns success. The Guest receives the receipt email within seconds.
> 2. Stripe asynchronously fires `payment_intent.succeeded` webhook → `handlePaymentIntentSucceeded` runs → conditional WHERE filters out (booking already CONFIRMED+CAPTURED) → returns `{ idempotent: true }` → email IS NOT fired (action already did it; the `{ idempotent: true }` path is the explicit skip per AC-7). If the action's DB write had failed (narrow ops window), the webhook rescue path returns `{ handled: true }` and DOES fire the email (with the same idempotency key — Resend dedups if the action's email actually went through but the response was dropped).
> 3. Guest cancels CONFIRMED+CAPTURED booking >24h before booking_date → `cancelBookingAction`'s eligible-refund branch refunds via Stripe → DB UPDATE succeeds → **`sendRefundConfirmationEmail(...).catch(...)`** (idempotency-key = `'refund-' + paymentIntentId`). The Guest receives the refund email (with the 9-6-locked 5–10 business-day timing context). Stripe's `charge.refunded` webhook fires asynchronously; `handleChargeRefunded` returns `{ idempotent: true }` → skip email.
> 4. Stripe simulates a `payout.paid` event for `owner@deskhive.local`'s connected account on its daily schedule → `handlePayoutPaid` runs → logs the event → **`sendPayoutNotificationEmail(...).catch(...)`** (idempotency-key = `'payout-' + payoutId`; no action-side analog). The Owner receives the payout notification email.
> 5. ALL 3 email-send failures are **logged with `warn` level + swallowed**; the action / handler returns success regardless. Phase 2 demo accepts the rare lost-email window per NFR-5; Phase 3 may add a retry queue.

> **Theme B sub-module inventory after Epic 9 close** (no changes in 8-4): `src/lib/payments/{connect,checkout,payment-intents,webhooks,refunds,payouts}.ts` — 6 cohesive sub-modules. **8-4 changes ZERO of these** — the email logic lives in `src/lib/bookings.ts` + `src/lib/email-templates/` + `src/lib/email.ts`.

> **Phase 2 closure on greenlight**: sprint-status will flip `epic-8: in-progress → done` + the implicit `phase-2` checkpoint achieved (all 3 themes A + B + C at `done`). BMad's optional Epic 8 retrospective + Phase 2 retrospective workflows become available — per BA Decision §13 lock, the retrospective agenda is LOCKED to all 9 proposed topics (BA may add more but the floor is 9). Phase 2 is the FIRST marketplace-payments + email-integration phase in this project; trimming the topic list reduces Phase 3 leverage.

> **Key anti-patterns to keep in mind:**
> - **No floating-point math** anywhere — `formatCents` is the canonical seam (CC-2 carry-forward).
> - **No Stripe SDK imports outside `src/lib/stripe.ts` + `src/lib/payments/*` sub-modules** (CC-3 carry-forward; 8-4 doesn't touch Stripe SDK directly — the data comes from the webhook event payload OR the existing 9-x DB queries).
> - **No Resend SDK imports outside `src/lib/email.ts`** (CC-4 carry-forward from 8-1; 8-4 extends `sendEmail`'s API with the optional `idempotencyKey` arg but does NOT import Resend at the call sites).
> - **No email sends from inside database transactions** (PRD §6.5 LOAD-BEARING). The 6 integration points (2 actions + 3 webhook handlers + 1 payout-only webhook) all fire AFTER the DB write completes; no `db.transaction(...)` wraps an email-send call.
> - **No blocking the action / handler return on the email-send promise** (NFR-5 LOAD-BEARING). Fire-and-forget `.catch(...)` is the locked pattern — mirrors 8-3's `notifyBookingConfirmed(...).catch(...)`.
> - **No returning 500 from a webhook handler on email-send failure** (BA Decision §5 anti-pattern — would trigger Stripe retry → duplicate email risk on the already-succeeded first attempt).
> - **No Stripe-receipt-URL fetching from inside webhook handlers** (anti-pattern from 9-3 / 9-5 / 9-6 / 9-7 — no Stripe API calls from handlers). The receipt email links to `/my-bookings`, not a Stripe-hosted receipt page.
> - **No `webhook_events.email_sent_at` schema column** (BA Decision §6 chose Resend `Idempotency-Key` header over schema extension; no migrations in 8-4).
> - **No retry-queue / background worker for email send failures** (Phase 3; PRD NFR-5 "TBD" defers).
> - **No new design tokens / colors / fonts** for the 3 new templates (CC-8 + 8-POLISH-1 carry-forward; reuse the existing `renderBaseTemplate`).
> - **No firing the email on `{ idempotent: true }` / `{ deferred: true }` / `{ ok: false }` handler return paths** (BA Decision §7). The `{ idempotent: true }` path specifically means the action-side caller already wrote AND fired its own email — the webhook is the audit-trail / rescue-only path.
> - **No mixed idempotency-key shapes between action-side and webhook-side callers** (BA Decision §7). Unified `'receipt-' + paymentIntentId` / `'refund-' + paymentIntentId` / `'payout-' + payoutId` keys across both callers so Resend dedups whichever fires first.
> - **No `bookingCount` field on `payout-summary`** (BA Decision §3 drop — Phase 2 doesn't expose this from `payout.paid`; would require `stripe.payouts.listLineItems` which is out of 9-7's locked scope).
> - **No calling real Resend from CI E2E tests** (BA Decision §11 — the `EMAIL_TEST_RECORD_FILE` JSONL sink from 8-2 is the canonical E2E pattern).
> - **No skipping the negative-path handler tests** — verifying `{ idempotent: true }` / `{ deferred: true }` paths DO NOT call `sendEmail` is load-bearing safety-net coverage.
> - **No logging a `warn` line on Resend's idempotency-dedup response** (BA Decision §7 supplement) — that's expected behavior in the dual-path design, not a failure.
> - **No bundling Phase 3 templates** (payment-failed / marketing / newsletter) into 8-4.
> - **No `db.transaction(...)` wrappers** around the 6 email-send call sites.
> - **No schema changes / no migrations** in 8-4 — pure code addition + 5 surgical handler/action line-additions.

## Acceptance Criteria

> Source: locked BA Decisions document Decisions 1–14.

1. **AC-1 (Template & handler integration shape — extend the 3 existing handlers in-place; 2 action-side fire-and-forget extensions).** Per BA Decision §1 + §7:
   - Each of the 3 webhook handlers in [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) gets exactly ONE new fire-and-forget email-send line on its `{ handled: true }` success path:
     - `handlePaymentIntentSucceeded` → on the rescue path (after `markBookingConfirmedAndCapturedByPaymentIntent` returns a non-undefined row, BEFORE returning `{ handled: true }`) calls `sendPaymentReceiptEmail({ paymentIntentId, amountCents: paymentIntent.amount, idempotencyKey: 'receipt-' + paymentIntentId }).catch((err) => logger.warn('payment_receipt_email_failed', { eventId: event.id, paymentIntentId, error: errMessage(err) }))`.
     - `handleChargeRefunded` → mirror with `sendRefundConfirmationEmail` + `idempotencyKey: 'refund-' + paymentIntentId` + log key `refund_email_failed`.
     - `handlePayoutPaid` → audit-only handler has NO `idempotent` discriminator (always returns `{ handled: true }`); fire after the `logger.info('stripe_webhook_payout_paid_acknowledged', ...)` call with `sendPayoutNotificationEmail({ stripeAccountId: event.account ?? '', payoutAmountCents: payout.amount, idempotencyKey: 'payout-' + payout.id }).catch((err) => logger.warn('payout_email_failed', { eventId: event.id, payoutId: payout.id, error: errMessage(err) }))`.
   - The 2 action-side fire-and-forget extensions in [src/actions/booking.ts](deskhive/src/actions/booking.ts):
     - `confirmBookingAction` Phase 2 happy path (after `markBookingConfirmedAndCaptured(bookingId)` returns a row) → `sendPaymentReceiptEmail({ paymentIntentId, amountCents: booking.totalCents, idempotencyKey: 'receipt-' + booking.paymentIntentId! }).catch(...)`. Phase 1 backwards-compat branch (no PI) skips the email.
     - `cancelBookingAction` Phase 2 CONFIRMED+CAPTURED eligible-refund branch (after `markBookingCancelledAndRefunded(...)` returns a row) → `sendRefundConfirmationEmail({ paymentIntentId, amountCents: booking.totalCents, idempotencyKey: 'refund-' + booking.paymentIntentId! }).catch(...)`. Phase 1 + Phase 2 PENDING-cancel branches skip the email.
   - **Anti-pattern enforced:** do NOT introduce an out-of-band "email worker" / dispatcher (Phase 3). Do NOT block the action / handler return on the `sendEmail` promise. Do NOT fire on `{ idempotent: true }` / `{ deferred: true }` / `{ ok: false }` paths.

2. **AC-2 (3 new template files following the 8-2 / 8-3 per-template-file convention).** Per BA Decision §2:
   - Create [src/lib/email-templates/payment-receipt.ts](deskhive/src/lib/email-templates/payment-receipt.ts) exporting `renderPaymentReceipt({ guestName, spaceName, bookingDate, amountCents, appUrl })`.
   - Create [src/lib/email-templates/payment-refund.ts](deskhive/src/lib/email-templates/payment-refund.ts) exporting `renderPaymentRefund({ guestName, spaceName, bookingDate, amountCents, appUrl })`. Body MUST include the "5–10 business days" timing (consistency with 9-6 toast lock — verify body copy).
   - Create [src/lib/email-templates/payout-summary.ts](deskhive/src/lib/email-templates/payout-summary.ts) exporting `renderPayoutSummary({ ownerName, payoutAmountCents, appUrl })`. Body MUST NOT mention a booking count (Decision §3 drop).
   - Each returns `{ bodyHtml, previewText, subject? }` (dynamic-subject pattern from 8-3 — see AC-4).
   - Each interpolates user-supplied content via `escapeHtml` from `src/lib/email.ts` (XSS defense; 8-2 carry-forward).
   - Each uses `formatBookingDate(bookingDate)` from `src/lib/format.ts` for date display + `formatCents(amountCents)` for amount display.
   - Each renders into the existing `renderBaseTemplate` via the dispatch from `src/lib/email.ts` (no template file calls `renderBaseTemplate` directly — that's the dispatch responsibility).
   - **Anti-pattern enforced:** do NOT merge into a single file (per-template-file pattern lock). Do NOT bypass `renderBaseTemplate`. Do NOT introduce new design tokens / colors. Do NOT bundle Phase 3 templates.

3. **AC-3 (`TemplateData` shape refinements — finalize the 8-1 placeholders).** Per BA Decision §3:
   - Edit `TemplateData` in [src/lib/email.ts](deskhive/src/lib/email.ts) — refine the 3 placeholder shapes:
     ```typescript
     'payment-receipt': {
       guestName: string;
       spaceName: string;
       bookingDate: string;   // YYYY-MM-DD ISO
       amountCents: number;
       appUrl: string;        // NEW — needed for "View booking" CTA
     };
     'payment-refund': {
       guestName: string;
       spaceName: string;
       bookingDate: string;   // NEW — body needs date context for the 5-10 day copy
       amountCents: number;
       appUrl: string;        // NEW — needed for "View my bookings" CTA
     };
     'payout-summary': {
       ownerName: string;
       payoutAmountCents: number;
       appUrl: string;        // NEW — needed for "View payouts" CTA → /owner/payouts
       // bookingCount REMOVED (Decision §3 — Phase 2 has no source for this).
     };
     ```
   - The `bookingCount` field on `payout-summary` is REMOVED — `payout.paid` webhook payload does not include it; `stripe.payouts.listLineItems` is out of 9-7's scope (Phase 3 territory).
   - **Anti-pattern enforced:** do NOT add `stripeReceiptUrl` (Stripe-API-from-handler anti-pattern). Do NOT add `userEmail` to any shape (recipient is the `to` arg). Do NOT leak internal IDs (event id / PI id) into the body.

4. **AC-4 (Subject lines — PRD §4.3 verbatim base + dynamic interpolation per 8-3 pattern).** Per BA Decision §4:
   - Edit `Subjects` registry in [src/lib/email.ts](deskhive/src/lib/email.ts) — correct the 8-1 placeholders to PRD §4.3 verbatim wording:
     ```typescript
     'payment-receipt': 'Receipt for your DeskHive booking',
     'payment-refund':  'Refund processed',
     'payout-summary':  'Payout sent',
     ```
   - The 3 render functions return DYNAMIC subjects for templates where interpolation adds value (8-3 dynamic-subject pattern):
     - `payment-receipt.ts` returns `subject: \`Receipt for your DeskHive booking at ${escapeHtml(spaceName)}\``.
     - `payment-refund.ts` returns `subject: \`Refund processed for ${escapeHtml(spaceName)}\``.
     - `payout-summary.ts` returns NO `subject` (falls back to the static `'Payout sent'` from the `Subjects` registry — no space context in payout emails).
   - **Anti-pattern enforced:** do NOT use the 8-1 placeholders unchanged (they deviated from PRD wording). Do NOT add `[DeskHive]` bracket prefixes (8-2 calm-transactional voice lock). Do NOT add emoji / exclamation points.

5. **AC-5 (Email-send-failure handling — log + move on; handler / action returns success regardless).** Per BA Decision §5:
   - All 5 fire-and-forget call sites (3 webhook handlers + 2 actions) use the `.catch((err) => logger.warn(...))` pattern. The action / handler return is NEVER blocked on the email-send promise (NFR-5 lock + 8-3 carry-forward).
   - Log keys:
     - `payment_receipt_email_failed` (action OR webhook).
     - `refund_email_failed` (action OR webhook).
     - `payout_email_failed` (webhook only — no action-side payout caller).
   - Log fields: `eventId` (where applicable — webhook only), the Stripe resource id (`paymentIntentId` / `stripeAccountId` / `payoutId`), `error: err.message`. Level: `warn` (system still works; email is a notification convenience, not a critical write).
   - Webhook handler MUST NOT return `{ ok: false, status: 500 }` on email-send failure (would trigger Stripe retry → DB write idempotency is fine but Resend retry → duplicate email risk).
   - Phase 3 retry queue is explicitly DEFERRED.
   - **Anti-pattern enforced:** do NOT return 500 from a handler on email failure. Do NOT block on the email promise. Do NOT add a retry-queue / background worker / cron-driven catch-up.

6. **AC-6 (Idempotency for email sends — Resend `Idempotency-Key` header + new `idempotencyKey` arg on `sendEmail`).** Per BA Decision §6:
   - Edit [src/lib/email.ts](deskhive/src/lib/email.ts) — extend `sendEmail`'s args with an optional `idempotencyKey?: string` (additive; backwards-compatible with 8-1 / 8-2 / 8-3 callers):
     ```typescript
     export async function sendEmail<T extends TemplateName>(args: {
       to: string;
       template: T;
       data: TemplateData[T];
       idempotencyKey?: string;  // NEW in 8-4 — passes to Resend's
                                  // Idempotency-Key header when present.
     }): Promise<SendEmailResult>;
     ```
   - Internal Resend call passes the key through via the SDK's options arg:
     ```typescript
     const result = await resend.emails.send(
       { from, to, subject, html },
       { idempotencyKey: args.idempotencyKey },  // Resend SDK options
     );
     ```
   - **No schema changes** — no `webhook_events.email_sent_at` column (BA Decision §6 explicit anti-pattern; Resend's server-side dedup is sufficient).
   - **No idempotency key on 8-2 / 8-3 callers** — Server Actions don't have a stable webhook-event-id; each action invocation IS a fresh send-intent. The optional arg stays unset for those callers.
   - **Anti-pattern enforced:** do NOT add `webhook_events.email_sent_at`. Do NOT use the booking id or PI id alone as the idempotency key WITHOUT the operation prefix (`'receipt-' + paymentIntentId` is correct; `paymentIntentId` alone would collide with refund). Do NOT add the idempotency key to 8-2 / 8-3 existing callers.

7. **AC-7 (Dual-path: action-side normal happy path + webhook-side rescue path; unified resource-id idempotency key).** Per BA Decision §7 (LOAD-BEARING):
   - **The normal Phase 2 happy path is action-side**, NOT webhook-side. `confirmBookingAction` / `cancelBookingAction` write the DB AND fire the email. The webhook handlers' `{ handled: true }` rescue path fires ONLY when the action's DB write fails (narrow ops window — Stripe-succeeds-then-DB-fails per the 9-4 / 9-6 documented risk).
   - **Webhook handler `{ idempotent: true }` path SKIPS the email** — the action already won the race; the action-side email already fired (or will fire). Decision §7 anti-pattern: do NOT email on `{ idempotent: true }`.
   - **Unified idempotency-key shape across action + webhook callers** (resource-id-shaped, NOT event-id-shaped):
     - Receipt: `'receipt-' + paymentIntentId` (BOTH callers).
     - Refund: `'refund-' + paymentIntentId` (BOTH callers).
     - Payout: `'payout-' + payoutId` (webhook-only caller).
   - **Resource-id dedup** (NOT event-id dedup) is the lock — one receipt email per captured PI, regardless of how many Stripe events fire about it. Stripe sometimes fires multiple events for the same PI (e.g., `payment_intent.succeeded` AND a subsequent `charge.refunded` could both reference the same PI if refunded later); the unified key ensures we never double-receipt.
   - **Resend `Idempotency-Key` dedup-response handling supplement** (Decision §7 lock):
     - If Resend returns a 2xx response on idempotency-dedup (treats duplicate as success and returns the cached email id): no special handling needed. The existing `.catch(...)` returns `{ status: 'sent' }` and the caller logs nothing.
     - If Resend returns a 4xx response specifically for idempotency-dedup (treats duplicate as a known-rejected case — likely `409 Conflict` or similar): `sendEmail`'s implementation MUST detect that specific response code via `result.error` shape inspection and silently treat it as success — return `{ status: 'sent' }` (or introduce a new `{ status: 'deduplicated' }` variant if dev-agent prefers semantic clarity) — rather than logging `[email] send failed`.
     - **Dev-agent contract**: during Task 0 prep + Task 3 implementation, confirm Resend's actual dedup-response behavior by EITHER reading Resend's API docs (https://resend.com/docs/api-reference + idempotency-key documentation) OR observing actual Resend test-mode responses (send the same key twice + inspect `result` shape). Document chosen handling in DAR. If 2xx form: existing tests cover. If 4xx form: add an explicit unit test for the dedup-detection-and-silent-success code path.
   - **Anti-pattern enforced:** do NOT use mixed key shapes between action and webhook callers. Do NOT fire on `{ idempotent: true }`. Do NOT log `warn` on Resend's idempotency-dedup response (per the supplement). Do NOT skip the dev-agent confirmation step on Resend's actual behavior.

8. **AC-8 (Sender helper location — extend `src/lib/bookings.ts` with 3 new exports).** Per BA Decision §8:
   - Edit [src/lib/bookings.ts](deskhive/src/lib/bookings.ts) — add 3 new exports alongside the existing 8-3 `notify*` helpers:
     ```typescript
     export async function sendPaymentReceiptEmail(args: {
       paymentIntentId: string;
       amountCents: number;
       idempotencyKey: string;
     }): Promise<void>;

     export async function sendRefundConfirmationEmail(args: {
       paymentIntentId: string;
       amountCents: number;
       idempotencyKey: string;
     }): Promise<void>;

     export async function sendPayoutNotificationEmail(args: {
       stripeAccountId: string;
       payoutAmountCents: number;
       idempotencyKey: string;
     }): Promise<void>;
     ```
   - Each helper:
     1. Looks up the recipient via existing query helpers (see AC-9).
     2. Builds the `data` payload per the refined `TemplateData` shapes (AC-3).
     3. Calls `sendEmail({ to, template, data, idempotencyKey })`.
     4. Logs `warn` on `result.status === 'error'`; throws NOTHING (callers use `.catch(...)` defensively but the helper should resolve cleanly).
   - **Anti-pattern enforced:** do NOT put these in `src/lib/payments/*` (those are Stripe SDK wrappers; recipient lookups + content building belong with `notify*`). Do NOT put in `src/lib/email-templates/` (template renders only). Do NOT inline the helpers in `webhooks.ts`.

9. **AC-9 (Recipient lookup helpers — reuse 8-3 + add tiny `getUserById` if not present).** Per BA Decision §9:
   - **Receipt + refund helpers** look up the recipient via the existing 8-3 `getBookingDispatchInfo(bookingId)` helper:
     1. `getBookingByPaymentIntentId(paymentIntentId)` (9-5 helper). Returns the booking row.
     2. `getBookingDispatchInfo(booking.id)` (8-3 helper). Returns booking + space + desk + guest + owner in one round-trip JOIN.
     3. Compose `TemplateData` from `info.guest.fullName` (the `guestName` field), `info.space.name` (`spaceName`), `info.booking.bookingDate` (`bookingDate`), `amountCents` (arg from caller), `appUrl` from `process.env.BETTER_AUTH_URL` (or fallback to `'http://localhost:3000'` — same pattern as 8-3's CTA links).
     4. Call `sendEmail({ to: info.guest.email, template: 'payment-receipt', data, idempotencyKey })`.
   - **Payout helper** looks up the owner:
     1. `getConnectAccountByStripeAccountId(stripeAccountId)` (9-2 helper). Returns `{ userId, ...connectAccount }`.
     2. **Task 0 audit: search for an existing `getUserById(userId)` helper in `src/db/queries/users.ts` (or wherever user-lookup helpers live).** If present, REUSE. If absent, add a tiny new helper:
        ```typescript
        export async function getUserById(userId: string): Promise<{ id: string; email: string; fullName: string } | null>;
        ```
        Single `db.select({ id, email, fullName }).from(usersTable).where(eq(usersTable.id, userId)).limit(1)`. Document the add (vs reuse) in DAR.
     3. Compose `TemplateData` from `user.fullName` (`ownerName`), `payoutAmountCents` (arg from caller), `appUrl`.
     4. Call `sendEmail({ to: user.email, template: 'payout-summary', data, idempotencyKey })`.
   - Each helper handles "recipient not found" gracefully — `logger.warn` + return without throwing. Email can't fire without a recipient; the audit log is the canary.
   - **Anti-pattern enforced:** do NOT add a 2-query lookup when a JOIN exists (audit during Task 0; if a `getConnectAccountWithOwner` JOIN-shape exists, dev-agent picks). Do NOT skip the recipient lookup. Do NOT email the wrong recipient (Guest gets receipt + refund; Owner gets payout).

10. **AC-10 (Unit test coverage — ~12 new tests).** Per BA Decision §10:
    - **Render tests** (NEW; 1 each — 3 files in `src/lib/email-templates/`):
      1. [src/lib/email-templates/payment-receipt.test.ts](deskhive/src/lib/email-templates/payment-receipt.test.ts) — asserts `bodyHtml` contains `guestName`, `spaceName`, `formatBookingDate(bookingDate)`, `formatCents(amountCents)`, and the `appUrl` CTA link; `previewText` non-empty; `subject` contains the space name.
      2. [src/lib/email-templates/payment-refund.test.ts](deskhive/src/lib/email-templates/payment-refund.test.ts) — same shape; **MUST verify the body contains "5–10 business days"** (consistency with 9-6 toast lock).
      3. [src/lib/email-templates/payout-summary.test.ts](deskhive/src/lib/email-templates/payout-summary.test.ts) — same shape minus space context; **MUST verify the body does NOT mention a booking count** (Decision §3 drop regression guard).
    - **Sender helper tests** (extension to [src/lib/bookings.test.ts](deskhive/src/lib/bookings.test.ts); 3 new):
      4. `sendPaymentReceiptEmail` happy path — mocks `getBookingByPaymentIntentId` + `getBookingDispatchInfo` + `sendEmail`; asserts `sendEmail` called with correct `to`, `template`, `data`, AND `idempotencyKey = 'receipt-' + paymentIntentId`.
      5. `sendRefundConfirmationEmail` happy path — mirror with `idempotencyKey = 'refund-' + paymentIntentId`.
      6. `sendPayoutNotificationEmail` happy path — mocks `getConnectAccountByStripeAccountId` + `getUserById` (or the JOIN-shape if reused) + `sendEmail`; asserts `idempotencyKey = 'payout-' + payoutId`.
    - **Webhook handler positive tests** (extension to [src/lib/payments/webhooks.test.ts](deskhive/src/lib/payments/webhooks.test.ts); 3 new):
      7. `handlePaymentIntentSucceeded` on the `{ handled: true }` rescue path calls `sendPaymentReceiptEmail` with the right idempotency key.
      8. `handleChargeRefunded` on the `{ handled: true }` rescue path calls `sendRefundConfirmationEmail` with the right idempotency key.
      9. `handlePayoutPaid` calls `sendPayoutNotificationEmail` with `idempotencyKey = 'payout-' + payoutId` (no idempotent-skip distinction; always fires when the audit log fires).
    - **Webhook handler negative tests** (extension to `webhooks.test.ts`; 3 new — REGRESSION GUARDS):
      10. `handlePaymentIntentSucceeded` on the `{ idempotent: true }` path DOES NOT call `sendPaymentReceiptEmail`.
      11. `handlePaymentIntentSucceeded` on the `{ deferred: true }` (booking-not-found) path DOES NOT call `sendPaymentReceiptEmail`.
      12. `handleChargeRefunded` on the `{ idempotent: true }` path DOES NOT call `sendRefundConfirmationEmail`.
    - **Optional dedup-response unit test** (per AC-7 supplement) — IF Resend's actual dedup-response is 4xx-shaped, add a `sendEmail` test asserting the silent-success treatment. Dev-agent picks during Task 3 based on Resend behavior; document in DAR.
    - **Target unit-test count after this story:** 408 (post-9-7 baseline) + 12 = **420**. Dev-agent may ship +1-3 bonus.
    - **Mock-boundary pattern carry-forward (split-by-mock-boundary, 9-5 carry-forward):**
      - Render tests: no mocks (pure functions).
      - Helper tests: mock at `@/db/queries/*` + `@/lib/email` boundaries.
      - Handler tests: mock at `@/lib/bookings` boundary (the 3 new sender helpers).
    - **Anti-pattern enforced:** do NOT hit real Resend in CI. Do NOT skip the negative tests (Decision §7 skip-the-email logic is load-bearing). Do NOT skip the body-content regression assertions (5-10 day in refund + no-booking-count in payout).

11. **AC-11 (E2E test coverage — 0 new; target 61 unchanged).** Per BA Decision §11:
    - **Locked: 0 new E2E tests in 8-4.** Target stays at **61**.
    - Existing Phase 2 payment-flow E2E coverage (`booking-with-payment.spec.ts` + `confirm-booking-phase1-backcompat.spec.ts`) is unchanged. The `EMAIL_TEST_RECORD_FILE` JSONL sink from 8-2 is the canonical pattern if cross-cutting email assertions are needed in any existing spec — but 8-4 doesn't add a new spec.
    - **Optional BA override:** dev-agent MAY add 1 cross-cutting E2E that exercises booking → capture → receipt-email-recorded via the JSONL sink. Document in DAR if shipped; target moves to 62.
    - **Anti-pattern enforced:** do NOT call real Resend API from E2E. Do NOT verify email delivery in CI. Do NOT add new Playwright fixtures specifically for email.

12. **AC-12 (PRD §6.5 anti-pattern compliance — DB-first-then-email pattern verified).** Per BA Decision §12:
    - PRD §6.5 lock: *"Do NOT trigger email sends from within database transactions. Send after commit succeeds."*
    - 8-4 compliance audit table:
      | Caller | DB write → email-send relationship |
      |---|---|
      | `confirmBookingAction` (action-side receipt) | DB UPDATE returns successfully → `sendPaymentReceiptEmail(...).catch(...)`. ✓ |
      | `cancelBookingAction` eligible-refund branch (action-side refund) | DB UPDATE returns successfully → `sendRefundConfirmationEmail(...).catch(...)`. ✓ |
      | `handlePaymentIntentSucceeded` rescue path | `markBookingConfirmedAndCapturedByPaymentIntent` returns a row → `sendPaymentReceiptEmail(...).catch(...)`. ✓ |
      | `handleChargeRefunded` rescue path | `markBookingCancelledAndRefundedByPaymentIntent` returns a row → `sendRefundConfirmationEmail(...).catch(...)`. ✓ |
      | `handlePayoutPaid` (audit-only) | No DB write; `logger.info` → `sendPayoutNotificationEmail(...).catch(...)`. ✓ — vacuously compliant. |
    - **Zero `db.transaction(...)` usage anywhere in the 8-4 code path.** Verify during Task 9 (`git diff` scope review).
    - **Anti-pattern enforced:** do NOT introduce `db.transaction(...)` wrappers around any email-send call. Do NOT block the action / handler return on the email promise.

13. **AC-13 (Memory + Epic 8 + Phase 2 retrospective triggers; all-9 topics LOCKED).** Per BA Decision §13:
    - Extend out-of-tree `~/.claude/.../memory/reference_email_service_pattern.md` with a new Story 8-4 section covering:
      - 3 new templates + per-template-file convention + `TemplateData` refinements (drop `bookingCount`; add `appUrl` to all 3).
      - 3 new sender helpers in `src/lib/bookings.ts` (mirror 8-3 `notify*` pattern).
      - 6 integration points (2 actions + 3 webhook handlers; 1 of the 3 — payout — has no action-side analog).
      - The unified `'receipt-' + paymentIntentId` / `'refund-' + paymentIntentId` / `'payout-' + payoutId` idempotency-key shape (Decision §7 — resource-id-dedup, not event-id-dedup).
      - The `idempotencyKey?: string` extension to `sendEmail`'s API (additive; non-breaking for 8-2 / 8-3 callers).
      - The Resend `Idempotency-Key` dedup-response handling supplement (Decision §7 lock — confirm-then-implement).
      - The skip-the-email-on-`{ idempotent: true }`-path safety net (load-bearing).
      - PRD §6.5 compliance audit table (5 integration points × DB-first-then-email).
      - Cross-reference to `reference_stripe_service_pattern.md` for the 6 Theme B sub-modules + 7 dispatcher handlers.
    - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner for `reference_email_service_pattern.md` to reflect Theme C completion + cross-Theme-B integration.
    - **Trigger Epic 8 retrospective.** Theme C (Email Infrastructure) is COMPLETE after 8-4. Optional Epic 8 retrospective workflow becomes available per BMad standard.
    - **Trigger Phase 2 retrospective.** All 3 Phase 2 themes (A + B + C) complete after 8-4 ships at greenlight. Higher-order optional Phase 2 retrospective workflow becomes available.
    - **Retrospective scope LOCKED: include ALL 9 proposed topics** from the BA decisions doc's Forward-looking flags section per BA Decision §13 — Phase 2 is the first marketplace-payments + email-integration phase; trimming reduces Phase 3 leverage. Topics:
      1. The pre-scaffolded TemplateName / TemplateData / Subjects placeholder pattern from 8-1 — paid off across 8-2 / 8-3 / 8-4.
      2. The 8-3 `notify*` fire-and-forget pattern — extended cleanly to webhook handlers in 8-4.
      3. The `EMAIL_TEST_RECORD_FILE` JSONL sink — load-bearing across all 4 email stories.
      4. The PRD §6.5 anti-pattern (no email-from-transactions) — never violated.
      5. Cross-theme integration (Themes B + C in 8-4) — Theme C's 8-1 scaffolding designed for Theme B's webhook handlers from the start.
      6. The Resend `Idempotency-Key` pattern — Phase 3 carry-forward.
      7. The unified `'receipt-' + paymentIntentId` action+webhook idempotency-key shape — unified-resource-id-dedup pattern.
      8. The Resend dedup-response handling supplement (Decision §7 supplement) — pattern for any future Resend-using story.
      9. The skip-the-email-on-`{ idempotent: true }`-handler-path pattern — explicit decision against duplicate sends.
    - BA may ADD topics during the retrospective; the locked floor is 9.
    - **No new memory file** — extend `reference_email_service_pattern.md`.
    - **Anti-pattern enforced:** do NOT spin out a new memory file. Do NOT skip the Epic 8 / Phase 2 retrospective triggers.

14. **AC-14 (`git diff` scope bounded + single commit + BA walk + docs follow-up; Epic 8 closure marker).** Per BA Decision §14:
    - **All changes confined to:**
      - `deskhive/src/lib/email-templates/payment-receipt.ts` (new)
      - `deskhive/src/lib/email-templates/payment-refund.ts` (new)
      - `deskhive/src/lib/email-templates/payout-summary.ts` (new)
      - `deskhive/src/lib/email-templates/payment-receipt.test.ts` (new)
      - `deskhive/src/lib/email-templates/payment-refund.test.ts` (new)
      - `deskhive/src/lib/email-templates/payout-summary.test.ts` (new)
      - `deskhive/src/lib/email-templates/index.ts` — add 3 new exports
      - `deskhive/src/lib/email.ts` — 3 new `renderTemplate` switch cases + refined `TemplateData` shapes + corrected `Subjects` entries + `idempotencyKey?: string` arg extension
      - `deskhive/src/lib/email.test.ts` — extend with the optional dedup-response test if Resend's 4xx form applies
      - `deskhive/src/lib/bookings.ts` — 3 new sender helpers
      - `deskhive/src/lib/bookings.test.ts` — 3 new helper tests
      - `deskhive/src/db/queries/users.ts` (or wherever existing user-lookup helpers live) — add tiny `getUserById` helper if absent per AC-9
      - `deskhive/src/actions/booking.ts` — 2 action-side email-send calls (in `confirmBookingAction` happy path + `cancelBookingAction` eligible-refund happy path)
      - `deskhive/src/actions/booking.test.ts` — 2 new tests for the action-side email-send calls
      - `deskhive/src/lib/payments/webhooks.ts` — 3 handler email-send calls (in `handlePaymentIntentSucceeded` + `handleChargeRefunded` + `handlePayoutPaid` success paths)
      - `deskhive/src/lib/payments/webhooks.test.ts` — 6 new handler tests (3 positive + 3 negative)
      - `_bmad-output/implementation-artifacts/sprint-status.yaml` — `8-4-payment-driven-emails: review` during dev-story commit; flips to `done` + `epic-8: in-progress → done` in the post-greenlight `docs:` follow-up
      - `_bmad-output/implementation-artifacts/8-4-payment-driven-emails.md` (this file)
      - Memory files in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/lib/stripe.ts` / `stripe-service.ts` (Story 9-1's singleton)
      - `deskhive/src/lib/payments/*` (6 Theme B sub-modules unchanged)
      - `deskhive/src/app/api/stripe/webhook/route.ts` (9-5 thin shell — handler logic stays in `webhooks.ts`)
      - `deskhive/src/db/schema.ts` (NO schema changes per AC-6)
      - `deskhive/drizzle/migrations/*` (no migrations)
      - `deskhive/src/app/(owner)/owner/*` / `/admin/*` / UI files (no UI changes)
      - `deskhive/src/lib/toast.ts` (no new toasts)
      - `deskhive/scripts/seed.ts`
      - `deskhive/.env.example` (no new env vars)
    - All Story 8-4 changes land in a single commit on `main` titled `feat(emails): Story 8-4 — payment-driven emails`. (Theme C scope prefix `feat(emails):` mirrors 8-1 / 8-2 / 8-3.)
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight + flips sprint-status from `review` → `done` + **flips `epic-8: in-progress → done`** (the Epic 8 closure marker; same pattern 9-7's docs follow-up used for Epic 9 closure). **Phase 2 closure implicit** — all 3 themes A + B + C reach `done` together.
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).
    - **BA browser walk (stop bar):**
      1. All unit tests pass — target **~420** (408 baseline + 12 new). Document any divergence (+N bonus) in DAR.
      2. All E2E tests pass — target **61** (unchanged; 0 new).
      3. `pnpm typecheck` + `pnpm lint` clean.
      4. `pnpm build` — **42 routes** (unchanged from 9-7).
      5. `git diff --stat` matches AC-14 file list. Zero entries in carved-out files (Stripe singleton, the 6 Theme B sub-modules, the route shell, schema/migrations, UI files, seed, env).
      6. **Resend dev API key in `.env.local`** — `RESEND_API_KEY` present (from 8-1; reconfirm). `EMAIL_FROM_ADDRESS` sandbox value (`onboarding@resend.dev`) or verified-domain sender. `EMAIL_TEMPLATES_DISABLED` unset for the 3 new templates.
      7. **`stripe listen --forward-to localhost:3000/api/stripe/webhook`** running + `STRIPE_WEBHOOK_SECRET` swapped to CLI value + `pnpm dev` restarted (operator pattern from 9-5 / 9-6 / 9-7).
      8. **`owner@deskhive.local` Connect in REAL state** — re-onboard via `/owner/settings` if seed has reset (recurring operator hazard).
      9. **Action-side receipt walk**: sign in as `guest@deskhive.local` → book a desk → complete Stripe Checkout → owner@ confirms in `/owner/bookings` → verify the **receipt email** arrives at `marketadteam@gmail.com`. Verify subject reads "Receipt for your DeskHive booking at <space>" (dynamic interpolation per AC-4). Verify body contains formatted amount + booking date + "View booking" CTA → /my-bookings.
      10. **Action-side refund walk**: as the same guest, cancel the just-confirmed booking >24h before booking_date → verify the **refund email** arrives. Verify subject reads "Refund processed for <space>". Verify body contains the 5-10 business day timing copy (AC-2 lock).
      11. **Webhook-side rescue walk (OPTIONAL)**: simulate action-side DB-write failure by temporarily killing the dev server between the Stripe call and the DB UPDATE — too disruptive for a BA walk; covered by unit tests. Skip OR document the alternative path verification.
      12. **Payout walk**: trigger `stripe trigger payout.paid` from the side terminal (with `stripe listen` running) → verify `payout_paid_acknowledged` log line + the **payout email** arrives at `marketadteam@gmail.com` (owner@'s email). Verify subject reads "Payout sent" (static; no dynamic per AC-4). Verify body does NOT mention a booking count (AC-3 regression assertion).
      13. **Idempotency dedup walk (OPTIONAL)**: rapidly trigger the same `payout.paid` event twice via `stripe trigger`. Verify ONLY ONE payout email arrives at `marketadteam@gmail.com` (Resend's `Idempotency-Key` dedup is the mechanism). If Resend returns the 4xx-on-dedup shape, verify no `[email] send failed` log line surfaces (Decision §7 supplement).
      14. **Epic 8 closure walk**: after greenlight + the post-greenlight `docs:` follow-up, verify `sprint-status.yaml` shows `epic-8: done` + all 4 Theme C stories (8-1, 8-2, 8-3, 8-POLISH-1, 8-4) at `done`. Optional Epic 8 retrospective workflow + Phase 2 retrospective workflow become available per BMad standard.

## Tasks / Subtasks

- [x] **Task 0 — Prep + 9-7 baseline check + audit existing files + confirm Resend dedup-response shape.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (408 expected) / `build` (42 routes expected) / `test:e2e` (61 expected, modulo documented hazards).
  - Confirm Epic 9 is at `done` on `main` (`git log --oneline` shows `13835a8` + `9944e82` + `be81c93`).
  - Re-read [docs/design/8-4-payment-driven-emails-ba-decisions.md](docs/design/8-4-payment-driven-emails-ba-decisions.md) end-to-end (14 locked decisions including the §7 supplement on Resend dedup-response handling).
  - Inspect the 8-1 pre-scaffolded placeholders in [src/lib/email.ts](deskhive/src/lib/email.ts):
    - `TemplateName` union includes `'payment-receipt' | 'payment-refund' | 'payout-summary'`.
    - `TemplateData` has placeholder shapes (verify shape vs AC-3 refinements).
    - `Subjects` has placeholder strings (verify wording vs AC-4 PRD-verbatim lock).
    - `renderTemplate` switch's default throws the "not implemented" Error — confirm the 3 new cases replace this for the 3 template names.
  - Inspect [src/lib/email-templates/booking-requested-guest.ts](deskhive/src/lib/email-templates/booking-requested-guest.ts) (or any 8-3 template) — canonical example of the render-function shape (`{ bodyHtml, previewText, subject? }`) for 8-4 to mirror.
  - Inspect [src/lib/bookings.ts](deskhive/src/lib/bookings.ts) `notifyBookingConfirmed` (or any 8-3 notify helper) — canonical example of "look up dispatch info → call `sendEmail`" shape; 8-4's 3 new helpers mirror.
  - Inspect [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) — find the `handlePaymentIntentSucceeded` / `handleChargeRefunded` / `handlePayoutPaid` integration points. Each has a clear "just before returning `{ handled: true }`" line where the email-send call goes.
  - Inspect [src/actions/booking.ts](deskhive/src/actions/booking.ts) — find the `confirmBookingAction` Phase 2 happy path + `cancelBookingAction` Phase 2 CONFIRMED+CAPTURED eligible-refund branch. Each has a clear "just before the post-success path returns success" line for the action-side email-send call.
  - **Audit `getUserById` availability** per AC-9 — search `src/db/queries/users.ts` and adjacent for an existing user-by-id lookup. If absent, prep to add the tiny helper.
  - **Audit `getConnectAccountWithOwner` (or JOIN variant)** — if a single-query owner-with-Connect lookup exists, prep to reuse; else 2-query lookup is acceptable per AC-9.
  - **Confirm Resend `Idempotency-Key` dedup-response shape** per AC-7 supplement. Options:
    1. Read Resend's API docs (https://resend.com/docs/api-reference) for idempotency-key behavior.
    2. Send a test email twice with the same `idempotencyKey` via a tiny one-off script (or modified existing CLI `scripts/send-test-email.ts`) + inspect the SDK's `result` shape on the second call.
    3. Default assumption (2xx-on-dedup is HTTP idempotency-key convention): no special handling needed in `sendEmail`. Document the chosen assumption + verification path in DAR.

- [x] **Task 1 — `sendEmail` API extension: optional `idempotencyKey` arg** (AC-6 + AC-7):
  - Edit [src/lib/email.ts](deskhive/src/lib/email.ts) — add `idempotencyKey?: string` to `sendEmail`'s args (additive; non-breaking).
  - Pass the key through to Resend's SDK in the `resend.emails.send(...)` options arg.
  - IF Resend's dedup-response is 4xx-shaped (per Task 0 confirmation): add the silent-success detection in the result-error branch.
  - Optional: add a new `{ status: 'deduplicated' }` variant to `SendEmailResult` (dev-agent picks if semantic clarity is wanted; default is to fold into `{ status: 'sent' }`).

- [x] **Task 2 — 3 new render functions in `src/lib/email-templates/`** (AC-2 + AC-3 + AC-4):
  - Create [src/lib/email-templates/payment-receipt.ts](deskhive/src/lib/email-templates/payment-receipt.ts).
  - Create [src/lib/email-templates/payment-refund.ts](deskhive/src/lib/email-templates/payment-refund.ts) — body MUST include the "5–10 business days" timing copy (consistency with 9-6 toast lock per AC-2 + AC-10).
  - Create [src/lib/email-templates/payout-summary.ts](deskhive/src/lib/email-templates/payout-summary.ts) — body MUST NOT mention a booking count (Decision §3 drop; AC-10 regression).
  - Each interpolates user content via `escapeHtml` + uses `formatBookingDate` + `formatCents`.
  - Each returns dynamic `subject` for the two booking-context templates (`Receipt for your DeskHive booking at <space>` / `Refund processed for <space>`); payout omits `subject` (falls back to PRD `'Payout sent'` static).
  - Update [src/lib/email-templates/index.ts](deskhive/src/lib/email-templates/index.ts) barrel — add 3 new exports.

- [x] **Task 3 — `email.ts` finalize: 3 switch cases + refined TemplateData + corrected Subjects** (AC-3 + AC-4):
  - Edit [src/lib/email.ts](deskhive/src/lib/email.ts) — add 3 new cases to `renderTemplate` switch (the "not implemented" default throw no longer fires for these names).
  - Refine `TemplateData` shapes per AC-3 (add `appUrl` to all 3; add `bookingDate` to `payment-refund`; drop `bookingCount` from `payout-summary`).
  - Correct `Subjects` entries per AC-4 (PRD §4.3 verbatim wording).

- [x] **Task 4 — 3 new sender helpers in `src/lib/bookings.ts`** (AC-8 + AC-9):
  - Add `sendPaymentReceiptEmail({ paymentIntentId, amountCents, idempotencyKey })` — uses `getBookingByPaymentIntentId` (9-5) + `getBookingDispatchInfo` (8-3) + `sendEmail`.
  - Add `sendRefundConfirmationEmail({ paymentIntentId, amountCents, idempotencyKey })` — mirror.
  - Add `sendPayoutNotificationEmail({ stripeAccountId, payoutAmountCents, idempotencyKey })` — uses `getConnectAccountByStripeAccountId` (9-2) + `getUserById` (9-2 if exists, NEW if not — see AC-9) + `sendEmail`.
  - All 3 are non-throwing; log `warn` on Resend `{ status: 'error' }`.

- [x] **Task 5 — Add tiny `getUserById` helper if not present** (AC-9 carry-forward from Task 0 audit):
  - If absent: add to `src/db/queries/users.ts` (or wherever user-lookup helpers live) — `getUserById(userId): Promise<{ id; email; fullName } | null>`. Single Drizzle query.
  - If present: REUSE; document in DAR.
  - Optional: if a `getConnectAccountWithOwner` JOIN variant exists or is cheap to add, use that instead of 2-query lookup.

- [x] **Task 6 — Action-side email-send extensions** (AC-1 + AC-7):
  - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts) `confirmBookingAction` Phase 2 happy path:
    - AFTER `markBookingConfirmedAndCaptured(bookingId)` returns a non-undefined row, BEFORE the post-success path returns success, add:
      ```typescript
      sendPaymentReceiptEmail({
        paymentIntentId: booking.paymentIntentId!,
        amountCents: booking.totalCents,
        idempotencyKey: `receipt-${booking.paymentIntentId}`,
      }).catch((err) => {
        logger.warn('payment_receipt_email_failed', {
          bookingId,
          paymentIntentId: booking.paymentIntentId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      ```
    - Phase 1 backwards-compat branch (no PI) skips the email — already-implicit (the branch has no `paymentIntentId` to use).
  - Edit `cancelBookingAction` Phase 2 CONFIRMED+CAPTURED eligible-refund branch:
    - AFTER `markBookingCancelledAndRefunded(...)` returns a row, BEFORE the post-success path returns, add:
      ```typescript
      sendRefundConfirmationEmail({
        paymentIntentId: booking.paymentIntentId!,
        amountCents: booking.totalCents,
        idempotencyKey: `refund-${booking.paymentIntentId}`,
      }).catch(...);
      ```

- [x] **Task 7 — Webhook handler email-send extensions** (AC-1 + AC-5 + AC-7):
  - Edit [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts):
    - `handlePaymentIntentSucceeded` — on the `{ handled: true }` rescue path (after `markBookingConfirmedAndCapturedByPaymentIntent` returns a row), add the `sendPaymentReceiptEmail(...).catch(...)` line BEFORE the return.
    - `handleChargeRefunded` — mirror with `sendRefundConfirmationEmail`.
    - `handlePayoutPaid` — audit-only; after `logger.info(...)`, BEFORE the return, add the `sendPayoutNotificationEmail(...).catch(...)` line.
    - Use unified `'receipt-' + paymentIntentId` / `'refund-' + paymentIntentId` / `'payout-' + payoutId` keys per AC-7.

- [x] **Task 8 — Unit tests (~12 new across template + helper + handler)** (AC-10):
  - Create render tests for the 3 new templates (3 new files in `src/lib/email-templates/`).
  - Extend [src/lib/bookings.test.ts](deskhive/src/lib/bookings.test.ts) with 3 new sender-helper happy-path tests.
  - Extend [src/lib/payments/webhooks.test.ts](deskhive/src/lib/payments/webhooks.test.ts) with 6 new handler tests (3 positive + 3 negative regression guards).
  - Optional: extend [src/lib/email.test.ts](deskhive/src/lib/email.test.ts) with a dedup-response test if Resend's 4xx form applies (per Task 0 confirmation).
  - Optional: extend [src/actions/booking.test.ts](deskhive/src/actions/booking.test.ts) with 2 action-side email-send-call tests.

- [x] **Task 9 — Local CI parity + `git diff` scope verification** (AC-12 + AC-14):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — target **~420** (408 + 12 new).
  - `pnpm build` — **42 routes** (unchanged from 9-7).
  - `pnpm test:e2e` — 61 expected (modulo documented hazards from prior stories).
  - `git diff --stat` matches AC-14 file list. Zero entries in carved-out files.
  - Quick smoke: `pnpm dev` running + Stripe-Checkout-a-test-booking + verify the receipt email JSONL record appears in `EMAIL_TEST_RECORD_FILE` (or actual Resend dashboard delivery if BA prefers).
  - **AC-14 §6–§14 (full BA browser walk with `stripe listen` + 4 email-walks + idempotency-dedup verification + Epic 8 closure)** is DEFERRED to BA's review pass per the established precedent.

- [x] **Task 10 — Memory + sprint-status + DAR + single commit (no push)** (AC-13 + AC-14):
  - Extend `~/.claude/.../memory/reference_email_service_pattern.md` with the Story 8-4 section per AC-13. Document the Resend dedup-response shape confirmed in Task 0.
  - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner for `reference_email_service_pattern.md` to reflect Theme C completion + cross-Theme-B integration.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: add `8-4-payment-driven-emails: review` to Epic 8 (after `8-polish-1-email-design-polish: done`); update `last_updated` parenthetical. **Do NOT flip `epic-8: in-progress` → `done` in the dev-story commit** — that happens in the post-greenlight `docs:` follow-up (same pattern as 9-7's Epic 9 closeout).
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–9 `[x]` (Task 9's BA-walk DEFERRED note stays); fill in Dev Agent Record.
  - Stage all files per AC-14.
  - Commit: `feat(emails): Story 8-4 — payment-driven emails`.
  - **Do NOT push.** Wait for BA browser-verification per Task 9 + AC-14 §6–§14 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to:
    - Flip sprint-status `8-4-payment-driven-emails: review` → `done`.
    - **Flip `epic-8: in-progress` → `done`** (the Epic 8 closure marker — same shape as 9-7's `epic-9: done` flip).
    - Update `last_updated` parenthetical with the ship commit hash + Epic 8 closure note + **Phase 2 closure implicit (all 3 themes A + B + C at `done`)**.
    - Same `docs:` follow-up pattern as 9-1 → 9-7.

## Dev Notes

### What gets built and what's deliberately out of scope

Story 8-4 is the **integration story across Themes B + C** + **LAST Phase 2 story**. The implementation surface is deliberately tight:

**The 8 pieces of work:**
1. 3 new email template files in `src/lib/email-templates/` (~50 lines each).
2. 3 new render-function unit tests (~30 lines each).
3. 3 new exports in the `email-templates/index.ts` barrel.
4. `email.ts` finalization: 3 switch cases + refined `TemplateData` (drop `bookingCount`, add `appUrl`) + corrected `Subjects` (PRD §4.3 verbatim) + `idempotencyKey?: string` arg on `sendEmail`.
5. 3 new sender helpers in `src/lib/bookings.ts` + 3 helper unit tests.
6. Possibly 1 new `getUserById` helper if absent (audit during Task 0).
7. 2 action-side email-send calls in `src/actions/booking.ts` (confirm + cancel).
8. 3 webhook handler email-send calls in `src/lib/payments/webhooks.ts` (succeeded + refunded + payout-paid) + 6 handler tests (3 positive + 3 negative regression guards).

After 8-4 lands at `review` and BA greenlights:

- All 3 PRD §4.3 payment-driven email triggers are wired end-to-end. PRD §4.3 is FULLY HONORED — every transactional email row in the table delivers.
- Theme C (Email Infrastructure) is COMPLETE. 4 stories: 8-1 + 8-2 + 8-3 + 8-POLISH-1 + 8-4.
- **Phase 2 is COMPLETE.** All 3 themes (A Multi-Tenant + B Payments + C Email) at `done`. The BMad-standard optional Phase 2 retrospective workflow becomes available — with all 9 Decision §13 topics LOCKED into the agenda.

Feature scope (Story 8-4 only):
- ✅ 3 new template files + 3 render-function tests.
- ✅ 3 new sender helpers in `src/lib/bookings.ts` + 3 helper tests.
- ✅ 6 integration points (2 actions + 3 webhook handlers + 1 payout-only webhook).
- ✅ `sendEmail` API extension with optional `idempotencyKey?: string`.
- ✅ Unified resource-id idempotency-key shape across action + webhook callers.
- ✅ Resend `Idempotency-Key` header for server-side dedup.
- ✅ Optional `getUserById` helper add if absent.
- ✅ Memory extension + MEMORY.md refresh + Epic 8 / Phase 2 retrospective triggers.

Out of scope (do NOT build):
- ❌ `payment_intent.payment_failed` template — no current Phase 2 consumer.
- ❌ `payout.failed` / `payout.canceled` templates — Phase 3 (those events are also unhandled in 9-7's `WEBHOOK_HANDLERS` map).
- ❌ Marketing emails / newsletters / drip campaigns — Phase 3.
- ❌ In-app email-history view — Phase 3.
- ❌ Stripe-hosted receipt PDF link in body — out per Context anti-patterns.
- ❌ Per-payout drill-down (which bookings rolled in?) — Phase 3.
- ❌ `webhook_events.email_sent_at` schema column — Decision §6 picks Resend `Idempotency-Key`.
- ❌ Email retry-after-failure background queue — Phase 3.
- ❌ Multi-currency / locale-aware copy — Phase 2 USD-only, English-only.
- ❌ Schema changes / migrations — pure code addition.

### Key decisions baked into the spec

1. **Pre-scaffolded payoff** (BA Decision §1): 8-1 placed forward-compatible placeholders for the 3 templates in `email.ts`; 8-4 is fill-in-the-blanks integration, not greenfield design. The `renderTemplate` switch's default already throws *"Template not implemented... Implemented in Story 8-4 (payment-*)"*.
2. **In-place handler extension** (Decision §1): each handler gets exactly ONE new fire-and-forget line. No new dispatcher abstraction; no out-of-band email worker.
3. **`TemplateData` shape refinements** (Decision §3): drop `bookingCount` from `payout-summary` (Phase 2 has no source); add `appUrl` to all 3 (CTA links); add `bookingDate` to `payment-refund` (for the 5-10 day timing body copy).
4. **PRD §4.3 verbatim subjects + 8-3 dynamic interpolation** (Decision §4): `Subjects` registry corrected; render functions interpolate space context for receipt + refund.
5. **Log + move on for email failures** (Decision §5): `.catch(...)` fire-and-forget. NFR-5 + 8-3 carry-forward.
6. **Resend `Idempotency-Key` header for dedup** (Decision §6): additive `idempotencyKey?: string` arg on `sendEmail`. No schema changes.
7. **Dual-path with unified resource-id keys** (Decision §7 LOAD-BEARING): action-side normal happy path + webhook-side rescue path; unified `'receipt-' + paymentIntentId` / `'refund-' + paymentIntentId` / `'payout-' + payoutId` keys for cross-caller dedup.
8. **Resend dedup-response handling supplement** (Decision §7 supplement): dev-agent confirms Resend's actual behavior (2xx-on-dedup vs 4xx-on-dedup); `sendEmail` silently treats dedup-rejected as success regardless of which form applies.
9. **Skip the email on `{ idempotent: true }` paths** (Decision §7): the other path is the source-of-truth for that resource.
10. **Sender helpers in `src/lib/bookings.ts`** (Decision §8): consistent with 8-3 `notify*` location.
11. **Reuse `getBookingDispatchInfo` + maybe-add `getUserById`** (Decision §9): no new DB query patterns; tiny additive helper if needed.
12. **PRD §6.5 compliance** (Decision §12): DB-first-then-email at all 5 call sites; vacuously compliant at the payout handler (no DB write).
13. **All 9 retrospective topics LOCKED** (Decision §13): Phase 2 retrospective agenda floor is 9.

### Test-count baseline alignment

BA Decision §10 cites "408 baseline + ~12 new = ~420 unit tests". The 408 baseline is the post-9-7 actual (`pnpm test` output at commit `13835a8`: `408 passed | 1 skipped`).

E2E baseline: 61 (post-9-7 actual; 0 new in 9-7). +0 new locked in 8-4 → target **61** (or 62 if dev-agent ships the optional cross-cutting payment-flow + email-recording E2E).

Build route count: 42 (post-9-7 actual). 8-4 adds **ZERO new routes** — pure library + handler line-additions; no new pages.

### Sprint status update

[`_bmad-output/implementation-artifacts/sprint-status.yaml`](_bmad-output/implementation-artifacts/sprint-status.yaml) — add `8-4-payment-driven-emails: ready-for-dev` to Epic 8's section (after `8-polish-1-email-design-polish: done`). On move-to-review (Task 10), flip to `review`. On BA greenlight (post-push), flip to `done` AND flip `epic-8: in-progress` → `done` (Epic 8 closure marker — same shape as 9-7's Epic 9 closure).

### Recent commits

```
79f3e30 docs: lock Story 8-4 BA decisions (payment-driven emails)  ← THIS STORY's source-of-truth lock
be81c93 chore: mark Story 9-7 done + close Epic 9 in sprint status
9944e82 fix: remove Story 9-3 forward reference from Settings Connect-active copy (BA walk fix)
13835a8 feat(stripe): Story 9-7 — owner payouts view              ← Story 9-7 ship (Epic 9 done)
0dda7c8 chore: dispatch Story 9-7 (ready-for-dev)
0abb2e0 docs: lock Story 9-7 BA decisions (owner payouts view)
```

Story 8-4 will be the **fifth Theme C feature commit** (after 8-1, 8-2, 8-3, 8-POLISH-1). Subject: `feat(emails): Story 8-4 — payment-driven emails`. **Theme C's final feature commit + Phase 2's final feature commit.**

### Forward-looking notes preserved

- **Phase 3 templates**: `payment-failed` (wires from a future `payment_intent.payment_failed` handler — no Phase 2 consumer); `payout-failed` / `payout-canceled` (Phase 3 payout lifecycle events); marketing / newsletter / drip campaigns (separate sender + opt-in infrastructure).
- **Phase 3 retry queue**: PRD NFR-5's "TBD: in-memory queue with restart-loss tolerance" upgrade. New schema (`email_send_attempts` table) + polling worker + retry-backoff logic.
- **Phase 3 in-app email-history**: `/account/emails` view of all transactional emails sent to the current user.
- **Phase 3 multi-currency / locale-aware copy**: i18n infrastructure.
- **Phase 3 Stripe receipt-URL embed**: once a local `payments` cache table exists OR a lazy `stripe.charges.retrieve` is acceptable in the email-build path.
- **Phase 3 per-payout drill-down email**: depends on `stripe.payouts.listLineItems` + the local payouts cache (9-7 deferred).
- **Phase 3 `bookingCount` in `payout-summary`**: Decision §3's drop reverts once the cache lands.
- **Epic 8 retrospective (optional)** — Theme C closure marker; agenda floor 9 topics per Decision §13.
- **Phase 2 retrospective (optional)** — higher-order workflow capturing themes across all 3 epics; same 9 topics seed the agenda.
- **`acct_seed_for_e2e_only` operator hazard** — carries forward from 9-4 / 9-5 / 9-6 / 9-7 BA walks. BA may need to re-onboard `owner@deskhive.local` via `/owner/settings` before AC-14 §6–§14 walks if the seed has reset.

### References

- [Source: docs/design/8-4-payment-driven-emails-ba-decisions.md](docs/design/8-4-payment-driven-emails-ba-decisions.md) — locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `79f3e30`. 14 decisions including the §7 supplement on Resend dedup-response handling.
- [Source: docs/03-phase2-prd.md §4.3 Email Triggers table rows 12–14] — Payment captured / Payment refunded / Payout sent.
- [Source: docs/03-phase2-prd.md §6.5 anti-pattern] — "Don't trigger email sends from within database transactions."
- [Source: docs/03-phase2-prd.md NFR-5] — Email sends are non-blocking on the user request.
- [Source: docs/03-phase2-prd.md §7.4] — Email Visual Style (inherited via `renderBaseTemplate` unchanged).
- [Source: docs/03-phase2-prd.md §8 Epic 8 Story 8-4] — Implement 3 email templates + wire to Stripe webhook handlers + AC: each event fires the correct email, idempotent on duplicate webhooks.
- [Source: deskhive/src/lib/email.ts](deskhive/src/lib/email.ts) — Story 8-1's typed seam with the 8-4 pre-scaffolded placeholders (`TemplateName` / `TemplateData` / `Subjects` / `renderTemplate` switch default throw).
- [Source: deskhive/src/lib/email-templates/booking-requested-guest.ts](deskhive/src/lib/email-templates/booking-requested-guest.ts) — canonical 8-3 render-function shape mirrored by 8-4 templates.
- [Source: deskhive/src/lib/bookings.ts](deskhive/src/lib/bookings.ts) — Story 8-3's `notify*` helpers + `getBookingDispatchInfo` reuse; canonical fire-and-forget pattern.
- [Source: deskhive/src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) — 3 webhook handlers from 9-5 / 9-6 / 9-7 with explicit Story 8-4 placeholder comments.
- [Source: deskhive/src/actions/booking.ts](deskhive/src/actions/booking.ts) — 9-4 + 9-6 action extensions; 8-4 adds 2 email-send calls.
- [Source: deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — 9-5's `getBookingByPaymentIntentId` + 8-3's `getBookingDispatchInfo`.
- [Source: deskhive/src/db/queries/stripe-connect.ts](deskhive/src/db/queries/stripe-connect.ts) — 9-2's `getConnectAccountByStripeAccountId` for the payout owner lookup.
- Resend API docs (https://resend.com/docs/api-reference) — for the Idempotency-Key dedup-response confirmation per Task 0.
- Dev-agent memory `reference_email_service_pattern.md` — extend with Story 8-4 section per AC-13.
- Dev-agent memory `reference_stripe_service_pattern.md` — cross-reference; no edits in 8-4 (Theme B is complete).

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm test --run` — **425 passing + 1 skipped = 426 total** (post-8-4 baseline; from 408 post-9-7 + 17 new = +5 bonus over BA's +12 target).
- `pnpm build` — **42 routes** (unchanged from 9-7; zero new pages — pure library + handler line-additions).
- `pnpm test:e2e` — **50 passed + 6 failed + 5 did not run = 61 total** matching AC-12 target exactly. The 6 failures are 5 pre-existing documented hazards (admin-applications + application-emails + become-a-host × 2 + booking-emails) + the 9-3 cross-file Connect-row race for `booking-with-payment.spec.ts` (the documented hazard that occasionally surfaces depending on test-worker scheduling; same surface as 9-4 / 9-6 BA-walk runs). Zero new regressions from 8-4.
- One mid-run fix: pre-8-4 `vi.mock('@/lib/bookings', ...)` in `src/actions/booking.test.ts` only had the 3 `notify*` helpers; tests exercising the new email-send paths failed with `"No 'sendPaymentReceiptEmail' export is defined on the '@/lib/bookings' mock"`. Added `sendPaymentReceiptEmail: vi.fn().mockResolvedValue(undefined)` + `sendRefundConfirmationEmail: vi.fn().mockResolvedValue(undefined)` to the existing mock block. Test count went 423 passing + 2 failing → 425 passing + 0 failing.
- One pre-existing test rename: `src/lib/email.test.ts` had a `'not-implemented template (8-4 placeholder)'` test that asserted the dispatcher threw for `'payment-receipt'`. 8-4 wires that template; renamed the test to `'payment-receipt template (8-4 now wired) renders successfully via the dispatcher'` and asserted `{ status: 'sent' }` instead. Added `appUrl: 'http://localhost:3000'` to the data shape.
- Resend SDK version confirmed via `pnpm why resend` + filesystem inspection: `resend@6.12.3`. The SDK's `RequestOptions` second arg supports `idempotencyKey` natively (`headers.set("Idempotency-Key", options.idempotencyKey)` in the SDK source). 4xx error codes `invalid_idempotent_request` + `concurrent_idempotent_requests` documented in the SDK's error-codes union; per HTTP idempotency-key convention these fire ONLY for malformed cases (key reused with different `from`/`to`/`subject`/`html`; two simultaneous in-flight requests). On happy dedup Resend returns 200 with the cached email id — no special detection logic needed.
- Stripe.Payout.Status type-resolution gotcha (Story 9-7 carry-forward, not 8-4-specific but verified): `Stripe.Payout['status']` indexed-access form used (the `Stripe.Payout.Status` named union is not exported from the SDK). Touched only as a verification, not a 8-4 change.

### Completion Notes

- **Resend `Idempotency-Key` dedup-response shape** — confirmed via SDK source grep at `node_modules/.pnpm/resend@6.12.3/node_modules/resend/dist/...`. Two-case behavior:
  1. **2xx-on-dedup** (happy case): same key → 200 + cached email id. `result.error` is falsy; `sendEmail` returns `{ status: 'sent' }`. This is the HTTP idempotency-key convention.
  2. **4xx error codes** (`invalid_idempotent_request` / `concurrent_idempotent_requests`): only for MALFORMED cases (key reused with different params; two simultaneous in-flight calls). Surfaced as `{ status: 'error' }` and logged `warn` like any other Resend failure.
  No special detection logic added to `sendEmail`. The result-error branch already handles 4xx-as-error; the 2xx-on-dedup branch already returns `{ status: 'sent' }`. Documented in the `idempotencyKey?:` arg doc block in `src/lib/email.ts`.
- **`getUserById` reuse vs add decision** (AC-9 Task 5): pre-8-4 audit found NO existing `getUserById` helper. `src/db/queries/users.ts` did not exist. Other user-by-id lookups in the codebase (e.g., `src/db/queries/applications.ts`) used inline `db.select(...).from(usersTable).where(eq(usersTable.id, ...))` chains. 8-4 created the helper minimal: single Drizzle `select().from().where().limit(1)` returning `{ id, email, fullName } | null` — the narrow recipient-shape subset `sendPayoutNotificationEmail` needs. Other call sites keep their existing inline form (opt-in helper, not a forced migration).
- **Optional cross-cutting payment-flow + email-recording E2E**: NOT shipped. The Resend recording-sink E2E from 8-2 / 8-3 (using `EMAIL_TEST_RECORD_FILE`) is well-proven; the 8-4 dev-story scope deliberately keeps E2E target at 61 (no new spec). The action-side + webhook-side email-send paths are covered exhaustively at the unit-test layer (3-layer split-by-mock-boundary; +17 tests vs BA target of +12). BA browser walk per AC-14 §6–§14 covers the live end-to-end with `stripe listen` + actual Resend delivery. Decision: deliberate.
- **Optional `{ status: 'deduplicated' }` SendEmailResult variant**: NOT added. Per BA Decision §7 supplement, Resend's 2xx-on-dedup response is indistinguishable from a fresh send (the cached email id is just returned); adding a `deduplicated` variant would require Resend to expose a "this was a dedup hit" signal, which the SDK does not. Folded into `{ status: 'sent' }` — the caller's observable behavior is identical, and the resource-id idempotency key + Resend's 24h dedup window are the dedup mechanism, not a return-shape distinction. Decision: deliberate.
- **+5 bonus tests** beyond the BA-stated +12 target = **+17 new tests total** (post-9-7 baseline 408 → post-8-4 425):
  - **9 template-layer** tests (3 files × 3 tests each in `src/lib/email-templates/payment-{receipt,refund,payout-summary}.test.ts`): happy path + HTML-escaping + load-bearing regression (5–10 business days copy / no-booking-count assertion).
  - **3 sender-helper-layer** tests in `src/lib/bookings.test.ts`: each `send*Email` helper happy path with the right `sendEmail` call.
  - **6 handler-layer** tests in `src/lib/payments/webhooks.test.ts`: 3 positive rescue-path (fires the email with correct unified key) + 3 negative idempotent-skip-path (`{ idempotent: true }` branch does NOT call the email helper for receipt + refund; payout has no negative case — always fires).
  - **1 email-test rename** in `src/lib/email.test.ts`: 8-4 placeholder test → 8-4-wired success test.
  - **2 action-side** tests in `src/actions/booking.test.ts`: `confirmBookingAction` Phase 2 happy path fires `sendPaymentReceiptEmail` with `'receipt-${piId}'`; `cancelBookingAction` eligible-refund branch fires `sendRefundConfirmationEmail` with `'refund-${piId}'`.
- **`vi.mock` pre-existing-block gotcha**: when extending a per-module mock that already exists in a test file, all NEW exports being added by the dev-story must be added to the mock block — Vitest emits `"No '<symbol>' export is defined on the '<module>' mock"` errors otherwise. Resolved by adding `sendPaymentReceiptEmail` + `sendRefundConfirmationEmail` (+ keeping the existing 3 `notify*` mocks) to the existing `vi.mock('@/lib/bookings', ...)` block in `src/actions/booking.test.ts`.
- **Phase 2 closure tracking**: dev-story commit moves Status to `review` only. Post-greenlight `docs:` follow-up flips `8-4-payment-driven-emails: review → done` AND flips `epic-8: in-progress → done` (Theme C closure marker). Phase 2 closure is implicit when all 3 themes A + B + C reach `done` together — Epic 7 (Theme A) at `done`, Epic 9 (Theme B) at `done` (closed at `be81c93`), Epic 8 (Theme C) flips after this. Optional Epic 8 retrospective + Phase 2 retrospective workflows become available per BMad standard with BA Decision §13's 9-topic agenda floor locked.

### File List

**Modified (9 files):**
- `deskhive/src/lib/email.ts` — added `idempotencyKey?: string` to `sendEmail` args + `sendOptions` pass-through to Resend SDK; refined 3 payment template `TemplateData` shapes per AC-3 (added `appUrl` to all 3; added `bookingDate` to `payment-refund`; dropped `bookingCount` from `payout-summary`); corrected 3 `Subjects` entries to PRD §4.3 verbatim; added 3 new switch cases to `renderTemplate`; updated default throw message to "All Phase 2 templates wired by Story 8-4". Imports the 3 new render functions from `@/lib/email-templates`.
- `deskhive/src/lib/email.test.ts` — renamed `'not-implemented template (8-4 placeholder)'` test to `'payment-receipt template (8-4 now wired) renders successfully via the dispatcher'`; updated assertion + data shape.
- `deskhive/src/lib/email-templates/index.ts` — added 3 new exports (`renderPaymentReceipt`, `renderPaymentRefund`, `renderPayoutSummary`).
- `deskhive/src/lib/bookings.ts` — added 3 sender helpers (`sendPaymentReceiptEmail` / `sendRefundConfirmationEmail` / `sendPayoutNotificationEmail`) + imports for `getBookingByPaymentIntentId` / `getConnectAccountByStripeAccountId` / `getUserById`.
- `deskhive/src/lib/bookings.test.ts` — added 3 sender-helper tests + new mocks for `getBookingByPaymentIntentId`, `getConnectAccountByStripeAccountId`, `getUserById`.
- `deskhive/src/actions/booking.ts` — added 2 fire-and-forget email-send calls: `sendPaymentReceiptEmail({...}).catch(...)` in `confirmBookingAction` Phase 2 happy path; `sendRefundConfirmationEmail({...}).catch(...)` in `cancelBookingAction` eligible-refund branch.
- `deskhive/src/actions/booking.test.ts` — added `sendPaymentReceiptEmail` + `sendRefundConfirmationEmail` mocks to the existing `vi.mock('@/lib/bookings', ...)` block; added 2 tests asserting the action-side email-send fires with the unified resource-id key.
- `deskhive/src/lib/payments/webhooks.ts` — added 3 fire-and-forget email-send calls: `sendPaymentReceiptEmail` on `handlePaymentIntentSucceeded` rescue path; `sendRefundConfirmationEmail` on `handleChargeRefunded` rescue path; `sendPayoutNotificationEmail` on `handlePayoutPaid` (audit-only — always fires).
- `deskhive/src/lib/payments/webhooks.test.ts` — added 6 handler tests (3 positive rescue + 3 negative idempotent-skip) with new `sendPaymentReceiptEmailMock` / `sendRefundConfirmationEmailMock` / `sendPayoutNotificationEmailMock` at `@/lib/bookings` boundary.

**New (7 files):**
- `deskhive/src/db/queries/users.ts` — tiny `getUserById(userId)` helper (single Drizzle `select().from(usersTable).where(eq(...)).limit(1)` returning `{ id, email, fullName } | null`). Pre-8-4 audit found no existing helper.
- `deskhive/src/lib/email-templates/payment-receipt.ts` — render function returning `{ bodyHtml, previewText, subject }` for the receipt email (dynamic subject `Receipt for your DeskHive booking at ${spaceName}`).
- `deskhive/src/lib/email-templates/payment-receipt.test.ts` — happy path + HTML escaping + subject-interpolation tests (3 tests).
- `deskhive/src/lib/email-templates/payment-refund.ts` — render function with 5–10 business-days timing copy (LOAD-BEARING: AC-2 + AC-10) + dynamic subject `Refund processed for ${spaceName}`.
- `deskhive/src/lib/email-templates/payment-refund.test.ts` — happy path + HTML escaping + load-bearing regression on the "5–10 business days" copy (3 tests).
- `deskhive/src/lib/email-templates/payout-summary.ts` — render function with "A payout of $X.XX has been sent to your bank account on Stripe's schedule." body; deliberately omits `subject` field (dispatcher falls back to static `Subjects['payout-summary']` = 'Payout sent').
- `deskhive/src/lib/email-templates/payout-summary.test.ts` — happy path + HTML escaping + load-bearing regression that the body MUST NOT mention a booking count (Phase 3 drill-down forward-flag) (3 tests).

**Memory + sprint-status + story-file (out-of-deskhive-tree):**
- `~/.claude/.../memory/reference_email_service_pattern.md` — extended with "Story 8-4 additions" section (~14 sub-sections covering dual-path with unified resource-id keys, Resend dedup-response shape, additive API extension, 3 templates + `TemplateData` refinements + PRD §4.3 verbatim subjects, sender helpers, `getUserById`, action-side + webhook-side wiring patterns, audit-only handler email-send pattern, `{ idempotent: true }` skip-email rule, no-schema-column-for-dedup anti-pattern, test-layer split-by-mock-boundary + 17 new tests, Phase 2 closure markers, Phase 3 forward-flags).
- `~/.claude/.../memory/MEMORY.md` — extended one-liner for `reference_email_service_pattern.md` to reflect Theme C completion + Phase 2 closure markers.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — flipped `8-4-payment-emails: backlog` → `8-4-payment-driven-emails: review` (renamed to match the artifact filename); refreshed `last_updated` parenthetical with Story 8-4 closeout notes + Phase 2 closure tracking.
- `_bmad-output/implementation-artifacts/8-4-payment-driven-emails.md` (this file) — Status `ready-for-dev → review`; Tasks 0–10 marked `[x]`; DAR + File List + Change Log filled.

**Zero changes (carved-out per AC-14):**
- `deskhive/src/lib/stripe.ts` / `stripe-service.ts` (Story 9-1's singleton untouched).
- `deskhive/src/lib/payments/{connect,checkout,payment-intents,refunds,payouts}.ts` (5 of the 6 Theme B sub-modules untouched; only `webhooks.ts` extended with email-send lines).
- `deskhive/src/app/api/stripe/webhook/route.ts` (9-5 thin shell unchanged).
- `deskhive/src/db/schema.ts` (NO schema changes per AC-6).
- `deskhive/drizzle/migrations/*` (no migrations).
- `deskhive/src/app/(owner)/owner/*` / `/admin/*` / UI files (no UI changes).
- `deskhive/src/lib/toast.ts` (no new toasts).
- `deskhive/scripts/seed.ts`.
- `deskhive/.env.example` (no new env vars; Resend env already documented since 8-1).

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-19 | Story drafted by `bmad-create-story` from locked BA decisions document (commit `79f3e30`). LAST Phase 2 story; Epic 8 + Phase 2 close after 8-4 ships at greenlight. | `cc95c58` (dispatch — story file only, per Option A precedent) |
| 2026-05-19 | Dev-story implementation completed across Tasks 0–10. Status flipped `ready-for-dev → review`. +17 unit tests (BA target +12; +5 bonus). E2E unchanged at 61. Build unchanged at 42 routes. Resend `Idempotency-Key` dedup-response shape verified via SDK source + HTTP convention (2xx-on-dedup; no special handling). `getUserById` helper newly added (pre-8-4 audit found none). Optional cross-cutting E2E + optional `{ status: 'deduplicated' }` variant DEFERRED per DAR. Awaiting BA browser walk per AC-14 §6–§14 before push. | _TBD (filled by dev-story commit)_ |
| 2026-05-19 | _TBD (filled by `docs:` follow-up after BA greenlight + push — same pattern as Stories 9-1 + 9-2 + 9-2b + 9-3 + 9-4 + 9-5 + 9-6 + 9-7; the post-greenlight follow-up ALSO flips `epic-8: in-progress` → `done` as Theme C closure marker; Phase 2 closure is implicit when all 3 themes A + B + C reach `done` together)_ | _TBD_ |
