/**
 * Money math helpers — single source of truth for dollar ↔ cents conversion.
 *
 * Storage layer uses integer cents per the locked architectural decision
 * (architecture.md line 113: "Money as integer cents and dates as ISO
 * strings — type-level discipline throughout the stack; no floats").
 * User-facing forms accept dollar strings (Story 6-1). These helpers are
 * the seam between the two.
 *
 * IMPORTANT — never use `parseFloat(input) * 100`. Floating-point math
 * returns values like 2549.9999999996 for "25.50", which would silently
 * drift across thousands of transactions. Use integer-string parsing.
 *
 * Phase 2 will extend this file with refund/payout/fee math. Keep all
 * money operations here.
 */

/**
 * Result of parsing a user-input dollar string. The discriminated-union
 * shape lets the validation layer pick a precise error message per reason
 * without re-parsing.
 */
export type DollarsParseResult =
  | { ok: true; cents: number }
  | { ok: false; reason: DollarsParseError };

export type DollarsParseError = 'invalid' | 'too_many_decimals';

// Whole part: 1-5 digits (caps dollars at 99999, well above the $9999.99
// business max; the schema enforces the tighter $1..$9999.99 range).
// Fractional part: 1-2 digits, optional.
//
// Matches: "25", "25.5", "25.50", "0.99", "9999.99"
// Rejects: "025" (leading zero on multi-digit whole — but allow "0.99"),
//          "25.999", "-5", "abc", "", "25.", ".5"
const DOLLAR_REGEX = /^(0|[1-9][0-9]{0,4})(?:\.([0-9]{1,2}))?$/;

// A separate, looser regex used ONLY to distinguish "syntactically a number
// with too many decimal places" from "completely unparseable garbage". This
// lets us surface the more specific "max 2 decimals" message per AC-2 instead
// of the generic "invalid format" one.
const TOO_MANY_DECIMALS_REGEX = /^(0|[1-9][0-9]{0,4})\.[0-9]{3,}$/;

/**
 * Parses a user-input dollar string into integer cents.
 *
 * Accepts:
 *   "25"     → 2500
 *   "25.5"   → 2550   (single decimal is interpreted as tens-of-cents)
 *   "25.50"  → 2550   (NOT 2549.999... — integer-string parsing avoids the float trap)
 *   "0.99"   → 99
 *   "1"      → 100
 *   "9999.99"→ 999999
 *
 * Rejects (returns `{ ok: false }`):
 *   "25.999" → { reason: 'too_many_decimals' }
 *   "-5"     → { reason: 'invalid' }
 *   "abc"    → { reason: 'invalid' }
 *   ""       → { reason: 'invalid' }
 *   "25."    → { reason: 'invalid' }
 *   ".5"     → { reason: 'invalid' }
 *
 * Whitespace is trimmed before parsing.
 *
 * NOTE: this helper validates *syntax* only — it doesn't apply business
 * rules like "$1 minimum" or "$9999.99 maximum". Those live in the Zod
 * schema so this helper stays reusable across non-form contexts (Phase 2
 * receipt parsing, admin import tools, etc.).
 */
export function dollarsToCents(input: string): DollarsParseResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: 'invalid' };

  // Distinguish the too-many-decimals case from "completely invalid" so the
  // form can surface the more specific message.
  if (TOO_MANY_DECIMALS_REGEX.test(trimmed)) {
    return { ok: false, reason: 'too_many_decimals' };
  }

  const match = DOLLAR_REGEX.exec(trimmed);
  if (!match) return { ok: false, reason: 'invalid' };

  const wholePart = match[1]; // e.g. "25", "0", "9999"
  const fracPart = match[2]; // e.g. "5", "50", undefined

  // parseInt is safe here — wholePart matched [0-9]{1,5}, fits in Number
  // exactly. No float involved.
  const dollars = parseInt(wholePart, 10);

  // Pad fractional part to 2 digits ("5" → "50") then parse as integer
  // cents. parseInt on "00".."99" is exact.
  const cents = fracPart === undefined ? 0 : parseInt(fracPart.padEnd(2, '0'), 10);

  return { ok: true, cents: dollars * 100 + cents };
}

