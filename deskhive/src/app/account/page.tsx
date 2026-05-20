import { redirect } from 'next/navigation';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { getUserProfileById } from '@/db/queries/users';
import { AccountTabs } from './account-tabs';

/**
 * DESIGN-INT-9 + DESIGN-INT-GAPS-PASS-2 Gap 4 — Account settings.
 *
 * 3-tab interface mirroring prototype DeskHive_Prototype.html
 * lines 1436-1509 (Profile / Payment methods / Notifications).
 *
 * Gap 4 changes vs DESIGN-INT-9:
 *   - Loads the full user profile (image + createdAt) from
 *     usersTable instead of only the session.user subset, so the
 *     Profile tab can render the avatar + "Member since {Month
 *     Year}" subtitle from real DB data.
 *   - Profile tab Full-name field is now editable + wired to a
 *     Server Action (updateProfileAction). See AccountTabs.
 *
 * Server Component reads session + DB; Client Component owns tab
 * state + Save action. Auth flow unchanged: redirect to /login on
 * missing session.
 */
export default async function AccountPage() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) {
      redirect('/login?callbackUrl=/account');
    }
    throw err;
  }

  const profile = await getUserProfileById(String(session.user.id));
  if (!profile) {
    // Session valid but underlying user row missing — defensive
    // bounce to login so the stale session is rebuilt on re-auth.
    redirect('/login?callbackUrl=/account');
  }

  // "Member since {Month Year}" — UTC-normalized so SSR + hydration
  // stay byte-identical (Story 5-2's date-format pattern).
  const memberSince = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(profile.createdAt);

  return (
    <main
      className="container-content"
      style={{ paddingTop: '3rem', paddingBottom: '4rem', maxWidth: '56rem' }}
    >
      <header className="mb-6">
        <h1 className="page-h1" data-testid="account-h1">
          Account settings
        </h1>
        <p
          className="mt-1.5 muted-strong"
          style={{ fontSize: 14 }}
        >
          Manage your profile, payments, and notifications.
        </p>
      </header>

      <AccountTabs
        fullName={profile.fullName}
        email={profile.email}
        image={profile.image}
        memberSince={memberSince}
      />
    </main>
  );
}
