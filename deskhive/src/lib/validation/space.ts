import { z } from 'zod';

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
});

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
