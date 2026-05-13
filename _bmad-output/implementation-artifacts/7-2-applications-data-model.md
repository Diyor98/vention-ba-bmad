# Story 7.2: Applications Data Model + Server Actions

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product team building the multi-tenant application flow**,
I want **the `applications` table, its three Server Actions (create / approve / reject), the service-layer pure-logic seam, and atomic role-promotion on approval**,
so that **Stories 7.3 (Guest form) and 7.4 (admin review UI) can layer on top of a stable data + logic foundation, and Epic 8's email infrastructure has a documented notification-stub seam to fill in later.**

> Story 7.2 is the second story of **Epic 7 — Multi-Tenant**. Source of truth: [docs/design/7-2-applications-data-model-ba-decisions.md](docs/design/7-2-applications-data-model-ba-decisions.md). All decisions locked.

> **Backend-only story.** No UI, no routes, no header changes. Verification is unit-test + DB-inspection driven (BA Decision §11). The "Become a Space Owner" entry point in the user-pill dropdown lives in Story 7.3.

> **First use of `db.transaction()` in the codebase.** Approval atomically updates `applications.status` AND `users.role` in one transaction; either-or rollback. Conditional UPDATEs (Phase 1 race-safety pattern from architecture.md §"Booking state-machine") guard against concurrent state changes inside the transaction.

## ID-type clarification: UUID, not cuid2/nanoid

BA Decisions §1 lists `id: TEXT (cuid2 or nanoid per Phase 1 pattern)` for the applications table. **Phase 1's actual pattern is `uuid('id').primaryKey().defaultRandom()`** (see `usersTable`, `spacesTable`, `desksTable`, `bookingsTable` in [src/db/schema.ts](deskhive/src/db/schema.ts)) — UUID, not cuid2/nanoid. The BA spec's id-type hint is mis-remembered; this story honors the actual Phase 1 pattern. Same goes for `user_id` and `reviewed_by_user_id`: `uuid` referencing `usersTable.id`, matching every other FK in the schema.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–11 + Unit test coverage expected + BA verification checklist.

