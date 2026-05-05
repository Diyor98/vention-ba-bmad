import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold mb-6">Create your account</h1>
      <RegisterForm />
    </main>
  );
}
