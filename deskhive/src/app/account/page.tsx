import { redirect } from 'next/navigation';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { AccountTabs } from './account-tabs';

/**
 * DESIGN-INT-9 — Account settings scaffold (greenfield).
 *
 * 3-tab interface mirroring prototype's Account screen:
 *   • Profile    — name + email (read-only on save; Phase 3 add edit)
 *   • Payment    — Phase 3 scaffold; no stored card data in our schema
 *   • Notifications — Phase 3 scaffold; no settings table yet
 *
 * Server Component reads session + role; Client Component owns tab state.
 * Auth flow follows the rest of the app: redirect to /login on no-session.
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

  const user = session.user;
  const fullName =
    typeof user.name === 'string' && user.name.trim().length > 0
      ? user.name
      : user.email;
  const email = user.email;

  return (
    <main
      className="container-content"
      style={{ paddingTop: '3rem', paddingBottom: '4rem' }}
    >
      <header className="mb-6">
        <h1 className="page-h1">Account settings</h1>
        <p
          className="mt-1.5 muted-strong"
          style={{ fontSize: 14 }}
        >
          Manage your profile, payments, and notifications.
        </p>
      </header>

      <AccountTabs fullName={fullName} email={email} />
    </main>
  );
}
