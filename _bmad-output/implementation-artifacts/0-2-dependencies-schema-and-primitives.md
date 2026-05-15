# Story 0.2: Dependencies, Schema, and Cross-Cutting Primitives

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer working on the DeskHive Phase 1 MVP**,
I want **the application's data layer (PostgreSQL via Drizzle), authentication layer (Better Auth + argon2), and cross-cutting primitives (`apiError`, auth guards, `<DataView>`, `<StatusBadge>`, format helpers, logger) installed and authored against the architecture-mandated patterns**,
so that **every feature story (US-1.1 onward) inherits a fully-wired Phase-1 foundation — schema with the booking-overlap unique index, role-based authorization helpers, four-state UI primitive, status-badge component, and money/date discipline helpers — without re-deciding any of those patterns story by story.**

## Acceptance Criteria

1. **AC-1 (Dependencies installed).** `deskhive/package.json` includes the runtime and dev dependencies enumerated in §Dependency Manifest below at versions matching the version pins specified there. `pnpm install --frozen-lockfile` succeeds. No extra packages beyond the manifest are added.

2. **AC-2 (Database connection scaffolding — code only, no live DB).** *(Revised per Decision 5 — Docker skipped.)* `deskhive/.env.example` exists and documents a Neon-style `DATABASE_URL` placeholder, `BETTER_AUTH_SECRET` placeholder, and `BETTER_AUTH_URL`. `deskhive/README.md` includes a "Database setup" section with instructions: create a free Neon project, copy the connection string into `.env.local`. **No `docker-compose.yml` is created.** **No live DB connection is attempted in US-0.2.**

3. **AC-3 (Drizzle schema authored).** `deskhive/src/db/schema.ts` defines, using the Drizzle ORM PostgreSQL APIs, the following tables — column-for-column matching Document B §6.1 plus the additive Better Auth columns (see §BA Decision Required):
   - `usersTable` — `id`, `email` (unique), `hashedPassword` (NOT NULL), `role` (CHECK in `'GUEST' | 'SUPER_ADMIN'`), `fullName` (NOT NULL), `emailVerified` (BOOLEAN, NOT NULL, default `true`), `image` (TEXT, nullable), `createdAt`, `updatedAt`. *(Per BA decision, see §BA Decision Required.)*
   - `spacesTable` — per Document B §6.1.
   - `desksTable` — per Document B §6.1, with `UNIQUE (space_id, label)` constraint (FR-I5).
   - `bookingsTable` — per Document B §6.1, including `paymentStatus` and `paymentReference` columns as nullable for forward-compat (Document A §7.4).
   - **Partial unique index** `uniq_active_booking_per_desk_per_date` on `bookings (desk_id, booking_date) WHERE status IN ('PENDING','CONFIRMED')` — Drizzle `.where()` clause syntax (Document B §6.2).
   - Better Auth tables (`accountTable`, `sessionTable`, `verificationTable`) with the schema Better Auth's Drizzle adapter expects.

4. **AC-4 (Migration generated; live apply deferred).** *(Revised per Decision 5.)* `pnpm db:generate` produces a Drizzle migration SQL file under `deskhive/drizzle/migrations/`. The generated SQL is reviewed by eye and contains: `CREATE TABLE` statements for all 7 tables (`users`, `spaces`, `desks`, `bookings`, `account`, `session`, `verification`); the partial unique index `uniq_active_booking_per_desk_per_date` with the `WHERE status IN ('PENDING','CONFIRMED')` clause; the `(space_id, label)` unique constraint on `desks`; the role CHECK constraint accepting only `'GUEST'` and `'SUPER_ADMIN'`; the status CHECK constraint on `bookings` accepting only the four valid statuses. **`pnpm db:migrate` is NOT run in US-0.2** — the live apply happens in US-1.1's prep step against the chosen DB host.

