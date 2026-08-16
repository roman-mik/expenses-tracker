import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

// Custom 404 for all unmatched URLs. Server Component — no 'use client', no props.
export default async function NotFound() {
  const t = await getTranslations('NotFound');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 text-center">
      <header>
        <h1 className="font-[family-name:var(--font-heading)] text-4xl text-[var(--color-accent)]">
          {t('title')}
        </h1>
        <p className="mt-2 text-[var(--color-ink)]/70">{t('body')}</p>
      </header>

      <Link
        href="/"
        className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 font-medium text-white"
      >
        {t('backToKapa')}
      </Link>
    </main>
  );
}
