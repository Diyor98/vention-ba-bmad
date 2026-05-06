import { z } from 'zod';

// FormData values are strings (or null for missing fields). The pipe pattern
// first asserts a non-empty string, then coerces to a number for the integer/
// nonnegative checks. Without the leading string check, an empty input would
// coerce to 0 and pass — which is a different error semantic than "required".
export const createDeskSchema = z.object({
  label: z.string().trim().min(1, 'Label is required'),
  dailyPriceCents: z
    .string({
      required_error: 'Daily price is required',
      invalid_type_error: 'Daily price is required',
    })
    .min(1, 'Daily price is required')
    .pipe(
      z.coerce
        .number({ invalid_type_error: 'Daily price must be a number' })
        .int('Daily price must be an integer')
        .nonnegative('Daily price must be ≥ 0'),
    ),
});

export type CreateDeskInput = z.infer<typeof createDeskSchema>;

// Edit reuses create's fields and adds isActive. The action layer pre-converts
// the FormData checkbox value ('on' | null) to a real boolean before passing
// to Zod, so plain z.boolean() is correct here — z.coerce.boolean() would
// treat the string 'false' as truthy.
export const editDeskSchema = createDeskSchema.extend({
  isActive: z.boolean({
    required_error: 'Active flag is required',
    invalid_type_error: 'Active flag must be a boolean',
  }),
});

export type EditDeskInput = z.infer<typeof editDeskSchema>;
