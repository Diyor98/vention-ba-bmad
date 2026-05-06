import { redirect } from 'next/navigation';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { CreateSpaceForm } from './create-space-form';

export default async function NewSpacePage() {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.response.status === 401) redirect('/login');
      redirect('/');
    }
    throw err;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Create Space</h1>
      <CreateSpaceForm />
    </main>
  );
}
