import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import * as argon2 from 'argon2';
import { db } from '@/db/client';
import {
  usersTable,
  accountTable,
  sessionTable,
  verificationTable,
} from '@/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: usersTable,
      account: accountTable,
      session: sessionTable,
      verification: verificationTable,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Our `users.id` column is UUID per Doc B §6.1 (`uuid PRIMARY KEY DEFAULT gen_random_uuid()`).
  // Better Auth's default generateId produces short non-UUID strings, which Postgres rejects
  // with `invalid input syntax for type uuid`. Override with a v4 UUID generator from Node's
  // built-in crypto module (no new deps). Schema stays PRD-faithful.
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: async (password: string) =>
        argon2.hash(password, { type: argon2.argon2id }),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        argon2.verify(hash, password),
    },
  },
  user: {
    // Better Auth's core "name" field lives in our `fullName` property
    // (DB column `full_name` per Doc B §6.1). The Drizzle adapter resolves
    // the value via the schema property name; the column aliasing handles
    // the snake_case mapping at SQL level.
    fields: {
      name: 'fullName',
    },
    additionalFields: {
      // Defaulted to GUEST and input:false so clients cannot self-promote.
      role: { type: 'string', defaultValue: 'GUEST', input: false },
      // Retained per Doc B §6.1 letter-of-spec (BA Decision B.1) but unused
      // by Better Auth — credential hash lives in account.password.
      hashedPassword: {
        type: 'string',
        input: false,
        returned: false,
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
