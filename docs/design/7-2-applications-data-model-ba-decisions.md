# Story 7-2: Applications Data Model + Server Actions — BA Decisions

**Story:** 7-2
**Epic:** 7 — Multi-Tenant (Space Owner Role)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Tuesday, May 12, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §8 Epic 7, Story 7-2

---

## Context

Story 7-1 established the foundation: the `SPACE_OWNER` role exists in the schema, mode-switching infrastructure works, and a seed user can be flipped to SPACE_OWNER for testing. But there's no flow yet for a real user to *become* a Space Owner — they have to be promoted via direct DB write or seed script.

Story 7-2 fixes that by adding the applications data layer: a Guest can submit an application, a Super Admin can review it, and approval promotes the user's role from GUEST to SPACE_OWNER atomically.

This story is the **data + logic foundation** for the application flow. The user-facing form (Story 7-3) and the admin review UI (Story 7-4) build on top of this. No UI surface in this story — only schema, Server Actions, and a service layer.

---

## Scope

**In scope:**
- Drizzle schema: new `applications` table
- Drizzle migration: create the table with proper indexes and constraints
- Application status enum: `PENDING` / `APPROVED` / `REJECTED` (TEXT + CHECK constraint per Phase 1 pattern)
- New service module: `src/lib/applications.ts` (the seam — same pattern as `src/lib/money.ts`, `src/lib/toast.ts`)
- Three Server Actions:
  - `createApplicationAction(formData)` — Guest submits an application
  - `approveApplicationAction(applicationId)` — Super Admin approves; promotes user role from GUEST to SPACE_OWNER atomically
  - `rejectApplicationAction(applicationId, reason?)` — Super Admin rejects; user role unchanged
- Stub notification functions in the service layer (no-op for now, Epic 8 fills them in):
  - `notifyApplicationReceived(application)` — called from createApplicationAction
  - `notifyApplicationApproved(application)` — called from approveApplicationAction
  - `notifyApplicationRejected(application)` — called from rejectApplicationAction
- Unit tests for the Server Actions covering the happy paths and the security guards
- Memory entry codifying the applications service pattern

