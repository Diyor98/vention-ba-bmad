import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().trim().min(1, 'Full name is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// Login intentionally accepts any non-empty password — no minLength.
// Better Auth's verify() is the single source of truth on login.
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
