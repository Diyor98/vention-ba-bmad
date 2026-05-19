# Story 8-4 BA-walk verification log

Generated 2026-05-19. Captures end-to-end evidence for closing Story 8-4 (payment-driven emails) and Epic 8 (Email infrastructure / Theme C).

## Verification status (final)

**3 of 3 email paths verified end-to-end with inbox-arrival screenshot evidence.** No remaining code-only verifications.

| Email path | Phase | Helper return | Inbox arrival at `marketadteam@gmail.com` |
|---|---|---|---|
| `payment-receipt` | B | `{ status: 'sent' }` | ✅ 9:22 PM local — "Receipt for your DeskHive booking at Space Austin" |
| `payment-refund` | C | `{ status: 'sent' }` | ✅ 9:23 PM local — "Refund processed for Space Austin" |
| `payout-summary` | E | `{ status: 'sent' }` | ✅ 9:24 PM local — "Payout sent" ($85.00 to "Owner Without Connect") |

Screenshots retained by the BA. Subject lines + timestamps captured here so the evidence trail is self-contained without requiring access to the original images.

## Context

Story 8-4 was paused mid-walk in commit `8359970` on 2026-05-19 morning because no payout emails arrived after the synthetic `payout.paid` webhook fired. Root cause was diagnosed in `7cc4ebc` and remediated through a two-direction Resend-recipient swap so each email-recipient role (GUEST for receipt + refund; OWNER for payout) could inbox-verify against the single Resend-verified address (`marketadteam@gmail.com`).

- Story 8-4 ship commit: `61dbc37`
- Paused-mid-walk note: `8359970`
- Email-gating diagnostic: `7cc4ebc`
- Phase A1 (Martin isolation): `2a961b7`
- Phase A2 (GUEST → verified): `fe9b29e`

## Why replay instead of fresh booking flows

The 8-4 dev-story commit `61dbc37` wires three email helpers to specific call sites:
- `sendPaymentReceiptEmail` ← `confirmBookingAction` (Phase 2 happy path) + `handlePaymentIntentSucceeded` rescue path
- `sendRefundConfirmationEmail` ← `cancelBookingAction` (eligible-refund branch) + `handleChargeRefunded` rescue path
- `sendPayoutNotificationEmail` ← `handlePayoutPaid` (the SOLE caller — payouts are Stripe-initiated)

A "fresh booking" walk would exercise the helper call site + the helper itself + the Resend transport. A direct helper replay exercises **the helper + the Resend transport** with the same arguments the call site would have produced. The Resend transport is the unique unknown — the call sites are statically wired and unit-tested (see `src/actions/booking.test.ts` and `src/lib/payments/webhooks.test.ts` from `61dbc37`). Replaying against the actual production payment-intent / payout IDs from today's DB state covers the new ground without UI overhead.

Earlier Resend rejection responses did NOT create dedup records (Resend stores dedup only on `2xx` responses, not on gating rejections), so replaying against the original `receipt-${piId}` / `refund-${piId}` / `payout-${payoutId}` keys exercises a fresh API call.

## Phase B — `payment-receipt` email

**Target:** booking `509543f6-41be-400f-aa32-1ffdda0c0207` (most-recent CONFIRMED + CAPTURED, $25.00, booking_date 2026-06-01).

| Field | Value |
|---|---|
| `paymentIntentId` | `pi_3TYm1ARvIpZbtPbe0b7TiHaa` |
| `amountCents` | `2500` |
| `idempotencyKey` | `receipt-pi_3TYm1ARvIpZbtPbe0b7TiHaa` |
| Recipient at send time | `marketadteam@gmail.com` (GUEST user `f18ca0c0-…` after Phase A2 swap) |
| Helper called | `sendPaymentReceiptEmail` (verbatim from `src/lib/bookings.ts:273-311`) |

**Result:** helper returned without throwing. **No `logger.warn('payment_receipt_email_send_failed', …)` line and no `console.error('[email] send failed', …)` line.** Compare to the diagnostic at `7cc4ebc` where the same code path against the same booking emitted both — those did not surface this time, so `sendEmail` took the `{ status: 'sent' }` branch.

**Inbox delivery: ✅ confirmed.** Screenshot captured at 9:22 PM local — subject `"Receipt for your DeskHive booking at Space Austin"`. End-to-end verified.

Driver script: `scripts/demo-replay-receipt.ts`.

## Phase C — `payment-refund` email

**Target:** booking `92bd9829-92ed-4360-b317-367122ffbe0e` (CANCELLED + REFUNDED, $25.00, booking_date 2026-06-23).

| Field | Value |
|---|---|
| `paymentIntentId` | `pi_3TYWSJRvIpZbtPbe1cXXP5hT` |
| `amountCents` | `2500` |
| `idempotencyKey` | `refund-pi_3TYWSJRvIpZbtPbe1cXXP5hT` |
| Recipient at send time | `marketadteam@gmail.com` (GUEST user `f18ca0c0-…` still at verified address) |
| Helper called | `sendRefundConfirmationEmail` (verbatim from `src/lib/bookings.ts:319-357`) |

**Result:** helper returned without throwing. No `logger.warn('refund_email_send_failed', …)` and no `console.error('[email] send failed', …)`. Same `{ status: 'sent' }` signal as Phase B.

**Inbox delivery: ✅ confirmed.** Screenshot captured at 9:23 PM local — subject `"Refund processed for Space Austin"`. End-to-end verified.

Driver script: `scripts/demo-replay-refund.ts`.

## Phase D — routing swap back to OWNER

After Phase C, GUEST swapped out of `marketadteam@gmail.com` (back to `guest-demo-placeholder@deskhive.local`); SPACE_OWNER swapped in.

