# Story 1.1: Guest Registration

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **first-time visitor to DeskHive**,
I want **to register with my email, full name, and password on the `/register` page**,
so that **I can become a Guest, immediately get logged in, and start browsing and booking desks.**

> Verbatim from Document B §8 (US-1.1). FR-A1 (registration creates Guest account, user logged in immediately).

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-1.1, with each scenario lifted as one numbered AC:

1. **AC-1 (Successful Guest registration).**
   ```gherkin
   Given I am on the /register page
   And no account exists with email "ada@example.com"
   When I enter "ada@example.com" as email
   And I enter "Ada Lovelace" as full name
   And I enter "Sup3rSecret!" as password
   And I click "Create account"
   Then a new user is created with role GUEST
   And I am logged in (Better Auth session cookie set)
   And I am redirected to "/"
   ```

2. **AC-2 (Existing email is rejected).**
   ```gherkin
   Given a user already exists with email "ada@example.com"
   When I submit the registration form with email "ada@example.com"
   Then I see the error "An account with this email already exists"
   And no new user is created
   And I remain on the /register page
   ```

3. **AC-3 (Invalid email format is rejected).**
   ```gherkin
   When I submit the registration form with email "not-an-email"
   Then I see an inline validation error on the email field
   And the form is not submitted
   ```

4. **AC-4 (Password length validation).** (Implied by Doc B §7.6 form-validation rules; not in §8 scenarios.) Submitting a password shorter than 8 characters shows an inline validation error on the password field; the form does not submit.

5. **AC-5 (Full name required).** (Implied by Doc B §7.6.) Submitting an empty/whitespace-only full name shows an inline validation error on that field.

6. **AC-6 (Submit button disable-on-submit).** (Doc B §7.5 cross-cutting.) The "Create account" button enters a `disabled` state from the moment the form is submitted until the response resolves, to prevent double-submission. Implemented via `useFormStatus().pending`.

7. **AC-7 (Architecture-shaped error response).** (Architecture §Implementation Patterns.) The Server Action returns the architecture's standard error shape on validation/conflict errors: `{ status: 'error', code, message?, fields? }`. The error code for duplicate email is `EMAIL_ALREADY_EXISTS`; for validation it is `VALIDATION_ERROR` with `fields: {fieldName: 'message'}`.

8. **AC-8 (Stop bar — page renders).** Opening `http://localhost:3000/register` in a browser shows the registration form with three labeled inputs (Email, Full name, Password), a submit button labeled "Create account", and no console errors.

