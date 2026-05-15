---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
inputDocuments:
  - docs/01-product-brief-and-vision-prd.md
  - docs/02-phase1-prd.md
workflowType: 'architecture'
project_name: 'vention-ba-bmad'
user_name: 'Vention'
date: '2026-05-05'
completedAt: '2026-05-05'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (Phase 1, authoritative — Document B):**
21 FRs grouped into 5 areas — Authentication (4), Inventory Management (5),
Discovery (4), Booking (5), Admin Booking Management (3) — realized as 4 epics
and 15 user stories (US-1.1 through US-4.3). The Phase 1 surface is
deliberately a strict subset of Document A's 9-group long-term FR set; Phases
2–4 features (payments, reviews, messaging, analytics, map browsing) are
explicitly out of scope per Document B Section 11 and must not leak into the
implementation.

**Non-Functional Requirements:**
Seven NFRs (Document B Section 5) drive architectural choices:
- Secure password hashing (bcrypt/argon2) — auth module concern.
- HTTP-only sessions/tokens — no client-side JS access to credentials.
- **Database-level double-booking prevention** — the single most consequential
  technical requirement (Document B Section 6.2). PostgreSQL partial unique
  index on `bookings (desk_id, booking_date) WHERE status IN
  ('PENDING','CONFIRMED')` is the prescribed mechanism.
- All money as integer cents.
- All dates as ISO date strings (YYYY-MM-DD); no timezone arithmetic in Phase 1.
- No hardcoded secrets.
- Standard HTTP status codes (200/201/204/400/401/403/404/409).

**Scale & Complexity:**
- Primary domain: full-stack web application (single deployable, REST API).
- Complexity level: low–medium. Phase 1 is largely CRUD over four tables; the
  one architecturally non-trivial problem is concurrency-safe booking, solved
  at the database layer.
- Estimated architectural components: 6 logical modules (Identity, Inventory,
  Discovery, Booking, Admin, Stubbed-Infrastructure interfaces) plus
  cross-cutting auth, session, and error-shape concerns.
- Two roles in Phase 1 (Guest, Super Admin); Document A's third role
  (Space Admin) is deferred but its enum value `SPACE_ADMIN` must be reserved
  from day one.
- Eight screens, seventeen REST endpoints, four database tables.

### Technical Constraints & Dependencies

**Hard constraints from PRDs:**
- **PostgreSQL is effectively required.** Document A Section 7.2 is explicit:
  the booking-overlap exclusion requirement (Section 4.4 FR-B2 long-term;
  Section 6.2 Phase 1) cannot be safely satisfied in application code under
  concurrent load. PostgreSQL provides partial unique indexes natively, and
  `EXCLUDE` constraints for the time-range bookings expected in later phases.
  An alternative database is admissible only with documented equivalent
  data-layer guarantees.
- **Forward-compatibility envelope (Document A Section 7.4) is non-negotiable**
  and cheap to honor in Phase 1: nullable `payment_status`/`payment_reference`
  columns on `bookings`, reserved `SPACE_ADMIN` role enum value, integer-cents
  money, UTC timestamps, polymorphic-ready bookable identity (Desk now,
  MeetingRoom later).
- **Stubbed infrastructure interfaces (Document A Section 7.5):** payment,
  email, SMS, storage are interfaced from day one with no-op or basic
  implementations behind them. Phase 1 ships zero outbound integrations.
- Single deployable web app (not microservices); decomposition is a Phase 4
  concern.
- REST API (no GraphQL).
- Single staging environment is sufficient for Phase 1.
- No OAuth, no email verification, no password reset in Phase 1.
- Default Tailwind utility classes only on the frontend (Document A Section
  6.3, Document B Section 7.1) — visual design wraps after MVP and must be
  achievable by class edits alone, without component-structure changes.

**Hard timeframe:**
- Two weeks (10 working days) per Document B header. The architecture must
  optimize for implementation throughput within that window — boring, familiar
  technologies that the team already knows beat clever choices that introduce
  learning cost.

### Cross-Cutting Concerns Identified

These concerns span multiple modules and must be addressed by the architecture
document explicitly so AI implementation agents apply them consistently:

1. **Authentication & role-based authorization** — every protected endpoint
   must verify role (Document B FR-A4, Section 9). The architecture must
   define a single auth/authorization mechanism that works identically for
   API and UI routes.
2. **Session management** — HTTP-only sessions or tokens (Document B NFR-2);
   not exposed to client JS.
3. **Booking concurrency / double-booking prevention** — the marquee
   correctness requirement. Enforced at the database layer via partial unique
   index, not at the application layer.
4. **Forward-compatibility envelope** — Phase 2-ready schema columns and
   role enum values present in Phase 1.
5. **Stubbed-interface pattern** for email, SMS, payment, storage — Phase 2
   plug-in points without refactoring the booking domain.
6. **UI state machine (loading / empty / error / loaded)** — every screen that
   loads data must render all four (Document B Section 7.3, Section 9).
   Architecture should provide a primitive that enforces this by construction
   rather than relying on per-screen discipline.
7. **Money as integer cents and dates as ISO strings** — type-level discipline
   throughout the stack; no floats, no timezone math in Phase 1.
8. **Consistent error response shape** — `{ "error": "human-readable",
   "code": "MACHINE_CODE" }` on every error response (Document B Section 9).
9. **Reskinnable frontend** — visual styling reachable through Tailwind class
   edits alone; component structure, props, and behavior must remain stable
   when the human Designer (Makhbuba) wraps the visual pass after MVP.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application — single deployable Next.js application providing
both the user-facing UI (server-rendered React with App Router) and the REST
API surface (Next.js Route Handlers under `/api/*` and `/admin/*`). Backed by
PostgreSQL.

### Starter Options Considered

| Option | Verdict | Reason |
|---|---|---|
| `create-next-app@latest` (official, Vercel) | **Selected** | Smallest sound foundation; zero opinions to strip out; latest Next.js by definition. |
| `create-t3-app` | Rejected | Bundles tRPC; Document A §7.1 mandates REST API. |
| `saasykits/nextjs-sessionauth-template` | Rejected | Bundles Stripe and email — both explicitly forbidden in Phase 1 (Document B §11). |
| `create-remix` | Honorable mention | Equivalent full-stack alternative; Next.js chosen for ecosystem mass. |
| `create-vite` + separate backend | Rejected | Violates "single deployable" guidance; multiplies infrastructure for a 2-week MVP. |
| RedwoodJS | Rejected | GraphQL-default; violates REST mandate. |

### Selected Starter: `create-next-app@latest`

**Rationale for Selection:**
The PRDs forbid most features that batteries-included community starters
bundle (payments, email, multi-tenancy, organizations). The official
`create-next-app` is the smallest opinion-free foundation that satisfies
TypeScript, Tailwind, App Router, and ESLint requirements with zero
post-install cleanup. Project-specific additions (database client, auth,
testing) are added in a single follow-up story so each addition is auditable
in version control.

**Initialization Command:**

```bash
pnpm create next-app@latest deskhive \
  --typescript \
  --tailwind \
  --app \
  --eslint \
  --src-dir \
  --import-alias "@/*" \
  --turbo \
  --use-pnpm
```

(Use `--use-npm` instead of `--use-pnpm` if pnpm is not the team's package
manager. The starter command is identical otherwise.)

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- Next.js 16.2 (App Router; Pages Router not used)
- TypeScript strict mode (default in `create-next-app`)
- React 19 (bundled with Next.js 16)
- Node.js 20 LTS or newer (Next.js 16 baseline)

**Styling Solution:**
- Tailwind CSS v4 (CSS-first configuration via `@theme` block — Makhbuba's
  Phase-2 reskin happens by editing `globals.css` and Tailwind utility
  classes, never by touching TypeScript)
- No additional design system. shadcn/ui or other libraries deliberately not
  added — Phase 1 ships with raw Tailwind utility classes per Document B §7.1.

