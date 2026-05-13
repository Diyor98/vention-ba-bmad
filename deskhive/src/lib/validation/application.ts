import { z } from 'zod';

// Story 7-2: Become-a-Space-Owner application form input.
//
// The four user-supplied fields per BA Decisions §1. `motivation` is the
// only optional field; the action layer normalizes empty/whitespace
// strings to `null` before insert.
//
// Tax ID format intentionally NOT validated (varies per country — admin
// reviews manually). Business address is multi-line free text.
export const createApplicationSchema = z.object({
  businessName: z
    .string({
      required_error: 'Business name is required',
      invalid_type_error: 'Business name is required',
    })
    .trim()
    .min(1, 'Business name is required'),
  businessAddress: z
    .string({
      required_error: 'Business address is required',
      invalid_type_error: 'Business address is required',
    })
    .trim()
    .min(1, 'Business address is required'),
  taxId: z
    .string({
      required_error: 'Tax ID is required',
      invalid_type_error: 'Tax ID is required',
    })
    .trim()
    .min(1, 'Tax ID is required'),
  motivation: z
    .string()
    .trim()
    .max(1000, 'Motivation must be at most 1000 characters')
    .optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
