import Link from 'next/link';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/config';
import { LogoutButton } from './logout-button';

// Site header — sticky, audience-aware. Story 5-1 reskin.
//
// Public (logged out):  logo + "Browse spaces" + "Log in" + "Sign up" (primary)
//                       NB: "How it works" link from BA Decisions §2 is
//                       intentionally omitted — its destination lives in the
//                       Phase 2 marketing landing.
// Guest (logged in):    logo + "Browse spaces" + "My bookings" + user-pill + "Log out"
// Super Admin:          logo + "Browse spaces" + "My bookings" + "Admin" + user-pill + "Log out"
//
// `await auth.api.getSession({ headers: await headers() })` is the canonical
// session-read pattern from US-1.3. Role check unchanged. The existing
// `<LogoutButton>` Server Action form is reused; only its visual classes
// change.
export async function Header() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  const role = (user as { role?: string } | undefined)?.role;
  const displayName = user
    ? typeof user.name === 'string' && user.name.trim().length > 0
      ? user.name
      : user.email
    : '';
  const initial = displayName.trim().charAt(0).toUpperCase() || '·';

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="logo">
          <span className="logo-mark" aria-hidden="true" />
          <span>DeskHive</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link href="/" className="nav-link">
            Browse spaces
          </Link>

          {user && (
            <Link href="/my-bookings" className="nav-link">
              My bookings
            </Link>
          )}

          {role === 'SUPER_ADMIN' && (
            <Link href="/admin/spaces" className="nav-link">
              Admin
            </Link>
          )}

          <span className="nav-divider" aria-hidden="true" />

          {user ? (
            <>
              <span className="user-pill" aria-label={`Logged in as ${displayName}`}>
                <span className="user-avatar" aria-hidden="true">
                  {initial}
                </span>
                <span className="hidden sm:inline">{displayName}</span>
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="nav-link">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