// Story 9-3: DeskHive's platform fee rate, in basis points.
//
// 1500 bps = 15% per Phase 2 PRD §4.4 FR-PAY-7. Storing the rate as an
// integer in basis points keeps `calculatePlatformFee` integer-only
// (no float multiplication). Phase 2 is a single-fee-rate marketplace;
// the constant lives next to the math. **Phase 3 migration**: when
// per-owner or per-region rates become a real requirement (e.g., a
// `platform_settings` table or env-driven configuration), this constant
// becomes a parameter sourced from the appropriate seam. Until then,
// hardcoding-with-comment matches 9-2's `country: 'US'` pattern.
const PLATFORM_FEE_BPS = 1500;

/**
 * Story 9-3: DeskHive's platform fee on a booking total, in cents.
 *
 * Returns `Math.floor(amountCents * feeBps / 10000)` — toward-zero
 * rounding (BA Decision §2a). Platform never collects more than the
 * nominal 15% of the booking; any sub-cent remainder accrues to the
 * owner payout via `calculateOwnerPayout(amountCents, feeCents) =
 * amountCents - feeCents`.
 *
 * Examples:
 *   calculatePlatformFee(2500)      → 375   (15% of $25.00 = $3.75)
 *   calculatePlatformFee(10000)     → 1500  (15% of $100.00 = $15.00)
 *   calculatePlatformFee(1)         → 0     (Math.floor(0.15) — sub-cent)
 *   calculatePlatformFee(0)         → 0
 *   calculatePlatformFee(333, 1000) → 33    (10% of 333¢)
 *
 * Throws on non-integer or negative input — DB invariants prevent these
 * at runtime, but the typed throw catches regressions in tests / new
 * call sites.
 *
 * The optional `feeBps` parameter exists for forward-compat: Phase 3's
 * per-owner-rate seam will pass a sourced rate; Phase 2 callers omit
 * the argument and get the hardcoded default.
 */
export function calculatePlatformFee(
  amountCents: number,
  feeBps: number = PLATFORM_FEE_BPS,
): number {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(`Invalid amount cents: ${amountCents}`);
  }
  if (!Number.isInteger(feeBps) || feeBps < 0) {
    throw new Error(`Invalid fee bps: ${feeBps}`);
  }
  // Order of operations matters: multiply BEFORE dividing to avoid
  // truncating to zero on small amounts. amountCents and feeBps both
  // fit comfortably in Number's exact-integer range (<2^53) for any
  // realistic Phase 2 booking total.
  return Math.floor((amountCents * feeBps) / 10000);
}

/**
 * Story 9-3: owner payout from a booking total. Derived from
 * `amountCents - feeCents` — no rounding step, so the platform-fee
 * `Math.floor` truncation drift accrues to the owner. Pair with
 * `calculatePlatformFee`: compute fee once, derive payout from it.
 *
 * Throws on non-integer or negative input. Throws if `feeCents >
 * amountCents` (defensive — would yield a negative payout, indicating
 * a caller bug).
 */
export function calculateOwnerPayout(
  amountCents: number,
  feeCents: number,
): number {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(`Invalid amount cents: ${amountCents}`);
  }
  if (!Number.isInteger(feeCents) || feeCents < 0) {
    throw new Error(`Invalid fee cents: ${feeCents}`);
  }
  if (feeCents > amountCents) {
    throw new Error(
      `Fee (${feeCents}) cannot exceed amount (${amountCents})`,
    );
  }
  return amountCents - feeCents;
}

/**
 * Formats integer cents as a dollar string suitable for an HTML input
 * value. Always 2 decimal places.
 *
 *   2500   → "25.00"
 *   3050   → "30.50"
 *   99     → "0.99"
 *   100    → "1.00"
 *   999999 → "9999.99"
 *   1      → "0.01"
 *
 * Distinct from `formatCents()` in `src/lib/format.ts`, which returns
 * "$25.00" (with the dollar sign — for display in body text). This one
 * is for populating an `<input>` field, where the user types the number
 * without a sign.
 *
 * Throws on negative or non-integer input. DB invariants guarantee this
 * won't happen at runtime, but a typed throw catches regressions.
 */
export function centsToDollars(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid cents value: ${cents}`);
  }
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${remainder.toString().padStart(2, '0')}`;
}
