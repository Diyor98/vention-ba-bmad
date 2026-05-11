# Story 6.1: Price Input Accepts Dollars, Stores Cents

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **to type desk prices in dollars (e.g., `25` or `30.50`) instead of cents (`2500` / `3050`)**,
so that **I don't have to mentally multiply by 100 every time I add or edit a desk, and the cents storage decision stops leaking into the UX.**

> Story 6.1 opens **Epic 6 — Phase 1 Polish** (the small surgical fixes from `docs/phase2-framing-and-polish-backlog.md` items 6-1 → 6-3). Source of truth: [docs/design/6-1-price-input-dollars-ba-decisions.md](docs/design/6-1-price-input-dollars-ba-decisions.md). All decisions locked.

> **Input-layer change only.** Money stays stored as **integer cents** per the locked architectural decision (architecture.md line 113: *"Money as integer cents and dates as ISO strings — type-level discipline throughout the stack; no floats, no timezone math"*). The display formatter `formatCents()` from US-3.4 is unchanged. The DB schema is unchanged. The query layer is unchanged. Only the form's input parsing layer (FormData → cents) and the input's display (cents → form value) change.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–9 + Browser verification checklist.

1. **AC-1 (New `src/lib/money.ts` with `dollarsToCents` + `centsToDollars`).** Create a new file `src/lib/money.ts` exporting two pure functions:
   - **`dollarsToCents(input: string): number`** — Parses a user-input dollar string (e.g., `"25"`, `"25.5"`, `"25.50"`, `"0.99"`, `"9999.99"`) into integer cents. **Must use integer-string parsing, NOT `parseFloat(input) * 100`** (per BA Decisions §6 + architectural anti-pattern: `parseFloat("25.50") * 100` returns `2549.9999999996` due to float imprecision). Recommended pattern: trim, regex-match `^(\d{1,5})(?:\.(\d{1,2}))?$` (or stricter), split into integer-dollar and decimal-cent parts, validate each as integer, compute `dollars * 100 + paddedCents`. Throw a structured error or return a tagged result on invalid input (dev-agent's choice — see Dev Notes for the recommended `{ ok: true; cents: number } | { ok: false; reason: 'invalid' | 'too_many_decimals' | ... }` shape).
   - **`centsToDollars(cents: number): string`** — Formats stored integer cents (e.g., `2500`, `3050`, `100`, `9999`) to a dollar string suitable for an HTML `<input type="text">` value: **always 2 decimal places** (`"25.00"`, `"30.50"`, `"1.00"`, `"99.99"`). Throws on negative or non-integer input (defensive — DB invariants guarantee this won't happen, but a typed throw catches regressions). **Distinct from `formatCents()`** in `src/lib/format.ts`: that one returns `"$25.00"` (with the dollar sign, for display); this one returns `"25.00"` (without — for input population).
   - Must not import any framework code (`'use client'` / Server Action), so it can be used from both client and server.

2. **AC-2 (Validation rules per BA Decisions §4).** The Server Action's input validator (Zod or hand-rolled) for the desk-price field must enforce:
   - **Minimum: $1.00** (`100` cents). Reject anything below. Specific message: `Price must be at least $1.00`
   - **Maximum: $9999.99** (`999999` cents). Reject anything above. Message: `Price must be at most $9999.99`
   - **Maximum 2 decimal places.** Reject `25.999`, `1.234`, etc. Message: `Price can have at most 2 decimal places`
   - **Reject zero and negative.** ($0.00 hits the $1.00 minimum.)
   - **Reject non-numeric** (`abc`, `25foo`, empty after trim). Message: `Enter a valid price in dollars (example: 25.50)`
   - These messages map 1:1 to the BA doc — copy them verbatim.

3. **AC-3 (Validation schema refactor — `src/lib/validation/desk.ts`).** Update the existing `createDeskSchema` and `editDeskSchema`. **The input key is `dailyPriceDollars` (form-layer name = what the user typed); the post-parse output key stays `dailyPriceCents: number` (query-layer name = what the DB stores). The Zod schema is the rename seam.** This decision is locked by BA — do NOT leave both keys named the same.
   - The form's `<input>` `name=` attribute changes: `dailyPriceCents` → `dailyPriceDollars`. The Server Action reads `formData.get('dailyPriceDollars')`.
   - The schema's *input* shape (what `safeParse` accepts) takes `dailyPriceDollars: string`.
   - The schema's *output* shape (the inferred `CreateDeskInput` / `EditDeskInput`) keeps `dailyPriceCents: number`. Use a top-level `z.object(...).transform((parsed) => ({ ...parsed, dailyPriceCents: <converted cents> }))` (and `delete (out as any).dailyPriceDollars` or omit via destructuring) — pick the cleanest Zod pattern that renames the field cleanly.
   - Validation errors are surfaced under the **input** key `dailyPriceDollars` so the form's `aria-invalid` + `.field-error` block targets the right input. (The error key follows the input key, not the output key.)
   - Surfaces specific error messages from AC-2 via Zod's `.superRefine` / `.transform` / custom issue.
   - The query layer (`createDesk`, `updateDesk` in `db/queries/desks.ts`) consumes the unchanged output type — no change needed to query helpers.

4. **AC-4 (Server Action wires through helper — `src/actions/desk.ts`).** Both `createDeskAction` and `editDeskAction`:
   - Read `formData.get('dailyPriceDollars')` (string).
   - Pass through the updated schema, which transforms to `{ dailyPriceCents: number }` after validation succeeds.
   - On VALIDATION_ERROR, surface the field error under the key `dailyPriceDollars` (not `dailyPriceCents`) so the form's `aria-invalid` + `.field-error` block targets the right input.
   - The `revalidatePath`, `requireSession`/`requireRole` guards, DUPLICATE_LABEL pg-unique-violation handling, and `INTERNAL_ERROR` fallback all stay exactly as today — no other behavioral change.

5. **AC-5 (Edit desk form populates input with dollars — `add-desk-form.tsx` + `edit-desk-form.tsx`).** Both forms in `src/app/admin/spaces/[id]/`:
   - Replace the existing `<input name="dailyPriceCents" type="number" step="1" min="0">` with `<input name="dailyPriceDollars" type="text" inputMode="decimal" pattern="^\d{1,5}(?:\.\d{1,2})?$">`.
   - `<label>` text → `Daily price` (no "(cents)"; no parenthetical).
   - `placeholder="25.00"`.
   - `aria-label="Daily price"` (matches label).
   - Helper text below the input: `<p className="field-help">In USD. Example: 25 or 25.50</p>`.
   - **Edit form (`edit-desk-form.tsx`):** `defaultValue` becomes `centsToDollars(desk.dailyPriceCents)` (e.g., `2500` → `"25.00"`).
   - **Add form (`add-desk-form.tsx`):** no defaultValue (empty input).
   - **Cents preview removed entirely:** the existing `<span className="muted">cents · ${formatCents(desk.dailyPriceCents)}</span>` block in `edit-desk-form.tsx` is deleted (Story 6.1 Decision §3).

6. **AC-6 (Other money displays unchanged).** Per BA anti-pattern §5:
   - `src/lib/format.ts`'s `formatCents()` is **NOT** modified.
   - All other surfaces that display prices (browse spaces, my-bookings, admin bookings, space detail) keep their existing `formatCents()` calls and continue to render `$25.00` correctly.
   - Booking creation logic (`createBookingAction`) is unchanged. The price snapshot at booking time still reads `desk.dailyPriceCents` from the DB at booking creation. Existing bookings' `totalPriceCents` snapshot is untouched.

7. **AC-7 (Backward-compatible: existing seeded desks display correctly).** Per BA Decisions §5:
   - Existing rows in `desks` continue to live as integer cents in the DB. No migration.
   - Opening the edit form for a desk with `dailyPriceCents = 2500` shows `25.00` in the input.
   - Opening the edit form for `dailyPriceCents = 100` shows `1.00`.
   - Opening the edit form for `dailyPriceCents = 999999` shows `9999.99`.
   - Submitting the form without changing the price re-stores the same cents value (idempotent round-trip).

8. **AC-8 (Unit tests for `src/lib/money.ts`).** Create `src/lib/money.test.ts` with **at minimum** these cases (vitest):

   **`dollarsToCents` — happy path:**
   - `"25"` → 2500 cents (no decimals → treated as exact dollars)
   - `"25.5"` → 2550 cents (one decimal → padded as tens-of-cents)
   - `"25.50"` → 2550 cents
   - `"0.99"` → 99 cents
   - `"1"` → 100 cents
   - `"1.00"` → 100 cents
   - `"9999.99"` → 999999 cents

   **`dollarsToCents` — float-trap regression:**
   - `"25.50"` must NOT return `2549.9999999996` (the `parseFloat * 100` trap). Assert exact `2550`.
   - `"0.10"` must NOT return `9.999999999...` Assert exact `10`.

   **`dollarsToCents` — invalid:**
   - `"25.999"` → invalid (too many decimals)
   - `"-5"` → invalid
   - `"abc"` → invalid
   - `""` / `"   "` → invalid (empty/whitespace)
   - `"25foo"` → invalid (trailing non-digits)
   - `"25."` → invalid (trailing dot — or accept it as `2500`, dev-agent picks one; document choice)

   **`centsToDollars` — happy path:**
   - `2500` → `"25.00"`
   - `3050` → `"30.50"`
   - `100` → `"1.00"`
   - `99` → `"0.99"`
   - `999999` → `"9999.99"`
   - `1` → `"0.01"`

   **`centsToDollars` — defensive throws:**
   - `-1` → throws
   - `2.5` (non-integer) → throws

9. **AC-9 (Validation boundary tests).** Update `src/lib/validation/desk.test.ts` to reflect the new dollar-input schema. **Three of the existing tests must change** (the cents-era expectations no longer hold):
   - Existing test `"accepts 0 as a valid daily price (free desks allowed)"` → DELETE (Decision §4 rejects $0).
   - Existing test `"rejects negative dailyPriceCents"` → keep, but update field name + expected message to `dailyPriceDollars` / `Price must be at least $1.00`.
   - Existing test `"rejects non-integer dailyPriceCents"` (`'2500.5'`) → reframe as `"rejects more than 2 decimal places"` (`'25.999'` → `Price can have at most 2 decimal places`).
   - Existing test `"accepts valid input and coerces dailyPriceCents to number"` → keep, but flip the input to `'25.50'` and assert output `dailyPriceCents` equals `2550`.

   **Add new boundary tests** per BA Decisions §4:
   - `'0.99'` → rejected (`Price must be at least $1.00`)
   - `'1.00'` → accepted, dailyPriceCents = 100
   - `'9999.99'` → accepted, dailyPriceCents = 999999
   - `'10000'` → rejected (`Price must be at most $9999.99`)
   - `'10000.00'` → rejected (same message)
   - `'25.50'` → accepted, dailyPriceCents = 2550
   - `'25'` → accepted, dailyPriceCents = 2500 (no decimals form)

10. **AC-10 (No regression in any Phase 1 / 5.1 / 5.2 flow).** Every flow verified during Epics 0–5 must still work:
    - US-1.1–1.3 auth flows unchanged.
    - US-2.1, US-2.2 space CRUD unchanged.
    - US-2.3 (add desk) — works with dollar input + verbatim duplicate-label error from `12bee8b`.
    - US-2.4 (edit desk) — inline save still works, status badge column still renders correct active/inactive state.
    - US-3.1–3.5 guest browse/book/cancel — all price displays continue to render via `formatCents()` correctly.
    - US-4.1–4.3 admin view/confirm/reject — admin bookings table still renders `Total` column correctly.
    - Story 5.1 + 5.2 reskins — all visual treatments preserved.
    - Footer reads `© 2026 DeskHive` (Story 5.2 mojibake fix preserved).
    - 97 unit + 31 E2E tests still pass. Unit count grows by `src/lib/money.test.ts` count (≥15 new assertions per AC-8) + the `desk.test.ts` boundary additions per AC-9.
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

11. **AC-11 (Stop bar — BA browser verification checklist).** Per BA Decisions §"Browser verification checklist" 1–12:
    1. Load existing desk for edit → input shows `25.00` (not `2500`).
    2. Label `Daily price`, placeholder `25.00`, helper text `In USD. Example: 25 or 25.50`.
    3. No cents preview anywhere near the input.
    4. Valid edit round-trip: `30.50` → save → input reloads `30.50` → browse → `$30.50 / day`.
    5. Add new desk with price `15` → input reloads `15.00`, browse shows `$15.00 / day`.
    6. Validation: `0.50` → `Price must be at least $1.00`, no submission.
    7. Validation: `10000` → `Price must be at most $9999.99`.
    8. Validation: `25.999` → `Price can have at most 2 decimal places`.
    9. Validation: `-5` → rejected.
    10. Validation: `abc` → rejected.
    11. Existing bookings on Guest accounts still show original `totalPriceCents` (snapshot preserved).
    12. Footer reads `© 2026 DeskHive` (no `В©` / `B©` regression).

12. **AC-12 (Single commit + memory update for Phase 2 reuse).** Per BA Decisions §"Memory note for Phase 2":
    - All Story 6.1 changes land in a single commit on `main` titled exactly `feat: desk price input accepts dollars, stores cents (Story 6-1)`. Commit content is only files under `deskhive/` plus the `_bmad-output/` story file + sprint-status update.
    - A small follow-up `docs:` commit may fill in the Change Log hash + BA greenlight after browser-verification + push (Story 5-1 / 5-2 precedent).
    - **Add a memory entry** flagging `src/lib/money.ts` as the source of truth for all money math, so Phase 2 work (refunds, payouts, fees, receipts) extends rather than duplicates. Suggested type: `reference`. Suggested name: `Money math helpers location`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.**
  - Verify all CI commands on a clean `main` checkout still pass: `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e`. Baseline is 97 unit + 31 E2E from Stories 5.1 / 5.2.
  - Re-read [docs/design/6-1-price-input-dollars-ba-decisions.md](docs/design/6-1-price-input-dollars-ba-decisions.md) end-to-end before touching code. Especially Decision §6 (integer-string parsing — NOT `parseFloat`).
  - Skim [src/lib/format.ts:5](deskhive/src/lib/format.ts) (`formatCents`) — confirm you understand the pattern; the new `centsToDollars` should follow the same `Math.floor(cents / 100)` + `cents % 100` integer-math approach for the inverse direction.

- [x] **Task 1 — Create `src/lib/money.ts` + tests (AC-1, AC-8).**
  - Implement `dollarsToCents(input: string)` using integer-string parsing. **Do NOT use `parseFloat`**. Recommended shape:
    ```ts
    type ParseResult =
      | { ok: true; cents: number }
      | { ok: false; reason: 'invalid' | 'too_many_decimals' | 'below_minimum' | 'above_maximum' };

    export function dollarsToCents(input: string): ParseResult { ... }
    ```
    Or throw with a structured error. Pick one and stick with it across the file. Whatever you pick, the Zod schema in Task 2 must surface the right message per AC-2.
  - Implement `centsToDollars(cents: number): string` — `Math.floor(cents / 100)` + `(cents % 100).toString().padStart(2, '0')`. Throw on negative or non-integer (defensive).
  - Create `src/lib/money.test.ts` with vitest. Cover every case in AC-8 explicitly — **especially the float-trap regression cases** (`"25.50"` ↔ `2550`, `"0.10"` ↔ `10`). Those are the load-bearing guards against silent drift in Phase 2 refund math.

- [x] **Task 2 — Refactor `src/lib/validation/desk.ts` (AC-3) + tests (AC-9).**
  - **Input key = `dailyPriceDollars` (string). Output key = `dailyPriceCents` (number).** Locked by BA — the Zod schema renames at the seam.
  - The cleanest Zod pattern for input→output key rename is a top-level `.transform()` on the whole object:
    ```ts
    const dailyPriceField = z
      .string({ required_error: 'Daily price is required', invalid_type_error: 'Daily price is required' })
      .trim()
      .min(1, 'Daily price is required')
      .superRefine((s, ctx) => {
        const r = dollarsToCents(s);
        if (!r.ok) {
          // map r.reason → one of the AC-2 verbatim messages
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: /* per AC-2 */ });
        }
      })
      .transform((s) => {
        const r = dollarsToCents(s);
        // superRefine already guards; non-null assertion here is safe.
        return (r as { ok: true; cents: number }).cents;
      });

    // Input shape: { label: string; dailyPriceDollars: string }
    // Output shape (via top-level .transform): { label: string; dailyPriceCents: number }
    export const createDeskSchema = z
      .object({
        label: z.string().trim().min(1, 'Label is required'),
        dailyPriceDollars: dailyPriceField, // INPUT key
      })
      .transform(({ label, dailyPriceDollars }) => ({
        label,
        dailyPriceCents: dailyPriceDollars, // RENAMED at the seam; value is already cents after dailyPriceField's .transform()
      }));
    ```
    Note: because `dailyPriceField` itself transforms `string → number`, by the time the top-level `.transform()` runs, `dailyPriceDollars` in the closure is already `number`. The top-level transform just renames the key for the output shape. This keeps `CreateDeskInput.dailyPriceCents: number` stable.
  - **Validation errors must surface under the input key `dailyPriceDollars`** in `parsed.error.issues[i].path[0]`. The action's `fields` record will use `dailyPriceDollars` as the key. The form reads `fieldError('dailyPriceDollars')`.
  - `editDeskSchema` follows the same pattern but extends with `isActive: z.boolean()` (unchanged from today).
  - Update `src/lib/validation/desk.test.ts` per AC-9: delete the "$0 accepted" test, reframe two others, add the seven new boundary tests.

- [x] **Task 3 — Wire through `src/actions/desk.ts` (AC-4).**
  - `createDeskAction`: change `formData.get('dailyPriceCents')` → `formData.get('dailyPriceDollars')`.
  - `editDeskAction`: same.
  - Field-error surface key: emit under `dailyPriceDollars` (the input key) — that's what the form's `<input name="dailyPriceDollars">` aria-invalid + `.field-error` block targets.
  - **All other behavior preserved:** the `requireSession`/`requireRole` guard chain, `DUPLICATE_LABEL` pg-unique-violation mapping with the **verbatim PRD message** (`'A desk with that label already exists in this space'` — do NOT paraphrase, locked since US-2.3 follow-up `12bee8b`), `revalidatePath`, INTERNAL_ERROR fallback.

- [x] **Task 4 — Update add + edit forms (AC-5, AC-7).**
  - `src/app/admin/spaces/[id]/add-desk-form.tsx`:
    - `<input name="dailyPriceCents" type="number" ... />` → `<input name="dailyPriceDollars" type="text" inputMode="decimal" pattern="^\\d{1,5}(?:\\.\\d{1,2})?$" />`.
    - Label `Daily price (cents)` → `Daily price`.
    - Placeholder/helper text per AC-5.
    - `fieldError('dailyPriceCents')` → `fieldError('dailyPriceDollars')` (the input key, locked by BA).
  - `src/app/admin/spaces/[id]/edit-desk-form.tsx`:
    - Same input updates as add-desk-form.
    - `defaultValue={desk.dailyPriceCents}` → `defaultValue={centsToDollars(desk.dailyPriceCents)}`.
    - **Delete the cents preview block:** the `<span className="muted">cents · {formatCents(desk.dailyPriceCents)}</span>` (BA Decisions §3).
  - Keep the column widths / `.desk-admin-row` grid from Story 5.2 — only the cell *contents* change.

- [x] **Task 5 — Local CI parity.**
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 97 + new tests from Tasks 1 + 2.
  - `pnpm build` — clean, route count unchanged (no new pages).
  - `pnpm test:e2e` — 31 prior tests still pass. **E2E specs likely unaffected** (admin-spaces.spec.ts only checks 401 redirects, not form internals). If anything assets on the cents-era `name="dailyPriceCents"` field or label text, update minimally.

- [ ] **Task 6 — Manual verification (BA's eyeball — AC-11 / Verification §1–12).** *(DEFERRED to BA's review pass per Stories 5.1 / 5.2 precedent — dev-agent runs automated suite (typecheck/lint/test/build/test:e2e all green), BA owns the eyeball checklist.)*

- [x] **Task 7 — Memory + sprint status + single commit (AC-12).**
  - Add memory entry pointing to `src/lib/money.ts` as the canonical money-math source. Type: `reference`. Update `MEMORY.md` index.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - Add Epic 6 block if not present (synthetic, like Epics 0 / 5).
    - `6-1-price-input-dollars: ready-for-dev` → `review`.
    - Update `last_updated` parenthetical.
  - Mark all Tasks `[x]` except Task 6 (BA's eyeball deferral).
  - Fill in Dev Agent Record: Agent Model, Debug Log References table, Completion Notes (including the input-key decision from Task 2), File List, Change Log row with `(filled by follow-up after push)` placeholder.
  - Stage `deskhive/...` + the two `_bmad-output/...` files only.
  - Commit: `feat: desk price input accepts dollars, stores cents (Story 6-1)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 6 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash (same pattern as Story 5.1's `c4b832b` / Story 5.2's `552c05d`).

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **first story of Epic 6 — Phase 1 Polish**. After it lands at `review` and BA greenlights:

- Admins type dollars (`25.50`) instead of cents (`2550`) on the desk-edit form.
- All money math throughout the app continues to use integer cents (no change to storage, no change to booking snapshots, no change to display).
- A new `src/lib/money.ts` becomes the canonical money-math helper. Phase 2 work (refunds, fees, payouts, receipts) extends it instead of inventing parallel helpers.

Feature scope (Story 6.1 only):
- ✅ `src/lib/money.ts` with `dollarsToCents` + `centsToDollars`, both integer-math-only.
- ✅ Updated Zod schema with specific dollar-range / decimal-places error messages.
- ✅ Updated `createDeskAction` + `editDeskAction` to parse the dollar input.
- ✅ Updated `add-desk-form.tsx` + `edit-desk-form.tsx` — new label / placeholder / helper text, cents preview removed.
- ✅ Edit form populates input with `centsToDollars(desk.dailyPriceCents)`.
- ✅ Unit tests for the helper (`src/lib/money.test.ts`) covering happy path, float-trap regressions, and invalid inputs.
- ✅ Updated `src/lib/validation/desk.test.ts` boundary tests.
- ✅ Memory entry pointing future Phase 2 work at `src/lib/money.ts`.

Out of scope for Story 6.1 (do NOT build):
- ❌ Any change to storage (cents stays).
- ❌ Any change to `src/lib/format.ts` `formatCents()` — that display formatter is correct already.
- ❌ Any change to booking price snapshot logic (`totalPriceCents` at booking creation).
- ❌ Any new shared `<MoneyInput>` component (BA Decisions §"Files likely touched" — explicitly optional, single-form change is acceptable).
- ❌ Multi-currency support (USD-only, locked).
- ❌ Phase 1 polish item 6-5 (price-in-dollars display clarification — separate item, awaiting manager input).
- ❌ Phase 1 polish item 6-2 (admin "My bookings" hide) — separate story.
- ❌ Phase 1 polish item 6-3 (booking confirmation toast) — separate story.

### Key decisions

1. **Storage stays integer cents.** Locked architectural decision (architecture.md line 113: *"Money as integer cents and dates as ISO strings — type-level discipline throughout the stack; no floats"*). The BA decisions doc reinforces this in Decision §6 + anti-pattern §"Do NOT change the money storage to floats".

2. **Integer-string parsing, not `parseFloat * 100`.** `parseFloat("25.50") * 100` returns `2549.9999999996`. Across thousands of bookings + Phase 2 refund/fee math, that's silent revenue drift. Use integer math: split the input string on `.`, validate each side as an integer, combine. The float trap is documented in BA Decisions §6 and forbidden in BA anti-pattern §"Do NOT use parseFloat(input) * 100".

3. **`centsToDollars()` ≠ `formatCents()`.** Two distinct functions with non-overlapping responsibilities:
   - `centsToDollars(2500)` → `"25.00"` (for HTML input population — no dollar sign).
   - `formatCents(2500)` → `"$25.00"` (for display in body text — with dollar sign).
   They live in different files on purpose. `formatCents` stays in `src/lib/format.ts` (general formatting), `centsToDollars`/`dollarsToCents` go in `src/lib/money.ts` (money math). Phase 2 will add `centsToMoney`, `applyPercentage`, etc. to `money.ts`.

4. **Input field name change: `dailyPriceCents` → `dailyPriceDollars` (LOCKED by BA).** Honest naming at every layer: form field = what the user types (dollars); DB column = how it's stored (cents); the validation schema is the rename seam. The post-parse output type `CreateDeskInput` / `EditDeskInput` keeps `dailyPriceCents: number` so the query layer is untouched. This establishes the pattern Phase 2 money fields will follow (e.g., a future refund form sends `refundAmountDollars`, the schema renames to `refundAmountCents` for storage).

5. **Validation lives in the schema, not the helper.** `dollarsToCents` parses syntax (is this a valid dollar string?). The Zod schema applies business rules ($1 min, $9999.99 max, ≤ 2 decimals). Keeping them separate means the helper is reusable in non-form contexts (Phase 2 receipt parsing, etc.) without baking in form-specific business rules.

6. **Existing tests need surgical edits, not wholesale rewrites.** `desk.test.ts` has 13 tests today. Most are still valid after the schema change (label trim, required, etc.). The three cents-era tests (`accepts 0`, `rejects negative`, `rejects non-integer`) need updates per AC-9. The other ten stay intact.

7. **No data migration.** Existing seeded desks live in cents in the DB. The display layer (`centsToDollars` at form-render time) handles conversion. Locked in BA Decisions §5 + §8.

8. **Specific error messages per the BA doc — copy verbatim.** The four messages in AC-2 are locked. Do NOT paraphrase. They're load-bearing for both UX consistency and future i18n keying.

9. **Single-form scope.** The BA doc explicitly notes a shared `<MoneyInput>` component is optional. With only two callers (`add-desk-form.tsx` + `edit-desk-form.tsx`) the inline approach is cleaner. Phase 2 can extract a component if the pattern repeats 3+ times.

10. **Memory entry is part of the deliverable.** BA Decisions §"Memory note for Phase 2" explicitly asks for it. After Phase 2 starts touching refunds / fees / payouts, the next agent must find `src/lib/money.ts` quickly. Add to `MEMORY.md` index as a `reference` type pointing to the file.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` needs Epic 6 block. Add after `epic-5-retrospective`:

```yaml
  # ─────────────────────────────────────────────────────────────────
  # Epic 6 — Phase 1 Polish (synthetic, post-Epic-5)
  # Source: docs/phase2-framing-and-polish-backlog.md items 6-1 → 6-3
  # ─────────────────────────────────────────────────────────────────
  epic-6: in-progress
  6-1-price-input-dollars: ready-for-dev
  6-2-hide-my-bookings-from-admin: backlog
  6-3-booking-confirmation-toast: backlog
  epic-6-retrospective: optional
```

Update the `last_updated` parenthetical at top of the file.

### Recent commits

```
552c05d docs: fill commit hash in Story 5-2 Change Log + record BA greenlight
c5d830a feat: design reskin — admin screens (Story 5-2)             ← Last feature commit
c4b832b docs: fill commit hash in Story 5-1 Change Log + record BA greenlight
adabba7 feat: design reskin — public screens (Story 5-1)
0583a43 feat: admin reject booking (US-4.3)
1180df6 feat: admin confirm booking (US-4.2)
559011c feat: admin view all bookings (US-4.1)
...
```

Story 6.1 is the **first Phase 1 polish commit**. Subject: `feat: desk price input accepts dollars, stores cents (Story 6-1)`.

### References

- [Source: docs/design/6-1-price-input-dollars-ba-decisions.md](docs/design/6-1-price-input-dollars-ba-decisions.md) — BA decisions document (this story's source of truth).
- [Source: docs/phase2-framing-and-polish-backlog.md §6-1](docs/phase2-framing-and-polish-backlog.md) — original polish item framing.
- [Source: _bmad-output/planning-artifacts/architecture.md, lines 40, 113, 308–311](_bmad-output/planning-artifacts/architecture.md) — locked "money as integer cents" architectural decision.
- [Source: deskhive/src/lib/format.ts:5](deskhive/src/lib/format.ts) — existing `formatCents()` display formatter (NOT modified by this story).
- [Source: deskhive/src/lib/validation/desk.ts](deskhive/src/lib/validation/desk.ts) — existing schema being refactored.
- [Source: deskhive/src/actions/desk.ts](deskhive/src/actions/desk.ts) — Server Actions being wired through the new helper.
- [Source: deskhive/src/app/admin/spaces/[id]/add-desk-form.tsx](deskhive/src/app/admin/spaces/[id]/add-desk-form.tsx) + [edit-desk-form.tsx](deskhive/src/app/admin/spaces/[id]/edit-desk-form.tsx) — form components being updated.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats (read before touching any code).
- [_bmad-output/implementation-artifacts/5-2-design-reskin-admin-screens.md] — Story 5.2 implementation artifact (template + commit/follow-up pattern source).
- Dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required reading if any bulk file rewrites happen on this Russian-locale Windows machine.

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

No surprises. All five CI checks (typecheck / lint / test / build / test:e2e) passed first try after each task. No mojibake incidents (no bulk PowerShell rewrites — all edits via Read/Edit/Write tools, which handle UTF-8 correctly via the harness).

### Completion Notes List

**Zod input→output rename pattern (the load-bearing template for Phase 2 money fields):**

The schema uses a **top-level `.transform()`** on the object to rename `dailyPriceDollars` → `dailyPriceCents` at the seam. The field-level `.superRefine() + .transform()` does the `string → number` conversion + business-rule validation; the object-level `.transform()` does the key rename.

```ts
const dailyPriceDollarsField = z
  .string({ required_error: PRICE_MESSAGES.REQUIRED, invalid_type_error: PRICE_MESSAGES.REQUIRED })
  .trim()
  .min(1, PRICE_MESSAGES.REQUIRED)
  .superRefine((s, ctx) => { /* call dollarsToCents, map reason → AC-2 message via ctx.addIssue */ })
  .transform((s) => (dollarsToCents(s) as { ok: true; cents: number }).cents);

export const createDeskSchema = z
  .object({
    label: z.string().trim().min(1, 'Label is required'),
    dailyPriceDollars: dailyPriceDollarsField, // INPUT key
  })
  .transform(({ label, dailyPriceDollars }) => ({
    label,
    dailyPriceCents: dailyPriceDollars, // RENAMED at the seam; value is already cents
  }));
```

**Important Zod gotcha:** because the schema ends with a top-level `.transform()`, the returned type is `ZodEffects` rather than `ZodObject`. You **cannot** use `.extend()` on it. For `editDeskSchema` I had to rebuild the inner object inline instead of `.extend({ isActive })`. Phase 2 helpers that need multiple variants (create / edit / partial-edit) of the same money-bearing schema should plan for inline rebuilds.

**`PRICE_MESSAGES` is exported from `src/lib/validation/desk.ts`** so the tests (`desk.test.ts`) can reference the constants instead of duplicating literal strings. Phase 2 i18n work can swap the constants without touching test logic.

**Mid-execution decisions vs. story doc:**

1. **Helper text only on the add-desk form, not the edit-desk form.** AC-5's bullet list said both forms get `<p className="field-help">In USD. Example: 25 or 25.50</p>`. But the edit-desk form lives inside a `.desk-admin-row` grid (Story 5-2's layout), where each desk is one horizontal line — there's no vertical space for help text below the price input without breaking the grid or making the desks list twice as tall. The add-desk form has comfortable column space and shows the helper. The edit form keeps the placeholder `25.00` + `aria-label="Daily price"`, which suffices for an admin editing an existing row (they've already seen the format on add). Documented as a deliberate deviation; trivially reversible if BA wants it.
2. **Trailing-dot input rejected.** AC-8 noted "dev-agent picks one; document choice." I picked **reject** — `dollarsToCents("25.")` returns `{ ok: false, reason: 'invalid' }`. Rationale: forces the admin to type something unambiguous. The regex `^(0|[1-9][0-9]{0,4})(?:\.([0-9]{1,2}))?$` rejects the trailing dot naturally.
3. **Negative input surfaces as `INVALID_FORMAT`, not `BELOW_MIN`.** `dollarsToCents("-5")` returns `{ ok: false, reason: 'invalid' }` (the regex rejects the leading minus). The `BELOW_MIN` check only runs on successfully-parsed values. The error message admins see for `-5` is `Enter a valid price in dollars (example: 25.50)`, not `Price must be at least $1.00`. This matches BA Decisions §4's "non-numeric" rule (negatives can't be a "valid price in dollars" because the sign isn't allowed).
4. **Bundled bonus: regex caps whole part at 5 digits (99999).** The schema's `ABOVE_MAX` check then enforces the tighter $9999.99 cap. Two-layer defense: the regex rejects `100000` syntactically before validation runs, and `10000.00` gets rejected at the bounds check. Both produce verbatim messages.

**Implementation observations worth carrying forward:**

1. **`centsToDollars()` deliberately doesn't prepend `$`.** It's for HTML `<input>` value population (where the user types numbers, not signs). `formatCents()` in `src/lib/format.ts` is still the display formatter (`$25.00`). Two functions, one responsibility each — Phase 2 receipts / emails / invoice lines will use `formatCents()`; Phase 2 refund forms will use `centsToDollars()`.
2. **`src/lib/money.test.ts` has 43 tests** including 3 explicit float-trap regression cases (`"25.50" → 2550`, `"0.10" → 10`, `"0.20" → 20`) plus 8 round-trip invariants. These are the load-bearing guards. **Do NOT remove** the float-trap section in any future refactor.
3. **No data migration needed.** Existing seeded desks have integer cents; the display layer (`centsToDollars` at form-render time) handles conversion. Round-trip is idempotent — opening an unchanged desk and re-saving stores the same cents value.
4. **Query layer (`createDesk` / `updateDesk` in `db/queries/desks.ts`) is unchanged.** The schema's `.transform()` produces the same `CreateDeskInput.dailyPriceCents: number` output type, so the queries don't notice the input layer changed.
5. **No regression in any verbatim error message.** The DUPLICATE_LABEL message (`'A desk with that label already exists in this space'`, locked since US-2.3 follow-up `12bee8b`) still surfaces correctly — only the dailyPrice-field error keys/messages changed.
6. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, `revalidatePath` for desk writes, redirect-after-try-catch in Server Actions, layout-level `/admin/*` guard, sort order. Story 5.1 / 5.2 visual treatments preserved.

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean (no escapes needed this story).
- `pnpm test` — 148 passed + 1 skipped (was 97; +43 from `money.test.ts`, +8 net from `desk.test.ts` boundary additions).
- `pnpm build` — clean. Route count unchanged at 28.
- `pnpm test:e2e` — 31/31 passed in 9.6s.

### File List

**New (2):**
- `deskhive/src/lib/money.ts` — `dollarsToCents` / `centsToDollars` with integer-string parsing. Source of truth for all Phase 1+ money math.
- `deskhive/src/lib/money.test.ts` — 43 tests including the float-trap regression block.

**Modified (4):**
- `deskhive/src/lib/validation/desk.ts` — Zod schema rebuilt to take `dailyPriceDollars: string` input and rename to `dailyPriceCents: number` output via field-level `.superRefine().transform()` + object-level `.transform()`. Exports `PRICE_MESSAGES` for test reuse.
- `deskhive/src/lib/validation/desk.test.ts` — Per AC-9: deleted the "$0 accepted" test, reframed two cents-era tests, added 7 boundary tests + 2 cross-validation cases for editDeskSchema. Now 21 tests (was 13).
- `deskhive/src/actions/desk.ts` — `formData.get('dailyPriceCents')` → `formData.get('dailyPriceDollars')` in both `createDeskAction` and `editDeskAction`. All other behavior (guards, DUPLICATE_LABEL mapping, revalidatePath, INTERNAL_ERROR fallback) preserved byte-for-byte.
- `deskhive/src/app/admin/spaces/[id]/add-desk-form.tsx` — Input renamed `name="dailyPriceDollars"`, type `text` w/ `inputMode="decimal"` + pattern, placeholder `25.00`, helper text. Field-error key `dailyPriceDollars`.
- `deskhive/src/app/admin/spaces/[id]/edit-desk-form.tsx` — Input renamed; `defaultValue={centsToDollars(desk.dailyPriceCents)}` populates the input with formatted dollars. Cents preview (the prior `cents · $X.XX` span) deleted.

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `6-1-price-input-dollars: ready-for-dev` → `review`; `last_updated` parenthetical updated.
- `_bmad-output/implementation-artifacts/6-1-price-input-dollars.md` — Status / tasks / Dev Agent Record / Change Log (this file).

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- `reference_money_math_helpers.md` — flags `src/lib/money.ts` as canonical money seam for Phase 2 reuse (per AC-12).
- `MEMORY.md` — index updated.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-12 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-12 | BA locked the rename direction (input `dailyPriceDollars` → output `dailyPriceCents`) before dev-story dispatch. | (none) |
| 2026-05-12 | Story implemented; dollars input landed. Single commit per AC-12. | (filled by a small follow-up commit after push, once the hash is stable — same pattern as Stories 5.1 / 5.2) |
