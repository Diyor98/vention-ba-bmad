import { z } from 'zod';
import { dollarsToCents } from '@/lib/money';

// Story 6-1: the form input field is `dailyPriceDollars` (a string the
// admin types — e.g. "25.50"). The schema's OUTPUT renames it to
// `dailyPriceCents: number` so the query layer stays in cents. This rename
// is the seam between honest UX naming and the locked cents storage
// architectural decision (architecture.md line 113).
//
// Validation messages are copied verbatim from
// docs/design/6-1-price-input-dollars-ba-decisions.md §4. Do NOT
// paraphrase — they're load-bearing for UX consistency and future i18n.

// Business rules per BA Decisions §4:
const MIN_CENTS = 100; //   $1.00
const MAX_CENTS = 999_999; // $9999.99

// Message constants — single source of truth, also used by tests.
export const PRICE_MESSAGES = {
  REQUIRED: 'Daily price is required',
  INVALID_FORMAT: 'Enter a valid price in dollars (example: 25.50)',
  TOO_MANY_DECIMALS: 'Price can have at most 2 decimal places',
  BELOW_MIN: 'Price must be at least $1.00',
  ABOVE_MAX: 'Price must be at most $9999.99',
} as const;

// The dollar-string field. Output type after refinement+transform: number
// (cents). superRefine maps the dollarsToCents() error reasons to the
// AC-2 verbatim messages.
const dailyPriceDollarsField = z
  .string({
    required_error: PRICE_MESSAGES.REQUIRED,
    invalid_type_error: PRICE_MESSAGES.REQUIRED,
  })
  .trim()
  .min(1, PRICE_MESSAGES.REQUIRED)
  .superRefine((s, ctx) => {
    const r = dollarsToCents(s);
    if (!r.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          r.reason === 'too_many_decimals'
            ? PRICE_MESSAGES.TOO_MANY_DECIMALS
            : PRICE_MESSAGES.INVALID_FORMAT,
      });
      return;
    }
    if (r.cents < MIN_CENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: PRICE_MESSAGES.BELOW_MIN,
      });
      return;
    }
    if (r.cents > MAX_CENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: PRICE_MESSAGES.ABOVE_MAX,
      });
      return;
    }
  })
  .transform((s) => {
    // superRefine above guarantees this is `{ ok: true; cents: number }`
    // by the time we reach here — zod won't run .transform on a failed
    // parse.
    const r = dollarsToCents(s);
    return (r as { ok: true; cents: number }).cents;
  });

// INPUT shape:  { label: string; dailyPriceDollars: string }
// OUTPUT shape: { label: string; dailyPriceCents: number }
// The top-level .transform() renames the field at the schema seam so
// the query layer (createDesk / updateDesk) sees the cents value under
// the storage-name key, while the form + action see the dollar string
// under the form-name key.
export const createDeskSchema = z
  .object({
    label: z.string().trim().min(1, 'Label is required'),
    dailyPriceDollars: dailyPriceDollarsField, // type after refine+transform: number
  })
  .transform(({ label, dailyPriceDollars }) => ({
    label,
    dailyPriceCents: dailyPriceDollars,
  }));

export type CreateDeskInput = z.infer<typeof createDeskSchema>;

// Edit reuses create's fields plus isActive. Same rename seam.
// We can't use .extend() after the top-level .transform(), so we rebuild
// the base object inline. (Zod's ZodEffects doesn't carry .extend.)
export const editDeskSchema = z
  .object({
    label: z.string().trim().min(1, 'Label is required'),
    dailyPriceDollars: dailyPriceDollarsField,
    isActive: z.boolean({
      required_error: 'Active flag is required',
      invalid_type_error: 'Active flag must be a boolean',
    }),
  })
  .transform(({ label, dailyPriceDollars, isActive }) => ({
    label,
    dailyPriceCents: dailyPriceDollars,
    isActive,
  }));

export type EditDeskInput = z.infer<typeof editDeskSchema>;
