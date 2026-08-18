import { getTranslations } from 'next-intl/server';

/** Shown when the oldest FX rate behind the hero total is more than 30 days old (fx.ts's `isStale`). */
export async function StaleRateBanner({ ageDays }: { ageDays: number }) {
  const t = await getTranslations('Ledger.today');

  return (
    <div
      role="status"
      className="rounded-lg bg-accent-100 px-4 py-2 text-sm text-accent-700"
    >
      {t('staleRateWarning', { days: ageDays })}
    </div>
  );
}
