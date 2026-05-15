# Story 2.4: Edit Desk

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **to edit a desk's label, daily price, or active status — inline on the space's edit screen at `/admin/spaces/:id`**,
so that **I can correct mistakes, raise/lower prices over time, and remove a desk from booking without deleting it.**

> Verbatim from Document B §8 (US-2.4). FR-I4 (edit desk label, price, active status).

> **This story closes Epic 2 — Inventory Management.** After it lands, all four `desks`-related operations are wired up: list (US-2.3), create (US-2.3), edit (this story), and "deactivate" (handled as `isActive=false` via this story's edit form).

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-2.4, plus implementation-shaped ACs:

1. **AC-1 (Edit a desk's price — happy path).**
   ```gherkin
   Given a desk "Desk-1" exists with price 2500
   And I am logged in as Super Admin
   When I update its price to 3000
   Then the desk's daily_price_cents = 3000
   And future bookings use the new price
   ```
   **Note on "future bookings use the new price":** Booking creation is US-3.3+. For US-2.4 the verifiable portion is (a) the DB row's `daily_price_cents` is updated, and (b) the inline form re-renders with the new value. The booking-time-of-price snapshot is US-3.3's responsibility.

2. **AC-2 (Deactivate a desk hides it from booking).**
   ```gherkin
   Given a desk "Desk-1" exists with is_active = true
   When I set is_active = false
   Then on the public space detail page, Desk-1 no longer appears as bookable
   ```
   **Note on "public space detail page":** That route is US-3.2. For US-2.4 the verifiable portion is the DB's `is_active = false` after submit, and that the admin's desks list visibly shows the desk as `Inactive`. The "no longer appears as bookable on /spaces/:id" is US-3.2's filter; **US-3.2 must filter on `is_active = true` when rendering bookable desks**, called out forward as a cross-story dependency.

3. **AC-3 (Edit a desk's label).** Same flow as AC-1 — the label field is editable. If the new label collides with an existing label in the same space (other than this desk's own current label), the unique-violation surfaces as `DUPLICATE_LABEL` with the verbatim message `"A desk with that label already exists in this space"` — same string US-2.3 uses for duplicate-on-create.

4. **AC-4 (Inline on the space's edit screen — no new route).** Each desk in the list on `/admin/spaces/:id` becomes its own inline `<form>` with three editable fields (label, price-in-cents, active checkbox) and a "Save" button. **No new admin screen.** Doc B §7.2's closed inventory preserved (the PRD did not list a separate `/admin/desks/[id]` screen).

5. **AC-5 (Validation per Doc B §7.6).**
   - `label`: required, trimmed, non-empty.
   - `dailyPriceCents`: required, integer, `>= 0`.
   - `isActive`: boolean. Empty checkbox in FormData → `false`; checked → `true`. The action parses this from FormData before passing to Zod.
   Inline `text-red-700` field errors per row.

6. **AC-6 (Architecture-shaped error response — Server Action).** Same shape as `createDeskAction`: `idle` | `UNAUTHORIZED` | `FORBIDDEN` | `NOT_FOUND` | `VALIDATION_ERROR` | `DUPLICATE_LABEL` | `INTERNAL_ERROR`. `NOT_FOUND` for stale desk id; `DUPLICATE_LABEL` for the rename-to-existing-label case.

7. **AC-7 (Architecture-shaped error response — REST `PUT /admin/desks/:id`).** Status codes 200 / 400 / 401 / 403 / 404 / 409 / 500. Body shape via the `apiError`/`apiNotFound`/`apiValidationError` helpers.

8. **AC-8 (`updatedAt` set explicitly in updateDesk).** Same Postgres semantics as `updateSpace` (US-2.2): `DEFAULT now()` only fires on INSERT. Explicit `.set({ ...input, updatedAt: new Date() })`.

9. **AC-9 (`revalidatePath` after update).** Server Action calls `revalidatePath('/admin/spaces/${spaceId}')` so the desks list re-renders with the new values. `spaceId` is fetched from the desk row pre-update (since the form only carries the desk id).

10. **AC-10 (Submit-button disable-on-submit).** (Doc B §7.5.) `useFormStatus().pending` → label `Save` / `Saving…`.

11. **AC-11 (Refactor: extract `isPgUniqueViolation` helper).** US-2.3's hotfix established a 2-callsite duplication of the cause-walking matcher. US-2.4 adds 2 more callsites (`editDeskAction` + `PUT /admin/desks/:id`), making 4 total. **The duplication threshold is crossed.** Extract to `src/lib/db-errors.ts` with a small unit-test file. Replace all 4 callsites with imports of the helper. **Pure refactor — no behavior change.** Refactor is bundled with US-2.4 because US-2.4 is what crosses the threshold; doing it as a separate commit beforehand would be churn.

12. **AC-12 (Stop bar — page renders for Super Admin).** As Super Admin, opening `/admin/spaces/:id` for a space with desks shows: edit-space form (prefilled), desks list where each desk is its own inline mini-form (3 fields + Save button), and the existing add-desk form. Editing any desk's price/label/active and submitting updates the DB; the desks list re-renders.

13. **AC-13 (Single commit).** `feat: admin edit desk (US-2.4)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify `pnpm test` and `pnpm test:e2e` from US-2.3 (with the `12bee8b` fix) still pass. Schema unchanged; no new migrations.

- [x] **Task 1 — `editDeskSchema` + tests** — extend `src/lib/validation/desk.ts` and `desk.test.ts`:
  - `editDeskSchema = z.object({ label, dailyPriceCents, isActive: z.boolean() })` — same `label` and `dailyPriceCents` as `createDeskSchema`, plus a boolean `isActive`. Use `createDeskSchema.extend({ isActive: z.boolean() })` to avoid duplication.
  - **Why no `z.coerce.boolean()`:** The action layer pre-converts the FormData value (`'on'` ↔ `true`, missing ↔ `false`) to a real boolean before passing to Zod. `z.coerce.boolean()` would treat *any* truthy value (e.g., the string `'false'`) as `true`, which is the opposite of what we want for FormData semantics.
  - Add ~5 new tests: valid input, isActive=false accepted, isActive non-boolean rejected, empty label rejected (covered by inheriting `createDeskSchema`'s validation), all-empty input shows multiple errors.

- [x] **Task 2 — Extract `isPgUniqueViolation` helper** — `src/lib/db-errors.ts` (NEW):
  - Single export: `isPgUniqueViolation(err: unknown, constraintName?: string, depth = 3): boolean`.
  - Walks `err.cause` recursively up to `depth` levels. Each level checks SQLSTATE `'23505'`, the generic Postgres text `'duplicate key value violates unique constraint'`, and (when `constraintName` is provided) `msg.includes(constraintName)`.
  - JSDoc comment explaining why it walks the cause chain (pointing at Drizzle 0.45's `DrizzleQueryError` wrapping per `12bee8b`'s post-mortem).
  - **Add `src/lib/db-errors.test.ts`** with ~5 tests using mock errors:
    - top-level pg error with `code: '23505'` matches
    - top-level error with no code/message but `cause` matches at depth 1
    - depth-2 cause matches (defense)
    - constraint-name match works when code/message don't
    - non-violation errors return false
  - Update existing callers (`src/actions/desk.ts:createDeskAction` and `src/app/api/admin/spaces/[id]/desks/route.ts`) to import and call the helper. **Remove the inline `matchUniqueViolation` functions** from both files. Pure refactor — same behavior, smaller surface.

- [x] **Task 3 — Desks query helpers (extend)** — `src/db/queries/desks.ts`:
  - `getDeskById(id: string): Promise<Desk | undefined>`: select-where-id pattern (mirror `getSpaceById`).
  - `updateDesk(id: string, input: EditDeskInput): Promise<Desk | undefined>`: `db.update(desksTable).set({ label, dailyPriceCents, isActive, updatedAt: new Date() }).where(eq(desksTable.id, id)).returning()` → first row or undefined.
  - **Do NOT swallow** unique-violation errors here — bubble to the action layer.

- [x] **Task 4 — Edit Desk Server Action** — extend `src/actions/desk.ts` with `editDeskAction(deskId, prevState, formData)`:
  - `deskId` curried via `.bind(null, desk.id)` at the form level.
  - Auth: same `requireSession` + `requireRole('SUPER_ADMIN')` pattern (catches AuthError and returns the right state). Layout-level guard already covers the page render; this re-checks at the action boundary.
  - **Pre-existence check:** `getDeskById(deskId)`. If undefined → `NOT_FOUND`. **Capture `deskRow.spaceId` here** — needed for the `revalidatePath` call after update (the form doesn't submit `spaceId`).
  - Parse FormData with explicit `isActive` conversion: `formData.get('isActive') === 'on'` (HTML checkboxes submit `'on'` when checked, nothing when unchecked).
  - Validate via `editDeskSchema`.
  - Try `updateDesk(deskId, parsed.data)`. On unique-violation → `DUPLICATE_LABEL` (use the new helper from Task 2).
  - On success: `revalidatePath(\`/admin/spaces/${deskRow.spaceId}\`)` and return `{ status: 'idle' }` (no redirect — user stays on the page).

- [x] **Task 5 — `PUT /admin/desks/:id` REST endpoint** — `src/app/api/admin/desks/[id]/route.ts` (NEW):
  - Same auth/validation/duplicate-detection contract as the Server Action.
  - JSON body: `{ label, dailyPriceCents, isActive }`. `isActive` arrives as a real boolean (REST clients send JSON, not multipart). No FormData conversion needed in this code path.
  - 200 / 400 / 401 / 403 / 404 / 409 / 500. 409 uses the same verbatim message: `"A desk with that label already exists in this space"`.

- [x] **Task 6 — Inline edit-desk form component** — `src/app/admin/spaces/[id]/edit-desk-form.tsx` (NEW Client Component):
  - Props: `{ desk: Desk }`.
  - `useActionState(editDeskAction.bind(null, desk.id), { status: 'idle' })`.
  - Three labeled inputs in a flex row (label as `text`, dailyPriceCents as `number`, isActive as `checkbox`) plus a "Save" button on the right.
  - `defaultValue` on label/price (prefilled from `desk.label` and `desk.dailyPriceCents`); `defaultChecked={desk.isActive}` on the checkbox.
  - Inline per-field `text-red-700` errors below each input. Top-level error rendering for `DUPLICATE_LABEL`/`NOT_FOUND`/`INTERNAL_ERROR` cases — same `topLevelError` selector pattern as `add-desk-form`.
  - **`form` element gets `noValidate`** like every other form in the project.
  - The form is visually busy by design — Phase 1 minimalism, Designer reskins later.

- [x] **Task 7 — Update edit page to render inline edit forms** — modify `src/app/admin/spaces/[id]/page.tsx`:
  - Replace the read-only `<li>` rows in the desks list with `<EditDeskForm desk={d} />` instances.
  - The `<DataView>` empty state ("No desks in this space yet.") and the add-desk form below remain unchanged.

- [x] **Task 8 — E2E tests** — extend `tests/e2e/admin-spaces.spec.ts`:
  - `unauthenticated PUT /api/admin/desks/:id returns 401` — `request.put('/api/admin/desks/<bogus-id>', { data: {...} })`, expect 401.
  - **Authenticated happy-path E2E (login → edit price → verify update; deactivate → verify is_active=false) DEFERRED** to the future story that adds Postgres to CI's E2E job.

- [x] **Task 9 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 69 prior + ~5 new editDeskSchema tests + ~5 new db-errors tests = ~79 passing + 1 skipped
  - `pnpm build` — successful, +1 route (`/api/admin/desks/[id]`)
  - `pnpm test:e2e` — at least 15 tests pass (existing 14 + 1 new desk-edit-401)

- [ ] **Task 10 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - Log in as Super Admin → click a space with desks → page shows each desk as an inline form (label + price + active checkbox + Save).
  - Edit `Desk-1`'s price from `2500` to `3000` → Save → list re-renders with `$30.00`.
  - Edit `Desk-1`'s label to `Desk-2` (a label already taken in the same space) → inline error: `"A desk with that label already exists in this space"`.
  - Edit `Desk-1`'s label to itself (no change) → Save → no error; list re-renders identically.
  - Uncheck `Desk-1`'s Active checkbox → Save → row re-renders with `Inactive`.
  - Re-check Active → Save → re-renders with `Active`.
  - Negative price (`-100`) → inline validation error.
  - Empty label → inline validation error.
  - DevTools: `PUT /api/admin/desks/<id>` from no-session → 401; from Guest → 403; from Super Admin with bogus id → 404; with conflicting label → 409 + verbatim message; with valid edit → 200 + updated row.

- [x] **Task 11 — Single commit (AC-13)** — `feat: admin edit desk (US-2.4)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **fourth and final story of Epic 2**. After it lands:
- All four desks operations exist (list, create, edit, deactivate-via-edit).
- Epic 2 is fully closed; ready for retrospective.
- The `isPgUniqueViolation` helper exists for future Epic 3 use (booking double-booking constraint).

Feature scope (US-2.4 only):
- ✅ Inline edit form per desk on `/admin/spaces/:id`
- ✅ `editDeskAction` Server Action
- ✅ `PUT /admin/desks/:id` REST endpoint
- ✅ Deactivation handled as `isActive=false` via the same form
- ✅ Refactor: extract `isPgUniqueViolation` helper (4-callsite consolidation)

Out of scope for US-2.4 (do NOT build):
- ❌ A separate `/admin/desks/[id]` page — Doc B §7.2 closes the screen list.
- ❌ A "delete desk" button — not in Doc B §6.4 (no DELETE endpoint).
- ❌ Bulk operations / multi-select — Phase 2.
- ❌ Reordering desks (drag-and-drop) — Phase 2.
- ❌ Per-desk image upload — Phase 2.
- ❌ Variable pricing or schedule-based pricing — Phase 2.
- ❌ Audit log of who-edited-what — Phase 2.
- ❌ Optimistic-locking (concurrent-edit detection) — Phase 1 has one Super Admin.
- ❌ Public-facing desk visibility filter at `/spaces/:id` — that's US-3.2's job, but **US-3.2 must filter on `is_active = true`** (cross-story dependency surfaced in AC-2 Note).
- ❌ Modifying `editDeskSchema` to also handle moving desks across spaces — `space_id` is immutable in Phase 1.

### Key decisions

1. **Each desk row IS its own form.** Always-editable, no view-mode/edit-mode toggle. Phase 1 admin-only UX; visually busy but functional. Designer reskins later. The alternative (click-to-edit with client-side state) would add a `useState` toggle per row and complicate the keyboard/focus handling for marginal UX gain.

2. **`isActive` parsed from FormData explicitly, not via `z.coerce.boolean()`.** HTML checkboxes submit `'on'` when checked, nothing when unchecked. `z.coerce.boolean()` would treat the string `'false'` as `true` — incorrect for our case. The action layer does `formData.get('isActive') === 'on'` and passes a real boolean to Zod, which validates with plain `z.boolean()`.

3. **`spaceId` for revalidation comes from `getDeskById` pre-update.** The form only carries the desk id; the server action looks up the desk to get its `spaceId`, then uses it for `revalidatePath`. Same row is re-fetched for the pre-existence check, so no extra DB roundtrip.

4. **DUPLICATE_LABEL works on edit too.** Renaming Desk-1 to "Desk-2" when "Desk-2" already exists in the same space fires the `uniq_desk_label_per_space` constraint. Same matcher catches it; same verbatim PRD message. Renaming a desk to its OWN current label is a no-op at the SQL layer (UPDATE on a row that already has that value doesn't violate uniqueness — it's the same row).

5. **Refactor extraction in this story (not separate).** The user's ack on US-2.3's fix-commit (`12bee8b`) noted: "If a third unique constraint case lands, worth extracting then." US-2.4 lands two more callsites; extracting now is the right move and cheaper than three separate hotfixes.

6. **No `<DeskForm>` extraction shared with the create form.** Same reasoning as US-2.2's "no `<SpaceForm>` extraction" — the duplication is bounded (create-desk vs edit-desk; ~70 lines each). Re-evaluate when a third use lands.

7. **No `(admin)/desks` route group.** All `/admin/desks/[id]` REST endpoints sit at the top level under `src/app/api/admin/desks/[id]/route.ts`. Pattern parallel to `/admin/spaces/[id]/route.ts`.

### Architecture compliance

- Validation: Zod, server-authoritative.
- Form pattern: native `<form action={...}>` + `useActionState` + `useFormStatus`.
- State management: none beyond local form state.
- Component library: none. Raw Tailwind.
- Authorization: layout-level guard (US-2.2) + per-action `requireSession`+`requireRole` re-check.
- Error response shape: `{ status: 'error', code, message?, fields? }`.
- Status codes: 200 / 400 / 401 / 403 / 404 / 409 / 500.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/lib/db-errors.ts` (NEW)

```ts
/**
 * Detects Postgres unique-constraint violations across driver wrappers.
 *
 * Drizzle 0.45+ wraps pg errors in `DrizzleQueryError`, hiding the SQLSTATE
 * and the original message on `err.cause`. This helper walks the `cause` chain
 * up to `depth` levels and matches at each level via three patterns:
 *   1. SQLSTATE 23505 (the canonical pg unique-violation code)
 *   2. The generic Postgres text "duplicate key value violates unique constraint"
 *   3. The optional `constraintName` substring (caller-specific defense-in-depth)
 *
 * @param err - The thrown error to inspect
 * @param constraintName - Optional constraint name to match against the message
 * @param depth - Recursion depth limit (default 3, prevents infinite loops on circular causes)
 *
 * @example
 *   try { await createDesk(...) } catch (err) {
 *     if (isPgUniqueViolation(err, 'uniq_desk_label_per_space')) {
 *       return { status: 'error', code: 'DUPLICATE_LABEL', ... };
 *     }
 *     throw err;
 *   }
 */
export function isPgUniqueViolation(
  err: unknown,
  constraintName?: string,
  depth = 3,
): boolean {
  if (depth === 0 || !err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const msg = (err as { message?: string }).message ?? '';
  if (code === '23505') return true;
  if (msg.includes('duplicate key value violates unique constraint')) return true;
  if (constraintName && msg.includes(constraintName)) return true;
  return isPgUniqueViolation(
    (err as { cause?: unknown }).cause,
    constraintName,
    depth - 1,
  );
}
```

#### `src/lib/validation/desk.ts` (extension)

```ts
// existing createDeskSchema unchanged

export const editDeskSchema = createDeskSchema.extend({
  isActive: z.boolean(),
});

export type EditDeskInput = z.infer<typeof editDeskSchema>;
```

#### `src/db/queries/desks.ts` (extension)

```ts
// existing imports + listDesksForSpace + createDesk unchanged

import type { EditDeskInput } from '@/lib/validation/desk';

export async function getDeskById(id: string): Promise<Desk | undefined> {
  const [row] = await db
    .select()
    .from(desksTable)
    .where(eq(desksTable.id, id))
    .limit(1);
  return row;
}

export async function updateDesk(
  id: string,
  input: EditDeskInput,
): Promise<Desk | undefined> {
  const [row] = await db
    .update(desksTable)
    .set({
      label: input.label,
      dailyPriceCents: input.dailyPriceCents,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(desksTable.id, id))
    .returning();
  return row;
}
```

#### `src/actions/desk.ts` (extension — replaces inline matcher)

```ts
// Replace the inline matchUniqueViolation function with an import:
import { isPgUniqueViolation } from '@/lib/db-errors';
// In createDeskAction's catch block, replace:
//   if (isUniqueViolation) { ... }
// with:
//   if (isPgUniqueViolation(err, 'uniq_desk_label_per_space')) { ... }

// Then add editDeskAction below createDeskAction:

export type EditDeskActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'DUPLICATE_LABEL'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function editDeskAction(
  deskId: string,
  _prevState: EditDeskActionState,
  formData: FormData,
): Promise<EditDeskActionState> {
  // (auth try/catch — identical pattern to createDeskAction)

  const desk = await getDeskById(deskId);
  if (!desk) return { status: 'error', code: 'NOT_FOUND', message: 'Desk not found.' };

  const parsed = editDeskSchema.safeParse({
    label: formData.get('label'),
    dailyPriceCents: formData.get('dailyPriceCents'),
    isActive: formData.get('isActive') === 'on',
  });
  if (!parsed.success) { /* same field-mapping pattern */ }

  let result: EditDeskActionState | null = null;
  try {
    await updateDesk(deskId, parsed.data);
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_desk_label_per_space')) {
      result = {
        status: 'error',
        code: 'DUPLICATE_LABEL',
        message: 'A desk with that label already exists in this space',
      };
    } else {
      logger.error('edit_desk_action_db_failed', { error: String(err) });
      result = { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
    }
  }

  if (result) return result;
  revalidatePath(`/admin/spaces/${desk.spaceId}`);
  return { status: 'idle' };
}
```

#### `src/app/api/admin/desks/[id]/route.ts` (NEW)

(Mirror the action's contract. JSON body, status codes 200/400/401/403/404/409/500. Use `isPgUniqueViolation` for the 409 path.)

#### `src/app/admin/spaces/[id]/edit-desk-form.tsx` (NEW Client Component)

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { editDeskAction, type EditDeskActionState } from '@/actions/desk';
import type { Desk } from '@/db/schema';

const initialState: EditDeskActionState = { status: 'idle' };

export function EditDeskForm({ desk }: { desk: Desk }) {
  const [state, formAction] = useActionState(
    editDeskAction.bind(null, desk.id),
    initialState,
  );

  // (fieldError + topLevelError selectors mirror add-desk-form)

  return (
    <form action={formAction} className="border-b border-gray-200 py-3" noValidate>
      <div className="flex items-center gap-3 text-sm">
        <input
          name="label"
          type="text"
          defaultValue={desk.label}
          required
          className="flex-1 rounded border border-gray-300 px-2 py-1"
        />
        <input
          name="dailyPriceCents"
          type="number"
          step="1"
          min="0"
          defaultValue={desk.dailyPriceCents}
          required
          className="w-32 rounded border border-gray-300 px-2 py-1"
        />
        <label className="flex items-center gap-1">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={desk.isActive}
          />
          Active
        </label>
        <SubmitButton />
      </div>
      {/* per-field errors below the row */}
      {/* top-level error below */}
    </form>
  );
}
```

#### `src/app/admin/spaces/[id]/page.tsx` (modification)

Replace the read-only `<li>` rendering in the desks list with `<EditDeskForm desk={d} />`. The `<DataView>` wrapper and the empty-state message stay the same.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── actions/
│   │   ├── auth.ts
│   │   ├── space.ts
│   │   └── desk.ts                          # UPDATED — add editDeskAction; replace inline matcher
│   ├── app/
│   │   ├── admin/
│   │   │   └── spaces/
│   │   │       └── [id]/
│   │   │           ├── page.tsx             # UPDATED — desks list now renders EditDeskForm per row
│   │   │           ├── edit-space-form.tsx  # (unchanged)
│   │   │           ├── add-desk-form.tsx    # (unchanged)
│   │   │           └── edit-desk-form.tsx   # NEW (US-2.4)
│   │   └── api/
│   │       └── admin/
│   │           ├── desks/                   # NEW directory (US-2.4)
│   │           │   └── [id]/
│   │           │       └── route.ts         # NEW — PUT
│   │           └── spaces/
│   │               └── [id]/
│   │                   └── desks/
│   │                       └── route.ts     # UPDATED — replace inline matcher
│   ├── db/
│   │   └── queries/
│   │       └── desks.ts                     # UPDATED — add getDeskById + updateDesk
│   └── lib/
│       ├── db-errors.ts                     # NEW (US-2.4 — refactor extraction)
│       ├── db-errors.test.ts                # NEW (US-2.4)
│       └── validation/
│           ├── desk.ts                      # UPDATED — add editDeskSchema
│           └── desk.test.ts                 # UPDATED — tests for editDeskSchema
└── tests/
    └── e2e/
        └── admin-spaces.spec.ts             # UPDATED — add 1 test for /api/admin/desks/:id 401
```

Files NOT touched:
- `deskhive/src/db/schema.ts` — `desks` table + unique index already in place from US-0.2.
- `deskhive/src/lib/auth/config.ts`, `guards.ts` — unchanged.
- `deskhive/src/proxy.ts` — `/api/admin/desks/:id` covered by `/api/admin/:path*` matcher.
- `deskhive/src/app/admin/layout.tsx` — guard already in place.
- All Epic 1 files.
- `deskhive/src/app/admin/spaces/page.tsx`, `new/page.tsx`, `[id]/edit-space-form.tsx`, `[id]/add-desk-form.tsx`.
- `deskhive/src/app/api/admin/spaces/route.ts`, `[id]/route.ts`.
- `deskhive/src/db/queries/spaces.ts`.
- `deskhive/src/lib/validation/space.ts`, `space.test.ts`, `auth.ts`, `auth.test.ts`.

### Anti-patterns — explicit DO-NOTs

- ❌ Adding a separate `/admin/desks/[id]` page. Inline edit on the space's edit screen only.
- ❌ Using `z.coerce.boolean()` for `isActive`. The action pre-converts FormData explicitly.
- ❌ Letting unique-violation errors fall through to INTERNAL_ERROR. Use `isPgUniqueViolation` and map to DUPLICATE_LABEL with the verbatim PRD message.
- ❌ Paraphrasing the duplicate-label error string. AC-3 specifies it verbatim, same as US-2.3 AC-2.
- ❌ Re-running `requireSession` inside the page Server Component. Layout already does it.
- ❌ Hardcoding `'/admin/spaces/<spaceId>'` in `revalidatePath`. Use the desk's actual `spaceId` from the pre-existence check.
- ❌ Letting the `revalidatePath` call live inside `try`/`catch`. Same redirect-after-try-catch rule.
- ❌ Adding a "Delete desk" button. Not in Doc B §6.4.
- ❌ Adding a "Move desk to another space" feature. Not in Doc B §6.4 either.
- ❌ Optimistic-locking version columns or `If-Match` headers. Phase 2.
- ❌ Re-fetching the desks list client-side after edit. Server Component + `revalidatePath` is the canonical pattern.
- ❌ Skipping the refactor extraction (Task 2). Four inline copies of the same matcher would land if the extraction is deferred.

### Project structure notes

- `src/lib/db-errors.ts` is the first cross-cutting "DB error introspection" file. Future stories that need similar matchers (e.g., FK violation detection in cancel-booking) can extend it.
- `src/app/api/admin/desks/[id]/route.ts` is the second top-level admin-resource REST endpoint (after `spaces/[id]/route.ts`). Pattern: `PUT` for edits, no `DELETE` in Phase 1.
- `editDeskSchema = createDeskSchema.extend(...)` is the project's first use of Zod's `.extend()` schema composition. Future stories with create/edit pairs (e.g., bookings) may use the same pattern, OR keep the schemas independent if they diverge.

### Previous story intelligence

- **US-2.1** (`9f79cf1`): admin spaces list/new + middleware-as-proxy + admin link in header.
- **US-2.2** (`3bd3906`): admin space edit + admin layout extraction + first dynamic-segment route.
- **US-2.3** (`4ea877b`): inline desks add + first nested REST route.
- **`12bee8b` (US-2.3 fix follow-up):** the `matchUniqueViolation` matcher walks `err.cause` to handle Drizzle 0.45's `DrizzleQueryError` wrapping. **This story extracts that helper to `src/lib/db-errors.ts` and consolidates 2 → 0 inline copies.**
- **`1864bde` (US-1.3 follow-up):** `nextCookies()` plugin registered in Better Auth config so `signIn`/`signUp`/`signOut` set browser cookies.

**Patterns established (replicate, don't deviate):**
- Layout-level guard for `/admin/*`. Pages don't re-call `requireSession`.
- `.bind(null, resourceId)` for resource-scoped Server Actions.
- Multi-pattern + cause-walking matchers for DB errors.
- Verbatim PRD error messages (no paraphrasing).
- Server Action returns `{ status: 'idle' }` on success (no redirect) when staying on the same page.
- Explicit `updatedAt: new Date()` in every UPDATE.
- One feature story → one `feat:` commit titled `feat: <thing> (US-x.y)`.

### Recent commits

```
12bee8b fix: surface verbatim duplicate-label error in add-desk form (US-2.3 follow-up)
4ea877b feat: admin add desk to space (US-2.3)
3bd3906 feat: admin edit space (US-2.2)
9f79cf1 feat: admin create space (US-2.1)
1864bde fix: register nextCookies plugin so signIn/signOut actually set cookies (US-1.3 follow-up)
```

US-2.4 is the seventh `feat:` commit. After it, **Epic 2 is closed** — all four inventory operations live, retrospective optional.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-2.4 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.2] — FR-I4.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `desks` table schema (`is_active` column, unique constraint).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `PUT /admin/desks/:id` endpoint.
- [Source: docs/02-phase1-prd.md#Section 7.5/7.6] — submit-button + form validation rules.
- [Source: _bmad-output/implementation-artifacts/2-3-add-desk-to-space.md] — the create-desk pattern this story mirrors and extends.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveat (params is a Promise).
- [Source: deskhive/node_modules/drizzle-orm/errors.js] — `DrizzleQueryError` wrapping behavior; rationale for `err.cause` walking.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean across all new + modified files |
| `pnpm lint` | Clean |
| `pnpm test` | 81/81 pass + 1 skipped — added 7 db-errors helper tests + 5 new editDeskSchema tests |
| `pnpm build` | 15 routes (added `/api/admin/desks/[id]` PUT); proxy still attached |
| `pnpm test:e2e` | 15/15 pass in 9.9s — added 1 new `PUT /api/admin/desks/:id` 401 test |

### Completion Notes List

**Story executed end-to-end. Stop bar (Super Admin can edit/deactivate desks inline) achieved structurally.** All 81 unit + 15 E2E tests pass. Browser-interactive verification on BA's plate.

**No mid-execution corrections.** The patterns from US-2.3's hotfix and US-2.2's dynamic-segment template all carried over cleanly.

**Refactor extraction landed cleanly (Task 2).** `isPgUniqueViolation` extracted to `src/lib/db-errors.ts` with 7 unit tests covering: top-level SQLSTATE match, top-level message match, depth-1 cause match, depth-2 cause match, constraint-name fallback, non-violation rejection, and circular-cause termination. Both prior call sites (`createDeskAction` + `POST /api/admin/spaces/[id]/desks`) now import the helper instead of carrying inline duplicates. Net result: 4 inline matchers → 0 (4 callers, 1 source of truth).

**Key implementation observations:**

1. **`editDeskSchema = createDeskSchema.extend({ isActive: z.boolean() })`** — first use of Zod `.extend()` in the project. Type inference works correctly; `EditDeskInput.isActive` is `boolean`.

2. **`formData.get('isActive') === 'on'` conversion in the action.** HTML checkboxes only submit `'on'` when checked; FormData.get returns `null` when unchecked. Comparing to `'on'` produces a clean boolean. `z.coerce.boolean()` would have treated the literal string `'false'` as truthy (because non-empty strings coerce to `true`) — exactly the wrong semantic. Tested explicitly with the `'false'` string in the unit suite.

3. **`spaceId` for `revalidatePath` from the desk row.** `editDeskAction` does the pre-existence check via `getDeskById(deskId)` (also defends against stale ids), then uses `desk.spaceId` for the revalidation path. Form only submits the desk id; no extra DB roundtrip beyond what the existence check already does.

4. **Same `DUPLICATE_LABEL` matcher for edit.** Renaming a desk to a label already used in the same space hits the `uniq_desk_label_per_space` constraint. The new helper catches it; the user-facing message is the verbatim PRD string from US-2.3 AC-2 (`"A desk with that label already exists in this space"`, no period). Renaming to itself is a no-op at SQL — the same row's existing values don't violate uniqueness.

5. **Inline always-editable form per row** as planned. Visually busy with 3 inputs + checkbox + button on each row, but functional. Designer reskins later. Per-field errors render below each row when triggered; top-level errors (DUPLICATE_LABEL/NOT_FOUND/INTERNAL_ERROR) render in a separate paragraph below.

6. **REST endpoint `PUT /admin/desks/:id`** at the top level (parallel to `/admin/spaces/:id/route.ts`), NOT nested under `/admin/spaces/[id]/desks/:id` per Doc B §6.4 wording. Body arrives as JSON with `isActive` already a real boolean — no FormData conversion in this code path.

7. **Page change is a small swap.** The desks list inside `<DataView>` now maps to `<EditDeskForm desk={d} />` instead of read-only `<li>` rows. Empty state and add-desk form below remain identical.

**Browser-interactive verifications still on BA's plate (Task 10):**
- Edit `Desk-1` price 2500 → 3000 → list re-renders with $30.00.
- Rename `Desk-1` to a label already taken → verbatim duplicate-label error.
- Rename `Desk-1` to itself (no-op) → save succeeds, no error.
- Uncheck Active → re-check Active → list reflects each transition.
- Negative price / empty label → inline validation errors.
- DevTools 401 / 403 / 404 / 409 / 200 across the full PUT matrix.

**Epic 2 status:** Structurally complete. All 4 inventory stories at `review`. Retrospective optional.

### File List

All paths relative to repo root.

**NEW (4 files):**
- `deskhive/src/lib/db-errors.ts` — `isPgUniqueViolation` helper (extracted from US-2.3 hotfix's inline copies)
- `deskhive/src/lib/db-errors.test.ts` — 7 helper tests (top-level/cause-walk/circular)
- `deskhive/src/app/admin/spaces/[id]/edit-desk-form.tsx` — Client Component, inline always-editable form
- `deskhive/src/app/api/admin/desks/[id]/route.ts` — `PUT /admin/desks/:id` REST endpoint

**UPDATED (6 files):**
- `deskhive/src/lib/validation/desk.ts` — added `editDeskSchema = createDeskSchema.extend({ isActive: z.boolean() })`
- `deskhive/src/lib/validation/desk.test.ts` — added 5 `editDeskSchema` tests
- `deskhive/src/db/queries/desks.ts` — added `getDeskById` and `updateDesk`
- `deskhive/src/actions/desk.ts` — added `editDeskAction` + `EditDeskActionState` type; replaced inline `matchUniqueViolation` with `isPgUniqueViolation` import
- `deskhive/src/app/api/admin/spaces/[id]/desks/route.ts` — replaced inline matcher with `isPgUniqueViolation` import (refactor)
- `deskhive/src/app/admin/spaces/[id]/page.tsx` — desks list now renders `<EditDeskForm>` per row instead of read-only `<li>`
- `deskhive/tests/e2e/admin-spaces.spec.ts` — added 1 new test (`PUT /api/admin/desks/:id` 401)

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/db/schema.ts` — `desks` + unique index unchanged
- `deskhive/src/lib/auth/config.ts`, `guards.ts` — unchanged
- `deskhive/src/proxy.ts` — `/api/admin/desks/:id` covered by existing matcher
- `deskhive/src/app/admin/layout.tsx` — guard already in place
- `deskhive/src/app/admin/spaces/[id]/edit-space-form.tsx`, `add-desk-form.tsx` — unchanged
- `deskhive/src/db/queries/spaces.ts`, `src/actions/space.ts` — unchanged
- `deskhive/src/lib/validation/space.ts`, `space.test.ts`, `auth.ts`, `auth.test.ts` — unchanged
- All Epic 1 files

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | US-2.4 implemented; bundled refactor extracted `isPgUniqueViolation` to `src/lib/db-errors.ts` (4 callers → 1 source of truth); all CI commands green. | `571e8a0` |
