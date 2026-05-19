import Link from 'next/link';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <main className="container-narrow" style={{ paddingTop: '4rem', paddingBottom: '4rem' }}>
      <div className="mb-6 text-center">
        <h1 className="page-h1">Welcome back</h1>
        <p className="mt-2 muted-strong" style={{ fontSize: '14px' }}>
          Sign in to manage your bookings.
        </p>
      </div>

      <section className="auth-card">
        <LoginForm callbackUrl={callbackUrl} />
      </section>

      <p className="mt-6 text-center muted-strong" style={{ fontSize: '14px' }}>
        New to DeskHive?{' '}
        <Link
          href="/register"
          style={{
            color: 'var(--color-primary)',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Create an account
        </Link>
      </p>
    </main>
  );
}
