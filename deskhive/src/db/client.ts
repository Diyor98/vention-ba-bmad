import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __drizzleClient: DrizzleClient | undefined;
}

function createClient(): DrizzleClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool, { schema });
}

/**
 * Lazy-instantiated Drizzle client. The Proxy defers `createClient()` until the
 * first method call, so tests that import code transitively depending on this
 * module do not require `DATABASE_URL` to be set unless they actually query the DB.
 *
 * In development, the underlying client is stashed on `globalThis` so HMR
 * doesn't churn through Pool instances.
 */
export const db: DrizzleClient = new Proxy({} as DrizzleClient, {
  get(_target, prop) {
    const client =
      globalThis.__drizzleClient ??
      (globalThis.__drizzleClient = createClient());
    if (process.env.NODE_ENV === 'production') {
      // In production we don't want the global stash; clear it after first use.
      const value = client[prop as keyof DrizzleClient];
      return typeof value === 'function' ? value.bind(client) : value;
    }
    const value = client[prop as keyof DrizzleClient];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
