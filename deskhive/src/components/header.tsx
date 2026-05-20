import Link from 'next/link';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/config';
import { effectiveMode } from '@/lib/mode';
import { UserPill } from './user-pill';

// Site header — sticky, audience-aware.
//
// Variants (Story 7-1 introduces #4 and reframes #3):
//
//   1. Public (logged out):
//      logo + "Browse spaces" + "Log in" + "Sign up" (primary)
//      NB: "How it works" omitted — destination is Phase 2 marketing landing.
//
//   2. Guest (role === 'GUEST'):
//      logo + "Browse spaces" + "My bookings" + <UserPill> (Log out)
//
//   3. SPACE_OWNER in Guest mode:
//      logo + "Browse spaces" + "My bookings" + <UserPill> (Switch to hosting + Log out)
//
//   4. SPACE_OWNER in Host mode:
//      logo + "Dashboard" + "My spaces" + "Bookings" + "Payouts" + "Settings" + <UserPill> (Switch to traveling + Log out)
//      Host nav targets: /owner, /owner/spaces, /owner/bookings, /owner/payouts, /owner/settings.
//      Settings lives at /owner/settings — Story 9-2's Stripe Connect onboarding surface.
//      Payouts added in Story 9-7 — PRD §4.7 order: Dashboard + My spaces +
//      Bookings + Payouts (Settings is post-9-2 addition, placed after Payouts
//      to preserve the PRD §4.7 relative ordering of the four PRD-mentioned items).
//
//   5. SUPER_ADMIN (role === 'SUPER_ADMIN'):
//      logo + "Browse spaces" + "Admin" + <UserPill> (Log out — no mode switch)
//      "My bookings" hidden per Story 6-2 (admins operate, don't book).
//      No Host mode for admins (BA Decision §3 — they have /admin/* chrome).
//
// `await auth.api.getSession({ headers: await headers() })` is the canonical
// session-read pattern from US-1.3. `effectiveMode(session)` validates the
// deskhive_mode cookie against the session role so a stale Host-mode cookie
// held by a non-SPACE_OWNER falls back to Guest mode cleanly.
export async function Header() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  const role = (user as { role?: string } | undefined)?.role;
  const mode = await effectiveMode(session);

  const displayName = user
    ? typeof user.name === 'string' && user.name.trim().length > 0
      ? user.name
      : user.email
    : '';
  const email = user?.email ?? '';
  const initial = displayName.trim().charAt(0).toUpperCase() || '·';

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="logo">
          <span className="logo-mark" aria-hidden="true">
            <span className="logo-dot" />
          </span>
          <span>DeskHive</span>
        </Link>

        <nav className="flex items-center gap-1">
          {!user ? (
            // Variant 1 — Public
            <>
              <Link href="/" className="nav-link">
                Browse spaces
              </Link>
              <span className="nav-divider" aria-hidden="true" />
              <Link href="/login" className="nav-link">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </>
          ) : role === 'SPACE_OWNER' && mode === 'host' ? (
            // Variant 4 — SPACE_OWNER in Host mode
            <>
              {/* DESIGN-INT-17 — visual mode-pill makes the active mode
                  unmistakable on the host-nav surface. Uses .mode-pill +
                  .mode-pill.mode-host indigo treatment from DESIGN-1. */}
              <span
                className="mode-pill mode-host"
                aria-hidden="true"
                style={{ marginRight: '0.5rem' }}
              >
                <span className="dot" />
                Hosting
              </span>
              <Link href="/owner" className="nav-link">
                Dashboard
              </Link>
              <Link href="/owner/spaces" className="nav-link">
                My spaces
              </Link>
              <Link href="/owner/bookings" className="nav-link">
                Bookings
              </Link>
              <Link href="/owner/payouts" className="nav-link">
                Payouts
              </Link>
              <Link href="/owner/settings" className="nav-link">
                Settings
              </Link>
              <span className="nav-divider" aria-hidden="true" />
              <UserPill
                displayName={displayName}
                email={email}
                initial={initial}
                role={role}
                mode={mode}
              />
            </>
          ) : role === 'SUPER_ADMIN' ? (
            // Variant 5 — SUPER_ADMIN
            <>
              {/* DESIGN-INT-17 — black mode-pill marks admin role on every
                  page (.mode-pill default treatment from Story 5-2). */}
              <span
                className="mode-pill"
                aria-hidden="true"
                style={{ marginRight: '0.5rem' }}
              >
                <span className="dot" />
                Admin
              </span>
              <Link href="/" className="nav-link">
                Browse spaces
              </Link>
              <Link href="/admin/spaces" className="nav-link">
                Admin
              </Link>
              <span className="nav-divider" aria-hidden="true" />
              <UserPill
                displayName={displayName}
                email={email}
                initial={initial}
                role={role}
                mode={mode}
              />
            </>
          ) : (
            // Variants 2 + 3 — Guest user, or SPACE_OWNER in Guest mode
            <>
              <Link href="/" className="nav-link">
                Browse spaces
              </Link>
              <Link href="/my-bookings" className="nav-link">
                My bookings
              </Link>
              <span className="nav-divider" aria-hidden="true" />
              <UserPill
                displayName={displayName}
                email={email}
                initial={initial}
                role={role ?? 'GUEST'}
                mode={mode}
              />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
