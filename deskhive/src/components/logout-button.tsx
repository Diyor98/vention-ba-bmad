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
      className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Signing out…' : 'Log out'}
    </button>
  );
}
