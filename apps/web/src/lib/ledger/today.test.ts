import { describe, it, expect } from 'vitest';
import type { Money } from '@/lib/types';
import { summarizeToday } from './today';
import type { FxRate, LedgerAccount } from './types';

const money = (n: number): Money => n as Money;

function account(partial: Partial<LedgerAccount> = {}): LedgerAccount {
  return {
    id: 'acc-1',
    name: 'Checking',
    currency: 'RSD',
    currentBalanceMinor: money(10_000),
    type: 'personal',
    includeInTotal: true,
    sortOrder: 0,
    archived: false,
    ...partial,
  };
}

function rate(partial: Partial<FxRate> = {}): FxRate {
  return {
    baseCode: 'EUR',
    quoteCode: 'RSD',
    rateE8: 10_000_000_000, // 1 EUR = 100 RSD
    asOfDate: '2026-08-15',
    source: 'test-provider',
    ...partial,
  };
}

describe('summarizeToday', () => {
  it('sums same-currency accounts with no rate needed', () => {
    const summary = summarizeToday(
      [
        account({ id: 'a', currentBalanceMinor: money(5_000) }),
        account({ id: 'b', currentBalanceMinor: money(2_000) }),
      ],
      [],
      'RSD',
      '2026-08-15'
    );
    expect(summary.totalMinor).toBe(7_000);
    expect(summary.hasMissingRate).toBe(false);
    expect(summary.oldestRateAsOfDate).toBeNull();
  });

  it('converts a foreign-currency account into the reporting currency', () => {
    const summary = summarizeToday(
      [account({ id: 'a', currency: 'EUR', currentBalanceMinor: money(100) })], // 1.00 EUR
      [rate()],
      'RSD',
      '2026-08-15'
    );
    expect(summary.totalMinor).toBe(100); // 1 EUR -> 100 RSD
    expect(summary.accounts[0].convertedMinor).toBe(100);
    expect(summary.accounts[0].rate).toEqual(rate());
  });

  it('excludes archived accounts entirely', () => {
    const summary = summarizeToday(
      [account({ id: 'a', currentBalanceMinor: money(1_000), archived: true })],
      [],
      'RSD',
      '2026-08-15'
    );
    expect(summary.totalMinor).toBe(0);
    expect(summary.accounts).toHaveLength(0);
  });

  it('excludes includeInTotal=false accounts from the sum but still reports them', () => {
    const summary = summarizeToday(
      [
        account({
          id: 'a',
          currentBalanceMinor: money(1_000),
          includeInTotal: false,
        }),
      ],
      [],
      'RSD',
      '2026-08-15'
    );
    expect(summary.totalMinor).toBe(0);
    expect(summary.accounts).toHaveLength(1);
  });

  it('flags a missing rate instead of throwing, and excludes it from the total', () => {
    const summary = summarizeToday(
      [account({ id: 'a', currency: 'USD', currentBalanceMinor: money(100) })],
      [rate()], // only EUR -> RSD, no USD rate
      'RSD',
      '2026-08-15'
    );
    expect(summary.hasMissingRate).toBe(true);
    expect(summary.totalMinor).toBe(0);
    expect(summary.accounts[0].convertedMinor).toBeNull();
  });

  it('is stale when the oldest rate used is more than 30 days old', () => {
    const fresh = summarizeToday(
      [account({ id: 'a', currency: 'EUR', currentBalanceMinor: money(100) })],
      [rate({ asOfDate: '2026-07-20' })],
      'RSD',
      '2026-08-15' // 26 days
    );
    expect(fresh.isStale).toBe(false);

    const stale = summarizeToday(
      [account({ id: 'a', currency: 'EUR', currentBalanceMinor: money(100) })],
      [rate({ asOfDate: '2026-06-01' })],
      'RSD',
      '2026-08-15' // > 30 days
    );
    expect(stale.isStale).toBe(true);
    expect(stale.oldestRateAsOfDate).toBe('2026-06-01');
  });

  it('tracks the oldest of several rates used, not the newest', () => {
    const summary = summarizeToday(
      [
        account({ id: 'a', currency: 'EUR', currentBalanceMinor: money(100) }),
        account({ id: 'b', currency: 'USD', currentBalanceMinor: money(100) }),
      ],
      [
        rate({ asOfDate: '2026-08-10' }),
        rate({ baseCode: 'USD', asOfDate: '2026-07-01' }),
      ],
      'RSD',
      '2026-08-15'
    );
    expect(summary.oldestRateAsOfDate).toBe('2026-07-01');
  });
});
