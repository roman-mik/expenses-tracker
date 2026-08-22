import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { CapTracker } from './CapTracker';
import { dailyExpense } from '@/test/factories';

describe('CapTracker', () => {
  it('shows the empty state when there are no capped daily expenses', () => {
    render(<CapTracker dailyExpenses={[]} month="2026-02" actuals={{}} />);
    expect(
      screen.getByText(/no capped daily expenses yet/i)
    ).toBeInTheDocument();
  });

  it('ignores daily expenses without a cap', () => {
    render(
      <CapTracker
        dailyExpenses={[dailyExpense({ name: 'Uncapped', capMinor: null })]}
        month="2026-02"
        actuals={{}}
      />
    );
    expect(screen.queryByText('Uncapped')).not.toBeInTheDocument();
  });

  it('shows planned vs actual and the 28/30/31-day variants for a capped expense', () => {
    render(
      <CapTracker
        dailyExpenses={[
          dailyExpense({
            id: 'daily-1',
            name: 'Groceries',
            dailyAmountMinor: 1000,
            capMinor: 30000,
          }),
        ]}
        month="2026-02"
        actuals={{ 'daily-1': 20000 }}
      />
    );

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    // 2026-02 has 28 days -> planned = 28.000 (sr-RS grouping)
    expect(screen.getByText(/Planned this month: 28\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Actual so far: 20\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Cap: 30\.000/)).toBeInTheDocument();
    expect(screen.getByText(/28\.000.*30\.000.*31\.000/)).toBeInTheDocument();
    expect(screen.queryByText('Over cap')).not.toBeInTheDocument();
  });

  it('flags an over-cap daily expense', () => {
    render(
      <CapTracker
        dailyExpenses={[
          dailyExpense({
            id: 'daily-1',
            name: 'Groceries',
            dailyAmountMinor: 1000,
            capMinor: 10000,
          }),
        ]}
        month="2026-02"
        actuals={{ 'daily-1': 15000 }}
      />
    );

    expect(screen.getByText('Over cap')).toBeInTheDocument();
  });
});
