import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold mb-6">Log in</h1>
      <LoginForm />
    </main>
  );
}
