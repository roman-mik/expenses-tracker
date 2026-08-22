import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { DailyExpenseList } from './DailyExpenseList';
import { dailyExpense, horizonAccount } from '@/test/factories';

const mockAdd = vi.fn();
const mockEdit = vi.fn();
vi.mock('@/app/actions/horizon-spending', () => ({
  addDailyExpense: (...args: unknown[]) => mockAdd(...args),
  editDailyExpense: (...args: unknown[]) => mockEdit(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

const accounts = [horizonAccount({ id: 'account-1', name: 'Checking' })];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DailyExpenseList', () => {
  it('shows the empty state when there are no daily expenses', () => {
    render(
      <DailyExpenseList
        dailyExpenses={[]}
        accounts={accounts}
        categories={[]}
      />
    );
    expect(screen.getByText(/no daily expenses yet/i)).toBeInTheDocument();
  });

  it('lists a daily expense with its cadence and cap badges', () => {
    render(
      <DailyExpenseList
        dailyExpenses={[
          dailyExpense({
            name: 'Groceries',
            chargeCadence: 'weekly',
            capMinor: 30000,
          }),
        ]}
        accounts={accounts}
        categories={[]}
      />
    );
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByText(/Cap/)).toBeInTheDocument();
  });

  it('adds a daily expense through the add form', async () => {
    mockAdd.mockResolvedValue({ ok: true });
    render(
      <DailyExpenseList
        dailyExpenses={[]}
        accounts={accounts}
        categories={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add daily expense/i }));
    fireEvent.change(screen.getByPlaceholderText('Daily expense name'), {
      target: { value: 'Coffee' },
    });
    fireEvent.change(screen.getByLabelText('Daily amount'), {
      target: { value: '300' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Coffee', dailyAmountMinor: 300 })
      )
    );
  });

  it('shows a prompt to add an account first when there are none', () => {
    render(
      <DailyExpenseList dailyExpenses={[]} accounts={[]} categories={[]} />
    );
    expect(screen.getByText(/add an account first/i)).toBeInTheDocument();
  });

  it('archives a daily expense via the row action', async () => {
    mockEdit.mockResolvedValue({ ok: true });
    render(
      <DailyExpenseList
        dailyExpenses={[dailyExpense({ name: 'Groceries' })]}
        accounts={accounts}
        categories={[]}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /archive daily expense/i })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive?' }));

    await waitFor(() =>
      expect(mockEdit).toHaveBeenCalledWith('daily-expense-1', {
        archived: true,
      })
    );
  });
});
