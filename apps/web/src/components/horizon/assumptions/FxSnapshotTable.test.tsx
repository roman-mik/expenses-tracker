import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { FxSnapshotTable } from './FxSnapshotTable';
import type { FxRate } from '@/lib/horizon/types';

describe('FxSnapshotTable', () => {
  const today = '2026-08-19';

  it('renders empty state when rates list is empty', () => {
    render(<FxSnapshotTable rates={[]} today={today} />);
    expect(screen.getByText(/no fx rates stored yet/i)).toBeInTheDocument();
  });

  it('renders FX rate rows with accurate pair, rate format, date, source, and age badges', () => {
    const rates: FxRate[] = [
      {
        baseCode: 'EUR',
        quoteCode: 'RSD',
        rateE8: 11720000000, // 117.2000
        asOfDate: '2026-08-19',
        source: 'open.er-api.com',
      },
      {
        baseCode: 'USD',
        quoteCode: 'EUR',
        rateE8: 91500000, // 0.9150
        asOfDate: '2026-08-14', // 5 days old
        source: 'open.er-api.com',
      },
      {
        baseCode: 'RUB',
        quoteCode: 'RSD',
        rateE8: 120000000, // 1.2000
        asOfDate: '2026-07-01', // 49 days old -> stale
        source: 'open.er-api.com',
      },
    ];

    render(<FxSnapshotTable rates={rates} today={today} />);

    // Pairs
    expect(screen.getByText('EUR → RSD')).toBeInTheDocument();
    expect(screen.getByText('USD → EUR')).toBeInTheDocument();
    expect(screen.getByText('RUB → RSD')).toBeInTheDocument();

    // Rates formatted
    expect(screen.getByText('1 EUR = 117.2000 RSD')).toBeInTheDocument();
    expect(screen.getByText('1 USD = 0.915000 EUR')).toBeInTheDocument();
    expect(screen.getByText('1 RUB = 1.2000 RSD')).toBeInTheDocument();

    // Sources & dates
    expect(screen.getAllByText('open.er-api.com')).toHaveLength(3);
    expect(screen.getByText('2026-08-19')).toBeInTheDocument();
    expect(screen.getByText('2026-08-14')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01')).toBeInTheDocument();

    // Badges
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('5d ago')).toBeInTheDocument();
    expect(screen.getByText('Stale (> 30d)')).toBeInTheDocument();
  });
});
