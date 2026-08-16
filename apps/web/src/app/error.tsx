'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { track } from '@vercel/analytics';

// Route-level error boundary. Catches errors thrown in the Home/Add/Cap pages,
// their child components, and Server Actions surfaced during render. A crash in
// the root layout is NOT caught here (would need global-error.tsx).
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations('ErrorPage');

  useEffect(() => {
    console.error(error);
    // No-op unless deployed on Vercel. `message` is redacted in production, so
    // we key the event off `digest` (matchable to server logs).
    track('error_shown', { digest: error.digest ?? 'none' });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 text-center">
      <header>
        <h1 className="font-[family-name:var(--font-heading)] text-4xl text-[var(--color-accent)]">
          {t('title')}
        </h1>
        <p className="mt-2 text-[var(--color-ink)]/70">{t('body')}</p>
      </header>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 font-medium text-white"
        >
          {t('tryAgain')}
        </button>
        <Link
          href="/"
          className="rounded-[var(--radius-md)] border border-[var(--color-sand-300)] bg-[var(--color-surface)] px-4 py-3 font-medium text-[var(--color-ink)]"
        >
          {t('backToKapa')}
        </Link>
      </div>

      {error.digest && (
        <p className="text-xs text-[var(--color-ink)]/40">
          {t('reference', { digest: error.digest })}
        </p>
      )}
    </main>
  );
}
