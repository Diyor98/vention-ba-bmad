# Story 2.2: Edit Space

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **to edit the fields of an existing space at `/admin/spaces/:id`**,
so that **I can correct mistakes (typos, stale descriptions, wrong image URLs).**

> Verbatim from Document B §8 (US-2.2). FR-I2 (Super Admin edits Space fields).

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-2.2, plus implementation-shaped ACs:

1. **AC-1 (Edit existing Space — happy path).**
   ```gherkin
   Given a Space "Hive Central" exists
   And I am logged in as Super Admin
   When I open its edit page and change the description to "Updated description"
   And I click "Save"
   Then the Space's description is updated
   And the change is visible on the public space detail page after refresh
   ```
   **Note on the "public space detail page" clause:** the public `/spaces/:id` route lands in US-3.2; US-2.2 cannot test that surface. The verifiable portion of AC-1 is: (a) the DB row's `description` column is updated, and (b) re-rendering `/admin/spaces/:id` shows the new value. The "after refresh" wording from the PRD reflects Server Component re-execution behavior — confirmed by `revalidatePath` (see AC-7).

2. **AC-2 (List page links to edit).** On `/admin/spaces`, each space row is a link to `/admin/spaces/:id`. Either the whole row or an explicit "Edit" affordance.

3. **AC-3 (Form prefilled with current values).** Visiting `/admin/spaces/:id` shows the edit form with all 5 fields prefilled with the existing space's data.

4. **AC-4 (404 for missing space).** Visiting `/admin/spaces/:nonExistentId` produces Next.js's 404 page (via `notFound()`). The middleware/proxy still redirects unauthenticated users to `/login` first; only authenticated Super Admins reach the 404.

5. **AC-5 (REST PUT endpoint).** `PUT /admin/spaces/:id` exists with same auth/validation contract as US-2.1's POST:
   - 200 on update + the updated row
   - 400 on validation
   - 401 on no session, 403 on Guest
   - 404 on missing space
   - 500 on internal

6. **AC-6 (Validation reuses `createSpaceSchema`).** Edit accepts the same 5 fields with the same constraints; reuse `createSpaceSchema` (or rename to `spaceFormSchema`). Field-level inline errors per `text-red-700` paragraph pattern.

7. **AC-7 (`revalidatePath` after update).** The Server Action calls `revalidatePath('/admin/spaces')` AND `revalidatePath('/admin/spaces/${id}')` so both the list and the edit page reflect the change without a hard reload. Defer revalidating `/spaces/${id}` (public detail) to US-3.2 since that route doesn't exist yet.

8. **AC-8 (Architecture-shaped error response).**
   - Server Action: `idle` | `error.UNAUTHORIZED` | `error.FORBIDDEN` | `error.NOT_FOUND` | `error.VALIDATION_ERROR` | `error.INTERNAL_ERROR`. The `NOT_FOUND` case is when the action's `id` argument doesn't resolve a row (concurrent delete from a future Phase 2 admin tool, or stale URL).
   - REST: standard helpers; 200/400/401/403/404/500.

9. **AC-9 (Submit-button disable-on-submit).** (Doc B §7.5.) Same pattern as US-2.1 — `useFormStatus().pending` → "Save" / "Saving…".

10. **AC-10 (Centralized admin guard via layout).** Introduce `src/app/admin/layout.tsx` with `requireSession` + `requireRole('SUPER_ADMIN')` + the 401→`/login` / 403→`/` dispatch. **Remove the duplicate guard blocks from `/admin/spaces/page.tsx` and `/admin/spaces/new/page.tsx`** — the layout fires before children render. **Add the same guard to the new `/admin/spaces/[id]/page.tsx`** by inheritance (no per-page guard needed). This is the deferred extraction US-2.1's Dev Notes flagged as "extract once US-2.2 has Edit + we have the third page using the same guard."

11. **AC-11 (Stop bar — page renders for Super Admin).** As Super Admin, clicking a row on `/admin/spaces` lands on `/admin/spaces/:id` with the form prefilled. Editing description → Save → redirect back to `/admin/spaces`, list reflects the change.

