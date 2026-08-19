import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';
import type { AccountTotal } from '@/lib/horizon/today';

/**
 * One chip per account: native amount always visible, converted value and
 * the rate/source behind it revealed via a native `<details>` disclosure —
 * no JS needed for the expand/collapse the plan calls for.
 */
export async function AccountChips({
  accounts,
  reportingCurrency,
}: {
  accounts: AccountTotal[];
  reportingCurrency: Currency;
}) {
  const t = await getTranslations('Horizon.today');

  if (accounts.length === 0) {
    return <p className="text-sm text-ink-muted">{t('noAccountsYet')}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-3">
      {accounts.map(({ account, convertedMinor, rate }) => {
        const needsConversion = account.currency !== reportingCurrency;
        return (
          <li key={account.id}>
            <details
              className={`rounded-lg bg-surface px-4 py-2 ${
                account.includeInTotal ? '' : 'opacity-60'
              }`}
            >
              <summary className="cursor-pointer list-none">
                <span className="font-medium text-ink">{account.name}</span>
                <span className="ml-2 text-ink-muted">
                  {formatMoney(account.currentBalanceMinor, account.currency, {
                    withCurrency: true,
                  })}
                </span>
                {needsConversion && (
                  <span className="ml-2 text-sm text-ink-muted">
                    {convertedMinor !== null
                      ? `≈ ${formatMoney(convertedMinor, reportingCurrency, { withCurrency: true })}`
                      : t('rateUnavailable')}
                  </span>
                )}
                {!account.includeInTotal && (
                  <span className="ml-2 text-xs text-ink-muted">
                    {t('excludedFromTotal')}
                  </span>
                )}
              </summary>
              {needsConversion && rate && (
                <p className="mt-1 text-xs text-ink-muted">
                  {t('rateDetail', {
                    base: rate.baseCode,
                    quote: rate.quoteCode,
                    rate: (rate.rateE8 / 1e8).toFixed(6),
                    date: rate.asOfDate,
                    source: rate.source,
                  })}
                </p>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