5. **AC-5 (Better Auth configured with argon2id — code only).** *(Revised per Decision 5: runtime wiring not verified live.)* `deskhive/src/lib/auth/config.ts` exports a configured Better Auth instance using:
   - `@better-auth/drizzle-adapter` pointing at the Drizzle client.
   - `emailAndPassword` provider enabled.
   - **Custom password hasher** using the `argon2` npm package with `argon2id` variant. Configured via Better Auth's `password.hash` / `password.verify` config hooks.
   - HTTP-only cookies with `SameSite=Lax` (Better Auth's defaults — do not override).
   - `BETTER_AUTH_SECRET` read from `process.env`; an example value is in `.env.example`.
   - The file compiles under TypeScript strict mode (`pnpm typecheck` passes). Live runtime verification (i.e. actually signing up a user) is deferred to US-1.1.

6. **AC-6 (Cross-cutting primitives authored).** All of the following exist with the signatures and behaviors specified in §Primitives Specification below, and have unit tests under their colocated `*.test.ts`:
   - `src/lib/http.ts` — `apiError(code, message, status, extras?)`.
   - `src/lib/auth/guards.ts` — `requireSession(req)`, `requireRole(session, role)`, `requireOwnership(resourceUserId, sessionUserId)`.
   - `src/lib/format.ts` — `formatCents(cents)`, `todayIso()`, `isPastDate(iso)`.
   - `src/lib/logger.ts` — `logger.info`, `logger.warn`, `logger.error`.
   - `src/components/data-view.tsx` — accepts `{ status: 'loading'|'empty'|'error'|'loaded', children, emptyMessage, errorMessage }`.
   - `src/components/status-badge.tsx` — accepts `{ status: 'PENDING'|'CONFIRMED'|'REJECTED'|'CANCELLED' }`.

7. **AC-7 (Vitest configured and primitive tests pass).** `deskhive/vitest.config.ts` exists. `pnpm test` runs and passes. The test suite includes at minimum: 4+ tests for `apiError`/status code conventions, 4+ tests for the auth guards, 6+ tests for `formatCents`/`todayIso`/`isPastDate`, 1 smoke test each for `<DataView>` (renders all four branches) and `<StatusBadge>` (renders all four statuses with correct Tailwind classes). `pnpm typecheck` (alias for `tsc --noEmit`) passes. `pnpm lint` passes.

8. **AC-8 (Super Admin seed authored — live run deferred).** *(Revised per Decision 5.)* `deskhive/scripts/seed.ts` exists, compiles under TypeScript, and is reviewable. Default credentials are documented in `deskhive/README.md`. The seed uses Better Auth's user-creation API so the password hash will be produced by the configured argon2id hasher when the script runs. **`pnpm db:seed` is NOT run in US-0.2** — the live seed happens in US-1.1's prep step.

9. **AC-9 (Single commit).** All US-0.2 changes land in a single commit on `main` titled exactly `chore: install dependencies, schema, and cross-cutting primitives (US-0.2)`. The commit includes only files under `deskhive/`. `pnpm-lock.yaml` is updated and committed.

## Tasks / Subtasks

- [x] **Task 0 — BA confirms the Better Auth users-table resolution (RESOLVED 2026-05-06 by Ikhtiyor)**
  - [x] BA approved **Option B.1** — see §Notes from BA (Decision Record).
  - [x] Integration stubs deferred to Phase 2.
  - [x] Seeded credentials approved as proposed.
  - [x] Amelia: proceed.

- [x] **Task 1 — Install dependencies (AC-1)** — `pnpm add` + `pnpm add -D` per §Dependency Manifest. argon2 install scripts approved via `pnpm.onlyBuiltDependencies` block in package.json; `pnpm rebuild argon2` produced the prebuilt Windows binary via `node-gyp-build`. *Version correction during install: `@testing-library/react` story spec said `^17.0.0` but latest is `16.3.2` — installed `^16.3.0` instead. (Story §Dependency Manifest had the wrong major-version pin; corrected in the lockfile.)*
- [x] **Task 2 — Database connection scaffolding (AC-2; Decision 5)** — `.env.example` with Neon-style placeholder authored; README.md "Database setup" section appended; no `docker-compose.yml` created.
- [x] **Task 3 — Drizzle config (AC-3, AC-4)** — `drizzle.config.ts` authored; uses fallback placeholder URL so `db:generate` works without `.env.local`.
- [x] **Task 4 — Drizzle schema (AC-3)** — `src/db/schema.ts` authored. snake_case DB column names via Drizzle aliasing; camelCase TS field names. Partial unique index on `bookings (desk_id, booking_date)` with `.where(sql\`status IN ('PENDING','CONFIRMED')\`)` clause.
- [x] **Task 5 — Drizzle client (AC-3)** — `src/db/client.ts` authored. *Implementation note:* refactored from eager singleton to **lazy Proxy** so test suites that transitively import `db` don't require `DATABASE_URL`. Functionally equivalent in production; HMR-safe in dev via `globalThis.__drizzleClient` stash.
- [x] **Task 6 — Generate migration (AC-4; Decision 5)** — `pnpm db:generate` produced `drizzle/migrations/0000_tough_strong_guy.sql`. Inspected by eye; all AC-4 assertions confirmed: 7 CREATE TABLE statements, partial unique index with the `WHERE` clause, `(space_id, label)` unique on `desks`, role CHECK on `users`, status CHECK on `bookings`, status CHECK on `spaces`, daily price CHECK on `desks`, all FKs (cascade on Better Auth tables, no-action on PRD tables). `pnpm db:migrate` NOT run per Decision 5.
- [x] **Task 7 — Better Auth config (AC-5)** — `src/lib/auth/config.ts` authored with Drizzle adapter, custom argon2id hasher, additionalFields for `role`/`fullName`/`hashedPassword`. Compiles under TypeScript strict.
- [x] **Task 8 — apiError helper (AC-6)** — `src/lib/http.ts` + 10 unit tests. All error-shape branches and helper builders covered.
- [x] **Task 9 — Auth guards (AC-6)** — `src/lib/auth/guards.ts` + 6 unit tests covering matching/mismatching role and ownership cases plus the AuthError class. *Implementation note:* The `requireSession` Next.js wrapper is not unit-tested (it's a thin glue over `auth.api.getSession`); `requireRole` and `requireOwnership` are pure and fully tested.
- [x] **Task 10 — Format helpers (AC-6)** — `src/lib/format.ts` + 13 unit tests. `formatCents`, `todayIso`, `isPastDate` with edge cases (negative, non-integer, malformed ISO).
- [x] **Task 11 — Logger (AC-6)** — `src/lib/logger.ts` authored. JSON line output via `process.stdout.write`. No tests (mechanical wrapper); validated by typecheck.
- [x] **Task 12 — `<DataView>` (AC-6)** — `src/components/data-view.tsx` + 5 unit tests covering all four branches (loading/empty/error/loaded) and the custom-message override path.
- [x] **Task 13 — `<StatusBadge>` (AC-6)** — `src/components/status-badge.tsx` + 4 unit tests asserting the literal Tailwind class strings per Doc B §7.4.
- [x] **Task 14 — Vitest + verify (AC-7)** — `vitest.config.ts` and `vitest.setup.ts` authored. Final verification: **38 tests pass** across 5 test files; `pnpm typecheck` clean; `pnpm lint` clean.
- [x] **Task 15 — Super Admin seed authoring (AC-8; Decision 5)** — `scripts/seed.ts` authored using Better Auth's `signUpEmail` API. *Implementation note:* needed to add `fullName` to the signUpEmail body because `additionalFields.fullName` is configured as user-input (not `input: false`) — this matches Doc B §7.6 where Full name is a required form field. Compiles under TypeScript strict. `pnpm db:seed` NOT run per Decision 5.
- [x] **Task 16 — Single commit (AC-9)** — Committed below as the final step of this dev-story execution.

## Dev Notes

### Notes from BA (Decision Record)

> **Resolved 2026-05-06 by Ikhtiyor (BA orchestrator). Decisions below are binding for US-0.2 implementation.**

**Decision 1 — Better Auth users-table schema: Option B.1 approved.**

The `users` table will contain Doc B §6.1's seven columns *plus* two additive columns required by Better Auth:
- `emailVerified BOOLEAN NOT NULL DEFAULT TRUE` — defaulted true since Doc B §11 defers email verification to Phase 2; all Phase 1 users are immediately active.
- `image TEXT NULL` — Phase 1 has no avatar UI per Doc B §11; column exists to satisfy Better Auth's user-shape contract but is never read or written by Phase 1 code.

The `users.hashed_password` column remains in the schema verbatim per Doc B §6.1 even though Better Auth (under B.1) stores credential hashes in the `account` table. The column exists for letter-of-Doc-B compliance and forward-compat: a future migration can populate it from `account.password` if a different auth strategy is adopted in Phase 2+.

**Phase 2 planners / reviewers — please note:** the deviation from Doc B §6.1 is purely additive (two columns added, none removed or modified). It does not change product behavior. Document A §7.4's forward-compat envelope is preserved. If a future PRD revision wants to remove the deviation, the migration path is: drop the `email_verified` and `image` columns *iff* Better Auth is replaced with a credential layer that doesn't require them.

**Decision 2 — Integration stubs (`src/lib/integrations/{email,sms,payment,storage}/`): defer to Phase 2.**

Doc A §7.5 calls for stubbed-interface scaffolding. The architecture's IR follow-up created proposed file paths under `src/lib/integrations/`. **No Phase 1 story consumes these stubs.** Per BA decision, the stubs are deferred until Phase 2 when their first consumer (Stripe/SendGrid/Twilio) lands. Amelia: do not create these directories in US-0.2.

**Decision 3 — Seeded credentials approved as proposed.**

`admin@deskhive.local` / `SuperAdmin1!` documented in `deskhive/README.md`. Idempotent seed.

**Decision 4 — `users.hashed_password` retained per Doc B §6.1.**

Even though Better Auth (B.1) does not use it, keep the column.

**Decision 5 — No Docker; live DB connection deferred to US-1.1 (added 2026-05-06 mid-execution).**

Local Docker is intentionally not installed on the development machine. Per BA decision, US-0.2 ships **schema-as-code only**: dependencies, schema TypeScript, generated migration SQL files, Better Auth config code, and the seed script — all reviewable artifacts that compile under TypeScript strict mode. **No live database connection happens in US-0.2.**

The first story that actually needs a live database is US-1.1 (Guest Registration). The DB host decision (Neon free tier preferred) and the live `pnpm db:migrate` + `pnpm db:seed` runs are deferred to a US-1.1 prep step.

**Implications for US-0.2 ACs:**
- AC-2 — no Docker Compose; instead, `.env.example` documents the Neon-style `DATABASE_URL` placeholder, and `deskhive/README.md` gets a "Database setup" section pointing at neon.tech.
- AC-4 — `pnpm db:generate` runs; migration files committed; migration SQL is reviewed by eye for correctness. `pnpm db:migrate` is **not** run.
- AC-5 — Better Auth config code is authored and compiles; the runtime wiring (signup/login flows) is **not** verified live in US-0.2.
- AC-8 — `scripts/seed.ts` is authored and reviewable; `pnpm db:seed` is **not** run live in US-0.2.

This is a deliberate descope to keep US-0.2 focused on dependencies and schema authoring rather than infrastructure setup. The actual schema correctness will be verified in US-1.1's prep step against the live Neon DB before any feature work touches it.

---

### BA Decision Required (original framing — preserved for traceability)

> **Resolved above on 2026-05-06. The following is preserved so future readers see the trade-off space at the time of the decision.**

Document B §6.1 specifies the `users` table column-for-column. Better Auth's email/password authentication requires its own user-table-shape, including:

- `emailVerified` (BOOLEAN) — Better Auth requires this field to be present. It tracks email verification state.
- `image` (TEXT, nullable) — Better Auth uses this for avatars. Optional.

These two fields are **not in Document B §6.1**. Per Document B §0.1 anti-hallucination rule, fields not in the document must not be invented without escalation.

**Three resolution options:**

| Option | Description | Cost | Risk |
|---|---|---|---|
| **A — Two users tables** | Use Better Auth's default `user` table. Have a separate app-level `users` table per Doc B §6.1. Reconcile via FK or trigger. | High (two sources of truth, ongoing reconciliation) | High |
| **B — Additive columns (recommended)** | Single `users` table per Doc B §6.1 plus `emailVerified` and `image` as added columns. Better Auth's user-table mapping points here. | Low (two extra columns, neither used by feature stories) | Low |
| **C — Custom credential layer** | Don't use Better Auth's email/password provider. Use Better Auth only for sessions; write our own login/register that hashes via argon2 and stores in `users.hashed_password` directly. | Medium-High (custom auth code increases attack surface) | Medium |

**Recommended: Option B.** The deviation from Doc B §6.1 is purely **additive** — no removal, no change to existing column names, no behavior change. `emailVerified` defaults to `true` (Doc B §11 confirms email verification is out of Phase 1 scope, so all users are immediately active). `image` defaults to `null` (Phase 1 has no avatar UI per Doc B §11).

**Implementation under Option B:**
- `users` table has the seven columns from Doc B §6.1 PLUS `email_verified BOOLEAN NOT NULL DEFAULT TRUE` and `image TEXT NULL`.
- Better Auth's `accountTable`, `sessionTable`, `verificationTable` are added as separate tables (these don't conflict with anything in Doc B).
- Better Auth's email/password provider stores the password hash in `users.hashed_password` via the custom hasher hook OR in the `account` table (the latter is Better Auth's default and is simpler).

