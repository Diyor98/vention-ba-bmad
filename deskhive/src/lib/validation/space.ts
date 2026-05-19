import { z } from 'zod';
import { AMENITY_SLUGS } from '@/db/schema';

// Story DESIGN-2: amenity slugs validated as a closed set + dedup'd.
// Default to [] so existing forms that don't send the field still pass.
const amenitySchema = z
  .array(z.enum(AMENITY_SLUGS as unknown as [string, ...string[]]))
  .default([])
  .transform((arr) => Array.from(new Set(arr)));

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
  amenities: amenitySchema,
});

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
