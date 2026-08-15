import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/**
 * Over-cap state — never a block, never a scold. Acknowledges the overspend,
 * reassures that the 1st resets the slate, and — when the overspend is small
 * enough that absorbing it in one month is still a *slight* reduction — offers a
 * forward-looking recovery target: a lower next-month cap that nets the two
 * months even. Past that, absorbing it all at once would gut next month's cap
 * (punitive, the opposite of the app's voice), so we drop the number and keep
 * only the reassurance. Renders whenever spend is past the cap, regardless of
 * the nudge toggle.
 */

// Only suggest a reduced cap while it stays at least this fraction of the real
// cap — otherwise the "even out in one month" target reads as a punishment.
const MIN_SUGGESTION_FRACTION = 0.5;

export async function RecoveryPlan({
  cap,
  overspend,
  recoveryCap,
  daysLeft,
  currency,
}: {
  cap: number;
  overspend: number;
  recoveryCap: number;
  daysLeft: number;
  currency: Currency;
}) {
  const t = await getTranslations('RecoveryPlan');
  const suggestReducedCap = recoveryCap >= cap * MIN_SUGGESTION_FRACTION;
  return (
    <div className="rounded-lg border border-accent/40 bg-accent/8 px-5 py-4 flex flex-col gap-2">
      <p className="text-sm text-ink/85">
        {t.rich('overBy', {
          amount: formatMoney(overspend, currency),
          daysLeft,
          strong: (chunks) => (
            <strong className="text-accent-700">{chunks}</strong>
          ),
        })}
      </p>
      {suggestReducedCap ? (
        <p className="text-sm text-sage-700">
          {t.rich('evenOutOffer', {
            amount: formatMoney(recoveryCap, currency),
            strong: (chunks) => <strong className="text-ink">{chunks}</strong>,
          })}
        </p>
      ) : (
        <p className="text-sm text-sage-700">{t('noMathNeeded')}</p>
      )}
    </div>
  );
}