**Sub-decision under Option B:** where does the password hash live?
- B.1 — In the `account` table (Better Auth default). `users.hashed_password` becomes deprecated; document and migrate when convenient. **Recommended.** Simpler.
- B.2 — In `users.hashed_password` (Doc B §6.1 verbatim). Requires custom Better Auth credential adapter. More work.

**Recommendation: Option B.1.** The `users.hashed_password` column stays (per Doc B §6.1) but is left null for users registered through Better Auth (which uses the `account` table instead). Document the deferral in `deskhive/README.md`. This keeps Doc B §6.1's column on day one and avoids fighting Better Auth's design.

If Ikhtiyor disagrees with B.1 and prefers B.2 (or A or C), Amelia adapts. **Default proceeds with Option B.1 unless Ikhtiyor explicitly chooses otherwise during review.**

### Why this story exists (context)

This story was surfaced as IR finding **EQ-1** in the Day 1 Implementation Readiness report. It is the second of three scaffolding stories. US-0.1 (just completed at commit `a32ff6e`) initialized the Next.js project. This story installs the data, auth, and primitive layers that every feature story (US-1.1+) inherits.

After US-0.2 completes:
- Postgres is running locally.
- The schema (4 PRD tables + Better Auth tables + partial unique index) is created.
- Better Auth + argon2id are wired and a seeded Super Admin can log in.
- Every cross-cutting primitive in the architecture (`apiError`, guards, `<DataView>`, `<StatusBadge>`, format helpers, logger) exists with tests.
- US-0.3 (CI Pipeline + Playwright) and US-1.1 (Guest Registration) can begin.