**Build Tooling:**
- Turbopack (default in Next.js 16; 2-5x faster builds, 5-10x faster Fast
  Refresh than Webpack)
- ESLint with Next.js's recommended config

**Testing Framework (added in Day 1 follow-up story, not bundled):**
- Vitest for unit and integration tests
- Playwright for end-to-end tests (the demo flow in Document B §1.2 will be
  the central E2E test)

**Code Organization:**
- `src/` directory enabled (cleaner separation; recommended baseline)
- `@/*` import alias for absolute imports
- App Router file-system routing under `src/app/`
- API routes via Next.js Route Handlers under `src/app/api/`

**Development Experience:**
- Hot reload via Turbopack
- TypeScript strict mode catches type errors at build time
- Built-in dev server on `localhost:3000`

**Day 1 Follow-up Additions (separate story, not part of `create-next-app`):**

These are added by the first implementation story so each addition is
auditable:

- `drizzle-orm` 0.45.x + `drizzle-kit` for PostgreSQL schema and migrations
- `pg` (node-postgres) as the Postgres driver
- `better-auth` for HTTP-only cookie session authentication
  (Lucia is deprecated as of March 2025 and is not used)
- `vitest` + `@vitest/ui`
- `@playwright/test`
- `dotenv` for local environment variables
- A `docker-compose.yml` for a local Postgres 16 instance during development

**Hosting Target:**
- Single staging environment on Railway with managed Postgres add-on
- Deploys on push to `main` branch via Railway's GitHub integration
- Fly.io is an acceptable alternative if global edge becomes a concern in
  Phase 2; for Phase 1 single-region staging, Railway is the lowest-friction
  path

**Note:** Project initialization using the command above should be the first
implementation story. The Day 1 Follow-up Additions list above should be a
second story executed immediately after, before any feature work begins.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Bookable schema strategy: clean Desk-only schema in Phase 1 with documented
  Phase 2 migration to polymorphic `bookable_type`/`bookable_id` (Document A §7.4
  option b).
- Booking concurrency mechanism: rely on PostgreSQL partial unique index;
  catch unique-violation (SQLSTATE 23505) and return HTTP 409 with code
  `DESK_ALREADY_BOOKED`.
- Password hashing: argon2id (configured via Better Auth's custom password
  hasher API), satisfying Document B NFR-1.
- Authorization pattern: three layers — `middleware.ts` cookie check,
  per-handler `requireRole()` guard, per-resource `requireOwnership()` check.

**Important Decisions (Shape Architecture):**
- Validation: Zod with `drizzle-zod`-derived schemas, shared between API
  route handlers, Server Actions, and client forms.
- Frontend data: Server Components query Drizzle directly; mutations go
  through Server Actions using `useActionState` and `useFormStatus`.
- UI state primitive: a `<DataView>` component enforces the four required
  UI states (loading/empty/error/loaded) by construction.
- Forms: native `<form action={serverAction}>` plus Zod, no React Hook Form.
- Date picker: native `<input type="date">` (no library).
- Component library: none. Raw Tailwind utility classes only.

**Deferred Decisions (Phase 2+):**
- Caching layer (no Phase 1 requirement).
- Rate limiting (Document A NFR-3, not in Document B NFR).
- API documentation (OpenAPI/Swagger) beyond inline JSDoc and README curl examples.
- Centralized error tracking (Sentry/Datadog).
- Multi-instance scaling and observability (Document A NFR-6, NFR-5).

### Data Architecture

**Database:** PostgreSQL 16 (per Document A §7.2 mandate). Local development
via Docker Compose; staging via Railway managed Postgres add-on.

**ORM:** Drizzle ORM 0.45.x with the `pg` driver (node-postgres). Schema
defined in `src/db/schema.ts` as TypeScript with PostgreSQL column types.

**Migrations:** Drizzle Kit. Generated migration files committed under
`drizzle/migrations/`. Applied automatically by Railway as a release command
(`pnpm db:migrate`) before each deploy takes traffic.

**Bookable schema:** Phase 1 implements the clean Desk-only schema specified
verbatim in Document B §6.1 — `bookings.desk_id UUID NOT NULL REFERENCES
desks(id)`. Phase 2 migration plan (additive, non-destructive):
1. Add `bookable_type TEXT` and `bookable_id UUID` columns (nullable initially).
2. Backfill: `UPDATE bookings SET bookable_type='DESK', bookable_id=desk_id`.
3. Make both columns NOT NULL.
4. Replace the partial unique index `(desk_id, booking_date)` with
   `(bookable_id, bookable_type, booking_date)`.
5. Create the `meeting_rooms` table.
6. Optionally drop `desk_id` once all reads are off it.

**Booking concurrency:** Enforced at the database layer via the partial unique
index from Document B §6.2:

```sql
CREATE UNIQUE INDEX uniq_active_booking_per_desk_per_date
  ON bookings (desk_id, booking_date)
  WHERE status IN ('PENDING','CONFIRMED');
```

Application code performs `INSERT … RETURNING *` and catches the unique-violation
(SQLSTATE 23505) to return HTTP 409. No application-side reservation lock, no
SELECT-then-INSERT, no retry loop. The database is the source of truth.

**Validation:** Zod schemas in `src/lib/validation/`. Drizzle-zod derives
table-shaped schemas from the Drizzle schema. Same Zod schemas used by API
handlers, Server Actions, and client forms — input validation defined once.

**Caching:** None in Phase 1. Document A NFR-2 performance target is a
Phase-4 concern; current scale (single space, three desks for the demo) does
not warrant premature optimization.

**Money & dates type discipline:**
- Money columns: `INTEGER` cents only. Never `NUMERIC`, never `DECIMAL`,
  never floats anywhere in the codebase.
- Date columns: `DATE` (not `TIMESTAMPTZ`) for `booking_date`; serialized as
  YYYY-MM-DD string in JSON. Server runs in UTC; "today" computed as
  `new Date().toISOString().slice(0, 10)` server-side.
- Audit timestamps (`created_at`, `updated_at`): `TIMESTAMPTZ` UTC, set by
  Postgres `now()` defaults.

### Authentication & Security

**Authentication library:** Better Auth (current stable). Lucia is deprecated
(March 2025) and not used.

**Password hashing:** argon2id, configured via Better Auth's custom password
hasher (`password.hash` / `password.verify` config). `argon2` npm package
(native module). Satisfies Document B NFR-1.

**Session storage:** Database-backed sessions in a Better Auth-managed
`sessions` table, same Postgres instance. HTTP-only secure cookies with
`SameSite=Lax`; not accessible to client JavaScript per Document B NFR-2.

**Authorization pattern (three layers):**

1. **`middleware.ts`** at the project root checks session cookie presence on
   protected route prefixes (`/admin/*`, `/my-bookings`, `/api/admin/*`,
   `/api/bookings/me`, `/api/bookings/:id/cancel`). Unauthenticated UI
   requests redirect to `/login`; unauthenticated API requests return 401.
2. **Per-handler `requireRole(role)`** in `src/lib/auth/guards.ts` — every
   route handler that requires a specific role calls this; mismatches return
   403 with code `FORBIDDEN`.
3. **Per-resource `requireOwnership(resource, userId)`** for user-scoped
   actions (e.g. `POST /bookings/:id/cancel` requires the booking's
   `guest_user_id` to match the session user).

**CSRF:** Same-origin requests + HTTP-only cookies + `SameSite=Lax` is
sufficient for Phase 1. State-changing requests are POST/PUT to same origin.

**Rate limiting:** Deferred to Phase 2 (Document A NFR-3 — not in Document B).

**Secrets management:** `.env.local` for local development (gitignored);
`.env.example` committed with placeholder values. Railway env vars for
staging. No secrets in source.

### API & Communication Patterns

**API style:** REST via Next.js App Router Route Handlers under
`src/app/api/`. Endpoint URLs and methods exactly as specified in Document B
§6.4. No GraphQL.

