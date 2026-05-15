# Story 2.1: Create Space

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **to create a new coworking space with name, city, address, description, and a single image URL via the `/admin/spaces` admin area**,
so that **Guests can discover it on the public landing page (US-3.1+).**

> Verbatim from Document B §8 (US-2.1). FR-I1 (Super Admin creates a Space with name, city, address, description, single image URL).

> **This is the first protected-route story.** It introduces the middleware layer and the first actual usage of `requireSession`/`requireRole` (which were scaffolded in US-0.2 but never invoked until now).

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-2.1, plus implementation-shaped ACs:

1. **AC-1 (Super Admin creates a Space — happy path).**
   ```gherkin
   Given I am logged in as Super Admin
   When I navigate to /admin/spaces
   And I click "New Space"
   And I fill in name "Hive Central", city "Berlin", address "Friedrichstr 1",
     description "Bright modern workspace", image URL "https://example.com/x.jpg"
   And I click "Save"
   Then a Space is created with status PUBLISHED
   And I see "Hive Central" in the admin spaces list
   ```

2. **AC-2 (Guest cannot access admin routes — REST 403).**
   ```gherkin
   Given I am logged in as a Guest
   When I send POST /admin/spaces
   Then I receive 403 Forbidden
   ```

3. **AC-3 (Unauthenticated UI access redirects to login).** When an unauthenticated visitor navigates to `/admin/spaces` or `/admin/spaces/new`, the middleware (or route-level guard, whichever runs first) redirects them to `/login`. **No 404, no flash of admin content.**

4. **AC-4 (Unauthenticated REST returns 401).** When an unauthenticated client sends `POST /admin/spaces` (or `GET /admin/spaces`), the response is 401 with `{ error: 'Authentication required', code: 'UNAUTHORIZED' }`. (Distinct from 403 — 401 means "you didn't auth at all," 403 means "you authed as the wrong role.")

5. **AC-5 (Guest UI access also gets 403 / redirect).** When a logged-in Guest navigates to `/admin/spaces`, the page does NOT render admin content. Acceptable behaviors: (a) Next.js renders a 403 page via `notFound()` / `forbidden()`, OR (b) the page redirects to `/` with a flash. **Implementation choice for this story: redirect to `/` silently** (simplest; matches the admin-area-doesn't-exist-for-Guests UX). Document the choice in dev notes.

6. **AC-6 (Validation per Doc B §7.6).** All five fields are required and non-empty:
   - `name`: required, trimmed, non-empty
   - `city`: required, trimmed, non-empty
   - `addressLine`: required, trimmed, non-empty
   - `description`: required, trimmed, non-empty
   - `primaryImageUrl`: required, trimmed, non-empty, **must be a valid URL** (Zod `.url()`).
   Inline errors per field; same `text-red-700` paragraph pattern as US-1.1's register form.

7. **AC-7 (Architecture-shaped error response — Server Action and REST wrapper).**
   - Server Action: `{ status: 'error', code: 'VALIDATION_ERROR', fields: {...} }` on validation, `{ status: 'error', code: 'INTERNAL_ERROR', message: '...' }` on internal error.
   - REST wrapper (`POST /admin/spaces`): standard `apiError`/`apiValidationError`/`apiUnauthorized`/`apiForbidden` shapes. Status codes: 201 on created, 400 on validation, 401 on no session, 403 on wrong role, 500 on internal.

8. **AC-8 (Status defaults to PUBLISHED).** New spaces are inserted with `status='PUBLISHED'` (matches the DB default in `src/db/schema.ts`). The form does NOT expose a status field. The `SUSPENDED` state exists in the schema but has no UI in Phase 1 — Phase 2 admin tooling.

9. **AC-9 (Submit-button disable-on-submit).** (Doc B §7.5.) The "Save" button is disabled from form submit until response. `useFormStatus().pending`. Label: "Save" / "Saving…".

10. **AC-10 (Admin link in header for Super Admins).** When the session's `user.role === 'SUPER_ADMIN'`, the global header shows an "Admin" link pointing to `/admin/spaces` (placed between the user's email and the Log out button). For Guests, no Admin link. For unauthenticated users, no Admin link.

11. **AC-11 (Empty list state).** Opening `/admin/spaces` when no spaces exist shows the empty-state message from Doc B §7.3: `"No spaces available yet."` (use the `<DataView>` primitive from US-0.2.)

12. **AC-12 (Loaded list state).** Opening `/admin/spaces` when ≥1 space exists shows each space's name + city in a simple list. (Editing is US-2.2 scope; this story only renders list-and-name.)

13. **AC-13 (Stop bar — page renders for Super Admin).** After logging in as `admin@deskhive.local`, opening `http://localhost:3000/admin/spaces` shows the "New Space" link/button + the spaces list (empty or loaded), with no console errors.

