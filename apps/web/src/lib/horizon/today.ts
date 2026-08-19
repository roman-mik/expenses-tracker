/**
 * Pure computation behind the Today screen's hero total and account chips —
 * kept out of the page component so it's unit-testable without rendering
 * anything (mirrors `fx.ts`'s discipline: no `Date.now()`, `today` is
 * passed in).
 */
import type { Currency } from '@/lib/types';
import { convert, pickRate, rateAgeDays, isStale } from './fx';
import type { FxRate, HorizonAccount } from './types';

export interface AccountTotal {
  account: HorizonAccount;
  /** The account's balance in `reportingCurrency`. `null` when no rate covers it. */
  convertedMinor: number | null;
  /** The rate used for the conversion, or `null` when none was needed/found. */
  rate: FxRate | null;
}

export interface TodaySummary {
  /** Sum of every non-archived, `includeInTotal` account, in `reportingCurrency`. */
  totalMinor: number;
  /** Every non-archived account, in sort order, with its converted value. */
  accounts: AccountTotal[];
  /** The oldest `asOfDate` among rates actually used, or `null` if none were needed. */
  oldestRateAsOfDate: string | null;
  /** True when `oldestRateAsOfDate` is more than 30 days before `today`. */
  isStale: boolean;
  /** True when at least one account couldn't be converted for lack of a rate. */
  hasMissingRate: boolean;
}

export function summarizeToday(
  accounts: HorizonAccount[],
  rates: FxRate[],
  reportingCurrency: Currency,
  today: string
): TodaySummary {
  let totalMinor = 0;
  let oldestRateAsOfDate: string | null = null;
  let hasMissingRate = false;

  const entries: AccountTotal[] = accounts
    .filter((account) => !account.archived)
    .map((account) => {
      if (account.currency === reportingCurrency) {
        if (account.includeInTotal) totalMinor += account.currentBalanceMinor;
        return {
          account,
          convertedMinor: account.currentBalanceMinor,
          rate: null,
        };
      }

      const rate = pickRate(rates, {
        base: account.currency,
        quote: reportingCurrency,
        onOrBefore: today,
      });
      if (!rate) {
        hasMissingRate = true;
        return { account, convertedMinor: null, rate: null };
      }

      if (!oldestRateAsOfDate || rate.asOfDate < oldestRateAsOfDate) {
        oldestRateAsOfDate = rate.asOfDate;
      }
      const convertedMinor = convert(
        account.currentBalanceMinor,
        account.currency,
        reportingCurrency,
        rate
      );
      if (account.includeInTotal) totalMinor += convertedMinor;
      return { account, convertedMinor, rate };
    });

  return {
    totalMinor,
    accounts: entries,
    oldestRateAsOfDate,
    isStale: oldestRateAsOfDate !== null && isStale(oldestRateAsOfDate, today),
    hasMissingRate,
  };
}

export { rateAgeDays };
