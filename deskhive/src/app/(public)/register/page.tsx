import Link from 'next/link';
import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <main className="container-narrow" style={{ paddingTop: '4rem', paddingBottom: '4rem' }}>
      <div className="mb-6 text-center">
        <h1 className="page-h1">Create your account</h1>
        <p className="mt-2 muted-strong" style={{ fontSize: '14px' }}>
          Free to join. You&apos;ll book your first desk in 60 seconds.
        </p>
      </div>

      <section className="auth-card">
        <RegisterForm />
        <p
          className="mt-5 text-center muted"
          style={{ fontSize: '13px' }}
        >
          By creating an account, you agree to our{' '}
          <a
            href="#"
            style={{
              color: 'var(--color-neutral-700)',
              textDecoration: 'underline',
            }}
          >
            Terms
          </a>{' '}
          and{' '}
          <a
            href="#"
            style={{
              color: 'var(--color-neutral-700)',
              textDecoration: 'underline',
            }}
          >
            Privacy Policy
          </a>
          .
        </p>
      </section>

      <p className="mt-6 text-center muted-strong" style={{ fontSize: '14px' }}>
        Already have an account?{' '}
        <Link
          href="/login"
          style={{
            color: 'var(--color-primary)',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Log in
        </Link>
      </p>
    </main>
  );
}
