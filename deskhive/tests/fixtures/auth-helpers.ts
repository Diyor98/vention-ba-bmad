/**
 * Story 7-PREP-1: Better Auth session creation for Playwright E2E.
 *
 * Imports the production `auth` instance directly (same import path the
 * seed script uses) and calls `auth.api.signInEmail` server-side to
 * mint a real Better Auth session. The resulting Set-Cookie headers are
 * parsed and returned in Playwright's `addCookies` shape so a browser
 * context can be pre-authenticated without ever filling the /login form
 * or hitting a backdoor route.
 *
 * AC-2 bounded exception: scripts/seed.ts gains ONE new GUEST user
 * (`guest@deskhive.local`) in this story; otherwise the seed is
 * unchanged. The credentials map below pins the exact strings the seed
 * inserts.
 */

import { auth } from '@/lib/auth/config';

/**
 * Pinned seed-user credentials. Maps email → password. Tests never pass
 * passwords; the fixture looks them up by role or email.
 *
 * Decision §10 exception (Story 7-PREP-1 BA pre-dispatch lock): the
 * `guest@deskhive.local` entry is the one new seed user this story
 * adds. The four applicants + admin + owner are pre-existing.
 */
export const SEED_CREDENTIALS = {
  'admin@deskhive.local': 'SuperAdmin1!',
  'owner@deskhive.local': 'SpaceOwner1!',
  // Story 7-PREP-1 bounded AC-2 seed addition. Bumped from BA pre-
  // dispatch `Guest1!` (7 chars) to `GuestPass1!` (11 chars) to
  // satisfy Better Auth's 8-char minimum + our own register validation
  // (src/lib/validation/auth.ts:9).
  'guest@deskhive.local': 'GuestPass1!',
  // Story 9-2b: second bounded-exception seed user (SPACE_OWNER without a
  // Connect row) — gated-publish E2E target. BA Decision §5.
  'owner-no-connect@deskhive.local': 'OwnerNoConnect1!',
  'applicant1@deskhive.local': 'Applicant1!',
  'applicant2@deskhive.local': 'Applicant2!',
  'applicant3@deskhive.local': 'Applicant3!',
  'applicant4@deskhive.local': 'Applicant4!',
} as const satisfies Record<string, string>;

export type SeedEmail = keyof typeof SEED_CREDENTIALS;

/**
 * Role shorthand → email mapping (AC-1 locked role-mapping table).
 *
 * NB on 'fresh-owner': BA Decision §1 named `ihtiyor@mail.com` (created
 * manually during the Story 7-4 BA browser walk; NOT in the seed). The
 * seeded equivalent is applicant3 — SPACE_OWNER via Story 7-4's
 * APPROVED-application atomic promotion, owns zero spaces (Story 7-5
 * only assigned a seeded space to owner@deskhive.local). Memory entry
 * codifies the alignment.
 */
export const ROLE_EMAIL: Record<
  'guest' | 'owner' | 'admin' | 'fresh-owner' | 'owner-no-connect',
  SeedEmail
> = {
  guest: 'guest@deskhive.local',
  owner: 'owner@deskhive.local',
  admin: 'admin@deskhive.local',
  'fresh-owner': 'applicant3@deskhive.local',
  // Story 9-2b: SPACE_OWNER without a `stripe_connect_accounts` row.
  // Gated-publish E2E target — Publish button is disabled for this user.
  'owner-no-connect': 'owner-no-connect@deskhive.local',
} as const;

export type AuthRole = keyof typeof ROLE_EMAIL;

/**
 * Playwright cookie shape (subset). Matches the `Cookie` type expected
 * by `BrowserContext.addCookies(...)`.
 */
export type PlaywrightCookie = {
  name: string;
  value: string;
  url: string;
};

/**
 * Resolves a role shorthand or `{ email }` payload to a seeded email.
 * Throws if the email isn't in SEED_CREDENTIALS — prevents tests from
 * accidentally targeting users that aren't in the seed (which would
 * need a seed expansion, out of scope beyond the AC-2 exception).
 */
export function resolveEmail(role: AuthRole | { email: string }): SeedEmail {
  if (typeof role === 'string') {
    return ROLE_EMAIL[role];
  }
  if (!(role.email in SEED_CREDENTIALS)) {
    throw new Error(
      `Cannot create session for non-seed user: ${role.email}. ` +
        `Add it to SEED_CREDENTIALS (and scripts/seed.ts) or use one of the seeded users.`,
    );
  }
  return role.email as SeedEmail;
}

/**
 * Calls Better Auth's server-side signInEmail and returns the resulting
 * session cookies in Playwright's addCookies shape, scoped to the
 * localhost test origin.
 *
 * `asResponse: true` makes the API return a raw `Response` with
 * Set-Cookie headers — same path /api/auth/login uses internally. We
 * forward ALL Set-Cookie headers from the response (Better Auth may set
 * the session token plus a CSRF/state cookie depending on version);
 * scoping all to http://localhost:3000 keeps the browser request side
 * happy without us needing to know each cookie name.
 */
export async function createSessionCookies(
  email: string,
  password: string,
  baseURL = 'http://localhost:3000',
): Promise<PlaywrightCookie[]> {
  let response: Response;
  try {
    response = (await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    })) as unknown as Response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `auth.api.signInEmail threw while creating session for ${email}: ${msg}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `auth.api.signInEmail failed for ${email}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  // Better Auth's response carries Set-Cookie headers. Node's fetch
  // Response exposes them via getSetCookie() (available since Node 19.7).
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length === 0) {
    throw new Error(
      `auth.api.signInEmail returned no Set-Cookie headers for ${email}; cannot create session.`,
    );
  }

  return setCookies.map((cookieStr) => parseSetCookieForPlaywright(cookieStr, baseURL));
}

/**
 * Parses a single `Set-Cookie` header into Playwright's `addCookies`
 * shape. We only need name + value + url for the test browser context
 * to send the cookie on subsequent requests — Playwright infers domain
 * and path from `url`, and HttpOnly/SameSite/Secure attributes don't
 * matter for "would the browser send this on a request" purposes.
 */
function parseSetCookieForPlaywright(
  cookieStr: string,
  baseURL: string,
): PlaywrightCookie {
  const firstSemi = cookieStr.indexOf(';');
  const nameValue = firstSemi === -1 ? cookieStr : cookieStr.substring(0, firstSemi);
  const equalsIdx = nameValue.indexOf('=');
  if (equalsIdx === -1) {
    throw new Error(`Malformed Set-Cookie header: ${cookieStr}`);
  }
  const name = nameValue.substring(0, equalsIdx).trim();
  const value = nameValue.substring(equalsIdx + 1).trim();
  return { name, value, url: baseURL };
}
