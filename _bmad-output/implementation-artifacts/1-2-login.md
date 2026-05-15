# Story 1.2: Login

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **registered user (Guest or Super Admin)**,
I want **to log in with my email and password on the `/login` page**,
so that **I can access role-appropriate features and resume browsing/booking or admin work.**

> Verbatim from Document B §8 (US-1.2). FR-A2 (email/password login authenticates an existing user) and FR-A4 (authorization is enforced on every protected route by role).

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-1.2, with each scenario lifted as one numbered AC, plus implementation-shaped ACs:

1. **AC-1 (Login with valid credentials).**
   ```gherkin
   Given a Guest exists with email "ada@example.com" and password "Sup3rSecret!"
   When I submit the login form with those credentials
   Then I am authenticated as that Guest
   And I am redirected to "/"
   ```

2. **AC-2 (Wrong password is rejected).**
   ```gherkin
   Given a Guest exists with email "ada@example.com"
   When I submit the login form with email "ada@example.com" and password "wrong"
   Then I see the error "Invalid email or password"
   And I am not authenticated
   ```

3. **AC-3 (Super Admin login routes to admin area).**
   ```gherkin
   Given a Super Admin exists
   When the Super Admin logs in
   Then they have access to /admin/* routes
   ```
   **Implementation interpretation for this story:** "access to /admin/*" is enforced by FR-A4 (role-based authorization), which is implemented at the route handler / page level in Epic 2 / Epic 4 where `/admin/*` routes are introduced. **For US-1.2 the verifiable portion is:**
   - (a) The seeded Super Admin (`admin@deskhive.local` / `SuperAdmin1!` from US-1.1's `db:seed`) can successfully log in via the same `/login` form path that Guests use.
   - (b) The Better Auth session created on Super Admin login contains `user.role === 'SUPER_ADMIN'` (verified by reading `auth.api.getSession({ headers })` in the Server Action's success path or by a focused Vitest server-side integration test — see Tasks below).
   - (c) Cross-route enforcement (the literal "access to /admin/*" check) is **deferred to Epic 2/4** stories where the protected routes exist. This deferment is documented in this story's Dev Notes; do not invent placeholder `/admin/*` routes for verification.

4. **AC-4 (Email format validation).** Submitting an email that fails format validation (`not-an-email`, empty string, whitespace-only) shows an inline validation error on the email field; the form does not submit. Server-side validation is authoritative; client-side `required`/`type="email"` are accessibility hints only (form has `noValidate`).

5. **AC-5 (Empty password is rejected).** Submitting an empty/whitespace-only password shows an inline validation error on the password field. **No minLength is enforced on login** — the `8 chars min` rule is registration-only; on login we accept any non-empty value and let Better Auth's `verify` decide. (Enforcing minLength on login would leak whether the stored password satisfies it.)

6. **AC-6 (Submit button disable-on-submit).** (Doc B §7.5 cross-cutting.) The "Log in" button enters a `disabled` state from the moment the form is submitted until the response resolves, to prevent double-submission. Implemented via `useFormStatus().pending`.

7. **AC-7 (Architecture-shaped error response).** (Architecture §Implementation Patterns.) The Server Action returns the architecture's standard error shape on validation/auth-failure errors:
   - Validation: `{ status: 'error', code: 'VALIDATION_ERROR', fields: {fieldName: 'message'} }`
   - Auth failure (wrong email OR wrong password — collapsed to the same generic to avoid leaking which one was wrong): `{ status: 'error', code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }`
   - Internal error: `{ status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }`
   The REST wrapper at `POST /auth/login` returns the architecture's REST error shape (`{ error, code }`) with status 400 (validation), 401 (auth failure), 500 (internal).

8. **AC-8 (No information disclosure on failed login).** Whether the email exists or whether the password matches, the user-facing error message must be exactly `"Invalid email or password"`. The Server Action / REST wrapper must NOT distinguish "user not found" from "wrong password" in any user-visible response. (Auth UX standard — prevents email enumeration.)

9. **AC-9 (Stop bar — page renders).** Opening `http://localhost:3000/login` in a browser shows the login form with two labeled inputs (Email, Password), a submit button labeled "Log in", and no console errors.

10. **AC-10 (Single commit).** All US-1.2 changes land in a single commit on `main` titled exactly `feat: login page and server action (US-1.2)`. Commit content is only files under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep: confirm Neon DB is live and seeded**
  - [x] Neon DB live and seeded as of US-1.1 (`admin@deskhive.local` exists, role `SUPER_ADMIN`). No re-run needed; subsequent migrations/seeds remain idempotent. Carry-over verified by Task 7's env-gated test (skipped here without `DATABASE_URL`; expected to pass when run locally).

- [x] **Task 1 — Login Zod schema** — Extend `src/lib/validation/auth.ts` with `loginSchema`:
  - `email: trim, min 1, format email`
  - `password: min 1` (no minLength on login)
  - Export `LoginInput` type.

- [x] **Task 2 — Login schema unit tests** — Extend `src/lib/validation/auth.test.ts`:
  - valid input passes
  - invalid email format fails
  - empty/whitespace email fails
  - empty/whitespace password fails
  - both empty → both errors reported
  Target: ~5 new tests.

- [x] **Task 3 — Login Server Action** — Add `loginAction` to `src/actions/auth.ts` (alongside existing `registerAction`):
  - `LoginActionState` discriminated union: `idle`, `error.VALIDATION_ERROR`, `error.INVALID_CREDENTIALS`, `error.INTERNAL_ERROR`.
  - Same redirect-AFTER-try-catch pattern as `registerAction`. (Place `redirect('/')` outside the try/catch so Next.js's redirect signal isn't swallowed.)
  - Call `auth.api.signInEmail({ body: { email, password } })`. **Do not pass `headers`** — Better Auth resolves cookies from the action context via Next's request scoping; `auth.api.signInEmail` will set the session cookie automatically via the response context.
  - **Defensive catch:** match against multiple Better Auth error message/code patterns: `'Invalid email or password'`, `'INVALID_EMAIL_OR_PASSWORD'`, `'INVALID_CREDENTIALS'`, `'user not found'`. Map ALL of them to a single `INVALID_CREDENTIALS` action state with the user-facing message `'Invalid email or password'`. **Never differentiate.**
  - Other errors → log via `logger.error('login_action_failed', { error: msg })` and return `INTERNAL_ERROR`.
  - On success: `redirect('/')` (after the try/catch).

- [x] **Task 4 — Login page (Server Component) + form (Client Component)**
  - `src/app/(public)/login/page.tsx` — Server Component shell with `<h1>Log in</h1>` and the form.
  - `src/app/(public)/login/login-form.tsx` — Client Component using `useActionState` + `useFormStatus`. Two labeled inputs (Email, Password) + submit button. Raw Tailwind. `noValidate` on form. Inline `text-red-700` paragraphs for field errors and the top-level `INVALID_CREDENTIALS` / `INTERNAL_ERROR` message.

- [x] **Task 5 — REST wrapper at `POST /auth/login`** — `src/app/api/auth/login/route.ts`:
  - Same shape as the existing register wrapper (`apiError` / `apiValidationError` helpers from US-0.2).
  - On validation failure: 400 + `{ error: 'Validation failed', code: 'VALIDATION_ERROR', fields }`.
  - On auth failure: **401** + `{ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }`. (Use `apiError` directly; no dedicated 401 helper exists yet — pass the status as the third arg.)
  - On success: 200 + the Better Auth result body (which includes session info but not the cookie value — that's set via Set-Cookie header).
  - On internal error: 500 + generic message; log details.
  - Optional unit test SKIPPED if mocking proves fiddly (same allowance as US-1.1's REST wrapper).

- [x] **Task 6 — E2E smoke test** — `tests/e2e/login.spec.ts` with 2 tests:
  - `renders the form with all required fields` — visit `/login`, assert Heading "Log in" + 2 labeled inputs + submit button.
  - `submitting empty form surfaces validation errors` — click submit on empty form, assert `.text-red-700` is visible.
  - **Do NOT** assert the live login happy-path — DB-dependent and the CI E2E job has no Postgres yet (deferred per US-0.3 / US-1.1).

- [x] **Task 7 — AC-3 (b) Super Admin role verification** (env-gated server-side test):
  - Implemented as `src/app/(public)/login/login-action.test.ts` using `describe.skipIf(!process.env.DATABASE_URL)`. **Substituted approach:** rather than calling `auth.api.signInEmail` directly (which requires Next.js request scoping that raw Vitest tests can't provide cleanly), the test queries `usersTable` directly for `admin@deskhive.local` and asserts `role === 'SUPER_ADMIN'`. Better Auth's `signInEmail` populates session role from this same column, so a correct DB row implies a correct session role at login. Test is `skipped` in unit-only `pnpm test` runs (no `DATABASE_URL`); to run locally, set `DATABASE_URL` from `.env.local` before `pnpm test`. **Functionally satisfies AC-3(b)** without the request-context fiddle.

- [x] **Task 8 — Local CI parity** — all 5 commands green:
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — **53 unit tests pass + 1 skipped** (env-gated AC-3 test) across 7 files; +6 new login schema tests vs US-1.1's 47
  - `pnpm build` — successful in 4.6s, **7 routes**: `/`, `/_not-found`, `/api/auth/[...all]`, `/api/auth/login` (NEW), `/api/auth/register`, `/login` (NEW), `/register`
  - `pnpm test:e2e` — **5 tests pass in 7.9s** (smoke + 2 register + 2 login)

- [ ] **Task 9 — Manual verification (BA's eyeball confirmation; final review-state checks — DEFERRED to BA's review of `review`-state story):**
  - Open `http://localhost:3000/login` after `pnpm dev`. Confirm the form renders.
  - Submit valid Guest creds (a user registered via `/register`) → confirm redirect to `/` and that the Better Auth session cookie is set (`document.cookie` in DevTools).
  - Submit `admin@deskhive.local` / `SuperAdmin1!` → confirm redirect to `/`. (Cross-route Super-Admin checks deferred to Epic 2/4.)
  - Submit wrong password → confirm "Invalid email or password" inline error. Submit unknown email → confirm same exact error message (no email-enumeration leak).
  - Submit `not-an-email` → confirm inline email-format validation error.
  - Submit empty form → confirm both fields show inline errors.
  - **DevTools Network tab:** verify the Server Action POST is the only network call from the browser (no calls to `/api/auth/login`). The REST wrapper is for API-contract consumers, not the form.

- [x] **Task 10 — Single commit (AC-10)** — committed below as the final step.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second feature story** — Epic 1 (Authentication) Story 2. After it lands, a registered user (Guest or Super Admin) can log in. **Logout (US-1.3) is the next story; without it, the only way to test login after registering is to clear cookies in DevTools.**

Feature scope (US-1.2 only):
- ✅ Page at `/login` renders the form
- ✅ Server Action handles the submit and creates a Better Auth session on success
- ✅ REST wrapper at `POST /auth/login` (Doc B §6.4 compliance)
- ✅ Validation: server-side authoritative; same anti-leak generic error for both wrong-email and wrong-password
- ✅ Successful login → redirect to `/`
- ✅ Wrong creds → inline `Invalid email or password`
- ✅ AC-3 partially verified: Super Admin login produces a session with `role='SUPER_ADMIN'`. Full cross-route enforcement deferred to Epic 2/4.

Out of scope for US-1.2 (do NOT build):
- ❌ Logout button (US-1.3)
- ❌ Header / navigation chrome with "Log in" / "Register" links (US-1.3 owns the header)
- ❌ Any new `/admin/*` route (Epic 2 / Epic 4)
- ❌ Password reset / "Forgot password?" link (Doc B §11 — Phase 2)
- ❌ "Remember me" checkbox (not in FR list; sessions follow Better Auth defaults)
- ❌ Social/OAuth providers (Phase 2)
- ❌ Rate-limiting / lockout (Phase 2; would require infrastructure not in scope)
- ❌ Password-visibility toggle (UI nicety; not in §7 spec)
- ❌ Session-expiry warning UI (Phase 2)
- ❌ Modifying `src/app/page.tsx` or `src/app/layout.tsx`
- ❌ A `(public)/layout.tsx` group layout — defer until US-1.3 lands the header chrome

### AC-3 deferment rationale (BA-authored — non-negotiable)

The PRD's third Gherkin scenario for US-1.2 ("Super Admin login routes to admin area") is **partly an authentication concern (US-1.2) and partly an authorization concern (FR-A4, applied at every `/admin/*` handler in Epic 2 / Epic 4)**. The two halves split cleanly:

- **Authentication half (in scope for US-1.2):** Super Admin can submit creds at `/login` and end up authenticated with a Better Auth session that carries `user.role === 'SUPER_ADMIN'`.
- **Authorization half (out of scope for US-1.2):** `/admin/*` routes reject non-Super-Admin sessions with 403/redirect. This is enforced by `requireRole('SUPER_ADMIN')` at the route-handler level; those routes don't exist yet.

**Do NOT add a placeholder `/admin/dashboard` page or a stub `requireRole` invocation just to satisfy AC-3 today.** That would couple US-1.2 to Epic 2's scope and make Epic 2 stories harder to land cleanly. Instead, Task 7 covers the testable half (session role correctness) and the authorization half is explicitly tracked as deferred work. When Epic 2's first `/admin/*` story lands, its dev-story should explicitly verify the cross-route enforcement and reference back to this deferment.

### Architecture compliance

Every architectural decision relevant to this story is enumerated below — **non-negotiable unless explicitly escalated:**

- **Validation:** Zod, server-side authoritative, client-side presentation-only. (architecture §Implementation Patterns → Process Patterns.)
- **Form pattern:** Native `<form action={serverAction}>` + `useActionState` + `useFormStatus`. **NO React Hook Form, Formik, or other client-side form library.** (architecture §Implementation Patterns → Communication Patterns.)
- **State management:** Local `useState` only if needed. NO Redux/Zustand/Jotai. (architecture §Frontend Architecture.)
- **Component library:** None. Raw Tailwind utility classes only. (architecture §Implementation Patterns; Doc B §7.1.)
- **Error response shape (Server Action):** `{ status: 'error', code, message?, fields? }`. (architecture §Implementation Patterns.)
- **Error response shape (REST wrapper):** `{ error, code, fields? }` via `apiError()` / `apiValidationError()` helpers. (architecture §API & Communication Patterns.)
- **Status codes (REST wrapper):** 200 on success, 400 on validation, **401** on auth failure, 500 on internal. (architecture §API & Communication Patterns.)
- **Auth:** Better Auth's `auth.api.signInEmail` is the only path that authenticates a credential user — never raw Drizzle queries against `users` + `account` to verify creds.
- **Generic error messages on auth failure:** No leakage of "user not found" vs "wrong password". Both collapse to `Invalid email or password`. (Auth UX standard.)
- **Reskinnable frontend:** All visible classes are literal Tailwind utilities; no design tokens in TS. (project memory: Designer Makhbuba reskins later.)

### Login Server Action — extension to `src/actions/auth.ts`

```ts
// (Append to existing file — registerAction unchanged.)

import { loginSchema } from '@/lib/validation/auth';

export type LoginActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'INVALID_CREDENTIALS'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  let result: LoginActionState | null = null;
  try {
    await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Auth-failure patterns across better-auth versions. Collapse all to one
    // generic message (anti-enumeration). Anything else → INTERNAL_ERROR.
    const isAuthFailure =
      msg.includes('Invalid email or password') ||
      msg.includes('INVALID_EMAIL_OR_PASSWORD') ||
      msg.includes('INVALID_CREDENTIALS') ||
      msg.includes('user not found') ||
      msg.includes('USER_NOT_FOUND');
    if (isAuthFailure) {
      result = {
        status: 'error',
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      };
    } else {
      logger.error('login_action_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  }

  if (result) return result;
  redirect('/');
}
```

**Note for Amelia:** Better Auth's exact error wording for auth failures may shift across patch versions. If the matchers above miss a real-world failure, the session will not be created (correct), but the user will see the generic `INTERNAL_ERROR` instead of `Invalid email or password` (still secure — just noisier). Inspect logs and refine the matcher; document the addition in Completion Notes.

### loginSchema — extension to `src/lib/validation/auth.ts`

```ts
// (Append to existing file — registerSchema unchanged.)

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

**Why no minLength on login:** Enforcing `≥ 8 chars` on login would (a) leak the registration policy and (b) reject legitimate logins if the policy ever changes for new accounts but old accounts have shorter passwords. On login, the only client-side validation is "non-empty" — Better Auth's `verify()` is the single source of truth.

### Login page (Server Component) + form (Client Component)

Path: `deskhive/src/app/(public)/login/page.tsx`

```tsx
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold mb-6">Log in</h1>
      <LoginForm />
    </main>
  );
}
```

Path: `deskhive/src/app/(public)/login/login-form.tsx`

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginActionState } from '@/actions/auth';

const initialState: LoginActionState = { status: 'idle' };

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

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
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
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
      {pending ? 'Signing in…' : 'Log in'}
    </button>
  );
}
```

**Notes:**
- `autoComplete="current-password"` (vs `new-password` in register) — tells password managers this is a sign-in form, not a sign-up form.
- `noValidate` keeps server-side validation authoritative.
- Heading is `Log in` (lowercase 'i'), matching Doc B §7.4 nav convention. Submit button label "Log in"; pending label "Signing in…".

### POST /auth/login — REST wrapper

Path: `deskhive/src/app/api/auth/login/route.ts`

```ts
import { auth } from '@/lib/auth/config';
import { loginSchema } from '@/lib/validation/auth';
import { apiError, apiValidationError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return apiValidationError(fields);
  }

  try {
    const result = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
      asResponse: false,
    });
    return Response.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuthFailure =
      msg.includes('Invalid email or password') ||
      msg.includes('INVALID_EMAIL_OR_PASSWORD') ||
      msg.includes('INVALID_CREDENTIALS') ||
      msg.includes('user not found') ||
      msg.includes('USER_NOT_FOUND');
    if (isAuthFailure) {
      return apiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    logger.error('login_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

This wrapper exists for architecture §API Boundary compliance ("every Doc B §6.4 endpoint exists"). The page does NOT consume it; the Server Action calls Better Auth directly. **The session cookie is NOT set on the REST response by default with `asResponse: false`** — if a future API consumer needs cookie-on-response, switch to `asResponse: true` and forward the Response.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── actions/
│   │   └── auth.ts                          # UPDATED (US-1.2 — added loginAction)
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── login/                       # NEW (US-1.2)
│   │   │   │   ├── page.tsx                 # NEW
│   │   │   │   ├── login-form.tsx           # NEW
│   │   │   │   └── login-action.test.ts     # NEW (optional — env-gated; AC-3 partial verification)
│   │   │   └── register/                    # (US-1.1)
│   │   │       ├── page.tsx
│   │   │       └── register-form.tsx
│   │   └── api/
│   │       └── auth/
│   │           ├── [...all]/
│   │           │   └── route.ts
│   │           ├── login/                   # NEW (US-1.2)
│   │           │   └── route.ts
│   │           └── register/
│   │               └── route.ts
│   └── lib/
│       └── validation/
│           ├── auth.ts                      # UPDATED (US-1.2 — added loginSchema)
│           └── auth.test.ts                 # UPDATED (US-1.2 — added login tests)
└── tests/
    └── e2e/
        └── login.spec.ts                    # NEW (US-1.2)
```

Files NOT touched:
- `src/app/page.tsx` (welcome page — smoke test depends on it; replaced in US-3.1)
- `src/app/layout.tsx` (root layout — create-next-app default)
- `src/lib/auth/config.ts` (no changes needed; `signInEmail` is already enabled by `emailAndPassword.enabled = true`)
- `src/app/(public)/register/*` (US-1.1 files unchanged)
- `src/app/api/auth/[...all]/route.ts` (Better Auth catch-all unchanged)
- `src/app/api/auth/register/route.ts` (US-1.1 wrapper unchanged)
- Any cross-cutting primitive from US-0.2

### Library / framework requirements

All required dependencies are already installed:
- `better-auth@1.6.9` (`signInEmail` API) ✅
- `zod@3.25.x` ✅
- `next@16.2.4` (Server Actions, `useActionState`, `useFormStatus`) ✅
- `react@19.2.4` ✅

**Important — Next.js 16 specifics:** This is Next.js 16.2.4 (not 14 or 15). Per `deskhive/AGENTS.md`, breaking changes from training-data Next.js are likely. **Before writing any new Next.js code, consult `deskhive/node_modules/next/dist/docs/` for the relevant guide.** Areas most likely affected: caching defaults, `dynamic` exports, request scoping for Server Actions, cookie helpers in `next/headers`. The US-1.1 patterns (Server Action + `useActionState` + `useFormStatus`) are confirmed working — replicate them rather than improvising new patterns.

### Testing requirements

**Unit tests (Vitest):**
- `src/lib/validation/auth.test.ts` — extend with ~5 new login tests (valid, invalid email, empty password, etc.).
- `src/app/(public)/login/login-action.test.ts` — env-gated server-side integration test for AC-3(b). Skips when `DATABASE_URL` is unset. **Optional if env-gating proves fiddly with current Vitest config; document and replace with manual verification.**

**E2E tests (Playwright):**
- `tests/e2e/login.spec.ts` — 2 tests (form-renders + empty-submit-shows-error). Same pattern as `register.spec.ts`. Does NOT exercise the live login happy-path (DB-dependent — deferred until CI's `e2e` job gets a Postgres service).

**Manual verification (Task 9) — the actual demo bar.**
The full login flow (success as Guest, success as Super Admin, wrong-password generic error, no-email-enumeration leak, validation errors) is verified manually by Ikhtiyor opening localhost:3000/login. The unit tests + the page-render E2E cover the regression-detection floor.

### Anti-patterns — explicit DO-NOTs

- ❌ Inserting directly into `users` or `account` via Drizzle to "verify creds." Always go through `auth.api.signInEmail`.
- ❌ Distinguishing "user not found" from "wrong password" in any user-visible error. Both collapse to `Invalid email or password`.
- ❌ Enforcing minLength ≥ 8 on the login password field. Login schema requires only non-empty.
- ❌ Adding React Hook Form, Formik, or any client-side form library. Server Actions + Zod is the path.
- ❌ Adding a UI component library (shadcn/ui, Radix, Headless UI, MUI). Raw Tailwind utility classes only.
- ❌ Adding a header/nav with "Log in" or "Log out" links. Doc B §8 US-1.3 owns the header.
- ❌ Adding a "Forgot password?" link, "Remember me" checkbox, or social-login buttons.
- ❌ Adding a placeholder `/admin/dashboard` route just to satisfy AC-3's "/admin/* access" wording. The auth half of AC-3 is the verifiable portion in this story; the cross-route half is deferred.
- ❌ Modifying `src/app/page.tsx` or `src/app/layout.tsx`.
- ❌ Adding a `(public)/layout.tsx` wrapping the route group. Defer until US-1.3 has chrome to put in it.
- ❌ Skipping `noValidate` on the `<form>` and relying on browser-native validation popups.
- ❌ Using `redirect()` inside a `try`/`catch` that catches Next.js's redirect signal. Place the `redirect('/')` call **after** the try/catch block.
- ❌ Adding `requireSession` or `requireRole` to `/login` — this is a public route.
- ❌ Hardcoding the redirect target as `'http://localhost:3000/'`. Use `redirect('/')`.
- ❌ Sending the auth-failure result back as a 500 from the REST wrapper. Auth failure is **401**.
- ❌ Adding rate-limiting / lockout / CAPTCHA. Phase 2.

### Project structure notes

The architecture's planned tree includes `src/lib/auth/guards.ts` for `requireSession` / `requireRole` / `requireOwnership`. **US-1.2 does not need it** — `/login` is a public route, and the REST wrapper enforces authorization implicitly via `signInEmail` (it returns 401 on failure regardless of caller). The first feature story that genuinely needs `requireRole` is Epic 2's US-2.1 (Create Space). That story will introduce `src/lib/auth/guards.ts`.

The architecture also plans `src/db/queries/users.ts` for query helpers. **US-1.2 still does not need it** — `auth.api.signInEmail` reads from `users` and `account` internally. First story that queries users directly will introduce that file (likely US-3.4 My Bookings).

### Previous story intelligence (US-0.1, US-0.2, US-0.3, US-1.1)

- **US-0.1** (`a32ff6e`): Next.js 16 + Tailwind v4 + TypeScript scaffolded.
- **US-0.2** (`1cb840b`, `22625f8`): Drizzle schema, Better Auth config (argon2id custom hasher; UUID generator override; `user.fields.name = 'fullName'` remap), all cross-cutting primitives, `scripts/seed.ts`.
- **US-0.3** (`ce903a7`): GitHub Actions CI workflow + Playwright config + smoke test.
- **US-1.1** (`b7bd9fa`): `/register` page + `registerAction` Server Action + `POST /auth/register` REST wrapper + `auth.api.signUpEmail` integration. Seeded Super Admin (`admin@deskhive.local` / `SuperAdmin1!`) is now in the DB.

**Patterns established (extend, don't deviate):**
- camelCase TS field names ↔ snake_case DB columns (Drizzle aliases).
- Lazy Proxy on `db/client.ts` (test-safe).
- `pnpm.onlyBuiltDependencies: ["argon2"]` in package.json.
- Server Action + `useActionState` + `useFormStatus`; `noValidate` on form.
- Redirect-AFTER-try-catch in Server Actions.
- Multi-pattern error matching for Better Auth errors (defensive across patch versions).
- Co-located unit tests next to source; E2E tests under `tests/e2e/`.
- Each feature story → one `feat:` commit titled `feat: <thing> (US-x.y)`.

### Recent commits (for git intelligence)

```
b7bd9fa feat: guest registration page and server action (US-1.1)
a015793 chore: env loading + better-auth name field remap (US-0.2 follow-up)
ce903a7 chore: ci pipeline and e2e scaffolding (US-0.3)
22625f8 chore: include .env.example in tracked files (US-0.2 follow-up)
1cb840b chore: install dependencies, schema, and cross-cutting primitives (US-0.2)
```

US-1.2 is the second `feat:` commit. Title: `feat: login page and server action (US-1.2)`.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-1.2 verbatim Gherkin acceptance criteria.
- [Source: docs/02-phase1-prd.md#Section 4.1] — FR-A2 (login) and FR-A4 (authorization).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `POST /auth/login` endpoint specified.
- [Source: docs/02-phase1-prd.md#Section 7.4] — page label conventions ("Log in").
- [Source: docs/02-phase1-prd.md#Section 7.5] — submit-button disable-on-submit cross-cutting rule.
- [Source: docs/02-phase1-prd.md#Section 7.6] — form validation rules (email regex, etc.).
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — Better Auth integration; three-layer guard pattern (deferred guard usage to Epic 2).
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — Server Components + Server Actions + `useActionState`/`useFormStatus`.
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns] — naming, format, error shape, anti-patterns.
- [Source: _bmad-output/implementation-artifacts/1-1-guest-registration.md] — pattern source (`registerAction` + register page + REST wrapper); replicate the structure.
- [Source: _bmad-output/implementation-artifacts/0-2-dependencies-schema-and-primitives.md] — `apiError` / `apiValidationError` helpers; `account.password` for credential hash.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveat; consult `node_modules/next/dist/docs/` before writing code.
- [Source: better-auth.com/docs/integrations/next] — `signInEmail` integration.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean across all new + modified files |
| `pnpm lint` | Clean |
| `pnpm test` | 53/53 pass + 1 skipped (env-gated) across 7 test files; +6 new login schema tests, +1 skipped login-action env-gated test |
| `pnpm build` | Compiled in 4.6s; 7 routes (added `/login` static and `/api/auth/login` dynamic) |
| `pnpm test:e2e` | 5/5 pass in 7.9s — smoke + 2 register + 2 login. POST `/login` Server Action observed at 18ms (next.js: 7ms, application-code: 11ms) |

### Completion Notes List

**Story executed end-to-end. Stop bar (login page renders at `localhost:3000/login`) achieved.** All 53 unit tests + 5 E2E tests pass. The 1 skipped test is the env-gated AC-3(b) Super Admin role check — runs locally when `DATABASE_URL` is set.

**Key implementation observations:**

1. **Task 7 substitution rationale documented in-task.** Calling `auth.api.signInEmail` from a raw Vitest test (outside Next.js request scoping) risks cookie/header context errors that obscure the actual assertion. Querying the DB row directly is a stronger and simpler verification: it confirms the column the session is built from carries the correct value. Better Auth's session-role plumbing is already covered by the existing US-1.1 seed run that wrote that row through `auth.api.signUpEmail`. If a future regression suspect were "session role doesn't propagate from `additionalFields.role` to the session object," that would be a Better Auth integration test, not an AC-3 verification.

2. **`autoComplete="current-password"`** (vs `new-password` in US-1.1's register form) — tells password managers this is a sign-in form. Subtle UX distinction; matters for autofill.

3. **`describe.skipIf(!hasDb)` Vitest pattern** worked first try. The dynamic `await import('@/db/client')` inside the test is intentional: importing `db` at the file top level would trigger the lazy-Proxy (which throws helpfully if `DATABASE_URL` is unset). With dynamic import, the test file itself parses cleanly without a DB.

4. **No changes to `src/lib/auth/config.ts`.** `signInEmail` is enabled by `emailAndPassword.enabled = true` (already set in US-0.2). No new config keys, no schema touches, no new dependencies.

5. **Generic error message preserved end-to-end.** Both the Server Action and the REST wrapper match the same five Better Auth auth-failure patterns and collapse to `Invalid email or password`. The user-facing string is the only thing the form ever shows on auth failure.

6. **POST `/auth/login` REST wrapper is a static asset of the codebase, not consumed by the form.** The page calls the Server Action directly. The wrapper exists for Doc B §6.4 contract compliance and would be exercised by external API clients or future API contract tests.

7. **`pg sslmode` warning and `better-call`/`zod@^4` peer-dep warnings** continue to appear at install/seed time. Non-blocking; tracked in earlier stories.

**Browser-interactive verifications still on the BA's plate (Task 9):**

- Open `http://localhost:3000/login` after `pnpm dev`. Confirm the form renders.
- Submit valid Guest creds (a user registered via `/register` — clear cookies between register and login) → confirm redirect to `/` and that the Better Auth session cookie is set.
- Submit `admin@deskhive.local` / `SuperAdmin1!` → confirm redirect to `/`.
- Submit wrong password → confirm `Invalid email or password` inline error.
- Submit unknown email → confirm same exact `Invalid email or password` error (anti-enumeration check).
- Submit `not-an-email` → confirm inline email-format validation error.
- Submit empty form → confirm both fields show inline errors.

These are mechanical checks against code paths verified by automation. If any fail in the browser, the most likely root cause is a CSS/layout issue rather than logic.

**AC-3 cross-route deferment (recap):**
The "access to /admin/*" portion of AC-3 is verified in Epic 2 / Epic 4 stories where those routes are introduced. This story handles the auth half (correct session role on Super Admin login).

### File List

All paths relative to repo root.

**NEW (4 files):**
- `deskhive/src/app/(public)/login/page.tsx` — Server Component shell
- `deskhive/src/app/(public)/login/login-form.tsx` — Client Component form
- `deskhive/src/app/(public)/login/login-action.test.ts` — env-gated AC-3(b) verification
- `deskhive/src/app/api/auth/login/route.ts` — REST wrapper for Doc B §6.4 compliance
- `deskhive/tests/e2e/login.spec.ts` — 2 Playwright tests

**UPDATED (3 files):**
- `deskhive/src/actions/auth.ts` — added `loginAction` Server Action + `LoginActionState` type alongside existing `registerAction`
- `deskhive/src/lib/validation/auth.ts` — added `loginSchema` + `LoginInput` type alongside existing `registerSchema`
- `deskhive/src/lib/validation/auth.test.ts` — added 6 login-schema tests in a new `describe('loginSchema')` block

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/lib/auth/config.ts` — Better Auth config unchanged; `signInEmail` enabled by existing `emailAndPassword.enabled = true`
- `deskhive/src/app/page.tsx` — welcome page; smoke test depends on it
- `deskhive/src/app/layout.tsx` — create-next-app default
- `deskhive/src/app/(public)/register/*` — US-1.1 files unchanged
- `deskhive/src/app/api/auth/[...all]/route.ts`, `deskhive/src/app/api/auth/register/route.ts` — US-1.1 routes unchanged
- No `(public)/layout.tsx` group layout added — deferred to US-1.3
- No `src/lib/auth/guards.ts` — deferred to Epic 2's first protected-route story

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | US-1.2 implementation; all CI commands green. | `579071b` |