**Error response shape:** Single helper `apiError(code, message, status)`
in `src/lib/http.ts` returning
`Response.json({ error: message, code }, { status })`. Used by every error
return. Document B §9 cross-cutting requirement.

**Status code conventions:** Per Document B NFR-7. Common codes:
- 200 successful GET / PUT.
- 201 successful POST creating a resource.
- 204 successful DELETE / cancel with no body.
- 400 validation failure (Zod parse error).
- 401 missing or invalid session.
- 403 wrong role or wrong owner.
- 404 resource not found.
- 409 conflict (double-booking, terminal-state transition attempt).

**API documentation:** Document B §6.4 is authoritative; supplemented by
README curl examples and per-handler JSDoc. OpenAPI/Swagger deferred to
Phase 2.

**Money & dates at the API boundary:** Money as integer cents; dates as
YYYY-MM-DD strings (no time, no offset).

### Frontend Architecture

**Rendering model:** Server Components by default; Client Components only
where interactivity is needed (forms, date picker, badges with state).

**Data fetching:**
- Server Components query Drizzle directly (no internal API call for SSR).
- Client-initiated mutations use Next.js Server Actions with `useActionState`
  for response state and `useFormStatus` for the automatic
  disable-on-submit requirement (Document B §7.5).

**State management:** None at app level. Server state lives on the server;
client interactivity uses local `useState`. No Redux, Zustand, Jotai, or
React Query.

**Forms:** Native `<form action={serverAction}>`. Zod validation on the
server; field-level errors returned via `useActionState` and rendered inline.
`useFormStatus` handles the button-disable-during-submit requirement
(Document B §7.5). No React Hook Form.

**Date picker:** Native `<input type="date">`. Returns YYYY-MM-DD,
locale-independent, accessible, no dependency.

**The four UI states (Document B §7.3):** A `<DataView>` component in
`src/components/data-view.tsx` accepts a discriminated union of
`loading | empty | error | loaded` and renders the corresponding branch.
Every screen that loads data wraps its content in this component.
Enforcement is structural, not per-screen discipline.

**Status badges (Document B §7.4):** A `<StatusBadge status={...} />`
component centralizes the placeholder Tailwind class mapping. Makhbuba's
post-MVP reskin edits this single file.

**Component library:** None. Raw Tailwind utility classes per Document B §7.1.
The reusable primitives Phase 1 needs (Button, Input, Card, Badge, DataView,
FormField, Layout) live in `src/components/` as plain React + Tailwind v4.
Component structure, props, and behavior are stable; visual styling is
restyleable by class edits alone.

**Routing:** Next.js App Router file-system routing. Routes match the screen
inventory in Document B §7.2 exactly.

**Accessibility:** Native semantics (real `<form>`, `<button>`, `<label>`,
`<input>`); no custom interactive widgets that would require ARIA work.
Document B does not specify an accessibility level; we ship semantically
clean HTML and revisit in Phase 2.

### Infrastructure & Deployment

**Hosting:** Railway with the managed PostgreSQL 16 add-on, single staging
environment. Deploys on push to `main` after GitHub Actions checks pass.