12. **AC-12 (Single commit).** `feat: admin edit space (US-2.2)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify `pnpm test` and `pnpm test:e2e` from US-2.1 still pass before starting (regression baseline). DB unchanged; no new migrations.

- [x] **Task 1 — Spaces query helpers (extend)** — `src/db/queries/spaces.ts`:
  - Add `getSpaceById(id: string): Promise<Space | undefined>`: `db.select().from(spacesTable).where(eq(spacesTable.id, id)).limit(1)` → first row or undefined.
  - Add `updateSpace(id: string, input: CreateSpaceInput): Promise<Space | undefined>`: `db.update(spacesTable).set({ ...input, updatedAt: new Date() }).where(eq(spacesTable.id, id)).returning()` → first row or undefined (undefined when no row matched).
  - **No schema change.** `updatedAt` column already has `defaultNow()` via Drizzle, but explicit `set` ensures it bumps on UPDATE (Postgres default only fires on INSERT).

- [x] **Task 2 — Edit Space Server Action** — extend `src/actions/space.ts`:
  - Add `editSpaceAction(id: string, _prevState, formData): Promise<EditSpaceActionState>`.
  - Same auth-then-validate-then-write pattern as `createSpaceAction`, with these differences:
    - Action signature has `id` as the first arg (will be curried via `.bind(null, id)` in the form component).
    - On `updateSpace` returning `undefined`, return `{ status: 'error', code: 'NOT_FOUND', message: 'Space not found.' }`.
    - On success: `revalidatePath('/admin/spaces')` and `revalidatePath('/admin/spaces/${id}')`, then `redirect('/admin/spaces')`.
  - Reuse `createSpaceSchema` for validation (don't duplicate).

- [x] **Task 3 — `PUT /admin/spaces/:id` REST endpoint** — `src/app/api/admin/spaces/[id]/route.ts`:
  - Export `PUT(req, { params })` — Next 16: `params` is a Promise, must `await` it.
  - Same auth + validation as US-2.1's POST. On `updateSpace` undefined → `apiError('NOT_FOUND', 'Space not found', 404)` (or `apiNotFound` from `lib/http`).
  - On success: 200 + updated row.

- [x] **Task 4 — Centralized admin layout (refactor extraction)** — `src/app/admin/layout.tsx`:
  - Server Component layout that runs the auth guard once for all `/admin/*` pages.
  - Same try/catch dispatch as the current per-page guard: 401 → `/login`, 403 → `/`.
  - Returns `<>{children}</>` (no visual chrome — that's the global header's job).
  - **Then remove the duplicate guard blocks** from `src/app/admin/spaces/page.tsx` and `src/app/admin/spaces/new/page.tsx` (replace the try/catch with a comment: `// Guarded by src/app/admin/layout.tsx`).

- [x] **Task 5 — Edit page + form** — `src/app/admin/spaces/[id]/page.tsx` + `edit-space-form.tsx`:
  - `page.tsx` (Server Component): `await params` → `id`. Call `getSpaceById(id)`. If undefined → `notFound()` (from `next/navigation`). Otherwise render heading + form with prefilled values + a "Cancel" link to `/admin/spaces`.
  - `edit-space-form.tsx` (Client Component): structurally identical to `create-space-form.tsx`, but:
    - `useActionState(editSpaceAction.bind(null, id), { status: 'idle' })` (id passed via `.bind`).
    - Each input has `defaultValue={space.field}` to prefill.
    - Submit button label: `Save` / `Saving…`.
    - Top-level error handling for NOT_FOUND in addition to the existing codes.
  - **Form-component extraction is OPTIONAL for this story.** The duplication between create-space-form and edit-space-form is ~70 lines. Given Epic 2 only has these two space-form usages (US-2.3/US-2.4 are about desks with different fields), extracting a `<SpaceForm>` component now is over-engineering. **Decision: keep the two form components separate.** If a third Spaces form lands (e.g., a duplicate-space wizard), revisit. Document the duplication explicitly as a known and intentional choice.

- [x] **Task 6 — List page: each row links to its edit page** — `src/app/admin/spaces/page.tsx`:
  - Wrap each `<li>`'s content in `<Link href={\`/admin/spaces/${s.id}\`}>` (or add a small "Edit" link to the right side of the row — designer choice; pick whichever reads cleaner with raw Tailwind).
  - The list now reads from `listAllSpaces()` → maps to links. No new query.

- [x] **Task 7 — E2E tests** — extend `tests/e2e/admin-spaces.spec.ts`:
  - `unauthenticated GET /admin/spaces/:id redirects to /login` — visit `/admin/spaces/some-id`, expect URL → `/login`.
  - `unauthenticated PUT /api/admin/spaces/:id returns 401` — `request.put('/api/admin/spaces/some-id', { data: {...} })`, expect 401.
  - **DB-dependent happy-path E2E (login → edit → verify) DEFERRED** to the same future story that adds Postgres to CI's E2E job.

- [x] **Task 8 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 61 prior pass; no new unit tests required (no new schemas; the existing `createSpaceSchema` tests cover the validation that edit reuses)
  - `pnpm build` — adds `/admin/spaces/[id]` and `/api/admin/spaces/[id]` routes
  - `pnpm test:e2e` — at least 13 tests pass (existing 11 + 2 new edit-redirect tests)

- [ ] **Task 9 — Manual verification (BA's eyeball confirmation — DEFERRED to BA's review of `review`-state story):**
  - Log in as Super Admin → `/admin/spaces` shows the space(s) created in US-2.1.
  - Click a space → land on `/admin/spaces/:id` with form prefilled.
  - Change the description → Save → redirected back to `/admin/spaces`; list shows space (description visible somewhere or just confirm it didn't break).
  - Visit `/admin/spaces/<bogus-id>` → see 404.
  - Log out → visit `/admin/spaces/<id>` → redirect to `/login`.
  - DevTools: `PUT /api/admin/spaces/<id>` from no-session → 401; from Guest session → 403; from Super Admin session → 200 with updated row.

- [x] **Task 10 — Single commit (AC-12)** — commit message: `feat: admin edit space (US-2.2)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second story of Epic 2**. After it lands:
- Editing existing spaces is possible.
- The `(admin)`-area auth guard is centralized in `admin/layout.tsx` (refactor extraction).
- Dynamic-segment routing (`[id]`) is introduced in `/admin/*` and `/api/admin/*`.

Feature scope (US-2.2 only):
- ✅ Edit page at `/admin/spaces/[id]` with prefilled form
- ✅ `editSpaceAction` Server Action
- ✅ `PUT /admin/spaces/:id` REST endpoint
- ✅ List page rows are clickable → edit page
- ✅ Centralized admin guard via layout (refactor extraction)

Out of scope for US-2.2 (do NOT build):
- ❌ Add Desk to Space (US-2.3 — different domain, different schema)
- ❌ Edit Desk (US-2.4)
- ❌ Public space detail at `/spaces/:id` (US-3.2)
- ❌ Public space list at `/` (US-3.1)
- ❌ Image upload, file picker (Phase 2)
- ❌ Status toggle (PUBLISHED ↔ SUSPENDED) — schema supports both but no UI
- ❌ "Delete space" — not in Doc B §6.4 endpoints
- ❌ Audit log / change history (Phase 2)
- ❌ Concurrent-edit detection / optimistic locking — Phase 1 has one Super Admin
- ❌ Undo / "discard changes" warning — keep it minimal
- ❌ A "Cancel" button beyond a `<Link>` to `/admin/spaces` — no JS-driven dirty-state tracking

### Key decisions

1. **Centralize the admin guard in a layout.** US-2.1 explicitly noted this should happen "once US-2.2 has Edit." That's now. Three pages (list, new, edit) need the same guard; pulling it into a layout is one line of net-savings per page plus one-source-of-truth for the redirect logic. **All admin pages from this story onward inherit the layout guard; per-page `requireSession` calls become an anti-pattern within `/admin/*`.**

2. **No `<SpaceForm>` extraction.** The duplication between create-space-form and edit-space-form is real (~70 lines) but bounded — Epic 2 has no third use case for the same shape. Premature extraction would couple the two forms together for no current benefit. Document the duplication explicitly as a known and intentional choice; if we ever need the third instance, extract then.

3. **`.bind(null, id)` for the edit action.** Server Actions support binding additional args at the form level. The `id` is known at render time of the page (Server Component → form props) and curried into the action. Type-safe, no hidden form fields, no need to round-trip the id through formData.

4. **Reuse `createSpaceSchema` for edit.** Both forms accept the same 5 fields with the same constraints. Renaming is unnecessary — `createSpaceSchema` describes the shape of "valid space form data," which is the same whether creating or editing. Don't rename and don't duplicate.

5. **`updatedAt` set explicitly in `updateSpace`.** Postgres' `DEFAULT now()` fires on INSERT only, not UPDATE. Drizzle doesn't auto-bump `updatedAt` either. Explicit `.set({ ...input, updatedAt: new Date() })` is the cleanest fix — applies to every future query helper that updates a row with an `updatedAt` column.

6. **`revalidatePath` for both list and detail.** Without it, Next 16's request-cache may serve a stale page after the redirect. Already proven in US-2.1; same pattern here. Defer `revalidatePath('/spaces/${id}')` (public detail) to US-3.2.

### Architecture compliance

- Validation: Zod, server-authoritative.
- Form pattern: native `<form action={...}>` + `useActionState` + `useFormStatus`.
- State management: none beyond local form state.
- Component library: none. Raw Tailwind.
- Authorization: three-layer (proxy + layout-level requireRole + N/A ownership).
- Error response shape: `{ status: 'error', code, message?, fields? }`.
- Status codes: 200 / 400 / 401 / 403 / 404 / 500.
- Auth API: never raw Drizzle; always through `requireSession` / `requireRole`.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/app/admin/layout.tsx` (NEW — centralized guard)

```tsx
import { redirect } from 'next/navigation';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.response.status === 401) redirect('/login');
      redirect('/');
    }
    throw err;
  }
  return <>{children}</>;
}
```

After this lands, the per-page try/catch blocks in `/admin/spaces/page.tsx` and `/admin/spaces/new/page.tsx` should be replaced with a one-line comment pointing at the layout.

#### `src/db/queries/spaces.ts` (extension)

```ts
import { eq, desc } from 'drizzle-orm';
// ... existing imports unchanged ...

export async function getSpaceById(id: string): Promise<Space | undefined> {
  const [row] = await db.select().from(spacesTable).where(eq(spacesTable.id, id)).limit(1);
  return row;
}

export async function updateSpace(
  id: string,
  input: CreateSpaceInput,
): Promise<Space | undefined> {
  const [row] = await db
    .update(spacesTable)
    .set({
      name: input.name,
      city: input.city,
      addressLine: input.addressLine,
      description: input.description,
      primaryImageUrl: input.primaryImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(spacesTable.id, id))
    .returning();
  return row;
}
```

#### `src/actions/space.ts` (extension)

```ts
// Append to existing file.

export type EditSpaceActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function editSpaceAction(
  id: string,
  _prevState: EditSpaceActionState,
  formData: FormData,
): Promise<EditSpaceActionState> {
  // Same auth flow as createSpaceAction (401/403 distinction).
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) return { status: 'error', code: 'UNAUTHORIZED', message: 'Please log in.' };
      if (status === 403) return { status: 'error', code: 'FORBIDDEN', message: 'Forbidden.' };
    }
    logger.error('edit_space_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

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

  let result: EditSpaceActionState | null = null;
  try {
    const updated = await updateSpace(id, parsed.data);
    if (!updated) {
      result = { status: 'error', code: 'NOT_FOUND', message: 'Space not found.' };
    }
  } catch (err) {
    logger.error('edit_space_action_db_failed', { error: String(err) });
    result = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  if (result) return result;
  revalidatePath('/admin/spaces');
  revalidatePath(`/admin/spaces/${id}`);
  redirect('/admin/spaces');
}
```

#### `src/app/api/admin/spaces/[id]/route.ts` (NEW)

```ts
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createSpaceSchema } from '@/lib/validation/space';
import { updateSpace } from '@/db/queries/spaces';
import { apiError, apiValidationError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('edit_space_route_auth_failed', { error: String(err) });
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
    const updated = await updateSpace(id, parsed.data);
    if (!updated) return apiNotFound('Space not found');
    return Response.json(updated, { status: 200 });
  } catch (err) {
    logger.error('edit_space_route_db_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

#### `src/app/admin/spaces/[id]/page.tsx` (NEW)

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSpaceById } from '@/db/queries/spaces';
import { EditSpaceForm } from './edit-space-form';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
export default async function EditSpacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const space = await getSpaceById(id);
  if (!space) notFound();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Space</h1>
        <Link href="/admin/spaces" className="text-sm text-gray-700 hover:underline">
          Back to spaces
        </Link>
      </div>
      <EditSpaceForm space={space} />
    </main>
  );
}
```

#### `src/app/admin/spaces/[id]/edit-space-form.tsx` (NEW)

(Structurally identical to `create-space-form.tsx`, but uses `editSpaceAction.bind(null, space.id)` and `defaultValue={space.x}` on each input. Add a top-level NOT_FOUND error case.)

#### Updated `src/app/admin/spaces/page.tsx`

(Wrap each `<li>`'s content in `<Link href={...}>` so clicking a row navigates to edit. Remove the per-page guard try/catch — the layout handles it now.)

### Anti-patterns — explicit DO-NOTs

- ❌ Re-running `requireSession` / `requireRole` inside `/admin/*` page components after the layout already runs them. Trust the layout.
- ❌ Extracting a `<SpaceForm>` component "for symmetry." Premature.
- ❌ Skipping `revalidatePath` after update. Stale list bug.
- ❌ Forgetting to bump `updatedAt` in `updateSpace`. Postgres won't do it for you on UPDATE.
- ❌ Calling `auth.api.getSession` from a page or API route. Use `requireSession`.
- ❌ Using `cookies()` directly anywhere in `/admin/*`. The layout's `requireSession` is the only boundary.
- ❌ Adding a "Delete space" button. Not in Doc B §6.4.
- ❌ Hardcoding `'http://localhost:3000/admin/spaces'` anywhere. Use `redirect('/admin/spaces')`.
- ❌ Returning the redirect inside try/catch. Same redirect-after-try-catch rule as US-1.1.

### Project structure notes

- `/admin/[id]` is the first dynamic-segment route in the project. The pattern (`{ params }: { params: Promise<{ id: string }> }`, `await params`) carries forward to:
  - US-2.3 (`/admin/spaces/[id]/desks/...`)
  - US-2.4 (`/admin/desks/[id]/...`)
  - US-3.2 (`/spaces/[id]`)
  - US-3.3+ (`/bookings/[id]/cancel` etc)
- `src/app/admin/layout.tsx` becomes the canonical place to add admin-area cross-cutting concerns (logging, breadcrumbs, etc.) — but those are out of scope for US-2.2.

### Previous story intelligence

- **US-2.1** (`9f79cf1`): `/admin/spaces` list + `/admin/spaces/new` form + `POST /admin/spaces` + `proxy.ts` (Next 16) + admin link in header. **Mid-execution corrections** logged (middleware → proxy rename; raw cookie check; better-auth `nextCookies()` plugin added during browser verification). **All carry-over assumptions still apply.**

### Recent commits

```
9f79cf1 feat: admin create space (US-2.1)
826bf32 feat: logout button and global header (US-1.3)
579071b feat: login page and server action (US-1.2)
b7bd9fa feat: guest registration page and server action (US-1.1)
```

US-2.2 is the fifth `feat:` commit. Title: `feat: admin edit space (US-2.2)`.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-2.2 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.2] — FR-I2 (edit Space fields).
- [Source: docs/02-phase1-prd.md#Section 6.1] — `spaces` table schema.
- [Source: docs/02-phase1-prd.md#Section 6.4] — `PUT /admin/spaces/:id` endpoint.
- [Source: docs/02-phase1-prd.md#Section 7.5/7.6] — submit-button + form validation rules.
- [Source: _bmad-output/implementation-artifacts/2-1-create-space.md] — pattern source; layout-extraction trigger explicitly flagged.
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — three-layer auth.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveat (params is a Promise).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean across all new + modified files |
| `pnpm lint` | Clean |
| `pnpm test` | 61/61 pass + 1 skipped — no new unit tests (createSpaceSchema reused for edit) |
| `pnpm build` | 13 routes (+ `/admin/spaces/[id]` page, `/api/admin/spaces/[id]` PUT) |
| `pnpm test:e2e` | 13/13 pass in 5.3s — added 2 new admin-spaces tests (`/admin/spaces/:id` redirect + `PUT /api/admin/spaces/:id` 401) |

### Completion Notes List

**Story executed end-to-end. Stop bar (admin can edit existing space) achieved structurally.** All 61 unit + 13 E2E tests pass. Browser-interactive verification on BA's plate.

**No mid-execution corrections this time.** US-2.1's lessons (proxy.ts not middleware.ts; raw cookie check; `nextCookies()` plugin) all applied correctly from the start. The story's draft sketches matched 1:1 with what shipped.

**Key implementation observations:**

1. **Layout-extraction landed cleanly.** `src/app/admin/layout.tsx` runs the `requireSession` + `requireRole('SUPER_ADMIN')` guard; per-page guards in `/admin/spaces/page.tsx` and `/new/page.tsx` were replaced with one-line comments pointing at the layout. Net result: ~14 lines deleted, one file added, redirect logic now has a single source of truth. New `/admin/spaces/[id]/page.tsx` inherits the guard automatically.

2. **`.bind(null, space.id)` in the edit form works as advertised.** The bound function has the standard `(prevState, formData)` signature `useActionState` expects. No hidden form fields, no id round-tripping through formData. Type-safe at compile time.

3. **Next.js 16 dynamic-segment params pattern verified.** Both the page (`{ params }: { params: Promise<{ id: string }> }`) and the API route (same shape) use `await params`. Worked first try; this is the canonical pattern for every future `[id]`-shaped route in the project (US-2.3, US-2.4, US-3.2, US-3.5).

4. **Reused `createSpaceSchema` for edit validation.** No rename, no duplication. Same fields, same constraints. The schema describes "valid space form data" — symmetric for create and edit.

5. **Explicit `updatedAt: new Date()` in `updateSpace`.** Postgres' `DEFAULT now()` only fires on INSERT; without the explicit set, edited rows would keep their original `updated_at`. Documented as the canonical pattern for all future `update*` query helpers.

6. **List page rows are now full-row links** to the edit page. Used `<Link>` wrapping `<div>` content (with `block hover:bg-gray-50`) rather than a separate "Edit" button — denser, more affordance per click, no UX cost.

7. **`pg sslmode` warning still appears** during build (US-1.1+ carry-over). Non-blocking; will reassess on `pg` v9 upgrade.

8. **No `<SpaceForm>` extraction.** As planned. The two form components (`create-space-form.tsx` and `edit-space-form.tsx`) duplicate ~70 lines of structure. Documented as known and intentional in the story; revisit only if a third use case lands.

**Browser-interactive verifications still on BA's plate (Task 9):**
- `/admin/spaces` shows space(s); rows clickable.
- Click row → `/admin/spaces/<id>` with form prefilled.
- Edit description → Save → redirect to `/admin/spaces`; new value reflected if displayed.
- Visit `/admin/spaces/<bogus-uuid>` (logged in) → Next 404.
- Log out → visit `/admin/spaces/<id>` → redirect to `/login`.
- DevTools: `PUT /api/admin/spaces/<id>` from no-session → 401; from Guest → 403.

### File List

All paths relative to repo root.

**NEW (5 files):**
- `deskhive/src/app/admin/layout.tsx` — centralized admin guard (refactor extraction)
- `deskhive/src/app/admin/spaces/[id]/page.tsx` — edit page (Server Component)
- `deskhive/src/app/admin/spaces/[id]/edit-space-form.tsx` — edit form (Client Component, prefilled)
- `deskhive/src/app/api/admin/spaces/[id]/route.ts` — `PUT /admin/spaces/:id` REST endpoint
- (no new test file; existing `tests/e2e/admin-spaces.spec.ts` extended)

**UPDATED (5 files):**
- `deskhive/src/db/queries/spaces.ts` — added `getSpaceById` and `updateSpace`
- `deskhive/src/actions/space.ts` — added `editSpaceAction` + `EditSpaceActionState` type
- `deskhive/src/app/admin/spaces/page.tsx` — removed per-page guard (now in layout); rows now full-row links
- `deskhive/src/app/admin/spaces/new/page.tsx` — removed per-page guard (now in layout); page is now a sync function
- `deskhive/tests/e2e/admin-spaces.spec.ts` — added 2 new tests (`/admin/spaces/:id` redirect + `PUT` 401)

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/lib/auth/config.ts` — no Better Auth changes (US-2.1's `nextCookies()` plugin still active)
- `deskhive/src/lib/auth/guards.ts` — already implemented in US-0.2; this story USES it
- `deskhive/src/lib/validation/space.ts` and `space.test.ts` — `createSpaceSchema` reused as-is
- `deskhive/src/proxy.ts` — proxy unchanged from US-2.1
- `deskhive/src/components/header.tsx` — Admin link from US-2.1 unchanged
- `deskhive/src/db/schema.ts` — no schema changes
- All Epic 1 files
- `deskhive/src/app/admin/spaces/new/create-space-form.tsx` — create form unchanged

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | US-2.2 implemented; admin/layout.tsx guard extraction landed; all CI commands green. | `3bd3906` |