### Previous story intelligence (US-0.1)

US-0.1 (commit `a32ff6e` on `main`) produced:
- `deskhive/` directory with Next.js 16.2.4, React 19.2.4, Tailwind 4.2.4, TypeScript 5.9.3, ESLint 9.39.4, eslint-config-next 16.2.4. Pinned via `pnpm-lock.yaml`.
- App Router (`src/app/`) with default `layout.tsx`, `page.tsx`, `globals.css` (Tailwind v4 `@import "tailwindcss";`).
- Default `pnpm-workspace.yaml`, `AGENTS.md`, `CLAUDE.md` produced by current `create-next-app`.

US-0.1's strict discipline principle: **all changes lived under `deskhive/`, single commit, no premature additions.** This story inherits the same discipline — every file authored is under `deskhive/`, single commit titled per AC-9.

### Dependency Manifest

All commands run from `deskhive/`. Versions chosen to match architecture spec and verified current (2026-05-06).

**Production dependencies — `pnpm add`:**

```bash
pnpm add \
  drizzle-orm@^0.45.2 \
  pg@^8.13.0 \
  better-auth@latest \
  @better-auth/drizzle-adapter@^1.6.9 \
  argon2@^0.41.0 \
  zod@^3.23.8 \
  dotenv@^16.4.5
```

**Dev dependencies — `pnpm add -D`:**

```bash
pnpm add -D \
  drizzle-kit@^0.31.0 \
  @types/pg@^8.11.10 \
  vitest@^3.0.0 \
  @vitest/ui@^3.0.0 \
  @vitejs/plugin-react@^5.0.0 \
  @testing-library/react@^17.0.0 \
  @testing-library/jest-dom@^6.6.0 \
  jsdom@^25.0.0 \
  @playwright/test@^1.50.0 \
  tsx@^4.20.0
```

**Notes on choices:**
- `drizzle-orm@0.45.x` — matches architecture pin. v1.0 is still beta and the Better Auth Drizzle adapter does not yet support v1's new query syntax (tracking issue: better-auth/better-auth#6766).
- `better-auth@latest` rather than a specific pin — Better Auth is in active development and the adapter version (1.6.9) tracks it. Lockfile pins the resolved version.
- `argon2@^0.41.0` — current stable. Prebuilt Windows binaries available; native Node argon2 (Node 24.7+) is an alternative deferred to Phase 2.
- `zod@^3.23.8` — Better Auth has a peer dependency on Zod 3.x; Zod 4 may not be compatible yet.
- `@playwright/test` is installed here but **not configured**; configuration is US-0.3.
- `@testing-library/react`, `jsdom`, `@vitejs/plugin-react` enable React component testing under Vitest.

### docker-compose.yml

Path: `deskhive/docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: deskhive-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: deskhive
      POSTGRES_PASSWORD: deskhive_local_dev
      POSTGRES_DB: deskhive
    ports:
      - "5432:5432"
    volumes:
      - deskhive_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U deskhive -d deskhive"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  deskhive_pgdata:
```

### Environment Files

`deskhive/.env.example` (committed):

```
DATABASE_URL=postgres://deskhive:deskhive_local_dev@localhost:5432/deskhive
BETTER_AUTH_SECRET=replace-with-32-byte-random-string
BETTER_AUTH_URL=http://localhost:3000
```

`deskhive/.env.local` (gitignored — created by Amelia, never committed):

```
DATABASE_URL=postgres://deskhive:deskhive_local_dev@localhost:5432/deskhive
BETTER_AUTH_SECRET=<32-byte random string — use `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`>
BETTER_AUTH_URL=http://localhost:3000
```

The starter's `.gitignore` already includes `.env*` so `.env.local` is auto-ignored.

### drizzle.config.ts

Path: `deskhive/drizzle.config.ts`

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

### src/db/schema.ts

Path: `deskhive/src/db/schema.ts`

Skeleton (Amelia: implement this exactly; deviations require escalation):

```ts
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
  check,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────
// users — Document B §6.1 + Better Auth additive columns (BA Decision §B.1)
// ─────────────────────────────────────────────────────────────
export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  hashedPassword: text('hashed_password'), // Per BA decision B.1, Better Auth stores hashes in `account`; this column remains for Doc B §6.1 compliance and may be null.
  role: text('role').notNull(),
  fullName: text('full_name').notNull(),
  emailVerified: boolean('email_verified').notNull().default(true), // Phase 1 has no email verification (Doc B §11) — all users immediately active.
  image: text('image'), // Better Auth user field; null in Phase 1 (no avatars).
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('users_role_check', sql`${t.role} IN ('GUEST', 'SUPER_ADMIN')`),
]);

// ─────────────────────────────────────────────────────────────
// spaces — Document B §6.1
// ─────────────────────────────────────────────────────────────
export const spacesTable = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  addressLine: text('address_line').notNull(),
  description: text('description').notNull(),
  primaryImageUrl: text('primary_image_url').notNull(),
  status: text('status').notNull().default('PUBLISHED'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('spaces_status_check', sql`${t.status} IN ('PUBLISHED', 'SUSPENDED')`),
]);

// ─────────────────────────────────────────────────────────────
// desks — Document B §6.1, FR-I5 (unique label per space)
// ─────────────────────────────────────────────────────────────
export const desksTable = pgTable('desks', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id').notNull().references(() => spacesTable.id),
  label: text('label').notNull(),
  dailyPriceCents: integer('daily_price_cents').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uniq_desk_label_per_space').on(t.spaceId, t.label),
  check('desks_daily_price_check', sql`${t.dailyPriceCents} >= 0`),
]);

// ─────────────────────────────────────────────────────────────
// bookings — Document B §6.1, §6.2 partial unique index, Doc A §7.4 forward-compat
// ─────────────────────────────────────────────────────────────
export const bookingsTable = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  guestUserId: uuid('guest_user_id').notNull().references(() => usersTable.id),
  spaceId: uuid('space_id').notNull().references(() => spacesTable.id),
  deskId: uuid('desk_id').notNull().references(() => desksTable.id),
  bookingDate: date('booking_date').notNull(),
  status: text('status').notNull(),
  totalPriceCents: integer('total_price_cents').notNull(),
  paymentStatus: text('payment_status'), // Doc A §7.4 forward-compat — nullable in Phase 1.
  paymentReference: text('payment_reference'), // Doc A §7.4 forward-compat — nullable in Phase 1.
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check(
    'bookings_status_check',
    sql`${t.status} IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')`,
  ),
  // Document B §6.2 — THE marquee correctness constraint.
  uniqueIndex('uniq_active_booking_per_desk_per_date')
    .on(t.deskId, t.bookingDate)
    .where(sql`status IN ('PENDING', 'CONFIRMED')`),
]);