**CI:** GitHub Actions workflow `.github/workflows/ci.yml`. On every PR and
push to `main`:
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` (Vitest)
- `pnpm test:e2e` (Playwright against a containerized Postgres)
- `pnpm build`

**Migrations on deploy:** Railway release command runs `pnpm db:migrate`
before the new container receives traffic.

**Local development:** `docker-compose.yml` provides a Postgres 16 container.
Workflow:
1. `docker compose up -d`
2. `pnpm install`
3. `pnpm db:migrate`
4. `pnpm db:seed` (creates the seeded Super Admin from Document B §6.5)
5. `pnpm dev`

**Logging:** Structured JSON logs to stdout via a small `pino`-style helper.
Railway captures stdout. Document A NFR-5 (request tracing, business metrics)
is a long-term requirement; Phase 1 logs only enough to debug the demo flow.

**Monitoring & alerting:** None in Phase 1. Phase 2 concern.

**Scaling:** Single Railway service instance. Document A NFR-6 horizontal
scaling is a Phase 4 concern.

### Decision Impact Analysis

**Implementation Sequence:**

1. `create-next-app` initialization (Step 3 starter command).
2. Day 1 follow-up additions: Drizzle, Better Auth, argon2, Vitest, Playwright,
   docker-compose Postgres.
3. Drizzle schema for the four Phase 1 tables (Document B §6.1) including the
   partial unique index from §6.2.
4. Better Auth configuration (Drizzle adapter, argon2 hasher, session table).
5. The `requireSession` / `requireRole` / `requireOwnership` guard helpers.
6. The `apiError` helper and the `<DataView>` and `<StatusBadge>` components.
7. Stories US-1.1 through US-4.3 in epic order.

**Cross-Component Dependencies:**

- Better Auth's `sessions` and (its own minimal) `users` table either share or
  coexist with the application's `users` table (Document B §6.1). The Day 1
  follow-up story must reconcile these — likely by configuring Better Auth to
  use the application's `users` table directly rather than creating a parallel
  one. Drizzle adapter docs cover this.
- The `apiError` helper, the auth guards, and the `<DataView>` primitive are
  upstream of every story; Murat's cross-cutting tests (Document B §9) target
  these.
- The partial unique index is the linchpin; the booking-creation handler's
  catch-23505 logic is the *only* code that may rely on receiving the unique
  violation, and Murat's concurrency test is the only test that asserts it
  fires under load.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

This section locks down the conventions all implementation agents (Amelia,
Murat, and any future contributor) must follow. Many rules originate in the
PRDs (Document B §6, §7, §9); the rest are decided here to prevent drift.

### Naming Patterns

**Database Naming Conventions:**
- Tables: `snake_case` plural (`users`, `spaces`, `desks`, `bookings`,
  `sessions`).
- Columns: `snake_case` (`guest_user_id`, `total_price_cents`, `booking_date`,
  `created_at`).
- Primary keys: `id UUID DEFAULT gen_random_uuid()`.
- Foreign keys: `{singular_target_table}_id` (e.g. `space_id`, `desk_id`).
- Indexes: `{purpose}_{table}_{columns}` (e.g.
  `uniq_active_booking_per_desk_per_date` from Document B §6.2).
- Constraints (CHECK): inline on the column where possible.
- Enum string values: `SCREAMING_SNAKE_CASE` (`PENDING`, `CONFIRMED`,
  `SUPER_ADMIN`, `GUEST`).

**Drizzle schema (TypeScript) ↔ DB column mapping:**
- TypeScript field names: `camelCase` (`guestUserId`, `totalPriceCents`).
- Drizzle aliases TS→DB column at the schema definition site:

```ts
guestUserId: uuid('guest_user_id').notNull().references(() => users.id),
totalPriceCents: integer('total_price_cents').notNull(),
```

**API Naming Conventions:**
- Endpoint paths: lowercase, plural collections, hyphenated multi-word
  segments. Use Document B §6.4 verbatim — do not introduce new paths or
  rename existing ones.
- Route parameters: `:id`, `:date` (Next.js dynamic segment style).
- Query parameters: `camelCase` (`?city=Berlin`, `?date=2026-06-01`).
- HTTP methods: GET (read), POST (create or sub-action like cancel/confirm),
  PUT (full replace edit), DELETE (only where Document B §6.4 specifies it —
  Phase 1 has none).
- HTTP headers: standard lowercase or `Title-Case` per RFC. No custom
  headers in Phase 1.

**JSON Naming Conventions:**
- Field names: `camelCase` (`guestUserId`, `totalPriceCents`, `bookingDate`).
- The Drizzle schema's TypeScript field names *are* the JSON keys; no
  remapping at the boundary.

**Code Naming Conventions:**
- File names: `kebab-case` (`data-view.tsx`, `auth-guards.ts`,
  `my-bookings/page.tsx`).
- Component default exports: `PascalCase` (`export default function DataView()`).
- Type and interface names: `PascalCase` (`BookingStatus`, `SessionUser`).
- Functions and variables: `camelCase` (`requireRole`, `currentUser`).
- Module-level constants: `SCREAMING_SNAKE_CASE`
  (`BOOKING_STATUSES`, `MAX_DESKS_PER_SPACE`).
- Status string literals (in TS) match DB enum values exactly:
  `'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED'`.

### Structure Patterns

**Project Organization:**

```
deskhive/
├── .github/
│   └── workflows/ci.yml
├── drizzle/
│   ├── migrations/
│   └── meta/
├── public/                       # static assets (favicon only in Phase 1)
├── scripts/
│   ├── seed.ts                   # creates seeded Super Admin
│   └── ...
├── src/
│   ├── app/
│   │   ├── (public)/             # landing, register, login, space detail
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # /  — Browse Spaces
│   │   │   ├── register/page.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── spaces/[id]/page.tsx
│   │   ├── (guest)/              # guest-authenticated routes
│   │   │   ├── layout.tsx        # enforces guest session
│   │   │   └── my-bookings/page.tsx
│   │   ├── admin/                # admin routes
│   │   │   ├── layout.tsx        # enforces SUPER_ADMIN
│   │   │   ├── spaces/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   └── bookings/page.tsx
│   │   ├── api/
│   │   │   ├── auth/             # Better Auth handler + login/register/logout
│   │   │   ├── spaces/
│   │   │   ├── bookings/
│   │   │   └── admin/
│   │   ├── globals.css           # Tailwind v4 @theme + base styles
│   │   └── layout.tsx            # root layout
│   ├── components/               # shared UI primitives
│   │   ├── data-view.tsx
│   │   ├── status-badge.tsx
│   │   ├── form-field.tsx
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   └── header.tsx
│   ├── actions/                  # Server Actions, per domain
│   │   ├── auth.ts
│   │   ├── bookings.ts
│   │   ├── spaces.ts
│   │   └── admin-bookings.ts
│   ├── db/
│   │   ├── client.ts             # Drizzle pg client
│   │   ├── schema.ts             # all tables, indexes, constraints
│   │   └── queries/              # reusable query functions
│   │       ├── bookings.ts
│   │       ├── spaces.ts
│   │       ├── desks.ts
│   │       └── users.ts
│   └── lib/
│       ├── auth/
│       │   ├── config.ts         # Better Auth setup
│       │   └── guards.ts         # requireSession, requireRole, requireOwnership
│       ├── validation/           # Zod schemas
│       │   ├── auth.ts
│       │   ├── bookings.ts
│       │   └── spaces.ts
│       ├── http.ts               # apiError helper, status code helpers
│       ├── logger.ts             # JSON logger
│       └── format.ts             # money/date formatting helpers
├── tests/
│   └── e2e/
│       ├── demo-flow.spec.ts     # Document B §1.2 — the demo flow
│       ├── booking-concurrency.spec.ts
│       └── auth.spec.ts
├── .env.example
├── .gitignore
├── docker-compose.yml            # local Postgres 16
├── drizzle.config.ts
├── eslint.config.mjs
├── middleware.ts                 # session cookie check on protected paths
├── next.config.ts
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── README.md                     # demo run instructions, seeded creds
├── tsconfig.json
└── vitest.config.ts
```

**File Structure Patterns:**
- Unit tests are co-located: `auth-guards.ts` ↔ `auth-guards.test.ts` in the
  same directory.
- E2E tests live under `tests/e2e/`, separate from source — they have their
  own Playwright config and DB lifecycle.
- One Server Action module per bounded context.
- One Drizzle queries module per bounded context, mirroring the actions.
- Each route handler is a single `route.ts` file with named GET/POST/PUT
  exports.
- Static assets live in `public/`; Phase 1 has no images bundled (Spaces use
  external URLs per Document B §11).

### Format Patterns

**API Response Formats:**
- Success responses return the resource directly. No `{ data: ... }` envelope.
- Error responses use `{ error: string, code: string }` (Document B §9).
- 204 responses have no body.
- Lists are returned as JSON arrays directly (`[{...}, {...}]`), not wrapped.

**Status code usage (Document B NFR-7):**
- 200 — successful GET / PUT.
- 201 — successful POST creating a resource (returns the created resource).
- 204 — successful POST sub-action with no body (cancel, confirm, reject).
- 400 — request validation failed (Zod error). Body:
  `{ error, code: 'VALIDATION_ERROR', fields: { fieldName: 'message' } }`.
- 401 — no/invalid session. Body:
  `{ error: 'Authentication required', code: 'UNAUTHORIZED' }`.
- 403 — wrong role or ownership. Body: `{ error, code: 'FORBIDDEN' }`.
- 404 — resource not found.
- 409 — conflict. The most common Phase 1 use is double-booking
  (`code: 'DESK_ALREADY_BOOKED'`) and terminal-state transition attempts
  (`code: 'INVALID_STATE_TRANSITION'`).

**Data Exchange Formats:**
- Money: integer cents in JSON (`"totalPriceCents": 2500`). Format as
  `$XX.XX` only at render time.
- Calendar dates (`bookingDate`): YYYY-MM-DD strings (no time, no offset).
- Audit timestamps (`createdAt`, `updatedAt`): ISO 8601 UTC strings with
  `Z` suffix (`"2026-05-05T14:30:00.000Z"`).
- Booleans: `true` / `false`. Never `1` / `0`.
- Null values: explicit `null` for nullable fields, never omit the key.
- Single-resource responses: object directly, not `{ resource: {...} }`.
- List responses: array directly, not `{ items: [...] }`.

### Communication Patterns

**Server-Action / Form Patterns:**
- Server Action signature:
  `async function actionName(prevState, formData) { 'use server'; ... }`.
- Return shape on validation failure:
  `{ status: 'error', code: 'VALIDATION_ERROR', fields: {...} }`.
- Return shape on conflict:
  `{ status: 'error', code: 'DESK_ALREADY_BOOKED', message: '...' }`.
- Return shape on success:
  `{ status: 'success', redirectTo?: '/path' }` — or use Next.js `redirect()`
  from the action when no UI feedback is needed first.
- Action consumed by `useActionState`; submit button uses `useFormStatus` for
  the disable-on-pending requirement (Document B §7.5).

**State Management Patterns:**
- Server state lives on the server; query Drizzle directly in Server
  Components.
- Client interactivity uses local `useState` only.
- No global state store. No context for app-level data.
- Form state managed by `useActionState` (server-driven) and
  `useFormStatus` (status-driven) — no third option.

### Process Patterns

**Error Handling:**
- Route handlers wrap their body in try/catch; on error, log via the JSON
  logger and return `apiError(code, message, status)`.
- Never expose stack traces or internal error messages to clients.
- The booking creation handler explicitly catches Postgres unique-violation
  (SQLSTATE `23505`) on the `uniq_active_booking_per_desk_per_date` index and
  returns 409 with code `DESK_ALREADY_BOOKED`. Other unique violations (e.g.
  desk label uniqueness) map to their own codes.
- Server Actions catch errors and return the structured error shape above —
  never throw unhandled errors to the client.
- A root `error.tsx` boundary in `src/app/` handles unexpected client-side
  React errors with Document B's "Something went wrong. Please try again."
  message (no stack trace).

**Loading States:**
- Data screens: `<DataView status={...}>` is the single primitive that
  renders one of `loading | empty | error | loaded`. Every screen that loads
  data uses this.
- Form submissions: `useFormStatus().pending` drives button disabled state
  and any inline pending UI. No bespoke `isLoading` flag.
- Suspense boundaries are acceptable in Server Components but not required.

**Validation:**
- Validation happens at the boundary (route handler / Server Action) using
  Zod, before any DB call.
- Client-side validation is presentation-only; server-side validation is
  authoritative. Never trust the client.
- Failed validation returns 400 with field-level errors:
  `{ error: 'Validation failed', code: 'VALIDATION_ERROR', fields: { email: 'Must be a valid email' } }`.

**Logging:**
- Single JSON logger in `src/lib/logger.ts` exporting `info`, `warn`, `error`.
- Each log entry includes: `timestamp`, `level`, `message`, `requestId`
  (when available), and any context fields.
- No `console.log` in committed code outside the logger module — ESLint rule
  `no-console` enforces this.

### Enforcement Guidelines

**All implementation agents MUST:**

1. Match Document B §6.4 endpoint paths verbatim — never invent new paths,
   rename existing ones, or add aliases.
2. Use the established `apiError` helper for every error response.
3. Use `requireSession` / `requireRole` / `requireOwnership` guards on every
   protected route — no inline session checks.
4. Wrap data-loading screens in `<DataView>` — all four states must render.
5. Use Server Actions + Zod for all form submissions — no React Hook Form,
   no client-side fetch from forms.
6. Catch SQLSTATE `23505` only in the booking-creation handler — no
   application-side overlap detection.
7. Use only Tailwind utility classes for styling — no inline `style={...}`,
   no styled-components, no CSS Modules, no design-token imports from TS.
8. Match the Drizzle schema field names exactly when reading/writing the DB
   in TypeScript — never alias them at the call site.

**Pattern Enforcement Mechanisms:**
- ESLint config enforces the `naming-convention` rule, `no-console`, and
  `import/order`.
- TypeScript `strict: true` with `noUncheckedIndexedAccess` catches missing
  null checks.
- Vitest tests verify auth guards, the booking-concurrency 409 path, and
  the four UI states for each screen (per Document B §9).
- Playwright E2E test for the demo flow (Document B §1.2) is the
  acceptance gate for "Phase 1 done."
- Every story file references this section by anchor; story acceptance
  includes "follows the patterns in architecture.md §Implementation Patterns."

### Pattern Examples

**Good — booking-creation route handler:**

```ts
// src/app/api/bookings/route.ts
export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    requireRole(session, 'GUEST');

    const parsed = createBookingSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        'Validation failed',
        400,
        { fields: parsed.error.flatten().fieldErrors },
      );
    }

    const booking = await db
      .insert(bookings)
      .values({
        guestUserId: session.userId,
        spaceId: parsed.data.spaceId,
        deskId: parsed.data.deskId,
        bookingDate: parsed.data.bookingDate,
        status: 'PENDING',
        totalPriceCents: parsed.data.totalPriceCents,
      })
      .returning();

    return Response.json(booking[0], { status: 201 });
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_active_booking_per_desk_per_date')) {
      return apiError(
        'DESK_ALREADY_BOOKED',
        'This desk is already booked for that date',
        409,
      );
    }
    logger.error('booking_creation_failed', { err });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

