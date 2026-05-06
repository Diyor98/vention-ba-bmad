import { NextResponse, type NextRequest } from 'next/server';

// Layer 1 of the architecture's three-layer auth: cookie-presence check.
// Renamed from `middleware.ts` per Next.js 16's proxy convention (the old
// filename is deprecated; see `deskhive/AGENTS.md`). The exported function
// is therefore `proxy` (Next 16 looks up either name during the deprecation
// window).
//
// Cookie-presence ≠ valid session. The actual auth check is `requireSession`/
// `requireRole` at the route/page level (Layer 2). This proxy just rejects
// the trivial "no cookie at all" case fast, at the edge.
//
// Better Auth's default session cookie name is `better-auth.session_token`
// (and `__Secure-better-auth.session_token` over HTTPS). We check both
// directly via `request.cookies` rather than `getSessionCookie` from
// `better-auth/cookies`, which has historically had edge-runtime issues.
const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

export function proxy(request: NextRequest) {
  if (!hasSessionCookie(request)) {
    if (request.nextUrl.pathname.startsWith('/api/admin')) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
    if (request.nextUrl.pathname.startsWith('/admin')) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
