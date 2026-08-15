import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations('Login');
  const { error } = await searchParams;
  // Warm copy for the errors `src/app/auth/callback/route.ts` redirects here
  // with. Anything else (or none) falls through to the form's own idle state.
  const errorCopy: Record<string, string> = {
    closed: t('closedError'),
    missing_code: t('missingCodeError'),
  };
  const initialError = error ? errorCopy[error] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-heading)] text-4xl text-[var(--color-accent)]">
          {t('title')}
        </h1>
        <p className="mt-2 text-[var(--color-ink)]/70">{t('subtitle')}</p>
      </header>

      <LoginForm initialError={initialError} />
    </main>
  );
}