**Good — DataView usage:**

```tsx
// src/app/(public)/page.tsx (Server Component)
export default async function BrowseSpaces({ searchParams }) {
  const result = await loadSpaces(searchParams.city);
  return (
    <DataView
      status={result.status}
      emptyMessage="No spaces available yet."
      errorMessage="Something went wrong. Please try again."
    >
      {result.status === 'loaded' && <SpaceList spaces={result.data} />}
    </DataView>
  );
}
```

**Anti-patterns — explicit DO-NOTs:**

- ❌ `SELECT … FROM bookings WHERE desk_id = … AND booking_date = …` then
  `INSERT` based on the result. Race-condition-vulnerable; the DB index
  is the source of truth.
- ❌ `import { Button } from '@/components/ui/button'` from shadcn/ui.
  Phase 1 ships raw Tailwind components only.
- ❌ `import { useForm } from 'react-hook-form'`. Use Server Actions.
- ❌ `const total = priceDollars * 100`. Money is integer cents end-to-end.
- ❌ `return { data: bookings, error: null }`. Return the resource directly.
- ❌ `const today = new Date()` for booking-date comparison.
  Use `new Date().toISOString().slice(0, 10)` and compare ISO strings.
- ❌ `const PRIMARY_COLOR = '#3B82F6'` in TypeScript. Color tokens live in
  `globals.css` `@theme`.
- ❌ Bypassing `requireRole` because "the route is under `/admin/`."
  Every protected handler calls the guard explicitly.

## Project Structure & Boundaries

### Complete Project Directory Structure

The full tree is documented in §Implementation Patterns — Structure Patterns
above. This section adds the mapping from PRD requirements to specific
locations.

### Architectural Boundaries

**API Boundary (external — what clients see):**
- All HTTP endpoints listed in Document B §6.4 are realized as Next.js Route
  Handlers under `src/app/api/`. The API surface is closed: no endpoint
  exists outside §6.4, and every §6.4 endpoint exists.
