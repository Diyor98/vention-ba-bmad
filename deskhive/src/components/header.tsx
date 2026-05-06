import Link from 'next/link';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/config';
import { LogoutButton } from './logout-button';

export async function Header() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;

  return (
    <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <Link href="/" className="text-lg font-semibold">
        DeskHive
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            <span className="text-gray-700">{user.email}</span>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="text-gray-700 hover:underline">
              Log in
            </Link>
            <Link href="/register" className="text-gray-700 hover:underline">
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