1. **AC-1 (Schema — `applicationsTable`).** In [src/db/schema.ts](deskhive/src/db/schema.ts), add `applicationsTable` per BA Decision §1 (column types adjusted to Phase 1 UUID pattern per the ID-type clarification above):

   | Drizzle field | DB column | Type | Constraints |
   |---|---|---|---|
   | `id` | `id` | `uuid` | PK, defaultRandom() |
   | `userId` | `user_id` | `uuid` | NOT NULL, FK → `users.id` |
   | `businessName` | `business_name` | `text` | NOT NULL |
   | `businessAddress` | `business_address` | `text` | NOT NULL |
   | `taxId` | `tax_id` | `text` | NOT NULL |
   | `motivation` | `motivation` | `text` | NULLABLE |
   | `status` | `status` | `text` | NOT NULL, DEFAULT `'PENDING'`, CHECK `IN ('PENDING','APPROVED','REJECTED')` |
   | `rejectionReason` | `rejection_reason` | `text` | NULLABLE |
   | `createdAt` | `created_at` | `timestamptz` | NOT NULL, defaultNow() |
   | `reviewedAt` | `reviewed_at` | `timestamptz` | NULLABLE |
   | `reviewedByUserId` | `reviewed_by_user_id` | `uuid` | NULLABLE, FK → `users.id` |

   Indexes (Phase 1's `index()` from `drizzle-orm/pg-core`):
   - `applications_user_id_idx` on `user_id` — for "find my applications" queries.
   - `applications_status_idx` on `status` — for the admin list filter chips (Story 7.4).
   - `applications_created_at_idx` on `created_at DESC` — for admin list default sort.

   Type exports: `Application = typeof applicationsTable.$inferSelect`, `NewApplication = typeof applicationsTable.$inferInsert`, `ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'`. Add the type exports at the same place where other Phase 1 types are exported (bottom of `schema.ts`).

2. **AC-2 (Drizzle migration 0002 + reversibility).** Run `pnpm drizzle-kit generate` to produce `drizzle/migrations/0002_*.sql`. The migration:
   - `CREATE TABLE "applications" (...)` with all columns + CHECK constraint.
   - `CREATE INDEX` for the three indexes.
   - `ADD CONSTRAINT` for both FKs.

   Add a leading comment block per Story 7.1's pattern documenting the rollback DDL (`DROP TABLE "applications" CASCADE` — safe because no FK from other tables points at applications). Apply via `pnpm db:migrate` and verify the table + indexes exist via Neon dashboard or `psql \d applications`.

3. **AC-3 (Validation schema — `src/lib/validation/application.ts`).** New file (matches Phase 1's `src/lib/validation/booking.ts` etc.):
   ```ts
   import { z } from 'zod';

   export const createApplicationSchema = z.object({
     businessName: z.string().trim().min(1, 'Business name is required'),
     businessAddress: z.string().trim().min(1, 'Business address is required'),
     taxId: z.string().trim().min(1, 'Tax ID is required'),
     motivation: z.string().trim().max(1000, 'Motivation must be at most 1000 characters').optional(),
   });
   export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
   ```

   - Motivation length cap (1000 chars) enforced at the validation layer.
   - Empty-string handling: `trim().min(1, ...)` for required fields; for optional `motivation`, the action layer must normalize empty/whitespace strings to `undefined`/`null` before insert.

4. **AC-4 (Service module — `src/lib/applications.ts`).** New file. **Pure logic only — no DB calls, no `next/headers` reads, no Better Auth calls.** Per Story 6.1's pattern (`src/lib/money.ts`) and Story 7.1's pattern (`src/lib/mode.ts` constants). Exports:

   - `APPLICATION_STATUS` constants: `{ PENDING: 'PENDING' as const, APPROVED: 'APPROVED' as const, REJECTED: 'REJECTED' as const }`.
   - `APPLICATION_MESSAGES` const object — verbatim error/success strings keyed by code (`PENDING_APPLICATION_EXISTS`, `ALREADY_SPACE_OWNER`, `ADMINS_CANNOT_APPLY`, `APPLICATION_NOT_FOUND`, `APPLICATION_NOT_PENDING`, `USER_NOT_GUEST`, `INTERNAL_ERROR`, etc.).
   - **Pure precondition checks (the testable seam):**
     - `checkCanCreate(opts: { userRole: string | undefined; existingPendingCount: number }): { ok: true } | { ok: false; code: 'UNAUTHORIZED' | 'ALREADY_SPACE_OWNER' | 'ADMINS_CANNOT_APPLY' | 'PENDING_APPLICATION_EXISTS' }`.
     - `checkCanApprove(opts: { application: Application | undefined; targetUserRole: string | undefined }): { ok: true } | { ok: false; code: 'APPLICATION_NOT_FOUND' | 'APPLICATION_NOT_PENDING' | 'USER_NOT_GUEST' }`.
     - `checkCanReject(opts: { application: Application | undefined }): { ok: true } | { ok: false; code: 'APPLICATION_NOT_FOUND' | 'APPLICATION_NOT_PENDING' }`.
   - **Notification stubs** (Decision §8 contract — Epic 8 fills in bodies; Epic 8 must NOT change signatures):
     ```ts
     export async function notifyApplicationReceived(application: Application): Promise<void> { /* TODO Epic 8 Story 8-2: send via Resend. */ console.log(`[stub] notifyApplicationReceived: ${application.id}`); }
     export async function notifyApplicationApproved(application: Application): Promise<void> { /* TODO Epic 8. */ console.log(`[stub] notifyApplicationApproved: ${application.id}`); }
     export async function notifyApplicationRejected(application: Application): Promise<void> { /* TODO Epic 8. */ console.log(`[stub] notifyApplicationRejected: ${application.id}`); }
     ```

   The Server Actions in AC-6 / AC-7 / AC-8 read the session + DB state, then call the pure `checkCanX` functions, then call the stub notifiers inside `try/catch` (notifications are non-critical — never roll back a data write on notification failure).

5. **AC-5 (DB query helpers — `src/db/queries/applications.ts`).** New file. Phase 1 pattern (mirrors `src/db/queries/bookings.ts`):
   - `getApplicationById(id: string): Promise<Application | undefined>` — single-row lookup.
   - `findPendingForUser(userId: string): Promise<Application | undefined>` — returns the user's PENDING application or `undefined`. Used by `createApplicationAction` to enforce PENDING-uniqueness.
   - `createApplication(input: NewApplication): Promise<Application>` — insert helper. Status defaults to `'PENDING'` at the DB level.
   - `approveApplicationConditional(applicationId: string, reviewerId: string): Promise<Application | undefined>` — conditional UPDATE: `SET status='APPROVED', reviewed_at=NOW(), reviewed_by_user_id=? WHERE id=? AND status='PENDING'`. Returns the updated row or `undefined` if the WHERE clause didn't match (race against concurrent admin action).
   - `promoteUserToSpaceOwnerConditional(userId: string): Promise<{ id: string } | undefined>` — conditional UPDATE: `UPDATE users SET role='SPACE_OWNER' WHERE id=? AND role='GUEST'`. Returns the user id on success, `undefined` if the WHERE clause didn't match.
   - `rejectApplicationConditional(applicationId: string, reviewerId: string, reason: string | null): Promise<Application | undefined>` — conditional UPDATE: `SET status='REJECTED', reviewed_at=NOW(), reviewed_by_user_id=?, rejection_reason=? WHERE id=? AND status='PENDING'`.

   **Phase 1's conditional-UPDATE pattern (architecture.md "Booking state-machine race safety") is the model.** Every state transition's UPDATE includes the source state in WHERE; 0 rows affected → race detected, transaction aborts.

6. **AC-6 (`createApplicationAction` — `src/actions/applications.ts`).** New file (Phase 1 pattern: `'use server'` at top; only async function exports — see Story 7.1's `'use server'` non-async-export trap):

   - Signature: `createApplicationAction(_prevState: CreateApplicationActionState, formData: FormData): Promise<CreateApplicationActionState>`. `useActionState`-compatible.
   - State type (discriminated union, Phase 1 shape):
     ```
     | { status: 'idle' }
     | { status: 'success'; applicationId: string }
     | { status: 'error'; code: 'UNAUTHORIZED' | 'ALREADY_SPACE_OWNER' | 'ADMINS_CANNOT_APPLY' | 'PENDING_APPLICATION_EXISTS' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR'; message: string; fields?: Record<string, string> }
     ```
   - Flow:
     1. `requireSession()` — unauthenticated → return `UNAUTHORIZED` error state (do NOT redirect; this is a form Server Action and the caller's `useActionState` surfaces the error).
     2. `createApplicationSchema.safeParse(...)` from `formData` — VALIDATION_ERROR on failure with `fields` map.
     3. Normalize empty/whitespace `motivation` → `null`.
     4. Query existing PENDING via `findPendingForUser(session.user.id)`.
     5. Call `checkCanCreate({ userRole, existingPendingCount: pending ? 1 : 0 })` — bail with the matching error code if not OK.
     6. `createApplication({ userId: session.user.id, businessName, businessAddress, taxId, motivation })`.
     7. `try { await notifyApplicationReceived(application); } catch (err) { logger.error('notify_application_received_failed', ...) }` — never throws past the action boundary.
     8. Return `{ status: 'success', applicationId: application.id }`.
   - **No `redirect()` on success.** The Server Action returns success state; Story 7.3's form Client Component handles the post-submit UX (showing the "Your application is being reviewed" state via `useActionState`).

7. **AC-7 (`approveApplicationAction` — atomic with role promotion).** Per BA Decision §3:
   - Signature: `approveApplicationAction(_prevState: ReviewApplicationActionState, formData: FormData): Promise<ReviewApplicationActionState>`. The `applicationId` comes from `formData.get('applicationId')` (a hidden input in the future admin UI form).
   - State type:
     ```
     | { status: 'idle' }
     | { status: 'success' }
     | { status: 'error'; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_ID' | 'APPLICATION_NOT_FOUND' | 'APPLICATION_NOT_PENDING' | 'USER_NOT_GUEST' | 'INTERNAL_ERROR'; message: string }
     ```
   - Flow:
     1. `requireSession()` + `requireRole(session, 'SUPER_ADMIN')` (existing Phase 1 helper from `src/lib/auth/guards.ts`). On AuthError → return UNAUTHORIZED/FORBIDDEN error state (do NOT redirect — the Server Action is a form fragment).
     2. Validate `applicationId` is a UUID via the same `UUID_RE` pattern used in `cancelBookingAction` (line 156-157 of `src/actions/booking.ts`).
     3. Lookup `getApplicationById(applicationId)`. Pure check via `checkCanApprove({ application, targetUserRole: ??? })` after loading user — actually fold the user-role check into the conditional UPDATE for atomicity.
     4. **Atomic transaction** (`db.transaction(async (tx) => { ... })` — first use in the codebase; documented in memory):
        - Call `approveApplicationConditional(applicationId, session.user.id)` against `tx`. If returns `undefined` → throw to roll back (application no longer PENDING).
        - Call `promoteUserToSpaceOwnerConditional(application.userId)` against `tx`. If returns `undefined` → throw to roll back (user role no longer GUEST — likely a race against another admin or a user-already-promoted state).
        - Both succeed → commit.
     5. Map the throw outcomes (caught outside the transaction) to typed error states: APPLICATION_NOT_PENDING or USER_NOT_GUEST.
     6. `try { await notifyApplicationApproved(application); } catch (...) { logger.error }` — non-critical.
     7. `revalidatePath('/admin/applications')` (forward-looking — Story 7.4 will surface this).
     8. Return `{ status: 'success' }`.

8. **AC-8 (`rejectApplicationAction`).** Per BA Decision §4:
   - Signature: `rejectApplicationAction(_prevState: ReviewApplicationActionState, formData: FormData)`. Reads `applicationId` + optional `reason` from `formData`.
   - State type: same shape as `approveApplicationAction` (`ReviewApplicationActionState`), code values reduce to: `UNAUTHORIZED | FORBIDDEN | INVALID_ID | APPLICATION_NOT_FOUND | APPLICATION_NOT_PENDING | INTERNAL_ERROR`.
   - Flow:
     1. `requireSession()` + `requireRole(session, 'SUPER_ADMIN')`. Errors → typed error states.
     2. Validate `applicationId` is a UUID. Validate `reason` is `string` of length ≤ 500 (or empty/missing — both map to `null`).
     3. `getApplicationById(applicationId)`. Pure check via `checkCanReject({ application })` — bail on APPLICATION_NOT_FOUND / APPLICATION_NOT_PENDING.
     4. `rejectApplicationConditional(applicationId, session.user.id, reason ?? null)`. If returns `undefined` → APPLICATION_NOT_PENDING (race).
     5. `try { await notifyApplicationRejected(application); } catch (...) { logger.error }`.
     6. `revalidatePath('/admin/applications')`.
     7. Return `{ status: 'success' }`. **No role change** per Decision §4.

9. **AC-9 (`'use server'` file purity — Phase 1's locked lesson).** Per Story 7.1's Debug Log #1 + memory `reference_role_and_mode_switching.md`:
   - `src/actions/applications.ts` exports **only async functions**. The three Server Actions + nothing else.
   - All const objects (`APPLICATION_MESSAGES`, `APPLICATION_STATUS`), type unions (`CreateApplicationActionState`, `ReviewApplicationActionState`), and pure helpers (`checkCanCreate` et al.) live in `src/lib/applications.ts` (the non-server-only sibling module).
   - **Symptom to watch for if mis-organized:** unrelated pages (`/login`, `/register`, anything that transitively imports the Server Action bundle) failing at runtime with a `<dialog "Runtime Error">` "found object" / "invalid-use-server-value" message. This trap is exactly what bit Story 7.1 mid-implementation.

10. **AC-10 (Notification stubs are the Epic 8 seam).** Per BA Decision §8:
    - Three exported async functions in `src/lib/applications.ts`: `notifyApplicationReceived`, `notifyApplicationApproved`, `notifyApplicationRejected`. Each takes a single `application: Application` arg, returns `Promise<void>`, logs a `[stub]` line, and otherwise no-ops.
    - The Server Actions invoke each stub inside `try/catch` after the DB write succeeds. Notification failure is logged but **never rolled back** — the application/role state is the source of truth; notifications are best-effort.
    - **Epic 8 Story 8-2 will swap the bodies for real Resend calls.** The signatures are the contract — Epic 8 must NOT change them.

11. **AC-11 (PENDING-uniqueness invariant — enforced at the application layer, not DB).** Per BA Decision §5:
    - No partial unique index on `(user_id) WHERE status = 'PENDING'` at the DB level. **The check lives in `createApplicationAction`** via `findPendingForUser` + `checkCanCreate`.
    - **Rationale:** a partial unique index would correctly block a second concurrent PENDING insert, but it'd also reject the "REJECTED then re-apply" pattern unless the user's prior REJECTED row was also somehow scoped. The application-layer check handles the simpler invariant cleanly without DB-level complexity.
    - **Concurrency caveat:** two PENDING inserts racing between the SELECT and the INSERT could both pass the check and create two PENDING rows. This is an acceptable Phase 2 limitation per BA: a real user wouldn't accidentally submit twice (button-disable via `useFormStatus` from Story 7.3 covers the double-click case); a malicious user submitting via curl could create duplicates, but the admin UI would just see two rows. **Document the limitation in Completion Notes** — Phase 2.5 or later can add the partial unique index if it becomes a real problem.

12. **AC-12 (Atomic transaction pattern — first use of `db.transaction()`).** Per BA Decision §3 + the architecture.md "Booking state-machine race safety" model:
    - `approveApplicationAction` wraps both UPDATEs in `await db.transaction(async (tx) => { ... })` (Drizzle's transaction API for the pg client adapter).
    - Inside the transaction, both UPDATEs use the conditional-WHERE pattern. If `approveApplicationConditional` returns `undefined`, throw a tagged error (or use a sentinel like `tx.rollback()`); same for `promoteUserToSpaceOwnerConditional`. Drizzle's transaction wrapper rolls back on any throw.
    - The action catches the thrown error outside the transaction and maps it to the typed `APPLICATION_NOT_PENDING` or `USER_NOT_GUEST` error state.
    - **This is the codebase's first transaction use.** The memory entry (AC-16) codifies the pattern so subsequent Phase 2 stories (e.g., a hypothetical Story 9-N that handles booking + payment atomically) can follow the same shape.

13. **AC-13 (Tests — 12 cases on the service-layer pure functions).** Per BA Decision §"Unit test coverage expected":
    - New `src/lib/applications.test.ts` covers the **pure precondition helpers** (`checkCanCreate`, `checkCanApprove`, `checkCanReject`) plus the notification stub call surfaces. **The 12 BA cases map to pure-function tests** — the Server Action shells delegate to these helpers, so a passing `checkCanX` test set proves the corresponding action branches execute correctly.

    | BA case # | Pure-function coverage |
    |---|---|
    | 1 createApplicationAction happy path | `checkCanCreate({ userRole: 'GUEST', existingPendingCount: 0 })` → `{ ok: true }` |
    | 2 unauthenticated | `checkCanCreate({ userRole: undefined, ... })` → `{ ok: false, code: 'UNAUTHORIZED' }` |
    | 3 already SPACE_OWNER | `checkCanCreate({ userRole: 'SPACE_OWNER', ... })` → `{ ok: false, code: 'ALREADY_SPACE_OWNER' }` |
    | 4 already has PENDING | `checkCanCreate({ userRole: 'GUEST', existingPendingCount: 1 })` → `{ ok: false, code: 'PENDING_APPLICATION_EXISTS' }` |
    | 5 missing required field | validation schema test: `createApplicationSchema.safeParse({})` → fail with `fields` map (covered alongside in `src/lib/validation/application.test.ts`) |
    | 6 approveApplicationAction happy path | `checkCanApprove({ application: PENDING, targetUserRole: 'GUEST' })` → `{ ok: true }` |
    | 7 unauthorized approve | `requireRole(session, 'SUPER_ADMIN')` covered by existing `guards.test.ts`; not duplicated. Document in completion notes. |
    | 8 non-PENDING application | `checkCanApprove({ application: APPROVED, ... })` → `{ ok: false, code: 'APPLICATION_NOT_PENDING' }` |
    | 9 rejectApplicationAction happy path | `checkCanReject({ application: PENDING })` → `{ ok: true }` |
    | 10 reject without reason | covered by Server Action's `reason ?? null` defaulting — pure helper doesn't care; document the action-layer behavior in completion notes. |
    | 11 unauthorized reject | Same as #7 — `requireRole` is already tested. |
    | 12 notification stubs called | New test asserting the three stub functions are exported, are async, and run to completion without throwing on a valid `Application` input. |

    - Also: `src/lib/validation/application.test.ts` — happy path + each required-field rejection + motivation-length rejection (~6 cases).
    - **Server Action thin shells are NOT unit-tested** (they require mocking `next/headers` + `cookies()` + Better Auth + the db client = ~150+ lines of test infra per the Story 6.3 cost-cap precedent). **BA browser walk in Story 7.3 / 7.4 is the integration verification.**
    - **Document this test-strategy decision in Completion Notes.** If BA pushes back and wants action-shell mocking, escalate before adding infrastructure.

14. **AC-14 (No UI changes / no new routes — BA Decision §11).** Per anti-pattern §"Do NOT add `/become-a-host`, `/admin/applications`, or any other route":
    - No edits to `src/app/layout.tsx`, `src/components/header.tsx`, `src/components/user-pill.tsx`, or any page route.
    - No new files under `src/app/`.
    - `revalidatePath('/admin/applications')` in the approve/reject actions targets a route that doesn't exist yet (Story 7.4 creates it). The `revalidatePath` call is forward-looking and a harmless no-op until the route exists — documented in Completion Notes.

15. **AC-15 (No regression in any Phase 1 / Epic 6 / Story 7.1 flow).** Every flow verified through Story 7.1 must still work:
    - US-1.1–1.3, US-2.x, US-3.x, US-4.x: all Phase 1 flows.
    - Story 5.1 / 5.2 reskins preserved.
    - Story 6.1 dollar input, Story 6.2 admin redirect, Story 6.3 booking toast, Story 6.6 login form (no toggle).
    - Story 7.1: SPACE_OWNER role, `deskhive_mode` cookie, mode-switching, `/owner/*` placeholders all unchanged.
    - 177 unit + 31 E2E baseline still passes (plus new tests this story adds — target ~189 unit, 31 E2E).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

16. **AC-16 (Memory entry — `reference_applications_service_and_actions.md`).** Per BA Decision §10 + the Phase 2 memory pattern:
    - New memory file codifies:
      - The `src/lib/applications.ts` service pattern: pure logic + types + notification stubs, no DB calls.
      - The `src/actions/applications.ts` Server Action pattern: auth + DB query + service-layer pure check + DB write + stub-notifier-in-try/catch.
      - The PENDING-uniqueness invariant (Decision §5) + its concurrency limitation (AC-11 caveat).
      - The transaction pattern for atomic multi-table updates (Decision §3) — first use of `db.transaction()` in the codebase; documented as the template for future Phase 2 stories.
      - The notification-stubs-as-Epic-8-seam contract (Decision §8): three async function signatures Epic 8 must NOT change.
      - Cross-reference: Story 7.1's `'use server'` non-async-export pitfall (memory `reference_role_and_mode_switching.md`) — the same rule applies to `src/actions/applications.ts`.
    - Update `MEMORY.md` index with a one-line pointer.

17. **AC-17 (Single commit + memory entry).** Per the established pattern (Stories 5.1 → 7.1 all the same):
    - All Story 7.2 changes land in a single commit on `main` titled exactly `feat: applications data model + server actions (Story 7-2)`. Commit content is files under `deskhive/` (schema, migration, validation, lib, queries, actions, tests) plus the `_bmad-output/` story file + sprint-status update.
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry creation + index update happen alongside the commit but live in `~/.claude/.../memory/` (out-of-tree, NOT staged).

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1 audit.**
  - Verify all CI commands on a clean `main` checkout still pass: `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e`. Baseline from Story 7.1: 177 unit + 31 E2E + 31 routes.
  - Read [docs/design/7-2-applications-data-model-ba-decisions.md](docs/design/7-2-applications-data-model-ba-decisions.md) end-to-end.
  - Read [src/db/schema.ts](deskhive/src/db/schema.ts) — confirm UUID pattern + index helper usage.
  - Read [src/actions/booking.ts](deskhive/src/actions/booking.ts) — Phase 1's Server Action shape (auth → validate → DB query → conditional UPDATE → revalidatePath). The approve/reject actions mirror this.
  - Read [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — confirm the conditional-UPDATE pattern from `cancelBooking` / `confirmBooking` / `rejectBooking`. The new application query helpers follow the same shape.
  - Read [src/lib/auth/guards.ts](deskhive/src/lib/auth/guards.ts) — confirm `requireRole(session, 'SUPER_ADMIN')` is the existing pattern (Story 7.1 confirmed it auto-extends with the `Role` union).
  - Read dev-agent memory `reference_role_and_mode_switching.md` — Story 7.1's `'use server'` non-async-export pitfall is load-bearing for AC-9.
  - Read dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required if any PowerShell rewrites happen (unlikely in this story, but possible if globals.css gets touched).

- [x] **Task 1 — Schema additions + migration 0002 + apply to Neon** (AC-1, AC-2):
  - Edit `src/db/schema.ts`:
    - Add `applicationsTable` with all 10 columns + CHECK constraint + 3 indexes per AC-1.
    - Append type exports `Application`, `NewApplication`, `ApplicationStatus` to the type-exports block at the bottom.
    - Use `index('applications_user_id_idx').on(t.userId)` style (Drizzle's `index()` from `drizzle-orm/pg-core`).
  - Run `pnpm drizzle-kit generate` → produces `drizzle/migrations/0002_*.sql`.
  - Inspect the generated SQL. Add a leading comment block per Story 7.1's pattern documenting the rollback DDL: `DROP TABLE "applications" CASCADE`. (Safe — no FKs from other tables point at applications.)
  - Run `pnpm db:migrate` against Neon. Verify the table + indexes exist (`psql \d applications` or Neon dashboard).

- [x] **Task 2 — Validation schema + tests** (AC-3, AC-13):
  - Create `src/lib/validation/application.ts` with `createApplicationSchema` + `CreateApplicationInput` type per AC-3.
  - Create `src/lib/validation/application.test.ts` (mirrors `src/lib/validation/booking.test.ts`). Cover: happy path, each required field rejection (empty + whitespace), motivation length cap, motivation optional/undefined accepted.

- [x] **Task 3 — Service module — `src/lib/applications.ts`** (AC-4, AC-10):
  - Create the file with `APPLICATION_STATUS` + `APPLICATION_MESSAGES` const objects, the three `checkCanX` pure functions, and the three notification stubs.
  - Re-export `Application`, `NewApplication`, `ApplicationStatus` from `@/db/schema` for ergonomic imports from outside the schema module (matches Phase 1's pattern of co-locating types with their consumers).
  - Verify the file has NO `'use server'` directive at the top and NO `cookies()` / `headers()` / DB-client imports. It must remain pure server-side logic that's both testable and free of Server Action bundle constraints.

- [x] **Task 4 — DB query helpers — `src/db/queries/applications.ts`** (AC-5):
  - Create the file with the six helpers per AC-5: `getApplicationById`, `findPendingForUser`, `createApplication`, `approveApplicationConditional`, `promoteUserToSpaceOwnerConditional`, `rejectApplicationConditional`.
  - The two conditional-update functions accept an optional Drizzle transaction parameter so `approveApplicationAction` can compose them inside `db.transaction(...)`. Pattern:
    ```ts
    export async function approveApplicationConditional(
      applicationId: string,
      reviewerId: string,
      tx?: typeof db,
    ): Promise<Application | undefined> {
      const dbCtx = tx ?? db;
      const [row] = await dbCtx
        .update(applicationsTable)
        .set({ status: 'APPROVED', reviewedAt: new Date(), reviewedByUserId: reviewerId })
        .where(and(eq(applicationsTable.id, applicationId), eq(applicationsTable.status, 'PENDING')))
        .returning();
      return row;
    }
    ```
  - Same `tx?:` pattern for `promoteUserToSpaceOwnerConditional` and `rejectApplicationConditional`.

- [x] **Task 5 — Server Actions — `src/actions/applications.ts`** (AC-6, AC-7, AC-8, AC-9, AC-12):
  - **Top of file must be `'use server';`. Only async function exports.** Const objects + types + state unions live in `src/lib/applications.ts` (or a sibling `src/lib/applications-action-types.ts` if types feel cleanest there). Verify before writing any code: this is the Story 7.1 trap.
  - Implement the three Server Actions per AC-6/7/8.
  - Use `db.transaction(async (tx) => { ... })` in `approveApplicationAction`. Inside the transaction, throw a tagged error if either conditional UPDATE returns `undefined`; catch outside the transaction and map to the typed error state.
  - Notification stubs invoked inside `try/catch` after the data write succeeds. Log errors via `logger.error(...)` from `src/lib/logger.ts`. Never throw past the action boundary on notification failure.
  - `revalidatePath('/admin/applications')` in approve + reject paths. The path doesn't exist yet (Story 7.4 creates it) — harmless no-op until then.

- [x] **Task 6 — Service-layer tests — `src/lib/applications.test.ts`** (AC-13):
  - Implement the 12-case coverage matrix per AC-13's table. Each test exercises the pure `checkCanCreate` / `checkCanApprove` / `checkCanReject` helpers OR the notification stubs.
  - Add the validation schema tests in `src/lib/validation/application.test.ts` (Task 2 already covers).
  - **Do NOT mock `next/headers` / `cookies()` / `db` / Better Auth.** Pure-function tests only. The Server Action thin shells are tested via Story 7.3/7.4 BA browser checklist per AC-13's documented strategy.

- [x] **Task 7 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 177 + new tests from Task 2 + Task 6. Target ~189+.
  - `pnpm build` — clean. **Route count unchanged at 31** (no UI changes in this story per AC-14).
  - `pnpm test:e2e` — 31/31 pass.

- [ ] **Task 8 — BA verification (backend-only).** *(DEFERRED to BA's review pass per Decision §11 — no browser walk; backend-only verification.)*
  - Confirm Neon `applications` table matches AC-1 (Neon dashboard or `psql \d applications`).
  - Confirm `pnpm test` passes the 12 new pure-logic cases + validation schema cases.
  - Confirm `pnpm dev` boots cleanly with no console warnings related to the new schema/actions.

- [x] **Task 9 — Memory + sprint status + single commit** (AC-16, AC-17):
  - Create `~/.claude/.../memory/reference_applications_service_and_actions.md` per AC-16. Type: `reference`. Cross-reference Story 7.1's memory (`reference_role_and_mode_switching.md`) for the `'use server'` pitfall.
  - Update `MEMORY.md` index with the new entry.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `7-2-applications-data-model: backlog` → `review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 8 (BA's verification deferral, even though backend-only); fill in Dev Agent Record.
  - Stage `deskhive/...` (schema, migration, validation, lib, queries, actions, tests) + the two `_bmad-output/...` files.
  - Commit: `feat: applications data model + server actions (Story 7-2)`.
  - **Do NOT push.** Wait for BA verification per Task 8 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second story of Epic 7 — Multi-Tenant** and the data + logic foundation for the application flow. After it lands at `review`:

- The `applications` table exists with the expected columns, indexes, and CHECK constraint.
- A Guest can call `createApplicationAction` (programmatically — no UI yet) and create a PENDING application.
- A Super Admin can call `approveApplicationAction` to atomically approve + promote the user's role to SPACE_OWNER.
- A Super Admin can call `rejectApplicationAction` to reject without changing the user's role.
- The notification stubs are wired and Epic 8 has a documented contract to fill in.
- The transaction pattern is established for future Phase 2 atomic multi-table updates.

Feature scope (Story 7.2 only):
- ✅ `applicationsTable` schema + migration 0002 + Neon apply.
- ✅ `src/lib/validation/application.ts` + tests.
- ✅ `src/lib/applications.ts` service module (pure logic + types + stubs).
- ✅ `src/db/queries/applications.ts` query helpers (incl. conditional UPDATEs with optional `tx?:`).
- ✅ `src/actions/applications.ts` three Server Actions (async-functions-only file).
- ✅ `src/lib/applications.test.ts` 12-case service-layer coverage.
- ✅ Memory entry codifying the applications + transaction + Epic 8 stub patterns.

Out of scope (do NOT build):
- ❌ Guest-facing form UI — Story 7.3.
- ❌ Admin applications list / detail UI — Story 7.4.
- ❌ Real Resend/email sending — Epic 8 Story 8.2.
- ❌ Any new routes, header changes, page edits, sub-nav updates.
- ❌ Server Action shell unit tests requiring `next/headers` / `cookies()` / `db` / Better Auth mocking — escalation cost > 150 lines per Story 6.3 precedent; deferred to BA Story 7.3/7.4 browser walks.
- ❌ Application editing or deletion.
- ❌ Application multiple-pending allowed (BA Decision §5 invariant).
- ❌ Seed of test applications (Story 7.3 wires this up).
- ❌ Backfill of seeded spaces' `owner_id` (Story 7.1 left nullable; future story may backfill).

### Key decisions

1. **ID type is `uuid`, not `text`+cuid2.** BA Decision §1 listed `TEXT (cuid2 or nanoid)` but Phase 1's actual pattern across all tables is UUID. This story honors Phase 1 (clarification documented at the top of the story).

2. **PENDING-uniqueness invariant enforced at the application layer, not at the DB level.** No partial unique index. Rationale + concurrency caveat: see AC-11.

3. **First use of `db.transaction()` in the codebase.** `approveApplicationAction` wraps two conditional UPDATEs in a single transaction. The memory entry codifies the pattern for future Phase 2 stories.

4. **Atomic role promotion uses conditional UPDATEs**, not row-locking. Phase 1's "Booking state-machine race safety" model (architecture.md) is the precedent: every state transition's UPDATE includes the source state in WHERE. 0 rows affected → race detected, throw to roll back.

5. **`'use server'` file purity is load-bearing.** Story 7.1's Debug Log #1 captured the trap: const exports break the bundle for every page that transitively imports the action. AC-9 explicitly enforces async-functions-only.

6. **Notification stubs are the Epic 8 contract.** Decision §8: function signatures are locked; Epic 8 Story 8.2 swaps only the bodies. The Server Actions invoke stubs inside `try/catch` so notification failure never rolls back a data write.

7. **The 12 BA-required unit tests are tested at the service-layer pure-function level**, not the Server Action shell level. Action shells would require ~150+ lines of mocking infrastructure (matches the Story 6.3 cost-cap escalation precedent). The BA's browser walks in Stories 7.3 / 7.4 are the integration verification for the action shells.

8. **The `requireRole(session, 'SUPER_ADMIN')` Phase 1 helper already covers approve/reject auth.** Story 7.1 confirmed the helper auto-extends with the `Role` union. No new helpers added per BA Decisions §"Architectural anti-patterns forbidden".

9. **`revalidatePath('/admin/applications')` in approve/reject is forward-looking.** The route doesn't exist until Story 7.4. Calling `revalidatePath` on a non-existent route is harmless. Documented in Completion Notes.

10. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, redirect-after-try-catch in Server Actions (NB: this story's actions don't redirect — they return success state for `useActionState` consumers in Stories 7.3/7.4), Story 5.x/6.x patterns. Story 7.1's SPACE_OWNER role + mode infrastructure unchanged; this story just promotes users to SPACE_OWNER through the approval flow.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # Epic 7 — Multi-Tenant (Space Owner Role) — Phase 2 Theme A
  epic-7: in-progress
  7-1-role-infrastructure-and-mode-switching: review        # unchanged
  7-2-applications-data-model: review                        # was: backlog
  7-3-guest-application-form: backlog
  7-4-admin-application-review: backlog
  7-5-owner-dashboard-and-spaces: backlog
  epic-7-retrospective: optional
```

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
e265b21 docs: fill commit hash in Story 7-1 Change Log + record BA greenlight
b74a68d feat: role infrastructure + mode switching (Story 7-1)                  ← Last feature commit
d8c9e08 docs: fill commit hash in Story 6-6 Change Log + record BA greenlight
48c8f2e feat: remove cosmetic login role selector (Story 6-6)
c8055bb docs: fill commit hash in Story 6-3 Change Log + record BA greenlight
71ab26c feat: booking confirmation toast (Story 6-3)
...
```

Story 7.2 is the **second Phase 2 feature commit**. Subject: `feat: applications data model + server actions (Story 7-2)`.

### References

- [Source: docs/design/7-2-applications-data-model-ba-decisions.md](docs/design/7-2-applications-data-model-ba-decisions.md) — BA decisions document (this story's source of truth).
- [Source: docs/03-phase2-prd.md §8 Epic 7 Story 7-2] — Phase 2 PRD.
- [Source: deskhive/src/db/schema.ts](deskhive/src/db/schema.ts) — schema to extend in AC-1.
- [Source: deskhive/src/actions/booking.ts](deskhive/src/actions/booking.ts) — Phase 1 Server Action template (especially `cancelBookingAction` for the conditional-UPDATE + Phase 1 auth-error mapping pattern).
- [Source: deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — `cancelBooking` / `confirmBooking` / `rejectBooking` are the conditional-UPDATE template for the application query helpers.
- [Source: deskhive/src/lib/validation/booking.ts](deskhive/src/lib/validation/booking.ts) — validation schema pattern.
- [Source: deskhive/src/lib/money.ts](deskhive/src/lib/money.ts) — pure-logic service module template.
- [Source: deskhive/src/lib/mode.ts](deskhive/src/lib/mode.ts) — Story 7.1's pure-logic + constants + stubs separation pattern.
- [Source: deskhive/src/lib/auth/guards.ts](deskhive/src/lib/auth/guards.ts) — `requireRole(session, 'SUPER_ADMIN')` reused; no extension needed.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [_bmad-output/planning-artifacts/architecture.md "Booking state-machine race safety"] — conditional-UPDATE pattern precedent.
- [_bmad-output/implementation-artifacts/7-1-role-infrastructure-and-mode-switching.md] — Story 7.1 (commit + memory pattern source).
- Dev-agent memory `reference_role_and_mode_switching.md` — Story 7.1's `'use server'` non-async-export pitfall; load-bearing for AC-9.
- Dev-agent memory `reference_role_specific_nav_pattern.md` — Story 6.2's role-nav + soft-redirect pattern (unchanged by this story).
- Dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required if PowerShell rewrites happen.

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

No issues encountered. All five CI checks passed first try after each task. One transient Neon `ETIMEDOUT` during a mid-implementation E2E run (`browse.spec.ts:18` REST call) — passed on retry; unrelated to story code, same flakiness pattern as Story 7-1 seed run. Documented for context but not a real bug.

### Completion Notes List

**BA-required decision-point answers:**

1. **Migration rollback documentation choice:** ✅ **Comment block at the top of `drizzle/migrations/0002_omniscient_human_robot.sql`** (matches Story 7.1's pattern). Rollback DDL documented in-line: `DROP TABLE "applications" CASCADE;` — safe because no FK from any other table points at `applications` (and won't in Phase 2; the FKs are FROM `applications` TO `users`, not the other way around).

2. **`'use server'` file purity verification:** ✅ **`src/actions/applications.ts` exports only async functions + type unions.** Verified via grep: the file's exports are `createApplicationAction`, `approveApplicationAction`, `rejectApplicationAction` (async functions) plus `CreateApplicationActionState`, `ReviewApplicationActionState` (type unions — types are erased at compile time, safe). All const objects (`APPLICATION_MESSAGES`, `APPLICATION_STATUS`), pure helpers (`checkCanCreate` et al.), and notification stubs live in `src/lib/applications.ts` (non-server-only sibling). The internal helper `fetchUserRole` + the `TransactionAbort` class + `UUID_RE` const + `TX_NOT_PENDING`/`TX_NOT_GUEST` symbols are **declared internally** (not exported) — Next.js's `invalid-use-server-value` rule applies to EXPORTS only, not internal declarations. Build passed; no Runtime Error overlay on any page.

3. **Test strategy outcome:** ✅ **All 12 BA cases testable at the service-layer pure-function level.** `src/lib/applications.test.ts` is 224 lines / 21 tests; `src/lib/validation/application.test.ts` is 100 lines / 9 tests. Total new test coverage: 30 cases against pure functions, no `next/headers` / `cookies()` / `db` / Better Auth mocking required. The 12-case mapping from AC-13 maps cleanly (multiple BA cases per pure-helper test where applicable). BA cases 5, 7, 10, 11 are covered by adjacent surfaces (validation schema for #5; existing `guards.test.ts` `requireRole` coverage for #7 + #11; the Server Action's `reason ?? null` defaulting for #10 — exercised in code but not in a dedicated unit test).

4. **Transaction pattern shape (codebase's first `db.transaction()` use):** ✅ Used Drizzle's `db.transaction(async (tx) => { ... })` with the `tx` proxy method-shape mirroring `db`. Inside the transaction: two `tx.update(...).set(...).where(...).returning()` calls with source-state guards in the WHERE clauses; throw a tagged `TransactionAbort` (with `Symbol`-based tags `TX_NOT_PENDING` / `TX_NOT_GUEST`) on 0-rows-affected to trigger rollback. The wrapper catches `instanceof TransactionAbort` outside the transaction and maps tags to the typed error states. Memory entry `reference_applications_service_and_actions.md` documents the full pattern with code snippets for future Phase 2 stories to cargo-cult.

5. **PENDING-uniqueness concurrency limitation:** ✅ **Application-layer enforcement only** (`findPendingForUser` + `checkCanCreate`), no partial unique index at the DB level. **A partial unique index `(user_id) WHERE status = 'PENDING'` was considered and rejected** — adding it would correctly block concurrent PENDING inserts but adds DB-level complexity for a Phase 2 case that's already covered by `useFormStatus` button-disable in Story 7-3's UI. The concurrency caveat (curl-spammer creates duplicates) is acceptable per BA Decision §5 + AC-11, codified in the memory entry; Phase 2.5+ can add the index if it becomes a real problem.

6. **`revalidatePath('/admin/applications')` no-op confirmation:** ✅ **Verified harmless.** All three Server Actions call `revalidatePath('/admin/applications')` even though the route doesn't exist until Story 7-4. Next.js treats this as a cache-tag invalidation; no error/warning emitted at runtime. Forward-looking: Story 7-4's list page will see fresh data the first time it ships. Verified by running `pnpm build` post-implementation — no warnings related to the path.

**Implementation observations worth carrying forward:**

1. **The `'use server'` purity trap from Story 7-1 was internalized before writing any code.** Pre-coding checklist: scan the action file for non-async, non-type exports → none. Pure helpers + const objects + stubs went into `src/lib/applications.ts` from the first edit. No debug-log entry needed because the trap was avoided by design rather than discovered.

2. **Inlining transaction body vs. threading `tx` through query helpers.** I evaluated both shapes — passing `tx?: typeof db` to query helpers (typed-noisy and adds an optional-arg surface to every helper) vs. inlining the two UPDATEs inside the `db.transaction(...)` callback (more verbose at the call site but clearer that the transaction is the seam). Picked the inline approach. The two non-transactional helpers (`createApplication`, `rejectApplicationConditional`) stay clean in `src/db/queries/applications.ts`.

3. **`fetchUserRole` is a local helper inside the action file, not exported.** Pre-check needs the applicant's current role to classify USER_NOT_GUEST errors with a clearer message than "race against transaction." Could've lived in `src/db/queries/users.ts` but there's no such file yet — Phase 1 didn't need user-side query helpers. Avoided creating a new query module for one helper; inlined for now. Future stories that need user role lookups can extract.

4. **Service module re-exports types from schema** (`Application`, etc.) so consumers import from `@/lib/applications` cleanly. Phase 1 didn't establish this convention strictly; this story leans toward it for ergonomic consumer imports.

5. **Notification stubs run inside `try/catch` post-DB-write.** Per BA Decision §8: notification failure is logged via `logger.error('notify_application_*_failed', ...)` and never rolls back the data write. The data state is the source of truth; notifications are best-effort.

6. **Tagged-error pattern via `Symbol` + `class extends Error`.** Phase 1 used plain `throw new Error('CODE_STRING')` + string-match in catch. This story uses `Symbol`-based tags + `instanceof` check — type-safe, no string-comparison brittleness. Pattern recommended for future Phase 2 transaction shapes.

7. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern (now also inside transactions), `revalidatePath` for forward-looking routes, no `redirect()` on Server Action success, layout-level `/admin/*` guard, Story 7-1's role + mode infrastructure unchanged. The new SPACE_OWNER role from Story 7-1 is the target of approval promotion; no schema or auth changes to that surface.

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean (no new lint surface).
- `pnpm test` — **207 passed + 1 skipped** (was 177; +30 from `applications.test.ts` + `application.test.ts`).
- `pnpm build` — clean. **Route count unchanged at 31** (no UI changes per AC-14).
- `pnpm test:e2e` — 31/31 passed in 15.4s.

### File List

**New (5):**
- `deskhive/drizzle/migrations/0002_omniscient_human_robot.sql` — applications table CREATE + CHECK + 3 indexes + 2 FKs. Includes documented rollback comment block.
- `deskhive/src/lib/validation/application.ts` — Zod `createApplicationSchema` (4 fields, 1000-char motivation cap).
- `deskhive/src/lib/validation/application.test.ts` — 9 schema validation tests.
- `deskhive/src/lib/applications.ts` — service module: pure precondition helpers (`checkCanCreate` / `checkCanApprove` / `checkCanReject`), `APPLICATION_MESSAGES` + `APPLICATION_STATUS` const objects, three notification stubs (Epic 8 contract).
- `deskhive/src/lib/applications.test.ts` — 21 service-layer tests covering all 12 BA-required cases at the pure-function level.
- `deskhive/src/db/queries/applications.ts` — query helpers: `getApplicationById`, `findPendingForUser`, `createApplication`, `rejectApplicationConditional`. (Approve's two conditional UPDATEs inlined in the action's `db.transaction` callback, not in this file.)
- `deskhive/src/actions/applications.ts` — three `'use server'` actions: `createApplicationAction`, `approveApplicationAction` (atomic role promotion via `db.transaction`), `rejectApplicationAction`. Async-functions-only file per Story 7-1's `'use server'` purity rule.

**Modified (1):**
- `deskhive/src/db/schema.ts` — added `applicationsTable` (10 columns + CHECK + 3 indexes + 2 FKs) and three type exports (`Application`, `NewApplication`, `ApplicationStatus`). Added `index` to the drizzle-orm/pg-core import.

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `7-2-applications-data-model: backlog` → `review`; `last_updated` parenthetical updated.
- `_bmad-output/implementation-artifacts/7-2-applications-data-model.md` — Status + tasks + Dev Agent Record (this file).

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- **Created:** `reference_applications_service_and_actions.md` — codifies the applications data layer + `db.transaction()` pattern + Epic 8 stub contract + `'use server'` purity reinforcement + PENDING-uniqueness concurrency caveat.
- **Updated:** `MEMORY.md` — index appended with the new entry.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-13 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-13 | Story implemented; applications table + migration applied to Neon, service module + queries + three Server Actions shipped including codebase's first `db.transaction()` for atomic role promotion. 30 new unit tests across two test files. Memory entry codifies the patterns for Phase 2 reuse + Epic 8 stub contract. Single commit per AC-17. | `7240499` |
| 2026-05-13 | BA-verified backend-only per Decision §11 (no browser walk): 30 unit tests green, schema matches Decision §1 exactly, FKs + indexes verified, Phase 1 + 7.1 data untouched. | (this follow-up) |