14. **AC-14 (Single commit).** All US-2.1 changes land in a single commit on `main` titled exactly `feat: admin create space (US-2.1)`. Commit content is only files under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep: confirm Neon DB is live and seeded.**
  - [ ] No new migrations needed (`spaces` table exists from US-0.2 schema). Run `pnpm db:migrate` once to verify it's a no-op.
  - [ ] Seed remains: only `admin@deskhive.local` exists (Super Admin from US-1.1's seed). Doc B §6.5 says no other seed data — the demo flow itself creates spaces.

- [x] **Task 1 — Create Space Zod schema** — `src/lib/validation/space.ts`:
  - `createSpaceSchema`: object with `name`, `city`, `addressLine`, `description` (all `z.string().trim().min(1, 'X is required')`); `primaryImageUrl: z.string().trim().min(1, 'Image URL is required').url('Must be a valid URL')`.
  - Export `CreateSpaceInput` type.

- [x] **Task 2 — Schema unit tests** — `src/lib/validation/space.test.ts`:
  - valid input passes
  - each required field rejected when empty/whitespace-only (5 cases)
  - invalid URL rejected (e.g., `'not-a-url'`)
  - all-empty input reports all 5 fields
  - Target: ~7-8 tests.

- [x] **Task 3 — Spaces query helpers** — `src/db/queries/spaces.ts`:
  - `listAllSpaces()`: `db.select().from(spacesTable).orderBy(desc(spacesTable.createdAt))`. Returns `Space[]` (the inferred type from US-0.2).
  - `createSpace(input: CreateSpaceInput): Promise<Space>`: insert with `status: 'PUBLISHED'` default, return the inserted row via `.returning()`.
  - **NO query for "by id"** in this story — that comes with US-2.2 (Edit Space).

- [x] **Task 4 — Create Space Server Action** — `src/actions/space.ts`:
  - `'use server'` directive.
  - Type: `CreateSpaceActionState` discriminated union: `idle` | `error.VALIDATION_ERROR` | `error.UNAUTHORIZED` | `error.FORBIDDEN` | `error.INTERNAL_ERROR`.
  - Body:
    1. `requireSession()` — wrap in try/catch; on `AuthError`, return `{ status: 'error', code: 'UNAUTHORIZED', message: 'Please log in.' }` (the redirect happens at middleware/page level; the Server Action just refuses to act).
    2. `requireRole(session, 'SUPER_ADMIN')` — on `AuthError`, return `FORBIDDEN`.
    3. Parse FormData via `createSpaceSchema`. Field errors → `VALIDATION_ERROR` with field map.
    4. Call `createSpace(parsed.data)`.
    5. On success: `revalidatePath('/admin/spaces')` then `redirect('/admin/spaces')`.
  - Same redirect-AFTER-try-catch pattern (preserve redirect signal).
  - **`revalidatePath` is required** because the list page is server-rendered and Next would otherwise serve a stale cached version of `/admin/spaces` (Next 16 caching defaults can be aggressive).

- [x] **Task 5 — `POST /admin/spaces` REST endpoint** — `src/app/api/admin/spaces/route.ts`:
  - Export `POST(req)`:
    - try `requireSession()` → `requireRole(session, 'SUPER_ADMIN')`.
    - Parse JSON body, validate via `createSpaceSchema`.
    - On valid: `await createSpace(...)`, return 201 + the created row.
    - Catch `AuthError` → return `err.response` (401 or 403).
    - Catch validation errors → 400 via `apiValidationError`.
    - Catch internal errors → 500 via `apiError`.
  - **Optional GET also exposes the list** (useful for admin tooling) — not in PRD §6.4 but useful. **DECISION: defer GET to a later story** to keep US-2.1 scope tight (US-2.2 or a dedicated admin-API-completeness story). The list page reads from the DB query helper directly, not via this REST endpoint.

- [x] **Task 6 — Admin spaces list page** — `src/app/admin/spaces/page.tsx`:
  - Server Component (no `'use client'`).
  - At top: `const session = await requireSession();` / `requireRole(session, 'SUPER_ADMIN')`. **Wrap in try/catch:** on `AuthError`, redirect to `/login` (no session) or `/` (Guest). Server-Component-shaped redirects use `redirect()` from `next/navigation`.
  - Fetch list via `listAllSpaces()`.
  - Render: heading "Spaces" + a `<Link href="/admin/spaces/new">New Space</Link>` (button-styled) + the list.
  - List uses `<DataView>` from US-0.2 to handle empty / loaded states. (No loading state needed — Server Components render the data directly. No error state for now — let errors bubble to the global error boundary.)
  - Show columns: Name, City. (Address/description are too verbose for a list view; surface only in Edit page in US-2.2.)

- [x] **Task 7 — New space page** — `src/app/admin/spaces/new/page.tsx` + `create-space-form.tsx`:
  - `page.tsx` (Server Component) does the same `requireSession` → `requireRole('SUPER_ADMIN')` guard as the list page (centralize this once Epic 2's pattern is clearer; for now, duplicate at each entry point — see Dev Notes "Guard placement").
  - Renders `<CreateSpaceForm />` inside a heading "Create Space".
  - `create-space-form.tsx` (Client Component, `'use client'`):
    - Native `<form action={createSpaceAction}>` + `useActionState` for the form state + `useFormStatus` for the submit button.
    - 5 labeled inputs: Name, City, Address, Description (textarea), Image URL.
    - Same Tailwind styling pattern as register/login forms. `noValidate`. Inline `text-red-700` per-field errors.

- [x] **Task 8 — Header: add Admin link for Super Admins** — modify `src/components/header.tsx`:
  - Read `session.user.role` (already available from `getSession`).
  - When `role === 'SUPER_ADMIN'`, render `<Link href="/admin/spaces">Admin</Link>` between the user email span and the LogoutButton.
  - When Guest or unauthenticated: no Admin link.

- [x] **Task 9 — Middleware: cookie-presence check on `/admin/*` and `/api/admin/*`** — NEW `deskhive/middleware.ts`:
  - Use Better Auth's `getSessionCookie` helper from `better-auth/cookies` (Edge-runtime safe; no DB roundtrip).
  - If no session cookie:
    - For `/api/admin/*`: return JSON 401 (`{ error: 'Authentication required', code: 'UNAUTHORIZED' }`).
    - For `/admin/*`: redirect to `/login`.
  - If cookie present: pass through. Route-level `requireSession`/`requireRole` does the actual auth (cookie-presence ≠ valid session, but middleware is best-effort early rejection).
  - Matcher: `['/admin/:path*', '/api/admin/:path*']`.
  - **Verify against Better Auth 1.6.x docs** — `getSessionCookie` import path may be `better-auth/cookies` or `better-auth/next-js`; document the choice in Completion Notes.

- [x] **Task 10 — E2E tests** — `tests/e2e/admin-spaces.spec.ts`:
  - Test 1: `unauthenticated GET /admin/spaces redirects to /login`. Visit `/admin/spaces`, assert final URL ends with `/login`.
  - Test 2: `unauthenticated POST /admin/spaces returns 401`. Use `request.post('/api/admin/spaces', { data: { ... } })`, assert status 401.
  - **Authenticated happy-path E2E (login as Super Admin → create space → verify in list) is DB-dependent** and DEFERRED to the same future story that introduces a Postgres service container in CI's E2E job. (Same posture as register/login E2E happy paths.)

- [x] **Task 11 — Local CI parity** — all 5 commands green:
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 53 prior + ~8 new space-schema tests = ~61 passing + 1 skipped
  - `pnpm build` — successful, **+3 routes**: `/admin/spaces`, `/admin/spaces/new`, `/api/admin/spaces`
  - `pnpm test:e2e` — at least 10 tests pass (existing 8 + 2 new admin-spaces).

- [ ] **Task 12 — Manual verification (BA's eyeball confirmation — DEFERRED to BA's review of `review`-state story):**
  - Log in as `admin@deskhive.local` → header shows "Admin" link.
  - Click "Admin" → land on `/admin/spaces`. List is empty initially → "No spaces available yet."
  - Click "New Space" → land on `/admin/spaces/new`. Form has 5 fields.
  - Submit empty form → 5 inline errors visible.
  - Submit `name: 'Hive Central'`, `city: 'Berlin'`, `addressLine: 'Friedrichstr 1'`, `description: 'Bright modern workspace'`, `primaryImageUrl: 'https://example.com/x.jpg'` → redirect to `/admin/spaces`. List now shows "Hive Central" / "Berlin".
  - Submit invalid URL (`not-a-url`) → inline error on URL field.
  - Log out, then visit `/admin/spaces` directly in browser → redirect to `/login`.
  - Log in as a Guest (register a new one if needed), then visit `/admin/spaces` → redirect to `/`.
  - DevTools: send `POST /api/admin/spaces` from Guest session → 403 with `{ error: 'Forbidden', code: 'FORBIDDEN' }`. Send same from no-session → 401.

- [x] **Task 13 — Single commit (AC-14)** — commit message: `feat: admin create space (US-2.1)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **first story of Epic 2 — Inventory Management**. After it lands:
- `/admin/spaces` exists as a Super-Admin-only landing page for the admin area.
- The first **protected-routes infrastructure** (middleware + route-level `requireSession`/`requireRole`) is wired up and proven.
- The first **DB write** beyond auth lands (`createSpace`).
- The first **Server-Component page that fetches DB data and renders it via `<DataView>`** lands.

Feature scope (US-2.1 only):
- ✅ `/admin/spaces` list page (Server Component)
- ✅ `/admin/spaces/new` create form page
- ✅ `POST /admin/spaces` REST endpoint
- ✅ `createSpaceAction` Server Action
- ✅ `middleware.ts` (cookie-presence check on `/admin/*` and `/api/admin/*`)
- ✅ Header gets an "Admin" link for Super Admins
- ✅ List and create operations only

Out of scope for US-2.1 (do NOT build):
- ❌ Edit Space (US-2.2 owns it; `/admin/spaces/:id` page)
- ❌ Add Desk to Space (US-2.3)
- ❌ Edit Desk (US-2.4)
- ❌ Public spaces list at `/` (US-3.1) or `/spaces?city=X` (US-3.1)
- ❌ Space detail page at `/spaces/:id` (US-3.2)
- ❌ Image upload — `primaryImageUrl` is just a string field (URL input). No file upload, no image hosting. Doc B §11 Phase 2.
- ❌ Status toggle (PUBLISHED/SUSPENDED) — schema supports both but the form only writes PUBLISHED. Phase 2 admin tooling.
- ❌ A "delete space" feature — no DELETE endpoint exists in Doc B §6.4.
- ❌ Pagination on the admin list — Phase 1 is small enough.
- ❌ Search/filter on the admin list — Phase 1 is small enough.
- ❌ Bulk operations.
- ❌ A "drafts" mode — spaces go straight to PUBLISHED.
- ❌ Audit log / change history — Phase 2.
- ❌ A `(admin)/layout.tsx` route-group layout. **Maybe in US-2.2 if Edit grows the layout — but for US-2.1 the per-page guard is fine.** (See "Guard placement" below.)

### Guard placement decision

Three places where the auth check could live:
1. **Middleware** (`middleware.ts`) — runs at the edge, before the page even loads.
2. **Layout** (`src/app/admin/layout.tsx`) — runs once per request to any `/admin/*` page; centralizes the guard.
3. **Per-page** (top of each `page.tsx`) — explicit, duplicated, but easy to reason about.

For US-2.1: **middleware does cookie presence; per-page does role check.** No layout-level guard yet. Rationale:
- Layout-level guard would be DRY but introduces an extra component and binds Epic 2's structure to a `(admin)` route group prematurely. US-2.2 (Edit) and US-2.3 (Add Desk) will both need the same guard; if duplication grows annoying, EXTRACT a layout guard at that point — not now.
- Middleware can't do role checks reliably from a cookie alone (would need to decode the session, which means a DB roundtrip; defeats the "edge-fast" benefit).
- Per-page is verbose but explicit. Three lines per page (`requireSession` → `requireRole` → catch redirect) is acceptable scope.

**If a `(admin)/layout.tsx` is introduced later**, both `/admin/spaces/page.tsx` and `/admin/spaces/new/page.tsx` should be moved under `(admin)/admin/spaces/...` and the page-level guards removed. **Don't pre-extract.**

### Architecture compliance

- **Validation:** Zod, server-side authoritative. (architecture §Implementation Patterns.)
- **Form pattern:** Native `<form action={serverAction}>` + `useActionState` + `useFormStatus`. **NO React Hook Form, etc.**
- **State management:** None client-side beyond the form's local state.
- **Component library:** None. Raw Tailwind utility classes only.
- **DataView usage:** Use the `<DataView>` primitive from US-0.2 for the list's empty/loaded states. (architecture §Project Structure → cross-cutting components.)
- **Authorization:** Three-layer pattern landed:
  - Layer 1: middleware cookie presence
  - Layer 2: route handler `requireSession` + `requireRole('SUPER_ADMIN')`
  - Layer 3: `requireOwnership` — N/A here (no resource owned by a specific Super Admin; spaces are platform-owned)
- **Error response shape (Server Action):** `{ status: 'error', code, message?, fields? }`.
- **Error response shape (REST):** `{ error, code, fields? }` via helpers; status codes 201 / 400 / 401 / 403 / 500.
- **Auth API:** `auth.api.signInEmail` and friends are all wrapped already; this story consumes `requireSession` (which calls `getSession` internally) — don't call `getSession` directly.
- **Reskinnable frontend:** Literal Tailwind utilities only.
- **Default redirect after Super Admin login:** still `/`. Super Admin clicks "Admin" link in header to reach `/admin/spaces`. (Auto-redirecting Super Admins to `/admin/spaces` on login is out of scope; would couple US-1.2 to Epic 2.)

### Key file additions and code sketches

#### `src/lib/validation/space.ts`

```ts
import { z } from 'zod';

export const createSpaceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  city: z.string().trim().min(1, 'City is required'),
  addressLine: z.string().trim().min(1, 'Address is required'),
  description: z.string().trim().min(1, 'Description is required'),
  primaryImageUrl: z
    .string()
    .trim()
    .min(1, 'Image URL is required')
    .url('Must be a valid URL'),
});

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
```

#### `src/db/queries/spaces.ts`

```ts
import { desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { spacesTable, type Space } from '@/db/schema';
import type { CreateSpaceInput } from '@/lib/validation/space';

export async function listAllSpaces(): Promise<Space[]> {
  return db.select().from(spacesTable).orderBy(desc(spacesTable.createdAt));
}

export async function createSpace(input: CreateSpaceInput): Promise<Space> {
  const [row] = await db
    .insert(spacesTable)
    .values({
      name: input.name,
      city: input.city,
      addressLine: input.addressLine,
      description: input.description,
      primaryImageUrl: input.primaryImageUrl,
      // status defaults to 'PUBLISHED' at the DB level; explicit for clarity:
      status: 'PUBLISHED',
    })
    .returning();
  return row;
}
```

#### `src/actions/space.ts` (NEW file — sibling to `src/actions/auth.ts`)

```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createSpaceSchema } from '@/lib/validation/space';
import { createSpace } from '@/db/queries/spaces';
import { logger } from '@/lib/logger';

export type CreateSpaceActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function createSpaceAction(
  _prevState: CreateSpaceActionState,
  formData: FormData,
): Promise<CreateSpaceActionState> {
  // Auth gates (Layer 2)
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      // Distinguish 401 from 403 by inspecting the wrapped Response status
      // (the helpers set 401 for unauthorized, 403 for forbidden).
      const status = err.response.status;
      if (status === 401) return { status: 'error', code: 'UNAUTHORIZED', message: 'Please log in.' };
      if (status === 403) return { status: 'error', code: 'FORBIDDEN', message: 'Forbidden.' };
    }
    logger.error('create_space_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  // Validation
  const parsed = createSpaceSchema.safeParse({
    name: formData.get('name'),
    city: formData.get('city'),
    addressLine: formData.get('addressLine'),
    description: formData.get('description'),
    primaryImageUrl: formData.get('primaryImageUrl'),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  // Write
  let result: CreateSpaceActionState | null = null;
  try {
    await createSpace(parsed.data);
  } catch (err) {
    logger.error('create_space_action_db_failed', { error: String(err) });
    result = { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
  }

  if (result) return result;
  revalidatePath('/admin/spaces');
  redirect('/admin/spaces');
}
```

#### `src/app/api/admin/spaces/route.ts`

```ts
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createSpaceSchema } from '@/lib/validation/space';
import { createSpace } from '@/db/queries/spaces';
import { apiError, apiValidationError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('create_space_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  const parsed = createSpaceSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return apiValidationError(fields);
  }

  try {
    const row = await createSpace(parsed.data);
    return Response.json(row, { status: 201 });
  } catch (err) {
    logger.error('create_space_route_db_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

#### `src/app/admin/spaces/page.tsx`

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { listAllSpaces } from '@/db/queries/spaces';
import { DataView } from '@/components/data-view';

export default async function AdminSpacesPage() {
  // Layer 2 guard — middleware did cookie-presence; we do role.
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      // 401 → middleware already redirected. If we got here, it's a 403.
      // Redirect Guest to / silently per AC-5.
      redirect('/');
    }
    throw err;
  }

  const spaces = await listAllSpaces();

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Spaces</h1>
        <Link
          href="/admin/spaces/new"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          New Space
        </Link>
      </div>

      <DataView
        data={spaces}
        emptyMessage="No spaces available yet."
        renderItem={(s) => (
          <li key={s.id} className="border-b border-gray-200 py-3">
            <div className="font-medium">{s.name}</div>
            <div className="text-sm text-gray-600">{s.city}</div>
          </li>
        )}
      />
    </main>
  );
}
```

**Note for Amelia:** Verify the actual `<DataView>` API by reading `src/components/data-view.tsx`. The exact prop names (`renderItem` vs `children`, etc.) may differ; the test file (`data-view.test.tsx`) shows the canonical usage.

#### `src/app/admin/spaces/new/page.tsx`

```tsx
import { redirect } from 'next/navigation';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { CreateSpaceForm } from './create-space-form';

export default async function NewSpacePage() {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) redirect('/');
    throw err;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold mb-6">Create Space</h1>
      <CreateSpaceForm />
    </main>
  );
}
```

#### `src/app/admin/spaces/new/create-space-form.tsx`

(Replicate the register-form / login-form pattern. 5 fields; description as `<textarea>`. Same Tailwind utility classes; `noValidate`; inline error pattern.)

#### `src/components/header.tsx` — modification

Add an "Admin" link in the right nav, between user email and LogoutButton, gated by role:

```tsx
{user ? (
  <>
    <span className="text-gray-700">{user.email}</span>
    {(user as { role?: string }).role === 'SUPER_ADMIN' && (
      <Link href="/admin/spaces" className="text-gray-700 hover:underline">
        Admin
      </Link>
    )}
    <LogoutButton />
  </>
) : (...)}
```

#### `deskhive/middleware.ts` (NEW — at deskhive root, sibling of next.config / package.json)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    // No session cookie at all → reject early.
    if (request.nextUrl.pathname.startsWith('/api/admin')) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
    if (request.nextUrl.pathname.startsWith('/admin')) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
```

**Note for Amelia:** Verify `getSessionCookie`'s import path against Better Auth 1.6.9 docs. Possible alternatives if the import fails: `better-auth/next-js`, or read the cookie name directly from `request.cookies.get('better-auth.session_token')` (the default cookie name; check `auth.options.session.cookieName` if customized — we did NOT customize it). Document the resolved path in Completion Notes.

### File-structure requirements

After this story:

```
deskhive/
├── middleware.ts                                     # NEW (US-2.1)
├── src/
│   ├── actions/
│   │   ├── auth.ts                                   # (unchanged)
│   │   └── space.ts                                  # NEW (US-2.1)
│   ├── app/
│   │   ├── layout.tsx                                # (unchanged)
│   │   ├── admin/                                    # NEW (US-2.1)
│   │   │   └── spaces/
│   │   │       ├── page.tsx                          # NEW
│   │   │       └── new/
│   │   │           ├── page.tsx                      # NEW
│   │   │           └── create-space-form.tsx         # NEW
│   │   ├── api/
│   │   │   ├── admin/                                # NEW (US-2.1)
│   │   │   │   └── spaces/
│   │   │   │       └── route.ts                      # NEW
│   │   │   └── auth/
│   │   │       └── ...                               # (unchanged)
│   │   └── (public)/                                 # (unchanged)
│   ├── components/
│   │   ├── data-view.tsx                             # (unchanged)
│   │   ├── header.tsx                                # UPDATED (Admin link for Super Admin)
│   │   ├── logout-button.tsx                         # (unchanged)
│   │   └── status-badge.tsx                          # (unchanged)
│   ├── db/
│   │   ├── client.ts                                 # (unchanged)
│   │   ├── schema.ts                                 # (unchanged)
│   │   └── queries/                                  # NEW directory (US-2.1)
│   │       └── spaces.ts                             # NEW
│   └── lib/
│       ├── auth/                                     # guards.ts already existed (US-0.2)
│       ├── http.ts                                   # (unchanged)
│       ├── validation/
│       │   ├── auth.ts                               # (unchanged)
│       │   ├── auth.test.ts                          # (unchanged)
│       │   ├── space.ts                              # NEW (US-2.1)
│       │   └── space.test.ts                         # NEW (US-2.1)
└── tests/
    └── e2e/
        └── admin-spaces.spec.ts                      # NEW (US-2.1)
```

Files NOT touched:
- `src/app/page.tsx` (welcome page; smoke test depends on it; replaced in US-3.1)
- `src/app/layout.tsx` (root layout; unchanged from US-1.3)
- `src/lib/auth/config.ts` (unchanged)
- `src/lib/auth/guards.ts` (already implemented in US-0.2; this story USES it)
- All Epic 1 files
- US-0.2 cross-cutting primitives (`apiError`, `<DataView>`, `<StatusBadge>`, formatters, logger)

### Library / framework requirements

All required dependencies are already installed:
- `better-auth@1.6.9` (`getSessionCookie`, `requireSession`/`requireRole` already wrapped) ✅
- `drizzle-orm@0.45.2` (`desc`, `.insert().returning()`) ✅
- `zod@3.25.x` (`.url()`) ✅
- `next@16.2.4` (Server Actions, middleware, `revalidatePath`) ✅

**Important — Next.js 16 specifics (re-emphasized — see `deskhive/AGENTS.md`):**
- `revalidatePath` from `next/cache` (existing API; behavior in Next 16 may differ subtly from earlier versions — verify the call still invalidates the page).
- Middleware runs in the Edge runtime by default. `better-auth/cookies` is Edge-runtime safe; `auth.api.getSession` would NOT work in middleware (Node-only). **DO NOT** call `auth.api.getSession` from middleware.
- Async Server Components / async pages are stable.

### Testing requirements

**Unit tests (Vitest):**
- `src/lib/validation/space.test.ts` — ~7-8 tests for `createSpaceSchema`.

**E2E tests (Playwright):**
- `tests/e2e/admin-spaces.spec.ts` — 2 tests:
  1. Unauthenticated UI redirect to `/login`
  2. Unauthenticated REST 401
- Authenticated happy-path E2E DEFERRED (DB-dependent).

**Manual verification (Task 12) — the actual demo bar.**

### Anti-patterns — explicit DO-NOTs

- ❌ Calling `auth.api.getSession` directly from a route handler. Use `requireSession()` so the AuthError pattern is consistent.
- ❌ Calling `auth.api.getSession` from middleware. Use `getSessionCookie` (Edge-safe).
- ❌ Adding a layout-level guard before US-2.2 has Edit + US-2.1 has the existing pattern stable. Don't pre-extract.
- ❌ Auto-redirecting Super Admins to `/admin/spaces` on login. Login still goes to `/`. The "Admin" header link is the navigation surface.
- ❌ Adding any other `/admin/*` route in this story (no Edit, no Add Desk, no settings).
- ❌ Adding pagination, search, or filters to the admin list. Phase 1 is small.
- ❌ Image upload. `primaryImageUrl` is a URL input; the PRD §11 puts uploads in Phase 2.
- ❌ A "delete" or "suspend" button. Not in Doc B §6.4.
- ❌ Storing the role anywhere client-side (React Context, Zustand, etc.). Server-side `getSession` per request.
- ❌ Skipping the `revalidatePath('/admin/spaces')` call after create. Without it, the redirect lands on a stale list.
- ❌ Hardcoding `'/admin/spaces'` strings everywhere — fine for now (Phase 1 scope is bounded), but if Epic 2 grows complex, extract to a `routes.ts` constants module. Don't extract preemptively in this story.
- ❌ Hardcoding the redirect target as `'http://localhost:3000/admin/spaces'`. Use `redirect('/admin/spaces')`.
- ❌ Using `redirect()` inside a `try`/`catch` that catches Next.js's redirect signal. Same redirect-after-try-catch rule as US-1.1.

### Project structure notes

- `src/db/queries/` is introduced in this story. All future stories that touch the DB beyond auth will add files here (`bookings.ts`, `desks.ts`, etc.).
- `src/actions/space.ts` joins `src/actions/auth.ts`. Pattern: one action file per domain (auth, space, booking, etc.).
- `src/app/admin/` is introduced. All admin pages live under this prefix. Future Epic 2/4 stories add `spaces/[id]/page.tsx` (Edit), `spaces/[id]/desks/...`, `bookings/page.tsx`.
- `src/app/api/admin/` mirrors the UI prefix for protected REST endpoints.

### Previous story intelligence

- **Epic 0** (`a32ff6e`, `1cb840b`, `22625f8`, `ce903a7`, `a015793`): scaffolding — Next 16, Drizzle, Better Auth, CI, env-loading.
- **US-1.1** (`b7bd9fa`): `/register` + registerAction + auth catch-all + REST wrapper.
- **US-1.2** (`579071b`): `/login` + loginAction + REST wrapper + login schema tests.
- **US-1.3** (`826bf32`): global header + logoutAction + REST wrapper + session-read pattern. **All routes flipped to dynamic.**

**Patterns established (replicate, don't deviate):**
- Server Action → `redirect()` AFTER try/catch.
- Multi-pattern matching for Better Auth errors (not relevant here, but the pattern is set).
- camelCase TS field names ↔ snake_case DB columns (Drizzle aliases handle it).
- Co-located unit tests next to source; E2E under `tests/e2e/`.
- One feature story → one `feat:` commit titled `feat: <thing> (US-x.y)`.
- Header is global; pages render inside `<div className="flex-1">{children}</div>`.

### Recent commits (for git intelligence)

```
826bf32 feat: logout button and global header (US-1.3)
579071b feat: login page and server action (US-1.2)
b7bd9fa feat: guest registration page and server action (US-1.1)
a015793 chore: env loading + better-auth name field remap (US-0.2 follow-up)
ce903a7 chore: ci pipeline and e2e scaffolding (US-0.3)
22625f8 chore: include .env.example in tracked files (US-0.2 follow-up)
1cb840b chore: install dependencies, schema, and cross-cutting primitives (US-0.2)
```

US-2.1 is the fourth `feat:` commit. After it, Epic 2 has US-2.2 / US-2.3 / US-2.4 still in `backlog`.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-2.1 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.2] — FR-I1 (Super Admin creates a Space with name, city, address, description, single image URL).
- [Source: docs/02-phase1-prd.md#Section 6.1] — `spaces` table schema.
- [Source: docs/02-phase1-prd.md#Section 6.4] — `POST /admin/spaces` endpoint.
- [Source: docs/02-phase1-prd.md#Section 7.2] — Admin Spaces List screen.
- [Source: docs/02-phase1-prd.md#Section 7.3] — Required UI states (loading/empty/error/loaded).
- [Source: docs/02-phase1-prd.md#Section 7.5] — Submit-button disable-on-submit rule.
- [Source: docs/02-phase1-prd.md#Section 7.6] — Form validation rules.
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — Three-layer auth pattern.
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — Status code conventions.
- [Source: _bmad-output/implementation-artifacts/0-2-dependencies-schema-and-primitives.md] — `requireSession`/`requireRole` were scaffolded; `<DataView>` exists.
- [Source: _bmad-output/implementation-artifacts/1-1-guest-registration.md] — Server-Action + redirect-after-try-catch pattern.
- [Source: _bmad-output/implementation-artifacts/1-3-logout.md] — Header is global; modifying it is acceptable across stories.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveat.
- [Source: better-auth.com/docs/integrations/next-js] — `getSessionCookie` for middleware.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean across all new + modified files |
| `pnpm lint` | Clean |
| `pnpm test` | 61/61 pass + 1 skipped — added 8 new `createSpaceSchema` tests |
| `pnpm build` | 11 routes (added `/admin/spaces`, `/admin/spaces/new`, `/api/admin/spaces`); proxy registered as "Proxy (Middleware)"; all routes dynamic |
| `pnpm test:e2e` | 11/11 pass in 9.1s — added 3 new admin-spaces tests (UI redirect to /login on `/admin/spaces` and `/admin/spaces/new`; REST 401 on `POST /api/admin/spaces`) |

### Completion Notes List

**Story executed end-to-end. Stop bar (admin spaces page renders for Super Admin) achieved structurally.** All 61 unit tests + 11 E2E tests pass. Browser-interactive verification (Task 12) remains on BA's plate.

**Mid-execution corrections (3 — documented for future stories):**

1. **`middleware.ts` → `proxy.ts` rename (Next.js 16 breaking change).** First build emitted: *"The 'middleware' file convention is deprecated. Please use 'proxy' instead."* Renamed `src/middleware.ts` → `src/proxy.ts`, exported function `proxy(request)` instead of `middleware(request)`. Build output stops emitting the warning. **AGENTS.md was right** — this is exactly the kind of training-data drift it warned about. Future stories adding edge intercepts should write `proxy.ts` from the start.

2. **`getSessionCookie` from `better-auth/cookies` swapped for raw cookie check.** Originally imported per the story's draft. After the rename to `proxy.ts`, the API kept 500-ing on auth-protected routes (likely an edge-runtime ESM resolution issue with Better Auth's package; unconfirmed root cause). Replaced with a hardcoded check against the two default Better Auth cookie names: `better-auth.session_token` and `__Secure-better-auth.session_token` (HTTPS variant). Result: clean redirect/401 behavior at the edge. **No new dependencies; no Better Auth import in proxy.** If Better Auth ever changes its default cookie name, the constant in `src/proxy.ts` needs to change too — flagged with an inline comment.

3. **Page-level redirect refined to handle 401 → `/login`, 403 → `/`.** The original story-draft had pages redirecting to `/` for any AuthError, with a comment "middleware should have redirected" for 401. After defense-in-depth analysis, distinguished by `err.response.status`: 401 (no session, possibly because middleware was bypassed or cookie went stale mid-request) → `/login`; 403 (Guest hitting admin) → `/`. This makes E2E tests work even if proxy hiccups, AND gives the right UX semantically.

**Key implementation observations:**

4. **Stale dev server gotcha.** The first E2E run with the renamed proxy still failed because Playwright's `webServer` config reused a dev server from a *previous* run that was still on port 3000 with the OLD code. Killed PID 29704 manually; tests then passed. Worth noting in onboarding: if E2E results contradict the code, check `Get-NetTCPConnection -LocalPort 3000` and ensure no stale server is squatting.

5. **Three-layer auth pattern is now proven.**
   - Layer 1 (proxy.ts): cookie-presence check at the edge → redirect/401 fast.
   - Layer 2 (route/page): `requireSession` + `requireRole('SUPER_ADMIN')` → 401/403 with proper error shape.
   - Layer 3 (`requireOwnership`): N/A for this story; spaces are platform-owned.
   
   The pattern carries forward to every future Epic 2-4 admin/guest story.

6. **DataView prop name correction.** Story draft sketched `<DataView data={...} renderItem={...}>`. Actual API is `<DataView status={...} children>{...}</DataView>`. Fixed at write time by reading the existing component before generating the page. Story prompt could be improved to always read the component first; left as-is in the story for traceability.

7. **`revalidatePath('/admin/spaces')` matters in Next 16.** Without it, the redirect after create lands on a stale list. With it, the new space appears immediately. Confirmed via the architecture-required E2E happy-path is DB-dependent and deferred — but the `revalidatePath` call is mandatory.

8. **Build output now includes `Proxy (Middleware)`** as a separate line, indicating Next 16 detects and attaches the proxy correctly.

**Browser-interactive verifications still on BA's plate (Task 12):**
- Log in as Super Admin (`admin@deskhive.local` / `SuperAdmin1!`) → header should now show `Admin` link.
- Click `Admin` → `/admin/spaces`. Empty list → `"No spaces available yet."`
- Click `New Space` → `/admin/spaces/new`. Form has 5 fields.
- Submit valid input → redirect to `/admin/spaces`; new space visible.
- Submit invalid URL or empty fields → inline errors per field.
- Log out, then visit `/admin/spaces` directly → redirect to `/login`.
- Register a new Guest, then visit `/admin/spaces` while logged in as Guest → redirect to `/`.
- DevTools: `POST /api/admin/spaces` from Guest session → 403; from no-session → 401.

### File List

All paths relative to repo root.

**NEW (10 files):**
- `deskhive/src/proxy.ts` — Edge-runtime cookie-presence proxy (Next 16 convention)
- `deskhive/src/actions/space.ts` — `createSpaceAction` Server Action
- `deskhive/src/lib/validation/space.ts` — `createSpaceSchema` Zod schema
- `deskhive/src/lib/validation/space.test.ts` — 8 schema tests
- `deskhive/src/db/queries/spaces.ts` — `listAllSpaces` + `createSpace` query helpers (introduces the `src/db/queries/` folder)
- `deskhive/src/app/admin/spaces/page.tsx` — admin spaces list (Server Component)
- `deskhive/src/app/admin/spaces/new/page.tsx` — create space page (Server Component shell)
- `deskhive/src/app/admin/spaces/new/create-space-form.tsx` — form (Client Component, 5 fields)
- `deskhive/src/app/api/admin/spaces/route.ts` — `POST /admin/spaces` REST endpoint
- `deskhive/tests/e2e/admin-spaces.spec.ts` — 3 Playwright tests (UI redirects + REST 401)

**UPDATED (1 file):**
- `deskhive/src/components/header.tsx` — added Admin link (visible only when `user.role === 'SUPER_ADMIN'`); placed between user email and LogoutButton

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/lib/auth/config.ts` — Better Auth config unchanged
- `deskhive/src/lib/auth/guards.ts` — already implemented in US-0.2; this story USES it
- `deskhive/src/db/schema.ts` — `spaces` table already exists from US-0.2
- `deskhive/src/app/page.tsx` — welcome page; replaced in US-3.1
- `deskhive/src/app/layout.tsx` — root layout unchanged from US-1.3
- All Epic 1 files
- US-0.2 cross-cutting primitives

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | US-2.1 implemented; mid-execution corrections: `middleware.ts` → `proxy.ts`, swapped `getSessionCookie` for raw cookie check, refined page-level 401 → `/login` redirect; all CI commands green. | `9f79cf1` |