**Out of scope:**
- The Guest-facing application form UI — Story 7-3
- The `/become-a-host` landing/entry page — Story 7-3
- The admin applications list page (`/admin/applications`) — Story 7-4
- The admin application detail page (`/admin/applications/[id]`) — Story 7-4
- Any actual email sending — Epic 8
- Any UI surface in this story (the Server Actions are tested via unit tests, not E2E)
- Application editing or deletion (Phase 2 deferred — applications are submit-once; rejected users can apply again, but that's a 7-3 concern)
- Multiple applications per user — only one PENDING application per user at a time (see Decision 5)
- Backfill or seed of test applications (deferred to 7-3 when the form is wired up)
- Any admin sub-nav changes (the new "Applications" tab is added in Story 7-4)

---

## Decisions

### Decision 1: Schema — `applications` table fields

The table holds everything the Super Admin needs to review the application, plus audit fields.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT (cuid2 or nanoid per Phase 1 pattern) | PRIMARY KEY | Same id-generation strategy as other Phase 1 tables |
| user_id | TEXT | NOT NULL, FK to users.id | The applicant |
| business_name | TEXT | NOT NULL | "Acme Coworking" |
| business_address | TEXT | NOT NULL | Multi-line allowed; free text |
| tax_id | TEXT | NOT NULL | Free text; we don't validate format (different per country) |
| motivation | TEXT | NULLABLE | Optional 1000-char textarea per PRD |
| status | TEXT | NOT NULL, CHECK (status IN ('PENDING','APPROVED','REJECTED')), DEFAULT 'PENDING' | |
| rejection_reason | TEXT | NULLABLE | Set when status flips to REJECTED with a reason |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Submission time |
| reviewed_at | TIMESTAMPTZ | NULLABLE | Set when status flips to APPROVED or REJECTED |
| reviewed_by_user_id | TEXT | NULLABLE, FK to users.id | The Super Admin who reviewed |

Indexes:
- `applications_user_id_idx` on `user_id` — for "find my applications" queries from Story 7-3
- `applications_status_idx` on `status` — for the admin list page filter chips in Story 7-4
- `applications_created_at_idx` on `created_at DESC` — for the admin list page default sort

The applicant's `email` and `full_name` are NOT duplicated on the application — those come from the `users` table via the FK join. This avoids stale data if the user updates their profile later.

### Decision 2: Status is TEXT + CHECK, not pgEnum

Per Phase 1's locked architectural decision, all enums are TEXT columns with CHECK constraints. This applies to applications.status too. The migration adds the constraint; future status values (e.g., a hypothetical `WITHDRAWN` for user-initiated cancellation) can be added by dropping and re-adding the constraint, no pg-side enum surgery needed.

### Decision 3: `approveApplicationAction` does role promotion atomically

When a Super Admin approves an application, two things must happen in a single DB transaction:

1. `applications.status` → `'APPROVED'`, `reviewed_at` → NOW(), `reviewed_by_user_id` → admin.id
2. `users.role` → `'SPACE_OWNER'` for `applications.user_id`

If either fails, both roll back. This prevents a state where the application says "approved" but the user is still a GUEST, or vice versa.

Drizzle supports transactions via `db.transaction(async (tx) => { ... })`. Use that pattern.

**Edge case:** if the applicant has been deleted or is already a SPACE_OWNER somehow (race condition with manual admin action), the transaction should detect this and fail with a clear error. Don't silently double-promote or no-op.

### Decision 4: `rejectApplicationAction` does NOT change the user's role

Rejection only updates the application record:
- `applications.status` → `'REJECTED'`
- `applications.reviewed_at` → NOW()
- `applications.reviewed_by_user_id` → admin.id
- `applications.rejection_reason` → optional reason (or NULL if admin didn't provide one)

The user remains a GUEST. They can apply again later (a future story might restrict re-application timing, but this story doesn't).

### Decision 5: One PENDING application per user at a time

A user cannot have two PENDING applications. `createApplicationAction` checks: if there's already a PENDING application for this user_id, the action returns an error state (not a thrown exception, just a typed error response per `useActionState` pattern).

A user CAN have multiple historical applications if previous ones were REJECTED — they apply, get rejected, apply again. The constraint is only on PENDING.

Implementation: in `createApplicationAction`, before insert, query for existing PENDING applications by user_id. If found, return `{ error: 'PENDING_APPLICATION_EXISTS' }` typed state.

The UI (Story 7-3) will use this error to hide/replace the form with "Your application is being reviewed" state.

### Decision 6: Security guards on Server Actions

- `createApplicationAction` — must be called by an authenticated user. If user is not authenticated → return error. If user is already SPACE_OWNER → return `{ error: 'ALREADY_SPACE_OWNER' }`. If user is SUPER_ADMIN → return `{ error: 'ADMINS_CANNOT_APPLY' }`. Otherwise proceed.

- `approveApplicationAction` and `rejectApplicationAction` — must be called by SUPER_ADMIN. Reuse the existing `requireRole('SUPER_ADMIN')` pattern from Phase 1 (Story 6-2's memory). If non-admin tries to call, return error or throw FORBIDDEN — depends on whether the action might be reached by anything other than the admin UI. For defense-in-depth, return typed error so the action doesn't crash on accidental call.

### Decision 7: Service layer — `src/lib/applications.ts`

Follow the Phase 1 wrapper pattern (`src/lib/money.ts`, `src/lib/toast.ts`). The service module exports:

- Pure functions for application state transitions (no DB calls — those are in the Server Actions)
- Type definitions (`Application`, `ApplicationStatus`, `CreateApplicationInput`)
- The stub notification functions (Decision 8)
- Status guard helpers like `canTransitionTo(currentStatus, nextStatus)` if useful

The Server Actions live in `src/actions/applications.ts` (or wherever the existing actions live) and call into `src/lib/applications.ts` for pure logic.

### Decision 8: Stub notification functions (Epic 8 integration point)

`src/lib/applications.ts` exports three no-op stub functions:

```typescript
export async function notifyApplicationReceived(application: Application): Promise<void> {
  // TODO Epic 8: send email via src/lib/email.ts (Resend integration)
  // Recipient: application.user.email
  // Template: application-received
  console.log(`[stub] notifyApplicationReceived: ${application.id}`);
}

export async function notifyApplicationApproved(application: Application): Promise<void> {
  // TODO Epic 8: send "Welcome to DeskHive Hosting" email
  console.log(`[stub] notifyApplicationApproved: ${application.id}`);
}

export async function notifyApplicationRejected(application: Application): Promise<void> {
  // TODO Epic 8: send rejection email with optional rejection_reason
  console.log(`[stub] notifyApplicationRejected: ${application.id}`);
}
```

The Server Actions await these functions but don't fail if they throw (use `try/catch` and log; notifications are non-critical for the data write to succeed).

Epic 8 Story 8-2 will replace these stubs with real Resend calls. The function signatures are the contract — Epic 8 must not change them, only swap the body.

### Decision 9: Migrations are reversible

Like Story 7-1, the Drizzle migration has both up and down. The down migration drops the `applications` table cleanly. This is safe because no FKs from other tables point at applications yet (and won't in Phase 2).

### Decision 10: Memory entry codifying the applications service pattern

Amelia adds a new memory file capturing:
- The `src/lib/applications.ts` service pattern (pure logic + stubs, no DB calls)
- The `src/actions/applications.ts` Server Actions pattern (DB calls + service-layer calls + transactions for atomic role promotion)
- The PENDING-uniqueness invariant (Decision 5)
- The notification stub integration point for Epic 8 (Decision 8)
- The transaction pattern for atomic multi-table updates (Decision 3) — likely the first use of `db.transaction` in this codebase, worth codifying

Suggested file name: `reference_applications_service_and_actions.md` or similar (Amelia picks per the naming convention).

### Decision 11: No UI changes in this story

This is a backend-only story. The browser is not opened during BA verification — verification is via unit tests + DB inspection + Server Action invocation tests. No new routes, no nav changes, no header updates.

The "Become a Space Owner" entry in the user-pill dropdown is added in Story 7-3 along with the form. For now, the only way to test these Server Actions is by direct invocation (e.g., from a test file or a one-off script).

---

## Architectural anti-patterns forbidden

- **Do NOT** duplicate `email` or `full_name` on the applications table. Use FK joins to users.
- **Do NOT** allow approve/reject to be non-atomic with role promotion. Use a transaction.
- **Do NOT** create the form UI or any admin review UI. Story 7-3 / 7-4.
- **Do NOT** integrate with Resend or any email provider. Epic 8.
- **Do NOT** add a generic `transitionApplicationStatus(from, to)` helper. Keep the three Server Actions named and explicit (mirrors Phase 1 Decision #9: no generic role helpers).
- **Do NOT** allow multiple PENDING applications per user. Check before insert.
- **Do NOT** modify Story 7-1's role infrastructure. The `SPACE_OWNER` role already exists; this story just promotes users to it.
- **Do NOT** use pgEnum for the status field. TEXT + CHECK per Phase 1 architectural decision.
- **Do NOT** add `/become-a-host`, `/admin/applications`, or any other route. Routes come in 7-3 / 7-4.
- **Do NOT** import the application data into any React component or page. No UI in this story.

---

## Unit test coverage expected

After Amelia completes the dev story:

1. **createApplicationAction happy path** — Guest with full input → application row created with status=PENDING, returns success state
2. **createApplicationAction unauthenticated** — no session → returns error
3. **createApplicationAction already SPACE_OWNER** → returns `ALREADY_SPACE_OWNER` error
4. **createApplicationAction already has PENDING** → returns `PENDING_APPLICATION_EXISTS` error
5. **createApplicationAction missing required field** → returns validation error
6. **approveApplicationAction happy path** — SUPER_ADMIN approving PENDING → application.status = APPROVED, user.role = SPACE_OWNER, both in single transaction
7. **approveApplicationAction unauthorized** — non-admin caller → error
8. **approveApplicationAction non-PENDING application** — already approved/rejected → error
9. **rejectApplicationAction happy path** — SUPER_ADMIN with reason → application.status = REJECTED, rejection_reason set
10. **rejectApplicationAction without reason** — SUPER_ADMIN with no reason → application.status = REJECTED, rejection_reason = NULL
11. **rejectApplicationAction unauthorized** — non-admin → error
12. **Notification stubs are called** — verify (via spy/mock) that each Server Action calls the corresponding notification stub. Doesn't matter that they no-op; what matters is the integration point is exercised.

E2E tests are deferred to Story 7-3 when there's an actual UI to exercise.

---

## BA verification checklist (backend-only — no browser walk)

Since this is a backend-only story:

1. **Migration applies cleanly** — `pnpm db:migrate` runs without error. `applications` table exists with the expected columns, indexes, and CHECK constraint.

2. **Schema matches Decision 1** — Inspect the table via Neon dashboard or `psql` to confirm columns, types, nullability, defaults, and indexes match the BA spec.

3. **Service module exists** — `src/lib/applications.ts` exports the expected functions (types + stubs + helpers).

4. **Server Actions exist** — `src/actions/applications.ts` (or equivalent location) exports the three actions.

5. **All 12 unit tests pass** — `pnpm test` shows the new test cases green.

6. **Existing unit tests still pass** — no regressions in Phase 1 / Story 7-1 unit tests.

7. **Existing E2E tests still pass** — `pnpm test:e2e` runs clean. This story shouldn't affect any UI, but we verify.

8. **TypeScript compiles** — `pnpm typecheck` (or `pnpm build`) succeeds with no errors. New types from the applications module integrate cleanly with the existing role types from Story 7-1.

9. **Memory entry created** — Amelia confirms the new memory file is in place with the documented patterns.

10. **No new console warnings in dev** — `pnpm dev` starts cleanly, no warnings related to the new schema or Server Actions.

11. **CI baseline updated** — note the new test count (currently 177 unit + 31 E2E; this story should add ~12 unit tests, target ~189 unit / 31 E2E).

---

## Files likely touched

Estimate, not directive.

- `drizzle/schema.ts` — new `applications` table definition
- `drizzle/migrations/...` — generated migration SQL
- `src/lib/applications.ts` (new) — service layer
- `src/actions/applications.ts` (new) — Server Actions
- `src/lib/auth/...` — possibly extend if a new role-check pattern is needed (probably not — reuse existing)
- `tests/unit/applications.test.ts` (new) — unit tests for the actions + service
- Memory file in `~/.claude/.../memory/` — new pattern entry

No changes expected to:
- `src/app/layout.tsx` (no header changes)
- Any page route files (no UI)
- Seed script (no test applications seeded in this story)
- Better Auth configuration

---

## Memory note for Phase 2 continuation

This story establishes:
- The `applications` table schema and PENDING-uniqueness invariant
- The applications service module pattern (pure logic + Epic 8 stub seam)
- The atomic role-promotion transaction pattern (likely first transaction usage in the codebase)
- The naming convention for Server Action error states (`PENDING_APPLICATION_EXISTS`, `ALREADY_SPACE_OWNER`, etc.)

Story 7-3 consumes by:
- Building the form that calls `createApplicationAction`
- Reading "do I have a pending application?" state to decide what UI to show
- Adding the user-pill dropdown entry "Become a Space Owner" (only for Guests with no pending application)

Story 7-4 consumes by:
- Building the admin list page that queries applications by status
- Building the admin detail page with Approve / Reject buttons that call the actions
- Adding the new "Applications" tab to the admin sub-nav

Epic 8 Story 8-2 consumes by:
- Replacing the three notification stubs with real Resend email calls
- Keeping the function signatures unchanged

---

**End of BA decisions document.**
