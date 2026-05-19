# Demo email routing — temporary state

Applied 2026-05-19 to route two demo accounts' transactional emails to a shared inbox (`marketadteam@gmail.com`) for live-demo observation. Revert when the demo is complete.

## What changed

Two rows in the `users` table — only the `email` column. Passwords, roles, full names, and IDs unchanged. The `account` table (Better Auth credential index) was NOT touched, so logging in via the original email still works — `account.accountId` is the credential lookup key, not `users.email`.

| User ID | Before | After (plus-addressed) |
|---|---|---|
| `6926057b-7913-4f21-b385-1407d45262c0` | `owner-no-connect@deskhive.local` | `marketadteam+owner@gmail.com` |
| `f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f` | `1test@mail.com` | `marketadteam+1test@gmail.com` |

### Why plus-addressing instead of the bare address

`users.email` has a UNIQUE constraint and another row (most likely the BA's actual account) already owns `marketadteam@gmail.com`. Gmail's plus-address aliasing routes `marketadteam+anything@gmail.com` into the same inbox — same observation surface, no UNIQUE conflict, no other-row clobbering. The original spec called for a single bare address; plus-addresses preserve that intent while respecting the schema constraint.

## How to revert (post-demo)

Run via `psql` against the same `DATABASE_URL` used by the dev server, or by running `pnpm tsx scripts/demo-email-routing-revert.ts` (if you want to write the inverse helper later — for now, raw SQL is enough).

```sql
-- Revert demo accounts to their original emails.
-- Run this as a single transaction to avoid half-applied state.
BEGIN;

UPDATE users
   SET email = 'owner-no-connect@deskhive.local',
       updated_at = NOW()
 WHERE id = '6926057b-7913-4f21-b385-1407d45262c0'
   AND email = 'marketadteam+owner@gmail.com';

UPDATE users
   SET email = '1test@mail.com',
       updated_at = NOW()
 WHERE id = 'f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f'
   AND email = 'marketadteam+1test@gmail.com';

-- Verify exactly 2 rows are at the original emails after the commit.
SELECT id, email, full_name, role
  FROM users
 WHERE id IN (
   '6926057b-7913-4f21-b385-1407d45262c0',
   'f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f'
 );

COMMIT;
```

The IDs are the load-bearing match key in both `WHERE` clauses — even if a future demo session re-renames either email, the IDs stay the same and the revert remains correct.

## What NOT to revert

- Better Auth `account` rows — unchanged by the demo prep; nothing to revert.
- Passwords / roles / `full_name` — unchanged.
- Sessions, applications, bookings, payments — unchanged.

## Why we did this

`marketadteam@gmail.com` is the BA's transactional-email observation inbox throughout Phase 2. Routing the two demo accounts there means a single Gmail folder shows: owner-side payouts + booking notifications + Stripe Connect emails (for `owner-no-connect`) + guest-side booking lifecycle emails (for `1test`) — without re-onboarding the BA into 3 different inboxes during the demo. Standard live-demo posture; revert before any production-class use.
