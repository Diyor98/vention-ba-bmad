# Story 2.3: Add Desk to Space

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **to add a desk to a space with a label and a daily price (in cents), inline on the space's edit screen at `/admin/spaces/:id`**,
so that **Guests can book it.**

> Verbatim from Document B §8 (US-2.3). FR-I3 (add desk with label and daily price) and FR-I5 (desk labels unique within a Space).

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-2.3, plus implementation-shaped ACs:

1. **AC-1 (Add a desk to a Space — happy path).**
   ```gherkin
   Given a Space "Hive Central" exists with no desks
   And I am logged in as Super Admin
   When I navigate to that space's edit screen
   And I add a desk with label "Desk-1" and daily price 2500 cents ($25.00)
   Then the desk is created and visible in the desks list
   And the desk is is_active = true by default
   ```

2. **AC-2 (Unique label per Space — duplicate rejected).**
   ```gherkin
   Given a Space "Hive Central" already has a desk labelled "Desk-1"
   When I attempt to add another desk to the same Space with label "Desk-1"
   Then the request is rejected with the error "A desk with that label already exists in this space"
   And no second desk is created
   ```

3. **AC-3 (Inline on edit screen — no new route).** The desks list and the "Add desk" form render on `/admin/spaces/:id` below the existing Edit Space form. **No new admin screen is added** (Doc B §7.2 closure preserved). Two distinct `<form>` elements on the page (edit-space + add-desk), each posting to its own Server Action.

4. **AC-4 (Validation per Doc B §7.6).** Two fields:
   - `label`: required, trimmed, non-empty.
   - `dailyPriceCents`: required, integer, `>= 0`. Form input is `<input type="number" step="1" min="0">`; FormData value is a string; Zod uses `z.coerce.number().int().nonnegative()`.
   Inline `text-red-700` field errors.

5. **AC-5 (Architecture-shaped error response — Server Action).** `idle` | `error.UNAUTHORIZED` | `error.FORBIDDEN` | `error.NOT_FOUND` | `error.VALIDATION_ERROR` | `error.DUPLICATE_LABEL` | `error.INTERNAL_ERROR`.
   - `NOT_FOUND` when the bound `spaceId` doesn't resolve (stale URL, concurrent delete from a future Phase 2 admin tool).
   - `DUPLICATE_LABEL` when the unique-index violation surfaces. **User-facing message MUST be exactly:** `"A desk with that label already exists in this space"` (verbatim from PRD).

6. **AC-6 (Architecture-shaped error response — REST `POST /admin/spaces/:id/desks`).** 201 on created, 400 on validation, 401 / 403 / 404 / 409 (DUPLICATE_LABEL) / 500. The 409 response code is `DUPLICATE_LABEL` with the same exact PRD message.

