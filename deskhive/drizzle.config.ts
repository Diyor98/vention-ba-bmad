import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://placeholder:placeholder@localhost:5432/placeholder',
  },
  verbose: true,
  strict: true,
});