- The Better Auth handler mounts at `src/app/api/auth/[...all]/route.ts` and
  serves the session/login/register/logout flows. The Document B endpoints
  `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
  `GET /me` are thin wrappers that delegate to Better Auth.

**Component Boundary (UI):**
- Server Components fetch data directly via `src/db/queries/*`.
- Client Components are marked with `'use client'` and only handle
  interactivity (date picker selection, form state via `useFormStatus`,
  dropdowns). They never contain business logic or DB access.
- Shared UI primitives in `src/components/` are stateless and presentational.
  They take props, render Tailwind. No data fetching inside them.

**Service Boundary (none, in Phase 1):**
- Phase 1 is a single deployable. There are no internal services,
  message buses, or background workers. Server Components and Server
  Actions are synchronous request handlers.
- Forward-compatibility scaffolding for Phase 2 external services lives in
  `src/lib/integrations/`:

  ```
  src/lib/integrations/
  ├── email/
  │   ├── types.ts          # interface EmailProvider { send(...): Promise<void> }
  │   └── noop-provider.ts  # default no-op implementation
  ├── sms/
  │   ├── types.ts
  │   └── noop-provider.ts
  ├── payment/
  │   ├── types.ts          # interface PaymentProvider { authorize, capture, refund }
  │   └── noop-provider.ts
  └── storage/
      ├── types.ts          # interface StorageProvider { put, get }
      └── noop-provider.ts
  ```

  These are not consumed by any Phase 1 story; they exist so Phase 2's
  Stripe/SendGrid/Twilio integrations can be added without touching the
  booking domain. Per Document A §7.5.

**Data Boundary:**
- Only `src/db/queries/*` modules and `src/lib/auth/config.ts` (Better Auth's
  Drizzle adapter) issue queries. Route handlers and Server Actions call
  these query functions; they never construct SQL or call `db.select(...)`
  directly.
- The Drizzle schema in `src/db/schema.ts` is the single source of truth for
  table shapes. Any change to a column or index goes through a Drizzle Kit
  migration committed under `drizzle/migrations/`.

**Auth Boundary:**
- Three layers, each owning a distinct decision:
  1. `middleware.ts` — does this URL prefix require *any* session?
  2. `src/lib/auth/guards.ts::requireRole(role)` — does this handler require
     a *specific* role?
  3. `src/lib/auth/guards.ts::requireOwnership(resource, userId)` — does
     this user own this specific resource?

### Requirements to Structure Mapping

#### Database tables (Document B §6.1)

| Table | Defined in |
|---|---|
| `users` | `src/db/schema.ts` (the `usersTable` export) |
| `spaces` | `src/db/schema.ts` (the `spacesTable` export) |
| `desks` | `src/db/schema.ts` (the `desksTable` export, with `(space_id, label)` unique constraint) |
| `bookings` | `src/db/schema.ts` (the `bookingsTable` export, with the partial unique index `uniq_active_booking_per_desk_per_date` from Document B §6.2) |
| `sessions` | Owned by Better Auth via the Drizzle adapter; declared alongside in `src/db/schema.ts` for visibility |

The seed for the Super Admin user (Document B §6.5) lives in
`scripts/seed.ts` and is invoked by `pnpm db:seed`.

#### REST endpoints (Document B §6.4)

| Method & Path | File |
|---|---|
| `POST /auth/register` | `src/app/api/auth/register/route.ts` |
| `POST /auth/login` | `src/app/api/auth/login/route.ts` |
| `POST /auth/logout` | `src/app/api/auth/logout/route.ts` |
| `GET /me` | `src/app/api/me/route.ts` |
| `GET /spaces?city=X` | `src/app/api/spaces/route.ts` |
| `GET /spaces/:id` | `src/app/api/spaces/[id]/route.ts` |
| `GET /spaces/:id/availability?date=YYYY-MM-DD` | `src/app/api/spaces/[id]/availability/route.ts` |
| `POST /bookings` | `src/app/api/bookings/route.ts` |
| `GET /bookings/me` | `src/app/api/bookings/me/route.ts` |
| `POST /bookings/:id/cancel` | `src/app/api/bookings/[id]/cancel/route.ts` |
| `GET /admin/bookings` | `src/app/api/admin/bookings/route.ts` |
| `POST /admin/bookings/:id/confirm` | `src/app/api/admin/bookings/[id]/confirm/route.ts` |
| `POST /admin/bookings/:id/reject` | `src/app/api/admin/bookings/[id]/reject/route.ts` |
| `POST /admin/spaces` | `src/app/api/admin/spaces/route.ts` |
| `PUT /admin/spaces/:id` | `src/app/api/admin/spaces/[id]/route.ts` |
| `POST /admin/spaces/:id/desks` | `src/app/api/admin/spaces/[id]/desks/route.ts` |
| `PUT /admin/desks/:id` | `src/app/api/admin/desks/[id]/route.ts` |

#### Screens (Document B §7.2)

| Screen | Route | Page file |
|---|---|---|
| Landing / Browse Spaces | `/` | `src/app/(public)/page.tsx` |
| Space Detail | `/spaces/:id` | `src/app/(public)/spaces/[id]/page.tsx` |
| Register | `/register` | `src/app/(public)/register/page.tsx` |
| Login | `/login` | `src/app/(public)/login/page.tsx` |
| My Bookings | `/my-bookings` | `src/app/(guest)/my-bookings/page.tsx` |
| Admin Spaces List | `/admin/spaces` | `src/app/admin/spaces/page.tsx` |
| Admin Space Edit | `/admin/spaces/:id` | `src/app/admin/spaces/[id]/page.tsx` |
| Admin Bookings List | `/admin/bookings` | `src/app/admin/bookings/page.tsx` |

The route groups `(public)` and `(guest)` carry their own `layout.tsx` files
that handle the relevant auth assertion. The `admin/` subtree's
`layout.tsx` enforces `SUPER_ADMIN` role.

#### Stories to files (Document B §8)

The 15 stories in Document B Section 8 map to specific files. Each row lists
the principal file that the story touches; ancillary touches (validation
schema, query function, test file) are implied by the patterns and not
re-listed here.

**Epic 1 — Authentication:**

| Story | Page | API route | Server Action | Query / DB |
|---|---|---|---|---|
| US-1.1 Guest Registration | `app/(public)/register/page.tsx` | `app/api/auth/register/route.ts` | `actions/auth.ts::registerAction` | `db/queries/users.ts::createUser` |
| US-1.2 Login | `app/(public)/login/page.tsx` | `app/api/auth/login/route.ts` | `actions/auth.ts::loginAction` | `db/queries/users.ts::findByEmail` |
| US-1.3 Logout | `components/header.tsx` (logout button) | `app/api/auth/logout/route.ts` | `actions/auth.ts::logoutAction` | n/a (Better Auth deletes session) |

**Epic 2 — Inventory Management:**

| Story | Page | API route | Server Action | Query / DB |
|---|---|---|---|---|
| US-2.1 Create Space | `app/admin/spaces/page.tsx` (modal/inline form) | `app/api/admin/spaces/route.ts` | `actions/admin-spaces.ts::createSpace` | `db/queries/spaces.ts::insertSpace` |
| US-2.2 Edit Space | `app/admin/spaces/[id]/page.tsx` | `app/api/admin/spaces/[id]/route.ts` | `actions/admin-spaces.ts::updateSpace` | `db/queries/spaces.ts::updateSpace` |
| US-2.3 Add Desk | `app/admin/spaces/[id]/page.tsx` | `app/api/admin/spaces/[id]/desks/route.ts` | `actions/admin-spaces.ts::addDesk` | `db/queries/desks.ts::insertDesk` |
| US-2.4 Edit Desk | `app/admin/spaces/[id]/page.tsx` | `app/api/admin/desks/[id]/route.ts` | `actions/admin-spaces.ts::updateDesk` | `db/queries/desks.ts::updateDesk` |

**Epic 3 — Discovery & Booking:**

| Story | Page | API route | Server Action | Query / DB |
|---|---|---|---|---|
| US-3.1 Browse Spaces | `app/(public)/page.tsx` | `app/api/spaces/route.ts` | n/a (read via Server Component) | `db/queries/spaces.ts::listPublishedSpaces` |
| US-3.2 View Space Detail | `app/(public)/spaces/[id]/page.tsx` | `app/api/spaces/[id]/route.ts`, `app/api/spaces/[id]/availability/route.ts` | n/a | `db/queries/spaces.ts::getSpaceWithDesks`, `db/queries/bookings.ts::deskAvailability` |
| US-3.3 Create Booking | `app/(public)/spaces/[id]/page.tsx` (booking form) | `app/api/bookings/route.ts` | `actions/bookings.ts::createBooking` | `db/queries/bookings.ts::insertBooking` (catches SQLSTATE 23505) |
| US-3.4 View My Bookings | `app/(guest)/my-bookings/page.tsx` | `app/api/bookings/me/route.ts` | n/a (read via Server Component) | `db/queries/bookings.ts::listForGuest` |
| US-3.5 Cancel My Booking | `app/(guest)/my-bookings/page.tsx` (cancel button) | `app/api/bookings/[id]/cancel/route.ts` | `actions/bookings.ts::cancelBooking` | `db/queries/bookings.ts::cancelOwnedPending` |

**Epic 4 — Admin Booking Management:**

| Story | Page | API route | Server Action | Query / DB |
|---|---|---|---|---|
| US-4.1 View All Bookings | `app/admin/bookings/page.tsx` | `app/api/admin/bookings/route.ts` | n/a | `db/queries/bookings.ts::listAll` |
| US-4.2 Confirm Booking | `app/admin/bookings/page.tsx` (confirm button) | `app/api/admin/bookings/[id]/confirm/route.ts` | `actions/admin-bookings.ts::confirmBooking` | `db/queries/bookings.ts::transitionToConfirmed` |
| US-4.3 Reject Booking | `app/admin/bookings/page.tsx` (reject button) | `app/api/admin/bookings/[id]/reject/route.ts` | `actions/admin-bookings.ts::rejectBooking` | `db/queries/bookings.ts::transitionToRejected` |

#### Cross-cutting concerns

| Concern | Primary location |
|---|---|
| Authentication & session | `src/lib/auth/config.ts` (Better Auth setup), `src/app/api/auth/[...all]/route.ts` (handler) |
| Authorization guards | `src/lib/auth/guards.ts` (`requireSession`, `requireRole`, `requireOwnership`) |
| Booking-overlap concurrency | DB-level: `src/db/schema.ts` partial unique index. App-level: `src/db/queries/bookings.ts::insertBooking` with SQLSTATE-23505 catch. |
| Forward-compat envelope (nullable payment cols, reserved enum) | `src/db/schema.ts` (column definitions) |
| Stubbed-interface pattern | `src/lib/integrations/{email,sms,payment,storage}/` |
| UI four-state primitive | `src/components/data-view.tsx` |
| Money/cents formatting | `src/lib/format.ts::formatCents` |
| Date helpers (today-UTC, ISO compare) | `src/lib/format.ts::todayIso`, `src/lib/format.ts::isPastDate` |
| Consistent error response shape | `src/lib/http.ts::apiError` |
| Logger | `src/lib/logger.ts` |
| Status badge | `src/components/status-badge.tsx` |

### Integration Points

**Internal communication patterns:**
- **UI ↔ Data:** Server Components import from `src/db/queries/*` and call
  query functions directly. No internal HTTP. This is the fast path that
  makes Phase 1 demoable quickly.
- **UI ↔ Mutation:** Client Components submit `<form action={serverAction}>`.
  Server Actions live in `src/actions/*`, validate via Zod, call
  `src/db/queries/*`, return `{status, ...}` shape.
- **External API consumers ↔ Data:** Route Handlers in `src/app/api/*`
  validate via Zod, call `src/db/queries/*`, return JSON.
- **Auth flow:** Browser → middleware (cookie check) → route group layout
  (role assertion) → Server Component or Route Handler (handler-level guard
  via `requireRole`/`requireOwnership`) → Drizzle query.

**External integrations (Phase 1):**
- **None.** No outbound HTTP calls of any kind.
- Forward-compat interface stubs exist under `src/lib/integrations/` per
  Document A §7.5 but are not consumed by any Phase 1 story.

**Data flow — booking creation (the marquee correctness path):**

```
Browser (form submit)
  → useActionState (client)
  → Server Action: actions/bookings.ts::createBooking
    → requireSession(req)
    → requireRole(session, 'GUEST')
    → createBookingSchema.safeParse(formData)
    → db/queries/bookings.ts::insertBooking
       → Drizzle: INSERT … RETURNING *
       → Postgres: rejects via partial unique index if conflict (23505)
    → on 23505: return { status: 'error', code: 'DESK_ALREADY_BOOKED' }
    → on success: redirect('/my-bookings')
  → Client receives action result, renders status badge
```

### File Organization Patterns

**Configuration files (project root):**
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`,
  `eslint.config.mjs`, `postcss.config.mjs`, `drizzle.config.ts`,
  `playwright.config.ts`, `vitest.config.ts`, `docker-compose.yml`,
  `middleware.ts`, `.env.example`, `.gitignore`, `README.md`.

**Source organization:** see §Implementation Patterns above for the full
directory tree.

**Test organization:**
- Unit tests `*.test.ts` co-located next to source.
- E2E tests under `tests/e2e/` with their own Playwright config.
- `tests/e2e/demo-flow.spec.ts` is the central acceptance test — covers
  Document B §1.2 end to end.
- `tests/e2e/booking-concurrency.spec.ts` issues two parallel booking
  requests for the same desk + date and asserts exactly one succeeds with
  201, the other gets 409.
- Cross-cutting test fixtures in `tests/e2e/fixtures/` create the seeded
  Super Admin and any temporary Guest accounts.

**Asset organization:**
- `public/` — favicon only. No bundled images. Spaces use external
  `primary_image_url` strings (Unsplash for the demo per Document B §11).
- `src/app/globals.css` — Tailwind v4 `@theme` block plus base resets.
  This is the single file Makhbuba edits to reskin.

### Development Workflow Integration

**Local development:**
1. `docker compose up -d` — starts Postgres 16.
2. `pnpm install` — installs deps.
3. `pnpm db:migrate` — applies committed Drizzle migrations.
4. `pnpm db:seed` — creates the seeded Super Admin (Document B §6.5).
5. `pnpm dev` — Next.js dev server on `localhost:3000` with Turbopack hot
   reload.
6. `pnpm test --watch` (separate terminal) — Vitest watch mode.
7. `pnpm test:e2e` — runs Playwright against the local server when desired.

**Build process:**
- `pnpm build` produces `.next/` output via Turbopack.
- Type-checking via `tsc --noEmit` runs in CI (`pnpm typecheck`).
- ESLint runs in CI (`pnpm lint`).

**Deployment (Railway):**
- Push to `main` triggers GitHub Actions CI.
- On green, Railway pulls the same commit, runs the release command
  `pnpm db:migrate`, then starts the Next.js production server with
  `pnpm start`.
- Postgres add-on is provisioned alongside the service in the Railway
  project; `DATABASE_URL` is auto-injected.
- `BETTER_AUTH_SECRET` and any other secrets are set as Railway env vars.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All major dependencies are mutually compatible at their current stable
versions: Next.js 16.2 + React 19 + Better Auth + Drizzle 0.45.x + pg +
Tailwind v4 + argon2 + Vitest + Playwright. Better Auth's Next.js
integration explicitly supports App Router and custom password hashers.
Drizzle's pg driver is well-trodden under Next.js Server Components.
Tailwind v4's CSS-first config integrates cleanly with the App Router via
the `@tailwindcss/postcss` plugin.

**Pattern Consistency:**
Naming, structure, format, and process patterns all align with the chosen
stack. Drizzle's column aliasing reconciles the `snake_case` DB names with
the `camelCase` TypeScript / JSON convention. Server Actions plus Zod
satisfy the form-validation and disable-on-submit requirements without
introducing client-side form libraries. The `<DataView>` primitive
enforces the four-state UI contract structurally.

**Structure Alignment:**
The directory tree supports every routing, data-access, validation, and
testing pattern documented above. Bounded contexts (auth, bookings,
spaces, admin) live in parallel modules under `src/db/queries/`,
`src/actions/`, `src/lib/validation/`, and `src/app/api/`. Cross-cutting
primitives (`apiError`, guards, `<DataView>`, `<StatusBadge>`, `format.ts`)
live in dedicated locations and are referenced everywhere.

### Requirements Coverage Validation ✅

**Functional Requirements:**
All 17 Document B Phase 1 FRs map to user stories in §Project Structure →
Stories to files. Every story has a named page file, API route, Server
Action (where applicable), and database query.

**Non-Functional Requirements:**
- NFR-1 password hashing → argon2 via Better Auth custom hasher.
- NFR-2 HTTP-only sessions → Better Auth default.
- NFR-3 DB-level double-booking prevention → partial unique index from §6.2.
- NFR-4 money in integer cents → INTEGER column type, format helpers.
- NFR-5 ISO date strings → DATE column type, no timezone arithmetic.
- NFR-6 no hardcoded secrets → `.env.local` and Railway env vars.
- NFR-7 standard HTTP status codes → §Implementation Patterns status code
  conventions.

**Forward-Compatibility (Document A §7.4):**
- `payment_status` and `payment_reference` columns: nullable on bookings
  from day one.
- `SPACE_ADMIN` role: see §Forward-Compatibility Notes — reserved in TS
  type, deferred in DB CHECK constraint per Document B §6.1 verbatim
  schema.
- Polymorphic bookable: clean Desk-only schema in Phase 1 with documented
  Phase 2 additive migration plan.
- Stubbed-interface scaffolding for email, SMS, payment, storage exists
  under `src/lib/integrations/` with no-op default providers.

**UX Directives (Document B §7):**
All eight screens have page files; the four UI states are enforced by the
shared `<DataView>` component; status badges are centralized in
`<StatusBadge>`; form validation is enforced by Zod schemas; the disable-
on-submit requirement is satisfied structurally by `useFormStatus`.

**Cross-Cutting QA (Document B §9):**
Each cross-cutting check has a named architectural owner — auth guards
own 401/403, `<DataView>` owns the four states, `apiError` owns the error
shape, the schema/format helpers own integer-cents and ISO-date discipline.

### Forward-Compatibility Notes

**The `users.role` enum tension (resolved):**

Document A §7.4 directs that the `users.role` enum *include* `SPACE_ADMIN`
as a defined value. Document B §6.1 specifies a CHECK constraint that
allows only `'GUEST'` and `'SUPER_ADMIN'`. Document B is authoritative for
the build per its §0.1 anti-hallucination rule, so the DB CHECK matches
Document B verbatim. Document A's intent is honored at the type-system
layer:

- TypeScript: `type Role = 'GUEST' | 'SUPER_ADMIN' | 'SPACE_ADMIN'` —
  `SPACE_ADMIN` is a known literal, even though the DB will reject inserts
  with it in Phase 1.
- Phase 2 migration: a single non-destructive DDL statement extending the
  CHECK constraint to admit `'SPACE_ADMIN'`. No data migration needed.

**Booking state-machine race safety (formalized):**

Every booking state transition is implemented as a conditional UPDATE that
includes the source state in its `WHERE` clause and checks the affected
row count. Concurrent confirm-vs-cancel or double-confirm requests are
serialized by Postgres's row-level MVCC; the second request finds zero
rows updated and the handler returns HTTP 409 with code
`INVALID_STATE_TRANSITION`. This pattern is mandatory for every transition
handler — no transition uses an unconditional UPDATE.

```ts
// canonical state transition pattern
const result = await db
  .update(bookings)
  .set({ status: nextStatus, updatedAt: new Date() })
  .where(and(eq(bookings.id, bookingId), eq(bookings.status, sourceStatus)))
  .returning();

if (result.length === 0) {
  throw new InvalidStateTransitionError();
}
```

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical decisions are documented with versions verified against
current upstream releases. Implementation patterns are concrete enough
that Amelia can begin coding from this document alone. Anti-patterns are
listed explicitly to prevent agent drift.

**Structure Completeness:**
The complete directory tree is specified down to the file level. Every
PRD endpoint, screen, story, and table maps to an exact file path.
Component boundaries (UI / data / auth / external) are named.

**Pattern Completeness:**
Naming, structure, format, communication, and process patterns are all
specified. Anti-patterns are explicitly enumerated. Enforcement
mechanisms (ESLint rules, TypeScript strict mode, test fixtures) are
identified.

### Gap Analysis Results

**Gaps found and resolved:**

1. **`users.role` enum tension between Document A and Document B** —
   resolved with the typesystem-reserves-DB-defers approach above.
2. **Booking state-machine race conditions** — resolved with the mandatory
   conditional-UPDATE pattern above.

**Acceptable Phase 1 limitations (intentional, documented):**

1. **No auto-cancel of stale PENDING bookings.** Document A FR-B4 deferred
   to Phase 2 per Document B §11. Bookings persist in PENDING until manual
   admin action.
2. **No payment processing.** Document B §11. Forward-compat columns exist
   on `bookings` but are not written to.
3. **No email or SMS notifications.** Document B §11. Status changes
   visible only on user-initiated refresh.
4. **No rate limiting on auth endpoints.** Document A NFR-3 deferred to
   Phase 2 — not in Document B NFRs.
5. **No centralized error tracking.** Phase 2 concern.
6. **No multi-instance scaling, no caching, no CDN.** Phase 4 concerns
   per Document A NFR-6.

**No critical gaps remain.**

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (§Project Context Analysis)
- [x] Scale and complexity assessed
- [x] Technical constraints from both PRDs identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented with verified versions
- [x] Technology stack fully specified
- [x] Booking-overlap implementation pattern locked
- [x] Forward-compatibility envelope honored

**✅ Implementation Patterns**
- [x] Naming conventions established (DB, API, JSON, code)
- [x] Structure patterns defined (directory layout, file colocation)
- [x] Format patterns specified (response shape, status codes,
      money/date discipline)
- [x] Communication patterns documented (Server Actions, no global state)
- [x] Process patterns documented (errors, loading, validation,
      state-machine race safety)
- [x] Anti-patterns explicitly enumerated

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] All 21 FRs, 7 NFRs, 17 endpoints, 8 screens, 15 stories, 4 tables
      mapped to specific file paths

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High. The architecture closes the loop between
Document A's long-term vision and Document B's authoritative Phase 1
scope without contradiction. The two real gaps surfaced in validation
(role-enum tension, state-machine race safety) have explicit resolutions
documented above.

**Key Strengths:**
- Booking concurrency is solved at the DB layer with a single line of DDL
  and a 4-line app-side error handler — no application-level coordination
  primitives needed.
- Server Components + Server Actions remove the entire "client-side
  fetch + auth + loading state" class of problems for forms and reads.
- `<DataView>` enforces the four UI states by construction; Murat's tests
  assert against a single primitive rather than per-screen discipline.
- The reskinnable-by-CSS-only architecture lets Makhbuba's Day-10 work
  proceed in parallel with implementation if desired, without merge
  conflicts.
- Forward-compat envelope is honored cheaply: a few nullable columns and
  a TypeScript literal that buys Phase 2 a frictionless migration.

**Areas for Future Enhancement:**
- API documentation: OpenAPI spec generation in Phase 2 when the surface
  grows.
- Observability: structured logs forwarded to a managed ingester (Logtail,
  Datadog, etc.) in Phase 2.
- Rate limiting: introduce on auth endpoints in Phase 2 (Document A
  NFR-3).
- Multi-instance scaling and caching: Phase 4 concerns per the long-term
  roadmap.

### Implementation Handoff

**For Bob (`bmad-create-story` skill, sprint planning):**
- This architecture is the primary input for `bmad-sprint-planning`. The 15
  stories in Document B §8 plus two scaffolding stories (project init,
  Day-1 dependencies) form the sprint backlog.
- Each story file should reference §Project Structure → Stories to files
  for principal file paths and §Implementation Patterns for conventions.

**For Amelia (`bmad-dev-story` skill, implementation):**
- Follow the file paths in §Project Structure exactly. Do not invent
  endpoints, screens, or fields outside Document B §6.4, §7.2, §6.1.
- Apply the patterns in §Implementation Patterns mechanically. Anti-pattern
  list is enforceable as a code review checklist.
- For booking creation, the conditional-INSERT-with-23505-catch is the
  *only* approved concurrency-safe path.
- For state transitions, the conditional-UPDATE-with-rowcount-check is
  the *only* approved transition mechanism.

**For Murat (`bmad-tea`, `bmad-qa-generate-e2e-tests`):**
- The cross-cutting tests in Document B §9 target named architectural
  primitives. Test against the primitives, not per-handler — that scales
  better and catches drift earlier.
- The marquee correctness test is `tests/e2e/booking-concurrency.spec.ts`:
  two parallel `POST /bookings` for the same desk + date → exactly one 201,
  exactly one 409 with code `DESK_ALREADY_BOOKED`.
- The acceptance gate for "Phase 1 done" is `tests/e2e/demo-flow.spec.ts`
  passing — that's Document B §1.2 end to end.

**For Sally and Makhbuba (post-MVP visual design):**
- Visual customization is class-edit-only. Tailwind v4 `@theme` block in
  `src/app/globals.css` carries design tokens. The `<StatusBadge>`
  component centralizes the status color mapping.
- Component structure, props, and behavior must remain stable. If a
  visual decision requires a structural change, escalate to the BA.

**First Implementation Priority:**
The first two stories (to be added by Bob during sprint planning) should be:
1. Project initialization via `pnpm create next-app@latest deskhive ...`
   (command in §Starter Template Evaluation).
2. Day-1 dependencies + schema: install Drizzle, Better Auth, argon2,
   Vitest, Playwright; create Drizzle schema file with the four Phase 1
   tables and the partial unique index; configure Better Auth with the
   custom argon2 hasher and Drizzle adapter; create the `apiError` helper,
   the auth guards, the `<DataView>` and `<StatusBadge>` components, and
   the format helpers; commit the seeded Super Admin migration.

After these two scaffolding stories are green, the 15 PRD stories can be
implemented in epic order (Auth → Inventory → Discovery & Booking → Admin
Booking Management) per Document B Appendix A.