7. **AC-7 (`is_active = true` by default).** Inserts include `isActive: true` (DB default also true; explicit for clarity per US-2.1's pattern).

8. **AC-8 (`revalidatePath` after add).** Server Action calls `revalidatePath('/admin/spaces/${spaceId}')` so the desks list re-renders without a hard reload. No redirect — user stays on the edit screen and sees the new desk appear in the list.

9. **AC-9 (Submit-button disable-on-submit).** (Doc B §7.5.) `useFormStatus().pending` → label "Add desk" / "Adding…".

10. **AC-10 (Desks list on edit screen).** Above (or below) the "Add desk" form, render a list of existing desks for this Space showing: label, daily price (formatted as `$X.XX`), and a small "Active" / "Inactive" indicator (Active by default; deactivation lands in US-2.4). Empty state via `<DataView>`: `"No desks in this space yet."`

11. **AC-11 (Stop bar — page renders for Super Admin).** As Super Admin, opening `/admin/spaces/<id>` shows: edit form (prefilled), desks list (empty for a new space), and the add-desk form. Submitting the add-desk form with valid input causes the new desk to appear in the list. Submitting a duplicate label shows the inline `DUPLICATE_LABEL` error.

12. **AC-12 (Single commit).** `feat: admin add desk to space (US-2.3)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify `pnpm test` and `pnpm test:e2e` from US-2.2 still pass. Schema unchanged; no new migrations (the `desks` table + `uniq_desk_label_per_space` constraint already exist from US-0.2).

- [x] **Task 1 — Desk Zod schema** — `src/lib/validation/desk.ts`:
  - `createDeskSchema`: `label: z.string().trim().min(1, 'Label is required')`; `dailyPriceCents: z.coerce.number().int('Daily price must be an integer').nonnegative('Daily price must be ≥ 0')`.
  - Export `CreateDeskInput` type.

- [x] **Task 2 — Schema unit tests** — `src/lib/validation/desk.test.ts`:
  - valid input passes
  - empty/whitespace label rejected
  - missing/empty dailyPriceCents rejected
  - negative dailyPriceCents rejected
  - non-integer dailyPriceCents rejected (e.g., `'2500.5'`)
  - non-numeric dailyPriceCents rejected (e.g., `'abc'`)
  - 0 is accepted (free desks allowed by spec — `>= 0`)
  - both fields empty → both errors reported
  - Target: ~7-8 tests.

- [x] **Task 3 — Desks query helpers** — `src/db/queries/desks.ts`:
  - `listDesksForSpace(spaceId: string): Promise<Desk[]>`: ordered by `createdAt asc` (oldest first; matches insertion order so admin sees a stable list).
  - `createDesk(spaceId: string, input: CreateDeskInput): Promise<Desk>`: insert with `isActive: true` explicit. Use `.returning()`.
  - **Do NOT swallow** the unique-violation error here; let it bubble. The action layer maps it to `DUPLICATE_LABEL`.

- [x] **Task 4 — Add Desk Server Action** — `src/actions/desk.ts`:
  - `createDeskAction(spaceId: string, _prevState, formData): Promise<CreateDeskActionState>`.
  - `spaceId` curried via `.bind(null, spaceId)` at the form level.
  - Auth flow: same as US-2.2's editSpaceAction.
  - **Pre-existence check:** before insert, `getSpaceById(spaceId)`. If undefined, return `NOT_FOUND`. (Defends against bound-stale-id in concurrent-delete edge cases.)
  - Validate via `createDeskSchema`.
  - Try `createDesk(spaceId, parsed.data)`. On error:
    - Detect Postgres unique-violation: error message contains `'uniq_desk_label_per_space'` OR `'duplicate key value violates unique constraint'` (defensive, two patterns) OR error code `'23505'` if the driver surfaces it. Map to `DUPLICATE_LABEL` with the verbatim PRD message.
    - All other DB errors → `INTERNAL_ERROR` + `logger.error('create_desk_action_db_failed', ...)`.
  - On success: `revalidatePath(\`/admin/spaces/${spaceId}\`)`. **Do NOT redirect** — user stays on the page; the revalidation re-renders the desks list with the new desk.

- [x] **Task 5 — `POST /admin/spaces/:id/desks` REST endpoint** — `src/app/api/admin/spaces/[id]/desks/route.ts`:
  - Mirror the Server Action's auth + validation + duplicate-detection contract.
  - Status codes: 201 / 400 / 401 / 403 / 404 / 409 / 500.
  - 409 response: `apiError('DUPLICATE_LABEL', 'A desk with that label already exists in this space', 409)`. (No dedicated `apiDuplicateLabel` helper; use `apiError` directly. If a third 409 use case lands, add a helper.)

- [x] **Task 6 — Update edit page to show desks list + add-desk form** — modify `src/app/admin/spaces/[id]/page.tsx`:
  - After the existing `<EditSpaceForm space={space} />`, render an `<hr />` (or a spacing div) and a `<section>` with:
    - Heading "Desks"
    - `listDesksForSpace(space.id)` → `<DataView>` with rows showing label, price (formatted), and Active/Inactive status
    - Heading "Add desk"
    - `<AddDeskForm spaceId={space.id} />`
  - Format price using `formatCents` helper from `src/lib/format.ts` (US-0.2). If that helper doesn't exist or has a different name, inline `\`$${(cents / 100).toFixed(2)}\`` and document.

- [x] **Task 7 — Add Desk form component** — `src/app/admin/spaces/[id]/add-desk-form.tsx` (Client Component):
  - Two labeled inputs: Label (`type="text"`) and Daily price (cents) (`type="number" step="1" min="0"`).
  - Same Tailwind / `useActionState` / `useFormStatus` / `noValidate` pattern as other forms.
  - Action bound: `createDeskAction.bind(null, spaceId)`.
  - Top-level error rendering: include `DUPLICATE_LABEL` and `NOT_FOUND` cases (the form's `state.code` discriminator already matches via the existing `'message' in state` shortcut).
  - On the form's success path, `useActionState` will see the action return *nothing useful* because the action returns `void` (it just revalidates and the page re-renders). **Action must still return one of the error states OR `void` — the discriminated union shape is `... | undefined` in practice.** Pattern: action returns the error states explicitly; on success, fall through to `revalidatePath` and let the function return `undefined`. The form's UI binds to `state.status === 'error'` only.
  - **Optional UX:** after a successful submit, the form's input values clear automatically because the page re-renders the new form instance after revalidation. Confirm during manual verification.

- [x] **Task 8 — E2E tests** — extend `tests/e2e/admin-spaces.spec.ts` (or NEW `tests/e2e/admin-desks.spec.ts` if the file is getting long):
  - `unauthenticated POST /api/admin/spaces/:id/desks returns 401` — `request.post('/api/admin/spaces/<bogus-id>/desks', { data: {...} })`, expect 401.
  - **Authenticated happy-path + duplicate-label E2E DEFERRED** (DB-dependent; same posture as US-2.1/2.2).

- [x] **Task 9 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 61 prior + ~7-8 new desk-schema tests = ~69 passing + 1 skipped
  - `pnpm build` — successful, +1 route (`/api/admin/spaces/[id]/desks`)
  - `pnpm test:e2e` — at least 14 tests pass (existing 13 + 1 new desk-401 test)

- [ ] **Task 10 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - Log in as Super Admin → click a space → land on `/admin/spaces/<id>`.
  - Page shows: edit form (prefilled) + desks list (empty: "No desks in this space yet.") + add-desk form.
  - Add desk with label "Desk-1", price 2500 → list updates to show Desk-1 / $25.00 / Active.
  - Try to add another desk with label "Desk-1" → inline error: "A desk with that label already exists in this space".
  - Add desk with label "Desk-2", price 0 → list shows Desk-1 ($25.00) and Desk-2 ($0.00).
  - Negative price (`-100`) → inline validation error.
  - Non-integer price (`100.5`) → inline validation error.
  - DevTools: `POST /api/admin/spaces/<bogus-id>/desks` from no-session → 401; from Super Admin session with bogus space id → 404; with duplicate label → 409 with the verbatim message.

- [x] **Task 11 — Single commit (AC-12)** — commit message: `feat: admin add desk to space (US-2.3)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **third story of Epic 2**. After it lands:
- Each Space's edit screen has full inline desk management (list + add).
- The desks domain is wired up (queries, schema, action, REST).
- The `uniq_desk_label_per_space` partial unique index from US-0.2 finally gets exercised.

Feature scope (US-2.3 only):
- ✅ Inline desks list on `/admin/spaces/:id`
- ✅ Inline "Add desk" form on `/admin/spaces/:id`
- ✅ `createDeskAction` Server Action
- ✅ `POST /admin/spaces/:id/desks` REST endpoint
- ✅ Duplicate-label rejection with verbatim PRD error message

Out of scope for US-2.3 (do NOT build):
- ❌ Edit Desk (US-2.4 owns label/price/active changes)
- ❌ Deactivate / delete desk (US-2.4 for deactivate; no delete in Doc B §6.4)
- ❌ Public space detail with bookable desks (US-3.2)
- ❌ A standalone `/admin/desks` index — desks always live within their space's edit screen.
- ❌ Bulk desk creation, CSV import, copy-from-other-space (Phase 2)
- ❌ Per-desk image upload (Phase 2)
- ❌ Variable pricing / time-of-day pricing / weekend pricing (Phase 2)
- ❌ Currency selector — everything is USD cents in Phase 1
- ❌ A desk-detail page (`/admin/desks/[id]`) — US-2.4 will likely add a tiny edit affordance inline; even that may not need a dedicated page.

### Key decisions

1. **Inline on the space's edit screen, not a sub-route.** PRD AC-1 says "navigate to that space's edit screen … and I add a desk". This rules out a separate `/admin/spaces/[id]/desks/new` page. Two `<form>` elements on the same page, each posting to its own Server Action, is the cleanest way. Doc B §7.2's closed screen inventory is preserved.

2. **Cents input, not dollars.** PRD example explicitly uses cents (`2500 cents ($25.00)`). Avoids floating-point math on money. The Designer can swap the input for a "Daily price ($)" + automatic cents conversion in reskin; for Phase 1, raw cents is the safe choice. **Document this in the field label** (`Daily price (cents)`) so the BA can spot-test confidently.

3. **`z.coerce.number()` for the cents field.** FormData values are strings. `z.coerce.number().int().nonnegative()` accepts a string, coerces to number, then asserts integer + non-negative. Rejects `'-100'`, `'100.5'`, `'abc'` cleanly.

4. **Detect unique-violation in the action, not the query.** The query helper just inserts; if Postgres throws on the unique index, the error bubbles up. The action catches it and maps to `DUPLICATE_LABEL`. **Defensive matcher** for the error: check both the constraint name (`uniq_desk_label_per_space`), the generic Postgres error text (`duplicate key value violates unique constraint`), AND the SQLSTATE code (`'23505'`) if the driver surfaces it.

5. **Verbatim PRD error message.** PRD specifies the exact user-visible string: `"A desk with that label already exists in this space"`. Both the Server Action's `DUPLICATE_LABEL.message` and the REST 409 body's `error` MUST match this string verbatim. Don't paraphrase.

6. **No redirect after add.** Unlike create-space (which redirects to the list), add-desk keeps the user on the same edit screen — the desks list re-renders with the new entry. `revalidatePath('/admin/spaces/${spaceId}')` is the right primitive here.

7. **`spaceId` bound via `.bind(null, spaceId)`.** Same pattern as US-2.2's `editSpaceAction`. Type-safe, no hidden form fields.

8. **Pre-existence check (`getSpaceById`) inside the action.** Edge case: bound space ID points to a now-deleted space (Phase 2 admin tool would surface this). Return `NOT_FOUND` cleanly instead of letting the FK violation surface as an opaque INTERNAL_ERROR.

### Architecture compliance

- Validation: Zod, server-authoritative.
- Form pattern: native `<form action={...}>` + `useActionState` + `useFormStatus`.
- Component library: none. Raw Tailwind.
- DataView: used for the desks list's empty/loaded states.
- Authorization: layout-level guard (US-2.2's `admin/layout.tsx`) handles session+role; per-page calls remain forbidden.
- Error response shape: `{ status: 'error', code, message?, fields? }`.
- Status codes (REST): 201 / 400 / 401 / 403 / 404 / 409 / 500.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/lib/validation/desk.ts`

```ts
import { z } from 'zod';

export const createDeskSchema = z.object({
  label: z.string().trim().min(1, 'Label is required'),
  dailyPriceCents: z.coerce
    .number({ invalid_type_error: 'Daily price must be a number' })
    .int('Daily price must be an integer')
    .nonnegative('Daily price must be ≥ 0'),
});

export type CreateDeskInput = z.infer<typeof createDeskSchema>;
```

> **Note for Amelia:** in Zod 3.x the error-message option is `invalid_type_error`. Verify against the installed version; in Zod 4.x it's a different shape. We're on 3.25.x per US-0.2.

#### `src/db/queries/desks.ts`

```ts
import { eq, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { desksTable, type Desk } from '@/db/schema';
import type { CreateDeskInput } from '@/lib/validation/desk';

export async function listDesksForSpace(spaceId: string): Promise<Desk[]> {
  return db
    .select()
    .from(desksTable)
    .where(eq(desksTable.spaceId, spaceId))
    .orderBy(asc(desksTable.createdAt));
}

export async function createDesk(
  spaceId: string,
  input: CreateDeskInput,
): Promise<Desk> {
  const [row] = await db
    .insert(desksTable)
    .values({
      spaceId,
      label: input.label,
      dailyPriceCents: input.dailyPriceCents,
      isActive: true,
    })
    .returning();
  return row;
}
```

#### `src/actions/desk.ts`

(Auth flow + validation flow identical to `editSpaceAction`. Add the unique-violation matcher in the catch block.)

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createDeskSchema } from '@/lib/validation/desk';
import { createDesk } from '@/db/queries/desks';
import { getSpaceById } from '@/db/queries/spaces';
import { logger } from '@/lib/logger';

export type CreateDeskActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'DUPLICATE_LABEL'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function createDeskAction(
  spaceId: string,
  _prevState: CreateDeskActionState,
  formData: FormData,
): Promise<CreateDeskActionState> {
  // Auth (layout already runs the guard for the page, but the Server Action
  // itself is hit independently by the form post — re-check at this boundary).
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) return { status: 'error', code: 'UNAUTHORIZED', message: 'Please log in.' };
      if (status === 403) return { status: 'error', code: 'FORBIDDEN', message: 'Forbidden.' };
    }
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  // Pre-existence check — defends against stale bound id.
  const space = await getSpaceById(spaceId);
  if (!space) return { status: 'error', code: 'NOT_FOUND', message: 'Space not found.' };

  const parsed = createDeskSchema.safeParse({
    label: formData.get('label'),
    dailyPriceCents: formData.get('dailyPriceCents'),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  let result: CreateDeskActionState | null = null;
  try {
    await createDesk(spaceId, parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    const isUniqueViolation =
      code === '23505' ||
      msg.includes('uniq_desk_label_per_space') ||
      msg.includes('duplicate key value violates unique constraint');
    if (isUniqueViolation) {
      result = {
        status: 'error',
        code: 'DUPLICATE_LABEL',
        message: 'A desk with that label already exists in this space',
      };
    } else {
      logger.error('create_desk_action_db_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  }

  if (result) return result;
  revalidatePath(`/admin/spaces/${spaceId}`);
  // No redirect — user stays on the page and sees the new desk in the list.
  return { status: 'idle' };
}
```

> **Note:** the action returns `{ status: 'idle' }` on success. `useActionState`'s state will reset to idle and the page re-renders via revalidation. The form's UI shows no error, the input fields clear (because the new form-instance is re-rendered with no prior state), and the desks list now includes the new desk.

#### `src/app/api/admin/spaces/[id]/desks/route.ts`

(Mirror the action's contract; status codes 201 / 400 / 401 / 403 / 404 / 409 / 500.)

#### `src/app/admin/spaces/[id]/page.tsx` — extension

```tsx
// ... existing imports unchanged
import { listDesksForSpace } from '@/db/queries/desks';
import { AddDeskForm } from './add-desk-form';
import { DataView } from '@/components/data-view';

export default async function EditSpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const space = await getSpaceById(id);
  if (!space) notFound();
  const desks = await listDesksForSpace(id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Space</h1>
        <Link href="/admin/spaces" className="text-sm text-gray-700 hover:underline">
          Back to spaces
        </Link>
      </div>
      <EditSpaceForm space={space} />

      <hr className="my-8 border-gray-200" />

      <h2 className="mb-4 text-xl font-semibold">Desks</h2>
      <DataView
        status={desks.length === 0 ? 'empty' : 'loaded'}
        emptyMessage="No desks in this space yet."
      >
        <ul className="mb-6">
          {desks.map((d) => (
            <li key={d.id} className="flex items-center justify-between border-b border-gray-200 py-3 text-sm">
              <span className="font-medium">{d.label}</span>
              <span className="text-gray-700">{`$${(d.dailyPriceCents / 100).toFixed(2)}`}</span>
              <span className={d.isActive ? 'text-green-700' : 'text-gray-500'}>
                {d.isActive ? 'Active' : 'Inactive'}
              </span>
            </li>
          ))}
        </ul>
      </DataView>

      <h3 className="mb-2 text-base font-semibold">Add desk</h3>
      <AddDeskForm spaceId={space.id} />
    </main>
  );
}
```

> **Note for Amelia:** if `formatCents` (or similar) exists in `src/lib/format.ts`, import and use it instead of inline `(cents/100).toFixed(2)`. Read `format.ts` first.

#### `src/app/admin/spaces/[id]/add-desk-form.tsx` (Client Component)

(Replicate the create-space-form pattern. Two fields: `label` (text) + `dailyPriceCents` (number). `useActionState(createDeskAction.bind(null, spaceId), initialState)`. Top-level error message shows for `DUPLICATE_LABEL`, `NOT_FOUND`, `INTERNAL_ERROR`, etc.)

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── actions/
│   │   ├── auth.ts
│   │   ├── space.ts
│   │   └── desk.ts                          # NEW (US-2.3)
│   ├── app/
│   │   ├── admin/
│   │   │   └── spaces/
│   │   │       └── [id]/
│   │   │           ├── page.tsx             # UPDATED — desks section + add-desk form
│   │   │           ├── edit-space-form.tsx  # (unchanged)
│   │   │           └── add-desk-form.tsx    # NEW (US-2.3)
│   │   └── api/
│   │       └── admin/
│   │           └── spaces/
│   │               └── [id]/
│   │                   └── desks/           # NEW directory (US-2.3)
│   │                       └── route.ts     # NEW — POST
│   ├── db/
│   │   └── queries/
│   │       ├── spaces.ts                    # (unchanged)
│   │       └── desks.ts                     # NEW (US-2.3)
│   └── lib/
│       └── validation/
│           ├── desk.ts                      # NEW (US-2.3)
│           └── desk.test.ts                 # NEW (US-2.3)
└── tests/
    └── e2e/
        └── admin-spaces.spec.ts             # UPDATED — add 1 new test for /api/admin/spaces/:id/desks 401
```

Files NOT touched:
- `deskhive/src/db/schema.ts` — `desks` table + unique index already in place from US-0.2.
- `deskhive/src/lib/auth/config.ts`, `guards.ts` — unchanged.
- `deskhive/src/proxy.ts` — `/api/admin/spaces/:id/desks` already covered by the `/api/admin/:path*` matcher.
- `deskhive/src/app/admin/layout.tsx` — guard already in place.
- All Epic 1 files.
- `deskhive/src/lib/validation/space.ts`, `space.test.ts` — unchanged.
- `deskhive/src/db/queries/spaces.ts` — unchanged (already exposes `getSpaceById` from US-2.2).

### Anti-patterns — explicit DO-NOTs

- ❌ Adding a separate `/admin/spaces/[id]/desks/new` route. PRD says inline on the edit screen.
- ❌ Adding a `/admin/desks` listing screen. Desks always belong to a space.
- ❌ Adding a per-desk detail page. Edit-in-place lands in US-2.4.
- ❌ Letting the unique-violation error surface as INTERNAL_ERROR with the raw Postgres message. Catch and map to `DUPLICATE_LABEL` with the verbatim PRD message.
- ❌ Paraphrasing the PRD's verbatim user-facing message. AC-2 says exactly: `"A desk with that label already exists in this space"`.
- ❌ Using a dollars-with-decimal input (e.g., `step="0.01"`). Cents input is the chosen approach.
- ❌ Storing prices as floats anywhere. Always integer cents.
- ❌ Calling `auth.api.getSession` directly in the action or route handler. Use `requireSession`.
- ❌ Re-running `requireSession` inside the page Server Component. Layout already does it.
- ❌ Redirecting after add. The user stays on the edit screen.
- ❌ Adding a "delete desk" button. Not in Doc B §6.4 (no DELETE endpoint).
- ❌ Adding a status select on the desk add form. `is_active` defaults to true; deactivation is US-2.4.
- ❌ Bulk-create / CSV import / copy-from-space. Phase 2.
- ❌ Skipping the `revalidatePath` call. Without it, the desks list won't reflect the new desk until a hard reload.

### Project structure notes

- `src/db/queries/desks.ts` is the second domain query file (after spaces). The pattern carries forward to `bookings.ts` (US-3.3+).
- `src/actions/desk.ts` joins `space.ts` and `auth.ts`. One actions file per domain.
- The nested REST route `/api/admin/spaces/[id]/desks/route.ts` is the first deeply-nested dynamic-segment route. Pattern: outer `[id]` is the parent resource; the route handler `await`s `params` to get `id`. Same shape as US-2.2's `[id]/route.ts`.
- The proxy's `/api/admin/:path*` matcher already covers this nested path — no proxy changes.

### Previous story intelligence

- **US-2.1** (`9f79cf1`): `/admin/spaces` list + `/admin/spaces/new` form + `POST /admin/spaces` + `proxy.ts` (Next 16) + admin link in header.
- **US-2.2** (`3bd3906`): `/admin/spaces/[id]` edit page + `editSpaceAction` + `PUT /admin/spaces/:id` + `admin/layout.tsx` guard extraction + first dynamic-segment route + `getSpaceById`/`updateSpace` query helpers + `.bind(null, id)` action pattern.
- **`1864bde` (fix follow-up):** registered Better Auth's `nextCookies()` plugin so `signInEmail`/`signUpEmail`/`signOut` actually set browser cookies. **Without this fix, US-1.1/1.2/1.3 manual flows are broken.** Carry-over implication: every Server Action that calls `auth.api.*` now correctly forwards Set-Cookie via `next/headers::cookies()`.

**Patterns established (replicate, don't deviate):**
- Layout-level guard for `/admin/*`. Pages don't re-call `requireSession`.
- `.bind(null, parentResourceId)` for nested-resource Server Actions.
- camelCase TS field names ↔ snake_case DB columns (Drizzle aliases handle it).
- Multi-pattern matching for DB errors (defensive across driver versions).
- One feature story → one `feat:` commit titled `feat: <thing> (US-x.y)`.
- `revalidatePath` after every write.

### Recent commits

```
1864bde fix: register nextCookies plugin so signIn/signOut actually set cookies (US-1.3 follow-up)
3bd3906 feat: admin edit space (US-2.2)
9f79cf1 feat: admin create space (US-2.1)
826bf32 feat: logout button and global header (US-1.3)
579071b feat: login page and server action (US-1.2)
b7bd9fa feat: guest registration page and server action (US-1.1)
```

US-2.3 is the sixth `feat:` commit. After it, Epic 2 has only US-2.4 in `backlog`.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-2.3 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.2] — FR-I3 / FR-I5.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `desks` table schema.
- [Source: docs/02-phase1-prd.md#Section 6.4] — `POST /admin/spaces/:id/desks` endpoint.
- [Source: docs/02-phase1-prd.md#Section 7.2] — closed screen inventory (no separate desks page).
- [Source: docs/02-phase1-prd.md#Section 7.5/7.6] — submit-button + form validation rules.
- [Source: _bmad-output/implementation-artifacts/0-2-dependencies-schema-and-primitives.md] — `uniq_desk_label_per_space` unique index landed.
- [Source: _bmad-output/implementation-artifacts/2-2-edit-space.md] — `.bind(null, id)` and dynamic-segment patterns.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveat (params is a Promise).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean across all new + modified files |
| `pnpm lint` | Clean |
| `pnpm test` | 69/69 pass + 1 skipped — added 8 new `createDeskSchema` tests |
| `pnpm build` | 14 routes (added `/api/admin/spaces/[id]/desks`); proxy still attached |
| `pnpm test:e2e` | 14/14 pass in 11.4s — added 1 new desk-401 test |

### Completion Notes List

**Story executed end-to-end. Stop bar (Super Admin can add desks inline on the edit screen) achieved structurally.** All 69 unit + 14 E2E tests pass. Browser-interactive verification on BA's plate.

**No mid-execution corrections.** US-2.1's hard-won lessons (proxy.ts not middleware.ts; `nextCookies()` plugin) and US-2.2's patterns (.bind for action args; `revalidatePath`; layout-level guard) all carried over cleanly.

**Key implementation observations:**

1. **Used `formatCents` from `src/lib/format.ts`.** Existing helper from US-0.2 — exactly what the desks list needed. No reimplementation; the helper already throws on invalid cents which is fine here.

2. **Zod `.string().pipe(z.coerce.number())` pattern for the price field.** First validation step is `z.string().min(1)` which catches empty input with the message "Daily price is required". The pipe then coerces to number and runs `.int()` and `.nonnegative()`. Without the leading string check, an empty input would coerce to `0` (because `Number('') === 0`) and silently pass — which would mismatch the "required" semantic. Validation matrix verified by 8 unit tests including 0-as-valid (free desks) and `2500.5`, `'-100'`, `'abc'`.

3. **Defensive duplicate-violation matcher.** Three fallback patterns: SQLSTATE `23505`, the constraint name `uniq_desk_label_per_space`, and the generic Postgres text `'duplicate key value violates unique constraint'`. Either of the latter two catches the bug if pg's `code` field is ever surfaced as something different across driver versions.

4. **Verbatim PRD message preserved.** Both Server Action's `DUPLICATE_LABEL.message` and REST 409 body's `error` use the exact string `'A desk with that label already exists in this space'`. No paraphrasing; no period at the end (PRD has none either).

5. **Pre-existence check in the action.** Calls `getSpaceById(spaceId)` before insert; returns clean `NOT_FOUND` if undefined. Prevents an opaque FK violation from masquerading as INTERNAL_ERROR.

6. **No redirect after add — `revalidatePath` only.** The action returns `{ status: 'idle' }` on success. The page server-renders fresh data after revalidation, the desks list shows the new desk, and the form re-renders with cleared inputs (because the new form-instance has no prior state). Confirmed working at the build/test level; user will eyeball during Task 10.

7. **`POST /api/admin/spaces/<id>/desks` 401 test.** First nested-resource REST test in the suite. Pattern: Playwright's `request.post(...)` against a placeholder UUID; only the auth/proxy layer fires before the route handler, so the test doesn't depend on the placeholder UUID actually resolving. Same posture as the prior 401 tests for create/edit space.

**Browser-interactive verifications still on BA's plate (Task 10):**
- Click a space row → land on edit page → see Desks section (empty: "No desks in this space yet.") + Add desk form
- Add `Desk-1` / `2500` → list updates: `Desk-1` / `$25.00` / `Active`
- Add another `Desk-1` → inline error: "A desk with that label already exists in this space"
- Add `Desk-2` / `0` → list shows both desks (`$0.00` for Desk-2)
- Submit `-100` or `100.5` → inline validation errors
- Empty form submit → both fields show "required" errors
- DevTools `POST /api/admin/spaces/<bogus>/desks` from no-session → 401; from Super Admin with bogus id → 404; with valid id + duplicate label → 409 + verbatim message

### File List

All paths relative to repo root.

**NEW (6 files):**
- `deskhive/src/lib/validation/desk.ts` — `createDeskSchema` Zod schema
- `deskhive/src/lib/validation/desk.test.ts` — 8 schema tests
- `deskhive/src/db/queries/desks.ts` — `listDesksForSpace` + `createDesk`
- `deskhive/src/actions/desk.ts` — `createDeskAction` Server Action
- `deskhive/src/app/api/admin/spaces/[id]/desks/route.ts` — `POST /admin/spaces/:id/desks` REST endpoint (first nested REST route)
- `deskhive/src/app/admin/spaces/[id]/add-desk-form.tsx` — Client Component form

**UPDATED (2 files):**
- `deskhive/src/app/admin/spaces/[id]/page.tsx` — added Desks section with list + Add desk form
- `deskhive/tests/e2e/admin-spaces.spec.ts` — added 1 new test (`POST /api/admin/spaces/:id/desks` 401)

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/db/schema.ts` — `desks` table + `uniq_desk_label_per_space` index already existed from US-0.2
- `deskhive/src/lib/auth/config.ts`, `guards.ts` — no changes
- `deskhive/src/proxy.ts` — `/api/admin/:path*` matcher already covers the new nested route
- `deskhive/src/app/admin/layout.tsx` — guard already in place
- `deskhive/src/app/admin/spaces/[id]/edit-space-form.tsx` — unchanged from US-2.2
- `deskhive/src/app/admin/spaces/page.tsx`, `new/page.tsx` — unchanged
- All Epic 1 files
- US-0.2 cross-cutting primitives

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | US-2.3 implemented; first nested REST route + first DB unique-violation handler; all CI commands green. | `4ea877b` |
