import { LoginForm } from '@/components/auth/LoginForm';

/**
 * Warm copy for the errors `src/app/auth/callback/route.ts` redirects here
 * with. Anything else (or none) falls through to the form's own idle state.
 */
const ERROR_COPY: Record<string, string> = {
  closed: 'Sign-ups are closed right now — ask for an invite.',
  missing_code: 'That sign-in link was incomplete. Try signing in below.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError = error ? ERROR_COPY[error] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-heading)] text-4xl text-[var(--color-accent)]">
          Kapa
        </h1>
        <p className="mt-2 text-[var(--color-ink)]/70">Sign in to your cap.</p>
      </header>

      <LoginForm initialError={initialError} />
    </main>
  );
}