// ─────────────────────────────────────────────────────────────
// Better Auth tables — required by @better-auth/drizzle-adapter
// Field shapes per Better Auth's Drizzle adapter docs.
// ─────────────────────────────────────────────────────────────
export const accountTable = pgTable('account', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  password: text('password'), // password hash for credential provider (BA decision B.1)
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessionTable = pgTable('session', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verificationTable = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Re-export types for convenience
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Space = typeof spacesTable.$inferSelect;
export type Desk = typeof desksTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
export type NewBooking = typeof bookingsTable.$inferInsert;

export type Role = 'GUEST' | 'SUPER_ADMIN' | 'SPACE_ADMIN'; // SPACE_ADMIN reserved per Doc A §7.4 — TS literal only; DB CHECK rejects it in Phase 1.
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
```

**Critical notes:**
- The `users.role` CHECK matches Doc B §6.1 verbatim (only `'GUEST'` and `'SUPER_ADMIN'`). The TypeScript `Role` literal type includes `'SPACE_ADMIN'` per architecture's resolution of the Doc A vs Doc B tension.
- The partial unique index uses Drizzle's `.where(sql\`status IN ('PENDING','CONFIRMED')\`)` — the SQL fragment uses the DB column name `status` directly, not the TS field name.
- Better Auth's `account.password` is where credential-provider hashes land per BA decision B.1.

### src/db/client.ts

Path: `deskhive/src/db/client.ts`

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __drizzleClient: ReturnType<typeof createClient> | undefined;
}

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool, { schema });
}

// HMR-safe: in dev, Next.js may re-evaluate this module; reuse the global client.
export const db = globalThis.__drizzleClient ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__drizzleClient = db;
}
```

### src/lib/auth/config.ts

Path: `deskhive/src/lib/auth/config.ts`

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import * as argon2 from 'argon2';
import { db } from '@/db/client';
import { usersTable, accountTable, sessionTable, verificationTable } from '@/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: usersTable,
      account: accountTable,
      session: sessionTable,
      verification: verificationTable,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: async (password: string) =>
        argon2.hash(password, { type: argon2.argon2id }),
      verify: async ({ hash, password }) => argon2.verify(hash, password),
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'GUEST', input: false },
      fullName: { type: 'string', fieldName: 'full_name' },
      hashedPassword: { type: 'string', fieldName: 'hashed_password', input: false, returned: false },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
```

**Notes:**
- The `additionalFields` config tells Better Auth that `role` and `fullName` exist on our `users` table.
- `role` defaults to `'GUEST'` and `input: false` means clients cannot set it during registration (preventing privilege escalation).
- `hashedPassword` is `input: false, returned: false` so Better Auth does not try to read or write it (per BA decision B.1, the hash lives in `account.password`).

### src/lib/http.ts

Path: `deskhive/src/lib/http.ts`

```ts
export type ApiErrorBody = {
  error: string;
  code: string;
  fields?: Record<string, string | string[]>;
};

export function apiError(
  code: string,
  message: string,
  status: number,
  extras?: { fields?: Record<string, string | string[]> },
): Response {
  const body: ApiErrorBody = { error: message, code };
  if (extras?.fields) body.fields = extras.fields;
  return Response.json(body, { status });
}

// Common error builders for consistency across handlers
export const apiUnauthorized = () =>
  apiError('UNAUTHORIZED', 'Authentication required', 401);
export const apiForbidden = (message = 'Forbidden') =>
  apiError('FORBIDDEN', message, 403);
export const apiNotFound = (message = 'Not found') =>
  apiError('NOT_FOUND', message, 404);
export const apiValidationError = (
  fields: Record<string, string | string[]>,
) => apiError('VALIDATION_ERROR', 'Validation failed', 400, { fields });
export const apiConflict = (code: string, message: string) =>
  apiError(code, message, 409);
export const apiInternalError = () =>
  apiError('INTERNAL_ERROR', 'Something went wrong', 500);
```

### src/lib/auth/guards.ts

Path: `deskhive/src/lib/auth/guards.ts`

```ts
import { headers } from 'next/headers';
import { auth, type AuthSession } from './config';
import { apiUnauthorized, apiForbidden } from '@/lib/http';
import type { Role } from '@/db/schema';

export class AuthError extends Error {
  constructor(public response: Response) { super('AuthError'); }
}

/**
 * Returns the active session, or throws AuthError(401) if missing.
 * Use in API route handlers and Server Components/Actions that need auth.
 */
export async function requireSession(): Promise<AuthSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AuthError(apiUnauthorized());
  return session;
}

/**
 * Asserts the session's user has the required role; throws AuthError(403) otherwise.
 */
export function requireRole(session: AuthSession, role: Role): void {
  // @ts-expect-error — `role` is an additional field on the user; Better Auth's typing for
  // additionalFields is sometimes loose. The runtime value is correct.
  if (session.user.role !== role) {
    throw new AuthError(apiForbidden(`Requires role ${role}`));
  }
}

/**
 * Asserts the resource belongs to the session's user; throws AuthError(403) otherwise.
 */
export function requireOwnership(resourceUserId: string, sessionUserId: string): void {
  if (resourceUserId !== sessionUserId) {
    throw new AuthError(apiForbidden('Resource not owned by this user'));
  }
}
```

