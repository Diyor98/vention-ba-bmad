'use server';

import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { effectiveMode } from '@/lib/mode';
import {
  getConnectAccountByUserId,
  upsertConnectAccount,
} from '@/db/queries/stripe-connect';
import {
  createConnectAccount,
  createConnectAccountLink,
  getConnectAccountStatus,
} from '@/lib/payments/connect';

/**
 * Story 9-2: Server Actions for Stripe Connect Express onboarding.
 *
 * Two actions per BA Decision §4:
 *   • initiateConnectOnboardingAction — user-clicks-CTA entry point.
 *     Idempotent re: account creation (per BA Decision §3): looks up
 *     the user's existing `stripe_connect_accounts` row first; only
 *     calls `createConnectAccount` if no row exists. Returns the
 *     Account Link URL for the client to `window.location.assign(...)`.
 *
 *   • refreshConnectStatusAction — user-returns-from-Stripe entry point.
 *     Re-fetches account status from Stripe and persists to the DB row.
 *     Also covers the case where the webhook is delayed/dropped —
 *     polling beats waiting (BA Decision §4 "why these two").
 *
 * Auth shape: both actions REQUIRE the caller be SPACE_OWNER in host
 * mode (effectiveMode === 'host'). Returns `NOT_SPACE_OWNER_HOST` if
 * not. Reading effectiveMode validates the deskhive_mode cookie against
 * the session role (Story 7-1's helper) — no separate cookie-tampering
 * check needed here.
 *
 * Server Action redirect note: `initiateConnectOnboardingAction` does
 * NOT call `redirect(url)` for external URLs. It returns the URL and
 * the client component does `window.location.assign(url)`. Server
 * Actions can't return redirects across the form boundary cleanly when
 * the redirect target is external (Next.js's redirect() throws and is
 * caught by the Server Action framework for internal navigations only).
 */

export type InitiateConnectOnboardingResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

export type RefreshConnectStatusResult =
  | { ok: true; chargesEnabled: boolean; payoutsEnabled: boolean }
  | { ok: false; error: string };

async function getAuthorizedOwnerOrError(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: 'UNAUTHENTICATED' | 'NOT_SPACE_OWNER_HOST' }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: 'UNAUTHENTICATED' };
  const role = (session.user as { role?: string }).role;
  if (role !== 'SPACE_OWNER') return { ok: false, error: 'NOT_SPACE_OWNER_HOST' };
  const mode = await effectiveMode(session);
  if (mode !== 'host') return { ok: false, error: 'NOT_SPACE_OWNER_HOST' };
  return {
    ok: true,
    userId: String(session.user.id),
    email: String(session.user.email),
  };
}

function getAppBaseUrl(): string {
  const raw = process.env.BETTER_AUTH_URL ?? '';
  if (raw && raw.length > 0) return raw.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export async function initiateConnectOnboardingAction(): Promise<InitiateConnectOnboardingResult> {
  const authResult = await getAuthorizedOwnerOrError();
  if (!authResult.ok) return { ok: false, error: authResult.error };
  const { userId, email } = authResult;

  // BA Decision §3 — eager-create, idempotent on retry.
  let stripeAccountId: string;
  const existing = await getConnectAccountByUserId(userId);
  if (existing) {
    stripeAccountId = existing.stripeAccountId;
  } else {
    const created = await createConnectAccount({ userId, email });
    if (!created.ok) return { ok: false, error: created.error };
    stripeAccountId = created.data.stripeAccountId;
    await upsertConnectAccount({ userId, stripeAccountId });
  }

  // Mint a fresh Account Link (always — these are ephemeral and expire).
  const baseUrl = getAppBaseUrl();
  const linkResult = await createConnectAccountLink({
    stripeAccountId,
    returnUrl: `${baseUrl}/owner/settings/onboarding/return`,
    refreshUrl: `${baseUrl}/owner/settings/onboarding/refresh`,
  });
  if (!linkResult.ok) return { ok: false, error: linkResult.error };

  return { ok: true, redirectUrl: linkResult.data.url };
}

export async function refreshConnectStatusAction(): Promise<RefreshConnectStatusResult> {
  const authResult = await getAuthorizedOwnerOrError();
  if (!authResult.ok) return { ok: false, error: authResult.error };
  const { userId } = authResult;

  const row = await getConnectAccountByUserId(userId);
  if (!row) return { ok: false, error: 'NO_CONNECT_ACCOUNT' };

  const statusResult = await getConnectAccountStatus({
    stripeAccountId: row.stripeAccountId,
  });
  if (!statusResult.ok) return { ok: false, error: statusResult.error };

  const { chargesEnabled, payoutsEnabled, onboardingCompleted } =
    statusResult.data;
  await upsertConnectAccount({
    userId,
    stripeAccountId: row.stripeAccountId,
    chargesEnabled,
    payoutsEnabled,
    onboardingCompleted,
  });

  return { ok: true, chargesEnabled, payoutsEnabled };
}
