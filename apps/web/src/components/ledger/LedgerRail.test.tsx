import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { LedgerRail } from './LedgerRail';

let pathname = '/ledger';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

describe('LedgerRail', () => {
  it('links every screen, with Assumptions apart from the rest', () => {
    pathname = '/ledger';
    render(<LedgerRail />);

    expect(screen.getByRole('link', { name: /today/i })).toHaveAttribute(
      'href',
      '/ledger'
    );
    expect(screen.getByRole('link', { name: /accounts/i })).toHaveAttribute(
      'href',
      '/ledger/accounts'
    );
    expect(screen.getByRole('link', { name: /timeline/i })).toHaveAttribute(
      'href',
      '/ledger/timeline'
    );
    expect(screen.getByRole('link', { name: /money in/i })).toHaveAttribute(
      'href',
      '/ledger/money-in'
    );
    expect(screen.getByRole('link', { name: /money out/i })).toHaveAttribute(
      'href',
      '/ledger/money-out'
    );
    expect(screen.getByRole('link', { name: /scenarios/i })).toHaveAttribute(
      'href',
      '/ledger/scenarios'
    );
    expect(screen.getByRole('link', { name: /target rate/i })).toHaveAttribute(
      'href',
      '/ledger/target-rate'
    );
    expect(screen.getByRole('link', { name: /assumptions/i })).toHaveAttribute(
      'href',
      '/ledger/assumptions'
    );
  });

  it('marks the current route active', () => {
    pathname = '/ledger/timeline';
    render(<LedgerRail />);

    expect(screen.getByRole('link', { name: /timeline/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: /today/i })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('marks Accounts active', () => {
    pathname = '/ledger/accounts';
    render(<LedgerRail />);

    expect(screen.getByRole('link', { name: /accounts/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it("doesn't mark Today active on a nested route", () => {
    pathname = '/ledger/timeline';
    render(<LedgerRail />);

    expect(screen.getByRole('link', { name: /today/i })).not.toHaveAttribute(
      'aria-current'
    );
  });
});