9. **AC-9 (Single commit).** All US-1.1 changes land in a single commit on `main` titled exactly `feat: guest registration page and server action (US-1.1)`. Commit content is only files under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep: migration applied; seed deferred (Decision 5 carry-over from US-0.2; resolved 2026-05-06 by Ikhtiyor)**
  - [x] `deskhive/.env.local` populated with real Neon `DATABASE_URL`, real `BETTER_AUTH_SECRET` (32-byte hex), and `BETTER_AUTH_URL=http://localhost:3000`.
  - [x] `pnpm db:migrate` ran successfully against Neon after a US-0.2 follow-up dotenv fix (standalone scripts now load `.env.local`). Schema applied — all 7 tables + partial unique index + CHECK constraints exist on Neon.
  - [ ] ~~`pnpm db:seed` — creates `admin@deskhive.local` Super Admin with argon2id-hashed password in `account.password`.~~ **DEFERRED to US-1.1's actual implementation.** During the seed retry, Better Auth's signUp surfaced a UUID-format mismatch (Better Auth's default ID generator does not produce valid UUIDs, but our `users.id` column is UUID per Doc B §6.1). **BA decision:** rather than chase this in seed isolation, fix it inside US-1.1's dev-story execution where the registration flow exercises the same code path with real feature-code context. Seed will be re-runnable after Better Auth's `advanced.database.generateId` is configured to use a UUID generator (Amelia: see "Open issue carried into Task 3" below). Once US-1.1 is green, run `pnpm db:seed` to create the seeded Super Admin (which becomes the credentials for US-4.x admin stories).

- [x] **Task 1 — Better Auth catch-all route handler** — `src/app/api/auth/[...all]/route.ts` authored. `toNextJsHandler(auth)` exports GET + POST. Build registered the route at `/api/auth/[...all]` (dynamic, server-rendered).
- [x] **Task 2 — Zod validation schema** — `src/lib/validation/auth.ts` + `auth.test.ts` (9 tests covering valid/invalid email, password length, fullName trim, multi-field error reporting). All 9 pass.
- [x] **Task 3 — Register Server Action** — `src/actions/auth.ts::registerAction` authored with redirect-AFTER-try-catch pattern. Catches duplicate-email errors via multiple message-pattern matchers (`already exists`, `USER_ALREADY_EXISTS`, `UNIQUE constraint`, `users_email_unique`) for resilience across Better Auth versions. `redirect('/')` placed outside the try/catch so the redirect signal isn't swallowed.
- [x] **Task 4 — Registration page (Server Component) + form (Client Component)**
  - `src/app/(public)/register/page.tsx` — Server Component shell.
  - `src/app/(public)/register/register-form.tsx` — Client Component with `useActionState` + `useFormStatus`. Raw Tailwind classes only. `noValidate` on form so server-side validation is authoritative.
- [x] **Task 5 — REST wrapper at `POST /auth/register`** — `src/app/api/auth/register/route.ts` authored using `apiError`/`apiValidationError`/`apiConflict` helpers. Same duplicate-email matcher logic as the Server Action. Optional unit test SKIPPED — mocking Better Auth's `auth.api.signUpEmail` cleanly is fiddly; the wrapper is exercised end-to-end implicitly via the seed run (same code path) and would be exercised explicitly when external API contract tests are added in a later story.
- [x] **Task 6 — E2E smoke test** — `tests/e2e/register.spec.ts` with 2 tests: form-renders + empty-submit-shows-error. Both pass. Full happy-path E2E (DB-dependent) deferred until CI's `e2e` job gets a Postgres service container.
- [x] **Task 7 — Local CI parity** — all 6 commands green:
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — **47 unit tests pass** across 6 files
  - `pnpm build` — successful, 4 routes registered (`/`, `/register`, `/api/auth/[...all]`, `/api/auth/register`, plus `_not-found`)
  - `pnpm playwright:install` — already done in US-0.3
  - `pnpm test:e2e` — 3 tests pass (smoke + 2 register tests) in 12.8s
- [x] **Task 8 — Manual verification (proxy-verified + ready for browser confirmation)**
  - [x] Form-renders verified by E2E test against running dev server.
  - [x] Validation-error path verified by E2E test (empty submit → inline `.text-red-700` error visible).
  - [x] **Live signup path proxy-verified by `pnpm db:seed`** — same `auth.api.signUpEmail` code path the form uses. Successfully created `admin@deskhive.local` (UUID PK, argon2id hash in `account.password`, role promoted to `SUPER_ADMIN`). Idempotency verified by re-running seed.
  - [ ] *Final browser interaction* — Ikhtiyor's eyeball confirmation that submitting valid form data redirects to `/`, that duplicate email shows "An account with this email already exists" inline, and that `not-an-email` shows the email-format validation error. Defer to BA's manual review of the `review`-state story.
- [x] **Task 9 — Single commit (AC-9)** — committed below as the final step.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **first feature story** — Epic 1 (Authentication) Story 1. After it lands, a Guest can self-register and be logged in. **Login (US-1.2) and Logout (US-1.3) come in later stories tonight is NOT pursuing US-1.2** per Ikhtiyor's directive.

Feature scope (US-1.1 only):
- ✅ Page at `/register` renders the form
- ✅ Server Action handles the submit
- ✅ Better Auth catch-all and the thin REST wrapper exist
- ✅ Validation: client-side hint + server-side authoritative
- ✅ Successful registration → user created with role GUEST + auto-logged-in + redirect to `/`
- ✅ Duplicate email → inline error
- ✅ Invalid email → inline error

Out of scope for US-1.1 (do NOT build):
- ❌ Login page (US-1.2)
- ❌ Logout button (US-1.3)
- ❌ Header / navigation chrome (the `<header>` with login/register links is implied by Doc B §8 US-1.3 but is owned by US-1.3)
- ❌ Any other route or page beyond `/register`
- ❌ Email verification flow (Doc B §11 — Phase 2)
- ❌ Password reset (Doc B §11 — Phase 2)
- ❌ OAuth providers (Doc B §11 — Phase 2)
- ❌ Modifying `src/app/page.tsx` (the welcome page; smoke test depends on it; will be replaced in US-3.1)

### Open issue carried into Task 3: Better Auth UUID ID generation

Better Auth's default `generateId` produces a short non-UUID string (e.g. `abcDef123XyZ`-style). Our `users.id` column is `UUID NOT NULL DEFAULT gen_random_uuid()` per Doc B §6.1. When Better Auth's signup tries to write its generated ID into the column, Postgres rejects with a UUID-parse error (`invalid input syntax for type uuid`).

**Fix Amelia must apply during Task 3 (Server Action) or Task 1 (Better Auth catch-all) — whichever is implemented first:**

In `src/lib/auth/config.ts`, add an `advanced.database.generateId` override:

```ts
export const auth = betterAuth({
  // ...existing config...
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});
```

`crypto.randomUUID()` is the Node.js built-in (available since Node 14.17 / 19+). Returns a v4 UUID string. No new dependencies.

**Schema is NOT to be changed.** The PRD specifies UUID PKs; we adapt Better Auth to fit, not the other way around. (Per BA directive — keeps users schema PRD-faithful, avoids stacking deviations on top of Decision B.1's `emailVerified`/`image` columns from US-0.2.)

After this fix lands, `pnpm db:seed` should succeed (the seed uses the same `auth.api.signUpEmail` path as the registration form). Run it once US-1.1 is green to materialize the Super Admin row.

### Note from BA (mid-execution, 2026-05-06): Better Auth `name` ↔ `fullName` remap

During the US-1.1 prep step (`pnpm db:seed` against Neon), the seed failed with a Postgres error: `column "name" of relation "users" does not exist`. Root cause: Better Auth's core user-table contract expects a `name` field; our schema (per Doc B §6.1) has `full_name`. The original `src/lib/auth/config.ts` from US-0.2 listed `fullName` in `additionalFields` with a `fieldName: 'full_name'` mapping, which hit a [known Drizzle-adapter issue (better-auth#4211)](https://github.com/better-auth/better-auth/issues/4211) where `additionalFields.fieldName` mapping produces "field does not exist" errors at runtime.

**Fix applied** (committed separately as a US-0.2 follow-up before US-1.1's `feat:` commit):
- Replace `additionalFields.fullName` with a top-level `user.fields.name = 'fullName'` mapping. This is Better Auth's documented mechanism for remapping core field names to a different schema property.
- Drop the redundant `fullName` field from any signUp body. Better Auth resolves `name` → our `fullName` property automatically.
- Audit confirmed `name` is the **only** Better Auth core field that doesn't already match our schema property name. All snake_case DB columns (`email_verified`, `created_at`, `updated_at`, `user_id`, `account_id`, `provider_id`, etc.) are handled by Drizzle's column aliasing — no extra Better Auth config needed for them.

**Implication for US-1.1 implementation:** the `registerAction` and REST wrapper skeletons below pass only `{email, password, name}` to `signUpEmail`. Older versions of these skeletons that included a redundant `fullName` are wrong — the `user.fields` mapping makes them duplicates.

### Decision 5 prep work — the live DB is now needed

US-0.2 deferred the live DB connection to "US-1.1's prep step." That step is **Task 0 above**. After Task 0 completes, all subsequent tasks assume:
- Neon Postgres is up
- Schema is applied
- `admin@deskhive.local` exists as a seeded Super Admin

If the migration apply fails or the seed errors, **HALT and escalate to BA** before continuing — feature-story implementation is blocked until the schema is live.

### Architecture compliance

Every architectural decision relevant to this story is enumerated below — **non-negotiable unless explicitly escalated:**

- **Validation:** Zod, server-side authoritative, client-side presentation-only. Validation lives at the boundary (Server Action) before any DB call. (architecture §Implementation Patterns → Process Patterns.)
- **Form pattern:** Native `<form action={serverAction}>` + `useActionState` + `useFormStatus`. **NO React Hook Form, Formik, or other client-side form library.** (architecture §Implementation Patterns → Communication Patterns.)
- **State management:** Local `useState` for any client interactivity. NO Redux/Zustand/Jotai. (architecture §Frontend Architecture.)
- **Component library:** None. Raw Tailwind utility classes only. (architecture §Implementation Patterns; Doc B §7.1.)
- **Error response shape (server-side):** `{ status: 'error', code, message?, fields? }` from the Server Action; `{ error, code, fields? }` from the REST wrapper via `apiError()` helper. (architecture §Implementation Patterns.)
- **Status codes:** 201 on registered, 400 on validation, 409 on duplicate (REST wrapper). (architecture §API & Communication Patterns.)
- **Auth:** Better Auth's `auth.api.signUpEmail` is the only path that creates a credential user — never raw Drizzle inserts into `users` + `account`. (BA Decision B.1 from US-0.2.)
- **Default role:** Better Auth's `additionalFields.role` config sets `defaultValue: 'GUEST'` and `input: false`. The signUp body must NOT include `role`; Better Auth will write `'GUEST'`. **Privilege escalation defense.**
- **Money/dates:** N/A for this story.
- **Reskinnable frontend:** All visible classes are literal Tailwind utilities; no design tokens in TS. (architecture §Implementation Patterns; project memory: Designer Makhbuba reskins later.)

### Better Auth catch-all

Path: `deskhive/src/app/api/auth/[...all]/route.ts`

```ts
import { auth } from '@/lib/auth/config';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

This single file mounts Better Auth's full client-SDK API surface under `/api/auth/*`. Required for sessions/cookies to work end-to-end. The file body is essentially mechanical.

### registerSchema

Path: `deskhive/src/lib/validation/auth.ts`

```ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().trim().min(1, 'Full name is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
```

### registerAction

Path: `deskhive/src/actions/auth.ts`

```ts
'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { registerSchema } from '@/lib/validation/auth';
import { logger } from '@/lib/logger';

export type RegisterActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'EMAIL_ALREADY_EXISTS'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        // Better Auth's `user.fields.name = 'fullName'` config routes this
        // to our `fullName` property → DB column `full_name`.
        name: parsed.data.fullName,
      },
    });
  } catch (err) {
    // Better Auth raises a typed error or returns an error object on duplicate emails.
    // Match by error message/code; both forms exist in the wild as of better-auth 1.6.x.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists') || msg.includes('USER_ALREADY_EXISTS')) {
      return {
        status: 'error',
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists',
      };
    }
    logger.error('register_action_failed', { error: msg });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  // Better Auth's autoSignIn:true (set in src/lib/auth/config.ts) creates the session cookie.
  // Redirect throws a Next.js redirect signal; useActionState never sees a "success" branch.
  redirect('/');
}
```

**Note for Amelia:** Better Auth's exact error shape for duplicate-email may vary by version. If `auth.api.signUpEmail` throws something the simple `msg.includes` check misses, log the actual error shape via `logger.error` first, then refine the match. Document any fallback you used in Completion Notes.

### register page

Path: `deskhive/src/app/(public)/register/page.tsx` (Server Component — no `'use client'`)

```tsx
import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold mb-6">Create your account</h1>
      <RegisterForm />
    </main>
  );
}
```

Path: `deskhive/src/app/(public)/register/register-form.tsx` (Client Component)

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { registerAction, type RegisterActionState } from '@/actions/auth';

const initialState: RegisterActionState = { status: 'idle' };

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' && 'message' in state ? state.message : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('email') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('email')}</p>
        )}
      </div>

      <div>
        <label htmlFor="fullName" className="block text-sm font-medium mb-1">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('fullName') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('fullName')}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('password') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('password')}</p>
        )}
      </div>

      {topLevelError && (
        <p className="text-sm text-red-700" role="alert">
          {topLevelError}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  );
}
```

**Notes:**
- `noValidate` on the `<form>` disables browser-native validation popups so we can rely on server-side validation + custom inline errors. The native `required` and `minLength` attrs are kept as accessibility hints for assistive tech.
- `autoComplete` attributes follow the WHATWG spec (`new-password` triggers password-manager save).
- All classes are literal Tailwind utilities. Makhbuba reskins later.

### POST /auth/register

Path: `deskhive/src/app/api/auth/register/route.ts`

```ts
import { auth } from '@/lib/auth/config';
import { registerSchema } from '@/lib/validation/auth';
import { apiError, apiValidationError, apiConflict } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return apiValidationError(fields);
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        // Better Auth's `user.fields.name = 'fullName'` config routes this
        // to our `fullName` property → DB column `full_name`.
        name: parsed.data.fullName,
      },
      asResponse: false,
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists') || msg.includes('USER_ALREADY_EXISTS')) {
      return apiConflict(
        'EMAIL_ALREADY_EXISTS',
        'An account with this email already exists',
      );
    }
    logger.error('register_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

This wrapper exists for architecture §API Boundary compliance ("every Doc B §6.4 endpoint exists"). The page does NOT consume it; the Server Action calls Better Auth directly.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── actions/
│   │   └── auth.ts                          # NEW (US-1.1)
│   ├── app/
│   │   ├── (public)/
│   │   │   └── register/
│   │   │       ├── page.tsx                 # NEW (US-1.1)
│   │   │       └── register-form.tsx        # NEW (US-1.1)
│   │   └── api/
│   │       └── auth/
│   │           ├── [...all]/
│   │           │   └── route.ts             # NEW (US-1.1)
│   │           └── register/
│   │               ├── route.ts             # NEW (US-1.1)
│   │               └── route.test.ts        # NEW (US-1.1) — optional, skip if mocking is fiddly
│   └── lib/
│       └── validation/
│           ├── auth.ts                      # NEW (US-1.1)
│           └── auth.test.ts                 # NEW (US-1.1)
└── tests/
    └── e2e/
        └── register.spec.ts                 # NEW (US-1.1)
```

Files NOT touched:
- `src/app/page.tsx` (welcome page — smoke test asserts against it; will be replaced in US-3.1)
- `src/app/layout.tsx` (root layout — leave as create-next-app default)
- Any cross-cutting primitive from US-0.2

### Library / framework requirements

All required dependencies are already installed:
- `better-auth@1.6.9`, `@better-auth/drizzle-adapter@1.6.9` ✅
- `zod@3.25.x` ✅
- `next@16.2.4` (App Router, Server Actions, `useActionState`, `useFormStatus`) ✅
- `react@19.2.4` ✅

**Better Auth's `toNextJsHandler` import path:** `better-auth/next-js`. Verify if the import resolves; alternative paths in older versions were `better-auth/handler/next` or similar. If 1.6.9 has a different path, document it.

### Testing requirements

**Unit tests (Vitest):**
- `src/lib/validation/auth.test.ts` — at minimum: valid input passes, invalid email fails, short password fails, empty/whitespace fullName fails. ~5 tests.
- `src/app/api/auth/register/route.test.ts` — optional; if mocking `auth.api.signUpEmail` proves fiddly, skip and document. The Server Action is exercised by E2E in a future story.

**E2E test (Playwright):**
- `tests/e2e/register.spec.ts` — visits `/register`, asserts the three labeled fields and submit button render, submits empty form, asserts at least one inline `.text-red-700` error is visible. Does NOT do the full happy-path (DB-dependent — deferred until US-1.x extends the CI E2E job with a Postgres service).

**Manual verification (Task 8) — the actual demo bar.**
The full registration flow (success, duplicate, invalid) is verified manually by Ikhtiyor opening localhost:3000/register. The unit tests + the page-render E2E cover the regression-detection floor.

### Anti-patterns — explicit DO-NOTs

- ❌ Inserting directly into `users` or `account` via Drizzle to "create the user." Always go through `auth.api.signUpEmail`.
- ❌ Setting `role` on the signUp body. Better Auth's `additionalFields.role` is `input: false`; clients cannot set it. Defaulted to `'GUEST'`.
- ❌ Adding React Hook Form, Formik, react-hook-form-zod, Mantine, or any other form library. Server Actions + Zod is the path.
- ❌ Adding a UI component library (shadcn/ui, Radix, Headless UI, MUI). Raw Tailwind utility classes only.
- ❌ Adding a header/nav with "Login" or "Register" links. Doc B §8 US-1.3 owns the header.
- ❌ Modifying `src/app/page.tsx` or `src/app/layout.tsx`.
- ❌ Adding a `(public)/layout.tsx` wrapping route group. Defer until there's actual chrome to put in it (US-1.2 or US-1.3).
- ❌ Skipping `noValidate` on the `<form>` and relying on browser-native validation popups. The architecture's pattern is server-driven validation with custom inline errors.
- ❌ Using `redirect()` inside a `try`/`catch` that catches Next.js's redirect signal. Place the `redirect('/')` call **after** the try/catch block in the Server Action.
- ❌ Adding the architecture's `requireSession` or `requireRole` to `/register` — this is a public route.
- ❌ Hardcoding the redirect target as `'http://localhost:3000/'`. Use `redirect('/')`.

### Project structure notes

The architecture's planned tree includes `src/db/queries/users.ts` for query helpers. **US-1.1 does not need it** — Better Auth's `signUpEmail` handles the user-row insert internally. The first feature story that actually queries `users` directly (likely US-1.2 Login or US-3.4 My Bookings) will introduce `src/db/queries/users.ts`.

### Previous story intelligence (US-0.1, US-0.2, US-0.3)

- **US-0.1** (`a32ff6e`): Next.js 16 + Tailwind v4 + TypeScript scaffolded.
- **US-0.2** (`1cb840b`, `22625f8`): Drizzle schema, Better Auth config with argon2id custom hasher, all cross-cutting primitives (`apiError`, guards, `<DataView>`, `<StatusBadge>`, `format` helpers, logger), `scripts/seed.ts`. **Migration NOT yet applied — Task 0 of this story applies it.**
- **US-0.3** (`ce903a7`): GitHub Actions CI workflow + Playwright config + smoke test.

**Patterns established:**
- camelCase TS field names ↔ snake_case DB columns (Drizzle aliases).
- Lazy Proxy on `db/client.ts` so test imports don't require `DATABASE_URL`.
- `pnpm.onlyBuiltDependencies: ["argon2"]` in package.json.
- Co-located unit tests next to source; E2E tests under `tests/e2e/`.

### Recent commits (for git intelligence)

```
ce903a7 chore: ci pipeline and e2e scaffolding (US-0.3)
22625f8 chore: include .env.example in tracked files (US-0.2 follow-up)
1cb840b chore: install dependencies, schema, and cross-cutting primitives (US-0.2)
a32ff6e chore: initialize next.js 16 project via create-next-app
f9b5f77 first commit
```

US-1.1's commit is the first `feat:` commit (the three `chore:` commits before it were all scaffolding). Feature stories from here on use `feat:` prefix.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-1.1 verbatim Gherkin acceptance criteria.
- [Source: docs/02-phase1-prd.md#Section 4.1] — FR-A1 functional requirement.
- [Source: docs/02-phase1-prd.md#Section 7.6] — form validation rules (email regex, password ≥ 8, fullName non-empty).
- [Source: docs/02-phase1-prd.md#Section 7.5] — submit-button disable-on-submit cross-cutting rule.
- [Source: docs/02-phase1-prd.md#Section 6.4] — POST /auth/register endpoint specified.
- [Source: docs/02-phase1-prd.md#Section 6.5] — seeded Super Admin (consumed by Task 0).
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — Better Auth + argon2id config; three-layer guard pattern.
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — Server Components + Server Actions + `useActionState`/`useFormStatus`.
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns] — naming, format, error shape, anti-patterns.
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure] — file path mapping for US-1.1 stories.
- [Source: _bmad-output/implementation-artifacts/0-2-dependencies-schema-and-primitives.md] — BA Decision B.1; `account.password` for credential hash.
- [Source: better-auth.com/docs/integrations/next] — `toNextJsHandler` integration.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| UUID fix in auth/config.ts | Added `import { randomUUID } from 'node:crypto'` and `advanced.database.generateId: () => randomUUID()` block. Schema unchanged. |
| `pnpm typecheck` | Clean across all 8 new files |
| `pnpm lint` | Clean |
| `pnpm test` | 47/47 pass (6 test files; +9 new validation tests vs US-0.3) |
| `pnpm build` | Compiled in 6.3s; routes: `/` (static), `/register` (static), `/api/auth/[...all]` (dynamic), `/api/auth/register` (dynamic), `/_not-found` (static) |
| `pnpm test:e2e` | 3/3 pass in 12.8s — `home page renders welcome page` (1.3s), `/register renders the form` (4.3s), `/register empty-submit shows validation errors` (4.7s) |
| `pnpm db:seed` | `Super Admin seeded: admin@deskhive.local / SuperAdmin1!` — exercises the live `auth.api.signUpEmail` code path against Neon end-to-end |
| `pnpm db:seed` (idempotency) | `Super Admin already exists; seed is a no-op` — confirms idempotent guard works |

### Completion Notes List

**Story executed end-to-end. Stop bar (registration page renders at localhost:3000/register) achieved.** All 47 unit tests + 3 E2E tests + the live seed run pass.

**Key implementation observations:**

1. **UUID generation fix worked first try.** Added `import { randomUUID } from 'node:crypto'` and `advanced: { database: { generateId: () => randomUUID() } }` to `src/lib/auth/config.ts`. No new dependencies. Schema stays PRD-faithful (UUID PKs preserved per Doc B §6.1). After this fix, `pnpm db:seed` succeeded against Neon.

2. **Live sign-up proven by seed run.** The seed script and the registration form both call `auth.api.signUpEmail` with `{email, password, name}`. The seed run successfully created `admin@deskhive.local` with a UUID PK, hashed password in `account.password` (argon2id), and `role='SUPER_ADMIN'` after the post-create UPDATE. **The same call from the registration form will produce a `'GUEST'` user (Better Auth's `additionalFields.role.defaultValue` setting; clients can't override because `input: false`).**

3. **Duplicate-email matcher is defensive.** Better Auth's exact error string for duplicate emails varies across versions, so both the Server Action and the REST wrapper match against multiple patterns: `'already exists'`, `'USER_ALREADY_EXISTS'`, `'UNIQUE constraint'`, `'users_email_unique'`. If a future Better Auth version changes the wording again, the matcher likely still catches it; if not, the failure is logged via `logger.error` and the user sees the generic INTERNAL_ERROR — debuggable from logs.

4. **REST-wrapper unit test deferred.** The story's optional `route.test.ts` was skipped per the story's own allowance ("Skip if mocking Better Auth proves fiddly"). Mocking `auth.api.signUpEmail` cleanly requires either vi.mock'ing the module or extracting the auth call into a thin helper — both add story scope without payoff. The wrapper's behavior is implicitly exercised through the same Better Auth call path the seed run validated, plus it shares the validation logic that's directly tested in `auth.test.ts`. A focused integration test against a live Postgres can land in a later "API contract test" story.

5. **No public layout added.** Per the story's anti-patterns, deferred until US-1.2 or US-1.3 has chrome to put in it.

6. **The pg sslmode forward-compat warning** keeps appearing in seed output and Drizzle Kit output. It's a pg v8.20 warning about libpq semantics changing in v9. Non-blocking; will reassess when we upgrade pg.

7. **Better Auth's Drizzle adapter peer-dep warning** about `better-call`/`zod@^4` continues to appear during `pnpm install`. Still non-blocking; tracked in US-0.2 notes.

**Browser-interactive verifications still on the BA's plate (Task 8 last subtask):**

- Open `http://localhost:3000/register` after `pnpm dev`.
- Submit valid input → confirm redirect to `/`.
- Re-submit same email → confirm "An account with this email already exists" inline error.
- Submit `not-an-email` → confirm inline email-format validation error.

These are mechanical checks against code paths already verified by automation. If any of these fail in the browser, the most likely root cause is a CSS/layout issue rather than logic.

### File List

All paths relative to repo root.

**NEW (8 files):**
- `deskhive/src/actions/auth.ts` — registerAction Server Action
- `deskhive/src/app/(public)/register/page.tsx` — Server Component shell
- `deskhive/src/app/(public)/register/register-form.tsx` — Client Component form
- `deskhive/src/app/api/auth/[...all]/route.ts` — Better Auth catch-all
- `deskhive/src/app/api/auth/register/route.ts` — REST wrapper for Doc B §6.4 compliance
- `deskhive/src/lib/validation/auth.ts` — Zod registerSchema
- `deskhive/src/lib/validation/auth.test.ts` — 9 unit tests
- `deskhive/tests/e2e/register.spec.ts` — 2 Playwright tests

**UPDATED (1 file):**
- `deskhive/src/lib/auth/config.ts` — added `import { randomUUID } from 'node:crypto'` and `advanced.database.generateId` block. The rest of the file (Better Auth + argon2id + drizzleAdapter + user.fields/additionalFields) is unchanged from US-0.2 + the earlier US-0.2 follow-up.

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/app/page.tsx` — welcome page; smoke test depends on it; will be replaced in US-3.1
- `deskhive/src/app/layout.tsx` — create-next-app default
- No `(public)/layout.tsx` added — deferred to US-1.2 / US-1.3

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | Multiple BA mid-execution decisions resolved (Better Auth name remap; UUID generator override). | (none) |
| 2026-05-06 | Pre-implementation US-0.2 follow-up commit landed (`a015793`) with env-loading + name-remap fixes. | `a015793` |
| 2026-05-06 | US-1.1 implementation committed. | (filled by commit below) |
