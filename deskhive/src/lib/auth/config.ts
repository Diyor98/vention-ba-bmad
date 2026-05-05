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
    additionalFields: {
      role: { type: 'string', defaultValue: 'GUEST', input: false },
      fullName: { type: 'string', fieldName: 'full_name' },
      hashedPassword: {
        type: 'string',
        fieldName: 'hashed_password',
        input: false,
        returned: false,
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
