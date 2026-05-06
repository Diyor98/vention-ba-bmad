import { z } from 'zod';

// Past-date check NOT in this schema — done in the action layer where the
// PRD-verbatim message ("Booking date cannot be in the past") is owned.
// spaceId NOT in the schema either — derived from the desk lookup.
export const createBookingSchema = z.object({
  deskId: z.string().uuid('Invalid desk id'),
  bookingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