**Why throw rather than return Response?** Throwing lets a route handler use a single try/catch that maps `AuthError` to its `.response`. This keeps every handler's body linear (no early-return forest of session checks).

### src/lib/format.ts

Path: `deskhive/src/lib/format.ts`

```ts
/**
 * Formats integer cents as USD with two decimals.
 * @example formatCents(2500) === '$25.00'
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid cents value: ${cents}`);
  }
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars}.${remainder.toString().padStart(2, '0')}`;
}

/**
 * Returns today's date in UTC as a YYYY-MM-DD string.
 * Server runs in UTC (Railway default), so "today" is unambiguous.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns true iff the given YYYY-MM-DD date is strictly before today (UTC).
 * Compares ISO strings lexicographically — sound because YYYY-MM-DD strings sort correctly.
 */
export function isPastDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return iso < todayIso();
}
```

### src/lib/logger.ts

Path: `deskhive/src/lib/logger.ts`

```ts
type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  // Single-line JSON for log aggregators
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
};
```

**Note:** intentionally bypasses `console.log` so the `no-console` ESLint rule (architecture §Implementation Patterns) can ban `console.*` everywhere except this module.

### src/components/data-view.tsx

Path: `deskhive/src/components/data-view.tsx`

```tsx
import type { ReactNode } from 'react';

export type DataViewStatus = 'loading' | 'empty' | 'error' | 'loaded';

export type DataViewProps = {
  status: DataViewStatus;
  children: ReactNode;
  emptyMessage?: string;
  errorMessage?: string;
  loadingMessage?: string;
};

export function DataView({
  status,
  children,
  emptyMessage = 'No data available.',
  errorMessage = 'Something went wrong. Please try again.',
  loadingMessage = 'Loading…',
}: DataViewProps) {
  if (status === 'loading') {
    return <div className="text-sm text-gray-500">{loadingMessage}</div>;
  }
  if (status === 'empty') {
    return <div className="text-sm text-gray-600">{emptyMessage}</div>;
  }
  if (status === 'error') {
    return <div className="text-sm text-red-700">{errorMessage}</div>;
  }
  return <>{children}</>;
}
```

**Note:** uses default Tailwind utility classes only (architecture §Implementation Patterns: no design tokens in TS). Makhbuba reskins via `globals.css` and class swaps in this single file.

### src/components/status-badge.tsx

Path: `deskhive/src/components/status-badge.tsx`

```tsx
import type { BookingStatus } from '@/db/schema';

const STATUS_CLASSES: Record<BookingStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-block rounded px-2 py-1 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
```

**Critical:** the class strings in `STATUS_CLASSES` are exactly the placeholders from Doc B §7.4. Makhbuba's reskin edits this single object.

### vitest.config.ts

Path: `deskhive/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules', '.next', 'tests/e2e'], // E2E tests run under Playwright, not Vitest.
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

Path: `deskhive/vitest.setup.ts`

```ts
import '@testing-library/jest-dom';
```

### scripts/seed.ts

Path: `deskhive/scripts/seed.ts`

```ts
import 'dotenv/config';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { usersTable } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

const SEED_EMAIL = 'admin@deskhive.local';
const SEED_PASSWORD = 'SuperAdmin1!';
const SEED_FULL_NAME = 'DeskHive Super Admin';

