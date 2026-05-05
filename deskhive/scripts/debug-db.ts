/**
 * One-shot debug script for the silent db:migrate failure.
 * Run with: pnpm tsx scripts/debug-db.ts
 *
 * Steps:
 *   1. Show what dotenv/config (default) loads from .env
 *   2. Show what explicit .env.local loading produces
 *   3. Try to connect to whatever DATABASE_URL is set, run SELECT 1
 *   4. If connect fails, print the structured Postgres error
 */

import { config as dotenvConfig } from 'dotenv';

console.log('=== Step 1: default dotenv/config (.env only) ===');
import('dotenv/config').then(() => {
  console.log('After dotenv/config:');
  console.log('  DATABASE_URL =', JSON.stringify(process.env.DATABASE_URL));
  console.log('  BETTER_AUTH_SECRET set?:', !!process.env.BETTER_AUTH_SECRET);

  console.log('\n=== Step 2: explicit .env.local load ===');
  const result = dotenvConfig({ path: '.env.local', override: true });
  if (result.error) {
    console.log('  .env.local load error:', result.error.message);
  } else {
    console.log('  .env.local loaded; parsed keys:', Object.keys(result.parsed ?? {}));
  }
  console.log('  DATABASE_URL (after .env.local) =', JSON.stringify(process.env.DATABASE_URL));

  // Mask password for printing
  const url = process.env.DATABASE_URL ?? '';
  const masked = url.replace(/:([^:@]+)@/, ':***@');
  console.log('  Masked URL:', masked);

  console.log('\n=== Step 3: pg connection test ===');
  void runConnTest();
});

async function runConnTest() {
  if (!process.env.DATABASE_URL) {
    console.log('  ✗ DATABASE_URL is not set; cannot test connection');
    process.exit(1);
  }
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const r = await pool.query('SELECT 1 AS one, current_database() AS db, version() AS ver');
    console.log('  ✓ connect succeeded');
    console.log('  Result:', r.rows[0]);
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: string };
    console.log('  ✗ connect failed');
    console.log('  Error message:', e.message);
    console.log('  Error code:', e.code);
    console.log('  Full error keys:', Object.keys(e));
  } finally {
    await pool.end();
  }
}
