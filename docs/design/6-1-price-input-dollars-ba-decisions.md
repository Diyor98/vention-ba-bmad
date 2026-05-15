# Story 6-1: Price Input Accepts Dollars, Stores Cents — BA Decisions

**Story:** 6-1
**Epic:** 6 — Phase 1 Polish
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Monday, May 11, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 1 polish backlog item 6-1 in `phase2-framing-and-polish-backlog.md`

---

## Context

Phase 1 stored desk prices as integer cents (locked architectural Decision #6 — money in cents) but exposed the cents unit in the admin desk-edit form. Admins must mentally convert `$25.00` to `2500` when entering a price. This leaks the storage decision into the UX and is friction for the day-to-day admin.

This story changes the **input UX only**. Storage stays in cents. All money math throughout the application continues to use integer cents.

---

## Scope

**In scope:**
- The desk price input on `/admin/spaces/[id]` (where Super Admin adds or edits desks within a space)
- The label, placeholder, and helper text for that input
- The Server Action that creates or updates a desk
- A new utility helper for dollar↔cents conversion
- Display of existing desk prices in the input (existing cents value converted to dollars for display)

**Out of scope:**
- Display of prices elsewhere in the app (already shows `$25.00` correctly via existing formatter — no change needed)
- Database schema changes (none — storage stays cents)
- Booking price snapshot logic (unchanged — already uses the desk's stored cents at booking time)
- Phase 1 polish item 6-5 (price-in-dollars display clarification) — separate item, awaiting manager input

---

## Decisions

### Decision 1: Input field format

Input accepts dollars with optional decimals.

- Valid input: `25`, `25.00`, `25.50`, `25.99`, `1.00`
- Invalid input: `25.999` (more than 2 decimal places), negative values, zero, non-numeric
- Single input field (not separate dollars / cents fields)

### Decision 2: Label, placeholder, helper text

- **Label:** `Daily price`
- **Placeholder:** `25.00`
- **Helper text below the input:** `In USD. Example: 25 or 25.50`

The word "cents" is removed from the visible UI entirely.

### Decision 3: Cents preview removed

The current form shows both the cents value in the input AND a `cents · $50.00` preview to the right. The preview is removed entirely. With dollar input, the preview is redundant. Admins do not need to see the cents storage value.

### Decision 4: Validation rules

Server-side and client-side validation must match:

- **Minimum:** $1.00 (`100` cents). Coworking desks priced below $1/day are not realistic and likely a typo.
- **Maximum:** $9999.99 (`999999` cents). Sanity upper bound; can be relaxed later if needed.
- **Decimal places:** Maximum 2. Reject `25.999`.
- **Negative or zero:** Reject.
- **Non-numeric:** Reject.

Error messages should be specific:
- Below minimum: `Price must be at least $1.00`
- Above maximum: `Price must be at most $9999.99`
- Too many decimals: `Price can have at most 2 decimal places`
- Invalid format: `Enter a valid price in dollars (example: 25.50)`

### Decision 5: Backward compatibility — existing data

Existing desks have prices stored in cents (e.g., Desk-2 at Space Miami = `2500` cents = `$25.00`). When the admin opens the edit form for an existing desk:

- The cents value must be converted to dollars for display in the input
- `2500` cents → input shows `25.00`
- The format is always 2 decimal places when populating the input from stored cents

This is an implementation detail, not a UX choice. Mentioned here so the dev story includes it.

### Decision 6: Dollar↔cents conversion helper

A small utility helper must be created (or extended if one exists) for clean conversion in both directions. Suggested location: `src/lib/money.ts` (new file or existing).

- `dollarsToCents(input: string): number` — parses a user-input dollar string (e.g., `"25.50"`) to cents (`2550`). Returns `null` or throws on invalid input.
- `centsToDollars(cents: number): string` — formats stored cents (e.g., `2500`) to a dollar string for input population (`"25.00"`). Always 2 decimal places.

These helpers must handle floating-point safely. Use integer math, not `parseFloat * 100`:
- `dollarsToCents("25.50")` should not return `2549.999999...` due to float imprecision
- Recommended pattern: parse the string into integer and decimal parts separately, validate, then combine: `cents = dollars * 100 + decimals (padded to 2 digits)`

This is the foundation Phase 2 will extend for refunds, payouts, and currency math. Worth getting right now.

### Decision 7: Form submission flow

When admin submits the form:
1. Client-side validation runs first (immediate feedback, no server round-trip on obvious errors)
2. Dollar string is sent to the Server Action as a string (NOT pre-converted to cents on the client — server is the source of truth)
3. Server Action validates again (defense in depth) and converts to cents via `dollarsToCents`
4. Cents value is stored in the database as before

The Server Action signature does NOT change in terms of database interaction. Only the input parsing layer changes.

### Decision 8: Existing desk seed data — no migration needed

The seeded desks in the database stay in cents. No data migration. The display layer handles conversion at form-render time.

### Decision 9: Test coverage required

The dev story should include:
- Unit tests for `dollarsToCents` and `centsToDollars` (especially edge cases: `25`, `25.5`, `25.50`, `0.99`, `1`, invalid strings, floating-point traps)
- Validation tests for boundary values ($0.99 rejected, $1.00 accepted, $9999.99 accepted, $10000 rejected)
- An end-to-end test (or browser verification step) for: load existing desk → input shows `25.00` → change to `30.50` → submit → database stores `3050` cents → reload form → input shows `30.50`

---

## Architectural anti-patterns forbidden

- **Do NOT** change the money storage to floats or dollars. Storage remains integer cents per Decision #6.
- **Do NOT** use `parseFloat(input) * 100` for conversion. Floating-point math will return values like `2549.9999999996` for `"25.50"`. Use integer string parsing.
- **Do NOT** add a separate "currency" field or any multi-currency assumption. USD only. Multi-currency is explicitly out of scope.
- **Do NOT** silently swallow validation errors. Surface specific error messages to the admin.
- **Do NOT** modify the existing `$25.00` display formatter used elsewhere in the app. That formatter already takes cents and produces a dollar string — no change needed there.

---

## Browser verification checklist

After Amelia completes the dev story, BA verifies in browser before greenlight:

1. **Load existing desk for edit** — open `/admin/spaces/[space-id]` for Space Miami → Desk-2 row → input field shows `25.00` (not `2500`)
2. **Label and helper text** — label reads `Daily price`, placeholder shows `25.00`, helper text below reads `In USD. Example: 25 or 25.50`
3. **Cents preview removed** — no `cents · $50.00` text visible anywhere near the input
4. **Valid edit round-trip** — change Desk-2 price to `30.50` → save → page reloads, input shows `30.50` → check Browse → Space Miami → Desk-2 displays `$30.50 / day`
5. **Add new desk** — add a new desk with price `15` (no decimals) → save → input on reload shows `15.00`, browse page shows `$15.00 / day`
6. **Validation: below minimum** — try price `0.50` → form rejects with `Price must be at least $1.00`, no submission
7. **Validation: above maximum** — try price `10000` → form rejects with `Price must be at most $9999.99`
8. **Validation: too many decimals** — try price `25.999` → form rejects with `Price can have at most 2 decimal places`
9. **Validation: negative** — try price `-5` → form rejects
10. **Validation: non-numeric** — try price `abc` → form rejects
11. **Existing booking prices unchanged** — open My Bookings on a guest account → existing bookings still show their original prices (price snapshot at booking time, not affected by desk price edits)
12. **Footer still reads `© 2026 DeskHive`** — no regression from Stories 5-1 / 5-2 mojibake fix

---

## Files likely touched

This is an estimate for context, not a directive. Dev story may discover additional files.

- `src/app/(admin)/admin/spaces/[id]/page.tsx` or related form component — the desk edit form UI
- `src/app/(admin)/admin/spaces/[id]/actions.ts` — Server Action for desk create/update
- `src/lib/money.ts` — new file for `dollarsToCents` / `centsToDollars`
- `src/lib/money.test.ts` — unit tests for the conversion helpers
- `src/components/...` — possibly a shared `MoneyInput` component if pattern is reused; not required, single-form change is acceptable

---

## Memory note for Phase 2

This story establishes the dollar↔cents conversion pattern that Phase 2 will extend for:
- Refund amounts (partial refunds calculated in cents)
- Platform fees (percentage calculated against cents amounts)
- Owner payouts (gross minus fee, in cents)
- Receipt formatting (cents → formatted dollar string for emails)

Amelia should add a MEMORY.md note flagging `src/lib/money.ts` as the source of truth for all money math, so Phase 2 work extends rather than duplicates.

---

**End of BA decisions document.**
