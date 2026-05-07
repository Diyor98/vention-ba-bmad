'use client';

import { useFormStatus } from 'react-dom';
import { logoutAction } from '@/actions/auth';

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      className="btn btn-secondary btn-sm"
    >
      {pending ? 'Signing out…' : 'Log out'}
    </button>
  );
}
