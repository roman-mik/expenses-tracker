import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { HorizonRail } from './HorizonRail';

let pathname = '/horizon';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

describe('HorizonRail', () => {
  it('links every screen, with Assumptions apart from the rest', () => {
    pathname = '/horizon';
    render(<HorizonRail />);

    expect(screen.getByRole('link', { name: /today/i })).toHaveAttribute(
      'href',
      '/horizon'
    );
    expect(screen.getByRole('link', { name: /accounts/i })).toHaveAttribute(
      'href',
      '/horizon/accounts'
    );
    expect(screen.getByRole('link', { name: /timeline/i })).toHaveAttribute(
      'href',
      '/horizon/timeline'
    );
    expect(screen.getByRole('link', { name: /money in/i })).toHaveAttribute(
      'href',
      '/horizon/money-in'
    );
    expect(screen.getByRole('link', { name: /money out/i })).toHaveAttribute(
      'href',
      '/horizon/money-out'
    );
    expect(screen.getByRole('link', { name: /scenarios/i })).toHaveAttribute(
      'href',
      '/horizon/scenarios'
    );
    expect(screen.getByRole('link', { name: /target rate/i })).toHaveAttribute(
      'href',
      '/horizon/target-rate'
    );
    expect(screen.getByRole('link', { name: /assumptions/i })).toHaveAttribute(
      'href',
      '/horizon/assumptions'
    );
  });

  it('marks the current route active', () => {
    pathname = '/horizon/timeline';
    render(<HorizonRail />);

    expect(screen.getByRole('link', { name: /timeline/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: /today/i })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('marks Accounts active', () => {
    pathname = '/horizon/accounts';
    render(<HorizonRail />);

    expect(screen.getByRole('link', { name: /accounts/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it("doesn't mark Today active on a nested route", () => {
    pathname = '/horizon/timeline';
    render(<HorizonRail />);

    expect(screen.getByRole('link', { name: /today/i })).not.toHaveAttribute(
      'aria-current'
    );
  });
});
