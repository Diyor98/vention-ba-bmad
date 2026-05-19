# Demo email routing — temporary state

Demo prep for the 8-4 BA walk. Three `users.email` rows touched. Revert when the demo is complete. **Reversion SQL keyed by user ID, so the IDs are the load-bearing identifier — emails may be safely re-renamed in future sessions.**

## Final state for 8-4 walk (current — applied 2026-05-19, after Resend gating discovered)

| User ID | Final email | Role | Notes |
|---|---|---|---|
| `6926057b-7913-4f21-b385-1407d45262c0` | `marketadteam@gmail.com` | SPACE_OWNER | demo Space Owner; Connect account `acct_1TYPobRuteminPIy` (charges + payouts enabled) |
| `f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f` | `guest-demo-placeholder@deskhive.local` | GUEST | demo Guest; Resend sandbox can't deliver to this address but that's fine — guest-side emails are code-verified, not inbox-verified, in 8-4 walk |
| `95feadca-52b5-419b-8490-0cac7ea5708d` | `martin-placeholder@deskhive.local` | SPACE_OWNER | **Orphan self-signup from 2026-05-14, isolated to free the bare `marketadteam@gmail.com` address.** No Connect account, no spaces, no demo impact. Row preserved in the table for forensics. |

### Why bare `marketadteam@gmail.com` for SPACE_OWNER

Resend free-tier sandbox sender (`onboarding@resend.dev`) only delivers to the API key owner's verified email — which is `marketadteam@gmail.com`. Resend treats Gmail plus-aliases (`marketadteam+owner@gmail.com`) as DIFFERENT recipients, so the earlier Part A plus-addressing setup blocked email delivery despite Gmail collapsing the inbox. Diagnostic trail: commit `7cc4ebc` (the 8-4 email gating diagnostic) + `scripts/demo-email-probe.ts`.

## Stale signups isolated for 8-4 walk

### `95feadca-52b5-419b-8490-0cac7ea5708d` — "Martin"

- **Original email:** `marketadteam@gmail.com`
- **Renamed to:** `martin-placeholder@deskhive.local`
- **Rationale:** Self-signup created 2026-05-14 09:04 UTC, last updated 2026-05-14 09:07 UTC (so ~3 minutes of activity, then dormant). Role SPACE_OWNER but no Stripe Connect account, no spaces owned. Likely a stale test signup from 9-7 owner-payouts development that ended up holding the bare `marketadteam@gmail.com` address. Moving it aside was the only way to free that address for the demo SPACE_OWNER, who has a real working Connect account.
- **No data was deleted.** The row is preserved with all original fields except `email` (and the auto-bumped `updatedAt`). Revert SQL below restores the original email.

## How to revert (post-demo, single transaction)

```sql
-- Revert all three demo-prep email moves to their original values.
-- IDs are the load-bearing key; emails may have changed in any future
-- session, so the WHERE clauses do NOT also match on email.
BEGIN;

UPDATE users
   SET email = 'marketadteam@gmail.com',  -- Martin's original email
       updated_at = NOW()
 WHERE id = '95feadca-52b5-419b-8490-0cac7ea5708d';

UPDATE users
   SET email = 'owner-no-connect@deskhive.local',  -- demo SPACE_OWNER original
       updated_at = NOW()
 WHERE id = '6926057b-7913-4f21-b385-1407d45262c0';

UPDATE users
   SET email = '1test@mail.com',  -- demo GUEST original
       updated_at = NOW()
 WHERE id = 'f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f';

-- Verify three rows are at their original emails after the commit.
SELECT id, email, full_name, role
  FROM users
 WHERE id IN (
   '95feadca-52b5-419b-8490-0cac7ea5708d',
   '6926057b-7913-4f21-b385-1407d45262c0',
   'f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f'
 );

COMMIT;
```

The transaction is required because reverting the SPACE_OWNER away from `marketadteam@gmail.com` BEFORE reverting Martin back into it would briefly leave the address unowned mid-transaction — fine alone, but if you rebooted at that point the next reseed could pick it up. Wrap in BEGIN/COMMIT and the worry is moot.

## What NOT to revert

- Better Auth `account` rows — never touched by any of these moves; nothing to revert. Logging in with the original emails continues to work because `account.accountId` is the credential-lookup key, not `users.email`.
- Passwords, roles, `full_name` — unchanged across all three rows.
- Sessions, applications, bookings, payments, Stripe Connect rows — unchanged.

## Historical context (preserved for traceability)

### Round 1 — initial plus-addressing (commit `a1c7179`, 2026-05-19 morning)

Two demo accounts routed to Gmail plus-aliases of `marketadteam@gmail.com`:

| User ID | Round 0 (original) | Round 1 (plus-alias) |
|---|---|---|
| `6926057b-7913-4f21-b385-1407d45262c0` | `owner-no-connect@deskhive.local` | `marketadteam+owner@gmail.com` |
| `f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f` | `1test@mail.com` | `marketadteam+1test@gmail.com` |

Reasoning at the time: `users.email` is UNIQUE and `marketadteam@gmail.com` was already held by another row (Martin, as it turned out). Gmail's plus-aliasing was used as a UNIQUE-constraint workaround under the (mistaken) assumption that Resend would treat the plus-variants as the same recipient as the bare address. **It does not** — Resend's sandbox-sender recipient-gating treats plus-variants as separate addresses, so neither demo account could receive a real email under sandbox conditions.

### Round 2 — consolidate to bare address (this commit)

Discovery in `7cc4ebc` (8-4 email gating diagnostic): Resend's gating message named the verified address as `marketadteam@gmail.com`. The only way to unblock email delivery to the SPACE_OWNER demo row was to take that bare address back. Martin (the row holding it) was orphaned (no Connect, no spaces) so the move was a 3-row UPDATE rather than a code change to bypass the gating.

A future Resend domain verification (separate operational task) would lift the gating entirely and let the demo use any recipient. Until that happens, the bare-address routing here is the pragmatic answer.