Single script run: `pnpm tsx scripts/demo-swap-routing.ts to-owner`.

Post-swap row state (verified by the script's STEP 5):

| User ID | Email | Role |
|---|---|---|
| `6926057b-…` | `marketadteam@gmail.com` | SPACE_OWNER |
| `f18ca0c0-…` | `guest-demo-placeholder@deskhive.local` | GUEST |
| `95feadca-…` | `martin-placeholder@deskhive.local` | SPACE_OWNER (stale signup, isolated in Phase A1) |

## Phase E — `payout-summary` email

**Target:** today's actual webhook event payload — `evt_1TYphmRuteminPIyEAsRkYQN` (recorded in `webhook_events` at 2026-05-19 15:37:16 UTC, payload `account=acct_1TYPobRuteminPIy`).

| Field | Value |
|---|---|
| `stripeAccountId` | `acct_1TYPobRuteminPIy` (the demo SPACE_OWNER's Connect account) |
| `payoutAmountCents` | `8500` |
| `idempotencyKey` | `payout-po_1TYphkRuteminPIyQvXmHzWU` |
| Recipient at send time | `marketadteam@gmail.com` (SPACE_OWNER user `6926057b-…` after Phase D swap) |
| Helper called | `sendPayoutNotificationEmail` (verbatim from `src/lib/bookings.ts:369-407`) |

**Result:** helper returned without throwing. No `logger.warn('payout_email_send_failed', …)` and no `console.error('[email] send failed', …)`. `sendEmail` took the `{ status: 'sent' }` branch.

This is the SAME helper invocation the `handlePayoutPaid` webhook handler made today at 15:37:16 UTC. What changed: the recipient resolved by `getConnectAccountByStripeAccountId(event.account) → getUserById(userId) → user.email` is now `marketadteam@gmail.com` instead of `marketadteam+owner@gmail.com`. The Resend recipient gate accepts the former and rejected the latter.

**Inbox delivery: ✅ confirmed.** Screenshot captured at 9:24 PM local — subject `"Payout sent"`, body shows `$85.00` payout to `"Owner Without Connect"`. **End-to-end verified (inbox arrival confirmed).** This upgrades the original "code-verified, delivery pending" framing — Phase E now stands at the same evidence tier as B + C.

**Note on the underlying payout artifact:** `po_1TYphkRuteminPIyQvXmHzWU` itself transitioned to "Failed" status in Stripe because instant-rails routing requires a debit card the test-mode Express account doesn't have. That doesn't affect the `payout.paid` event's earlier emission or the email send — `payout.paid` fired optimistically at payout creation; `payout.failed` is a Phase 3 event (unhandled in `WEBHOOK_HANDLERS`). The audit row + the email are correct for the captured-then-failed flow.

Driver script: `scripts/demo-replay-payout.ts`.

## Handler integration — independently audit-row-verified

The Stripe webhook side of the flow is separately confirmed by the `webhook_events` row from earlier today (queried via `scripts/demo-payout-check.ts`):

```json
{
  "id": "4dc1e39c-6c8f-43a3-96df-039f5d846b75",
  "eventType": "payout.paid",
  "stripeEventId": "evt_1TYphmRuteminPIyEAsRkYQN",
  "processedAt": "2026-05-19T15:37:16.367Z",
  "connectAccount": "acct_1TYPobRuteminPIy"
}
```

This row only inserts when `dispatchWebhookEvent` returns `{ ok: true, handled: true }` — proving Stripe's signature-verified `payout.paid` event flowed through the route → signature verification → dispatcher → `handlePayoutPaid` → audit-row-insert path. The handler's email-send call (`sendPayoutNotificationEmail(...).catch(...)`) ran at that same moment; today's Phase E replay re-exercises only the email-send leg of that call.

The `payment-receipt` and `payment-refund` handler-side integrations were similarly proven during 8-4 dev-story unit tests (commit `61dbc37`) — see `src/actions/booking.test.ts` for 2 action-side tests and `src/lib/payments/webhooks.test.ts` for 6 handler tests (3 positive rescue + 3 negative idempotent-skip) all passing on `main`.

## What was NOT modified

Per the hard rules of the verification plan, ZERO code changes were made to:
- `src/lib/email.ts` (sendEmail wrapper, kill switch, Resend transport)
- `src/lib/email-templates/*.ts` (payment-receipt, payment-refund, payout-summary templates)
- `src/lib/bookings.ts` (the three sender helpers)
- `src/lib/payments/webhooks.ts` (handlers + dispatcher)
- `src/actions/booking.ts` (confirmBookingAction, cancelBookingAction email-send call sites)
- `.env.local` (Resend key, sender address)

The walk was DB-side only: 4 `users.email` UPDATEs in two swap commits.

## Reversion path

`docs/design/DEMO-EMAIL-ROUTING-NOTE.md` carries the SQL keyed by user ID to restore every demo row to its original pre-Part-A email. The swap commits (`fe9b29e`, this commit's Phase D revert) are themselves reversible by running `pnpm tsx scripts/demo-swap-routing.ts <direction>` in either direction.

## Open follow-ups (out of 8-4 scope)

1. **Verify a Resend domain.** Lifts the sandbox-sender recipient-gating + lets future demos use any recipient. Operational task, not 8-4 code work.
2. **Add `payout.failed` / `payout.canceled` handlers.** Phase 3 candidates flagged at `webhooks.ts:765`. Today's instant-rails failure surfaced the gap but doesn't impact 8-4's correctness for the success path.
3. **Surface the Resend email id from helpers.** Currently the helpers discard `result.data.id` after the send. Future-helpful for observability but no 8-4 defect — would just make this verification log unambiguous on its own without relying on absence-of-warn signals.