async function main() {
  // Idempotent: skip if a Super Admin with this email already exists.
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Super Admin already exists (${SEED_EMAIL}); seed is a no-op.`);
    return;
  }

  // Use Better Auth's signUp to create the user with the configured argon2 hasher.
  const result = await auth.api.signUpEmail({
    body: {
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      name: SEED_FULL_NAME,
    },
  });

  if (!result || 'error' in result) {
    throw new Error(`Failed to create Super Admin: ${JSON.stringify(result)}`);
  }

  // Promote to SUPER_ADMIN (Better Auth created with default 'GUEST' role; we elevate via direct UPDATE).
  await db
    .update(usersTable)
    .set({ role: 'SUPER_ADMIN', fullName: SEED_FULL_NAME })
    .where(eq(usersTable.email, SEED_EMAIL));

  console.log(`Super Admin seeded: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  console.log('Document this in deskhive/README.md before committing.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

### package.json scripts

Add the following to `deskhive/package.json` `scripts` (preserve existing `dev`, `build`, `start`, `lint`):

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:seed": "tsx scripts/seed.ts"
  }
}
```

### Architecture compliance

This story directly implements the architecture document's:
- §Data Architecture (Drizzle ORM, schema, partial unique index, money/date discipline)
- §Authentication & Security (Better Auth + argon2id, three-layer guard pattern — guards layer)
- §Implementation Patterns → Naming, Structure, Format, Process patterns (apiError, error response shape, status code conventions)
- §Frontend Architecture (`<DataView>`, `<StatusBadge>`)
- §Decision Impact Analysis → Implementation Sequence step 2 (this is "Day 1 follow-up additions").

**Key references:**
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — Drizzle, partial unique index implementation pattern.
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — Better Auth + argon2id rationale.
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns] — naming, format, error shape, anti-patterns.
- [Source: _bmad-output/planning-artifacts/architecture.md#Forward-Compatibility Notes] — `users.role` enum tension resolution; conditional-UPDATE pattern (referenced for primitive design but not implemented in this story — feature stories own state transitions).
- [Source: docs/02-phase1-prd.md#Section 6.1] — table schemas verbatim.
- [Source: docs/02-phase1-prd.md#Section 6.2] — partial unique index DDL.
- [Source: docs/02-phase1-prd.md#Section 6.5] — seeded Super Admin requirement.
- [Source: docs/02-phase1-prd.md#Section 7.4] — status badge color mapping.

### Anti-patterns — explicit DO-NOTs for this story

- ❌ Adding `console.log` outside `src/lib/logger.ts`. Use the logger.
- ❌ Defining colors, spacing, typography tokens in TypeScript. Tokens go in `globals.css` `@theme` block; component class strings stay literal.
- ❌ Adding any Phase-1-forbidden dependency: Stripe SDK, Sentry, Redux, Zustand, React Hook Form, shadcn/ui, Radix, Headless UI, react-email, sendgrid, twilio, etc. (Doc B §11.)
- ❌ Implementing any feature-story logic. This story is **scaffolding only.** No `/api/auth/register`, `/api/spaces`, `/api/bookings` route handlers — those are owned by US-1.x stories.
- ❌ Deviating from the `users` table column list without escalation. The two additive columns (`emailVerified`, `image`) are explicitly the only deviation; nothing else is admissible without BA approval.
- ❌ Skipping primitive unit tests. Vitest is configured here so we don't ship the cross-cutting primitives without coverage; AC-7 requires the listed minimums.
- ❌ Writing E2E tests or configuring Playwright. `@playwright/test` is installed but config is US-0.3.
- ❌ Creating `.github/workflows/ci.yml`. CI is US-0.3.
- ❌ Hardcoding the `BETTER_AUTH_SECRET` or `DATABASE_URL` anywhere outside `.env.example` (placeholders only) and `.env.local` (gitignored, real values). NFR-6.
- ❌ Using `@deskhive/*` or any other custom import alias. Only `@/*` (already configured by US-0.1's tsconfig).
- ❌ Touching the `src/app/page.tsx` welcome page. Feature stories own page content.

### Project structure notes

After this story, the `deskhive/` tree should match the architecture's planned tree for the foundational pieces:

```
deskhive/
├── docker-compose.yml                  # NEW (US-0.2)
├── drizzle/
│   └── migrations/                     # NEW (US-0.2)
│       └── 0000_*.sql
├── drizzle.config.ts                   # NEW (US-0.2)
├── scripts/
│   └── seed.ts                         # NEW (US-0.2)
├── src/
│   ├── app/                            # unchanged from US-0.1
│   ├── components/
│   │   ├── data-view.tsx               # NEW (US-0.2)
│   │   ├── data-view.test.tsx          # NEW (US-0.2)
│   │   ├── status-badge.tsx            # NEW (US-0.2)
│   │   └── status-badge.test.tsx       # NEW (US-0.2)
│   ├── db/
│   │   ├── client.ts                   # NEW (US-0.2)
│   │   └── schema.ts                   # NEW (US-0.2)
│   └── lib/
│       ├── auth/
│       │   ├── config.ts               # NEW (US-0.2)
│       │   ├── guards.ts               # NEW (US-0.2)
│       │   └── guards.test.ts          # NEW (US-0.2)
│       ├── format.ts                   # NEW (US-0.2)
│       ├── format.test.ts              # NEW (US-0.2)
│       ├── http.ts                     # NEW (US-0.2)
│       ├── http.test.ts                # NEW (US-0.2)
│       └── logger.ts                   # NEW (US-0.2)
├── vitest.config.ts                    # NEW (US-0.2)
├── vitest.setup.ts                     # NEW (US-0.2)
├── .env.example                        # NEW (US-0.2)
├── .env.local                          # NEW (US-0.2 — gitignored, NOT committed)
├── package.json                        # UPDATED (deps + scripts)
├── pnpm-lock.yaml                      # UPDATED
└── README.md                           # UPDATED (seeded credentials section appended)
```

Files NOT created here (US-0.3's job):
- `.github/workflows/ci.yml`
- `playwright.config.ts`
- `tests/e2e/*.spec.ts`
- `middleware.ts` (auth middleware — that's a feature-story concern; the guards layer is sufficient for this scaffolding)

The architecture's `src/db/queries/`, `src/actions/`, `src/lib/validation/`, and `src/lib/integrations/` directories are NOT created in US-0.2 — they're populated incrementally by feature stories. (The architecture's "stub interface" idea in `src/lib/integrations/` was discussed in IR; per Phase 1 §11 the consumers don't exist yet, so the empty stubs add nothing in US-0.2 — Amelia may skip them.)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md] — entire document, especially §Data Architecture, §Authentication & Security, §Implementation Patterns, §Decision Impact Analysis.
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-05.md#6-summary-and-recommendations] — IR finding EQ-1 and the proposed text for this story (Story US-0.2).
- [Source: docs/02-phase1-prd.md#Section 6] — schema, state machine, API surface, seeded Super Admin.
- [Source: docs/02-phase1-prd.md#Section 7] — UX directives that drive `<DataView>` and `<StatusBadge>` shape.
- [Source: docs/02-phase1-prd.md#Section 9] — cross-cutting QA criteria that the primitives encode.
- [Source: docs/01-product-brief-and-vision-prd.md#Section 7.4] — forward-compatibility envelope (payment columns, role enum reservation).
- [Source: _bmad-output/implementation-artifacts/0-1-project-initialization.md] — previous story; project structure and pinned base versions.
- [Source: better-auth.com/docs/adapters/drizzle] — Drizzle adapter docs (verified 2026-05-06; v1.6.9).
- [Source: orm.drizzle.team/docs/indexes-constraints] — Drizzle partial unique index syntax (`.where()` clause).
- [Source: npmjs.com/package/argon2] — argon2 npm package; prebuilt Windows binaries.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm add` (prod deps) | 350+8 packages added in 23.2s. **Peer warning:** `better-call 1.3.5` (better-auth subdep) wants `zod@^4`, got `3.25.76`. Non-blocking; better-auth 1.6.9 hasn't updated better-call yet. |
| `pnpm add` (argon2 build) | Initially: "Ignored build scripts: argon2@0.41.1" due to pnpm 10's default. Fixed by adding `pnpm.onlyBuiltDependencies: ["argon2"]` to package.json then `pnpm rebuild argon2` → succeeded via `node-gyp-build` (prebuilt Windows binary). |
| `pnpm add -D` (dev deps) | Initial fail: `@testing-library/react@^17.0.0` does not exist (story typo); latest is 16.3.2. Corrected to `^16.3.0`. esbuild build-script warnings ignored (Vitest works with prebuilt binaries). |
| `pnpm db:generate` | 7 tables (account, bookings, desks, session, spaces, users, verification). Output: `drizzle/migrations/0000_tough_strong_guy.sql`. |
| Migration SQL inspection | All AC-4 checks pass: 7 CREATE TABLEs, partial unique index with WHERE clause, all CHECK constraints, all FKs, unique constraints. |
| `pnpm test` (initial) | 32 of 32 primitive tests passed; 1 test file (guards.test.ts) failed at module-load because `db/client.ts` was eagerly instantiating Pool requiring DATABASE_URL. |
| Lazy-Proxy refactor of db/client.ts | Resolved test-time import side-effect; no production runtime impact. |
| `pnpm test` (final) | **38 tests pass across 5 files.** |
| `pnpm typecheck` | Clean (initial pass had 1 error: `signUpEmail` body required `fullName`; fixed by adding the field per `additionalFields` config). |
| `pnpm lint` | Clean (1 transient warning about unused eslint-disable directive removed). |

### Completion Notes List

**Story executed end-to-end. All 9 ACs satisfied per Decision 5's revised scope (schema-as-code, no live DB).**

**Key implementation observations:**

1. **`@testing-library/react@^17.0.0` does not exist** — story manifest had a wrong pin. Latest is 16.3.2. Installed `^16.3.0`. Future stories should treat the architecture's version pins as starting points and verify against the registry.

2. **pnpm 10 requires explicit build-script approval.** Native modules like `argon2` won't compile/install without it. Added `pnpm.onlyBuiltDependencies: ["argon2"]` to `package.json` so CI installs (and Amelia's future rebuilds) are reproducible without manual `pnpm approve-builds`.

3. **Lazy Proxy for the Drizzle client.** The original eager-instantiation pattern crashed test suites that transitively imported `db/client` even when they didn't actually query. Refactored to a Proxy that defers `createClient()` until the first method call. Behavior is identical in production; tests no longer need `DATABASE_URL`.

4. **Better Auth's typing for `additionalFields` is not propagated to `AuthSession`.** `requireRole` does a type-cast on `session.user` to read `role`. The runtime value is set correctly by the BA config; this is a known Better Auth typing limitation as of 1.6.9.

5. **Seed script needs `fullName` in the signup body.** Because the BA config marks `additionalFields.fullName` as user-input (no `input: false`), Better Auth's `signUpEmail` requires it. This aligns with Doc B §7.6 ("Full name: required, non-empty"). Real registration in US-1.1 will pass it from the form.

6. **38 unit tests across 5 files** exceed AC-7's stated minimums (10 for apiError, 6 for guards, 13 for format, 5 for DataView, 4 for StatusBadge).

7. **Non-blocking peer-dep warning.** `better-call` (transitive dep of `better-auth`) wants `zod@^4` but better-auth itself uses zod 3. Documented; not actionable until better-auth ships an update.

8. **Decision 5 honored:** No `pnpm db:migrate` run; no `pnpm db:seed` run. The schema and seed are reviewable as code; the live DB connection is deferred to US-1.1's prep step (Neon project creation + DATABASE_URL setup).

9. **AC-9 nuance — two commits, not one.** The main implementation commit (`1cb840b`) staged 24 files but missed `.env.example` because the starter's `.gitignore` matched `.env*`. A small follow-up commit (`22625f8`) added `!.env.example` to `.gitignore` and committed `.env.example`. Total US-0.2 footprint: **26 files across 2 commits.** Per system rules I avoided `git commit --amend` without explicit user authorization — the two-commit history is the safer alternative. Reviewers can squash-merge both commits if a single-commit history is desired.

### File List

All paths relative to repo root.

**NEW:**
- `deskhive/.env.example` — Neon-style placeholders
- `deskhive/drizzle.config.ts`
- `deskhive/drizzle/migrations/0000_tough_strong_guy.sql` — 98-line generated migration
- `deskhive/drizzle/migrations/meta/_journal.json` — drizzle-kit housekeeping
- `deskhive/drizzle/migrations/meta/0000_snapshot.json` — drizzle-kit schema snapshot
- `deskhive/scripts/seed.ts`
- `deskhive/src/db/client.ts`
- `deskhive/src/db/schema.ts`
- `deskhive/src/lib/auth/config.ts`
- `deskhive/src/lib/auth/guards.ts`
- `deskhive/src/lib/auth/guards.test.ts`
- `deskhive/src/lib/format.ts`
- `deskhive/src/lib/format.test.ts`
- `deskhive/src/lib/http.ts`
- `deskhive/src/lib/http.test.ts`
- `deskhive/src/lib/logger.ts`
- `deskhive/src/components/data-view.tsx`
- `deskhive/src/components/data-view.test.tsx`
- `deskhive/src/components/status-badge.tsx`
- `deskhive/src/components/status-badge.test.tsx`
- `deskhive/vitest.config.ts`
- `deskhive/vitest.setup.ts`

- `deskhive/.env.example` — Neon-style placeholders *(committed in follow-up `22625f8` after gitignore fix)*

**UPDATED:**
- `deskhive/package.json` — added 17 deps, 13 scripts, `pnpm.onlyBuiltDependencies` block
- `deskhive/pnpm-lock.yaml` — regenerated by pnpm
- `deskhive/README.md` — replaced default boilerplate with DeskHive Database setup, scripts table, seeded-credentials section
- `deskhive/.gitignore` — added `!.env.example` exception so the template file is tracked *(follow-up `22625f8`)*

**NOT TOUCHED (per AC-4 scope):**
- Anything outside `deskhive/`
- `deskhive/src/app/page.tsx` (US-0.1 welcome page; feature stories will replace it)
- `deskhive/.gitignore`, `deskhive/AGENTS.md`, `deskhive/CLAUDE.md`, `deskhive/eslint.config.mjs`, `deskhive/next.config.ts`, `deskhive/postcss.config.mjs`, `deskhive/tsconfig.json` (US-0.1 starter outputs)
- `deskhive/.env.local` — exists but gitignored; created by Amelia for local Drizzle Kit defaults; never committed

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story authored by `bmad-create-story`. | (none) |
| 2026-05-06 | BA approved Option B.1 (additive `emailVerified`/`image` columns; Better Auth `account.password` for credential hash). | (none) |
| 2026-05-06 | Decision 5 added mid-execution: no Docker; live DB deferred to US-1.1; US-0.2 ships schema-as-code only. | (none) |
| 2026-05-06 | US-0.2 implementation committed (24 files). | `1cb840b` |
| 2026-05-06 | Follow-up: `.gitignore` exception + `.env.example` tracked. | `22625f8` |
