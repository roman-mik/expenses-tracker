import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { HistoryList, type ExpenseGroup } from './HistoryList';
import { expense as expenseFactory, category, member } from '@/test/factories';

const mockDeleteExpense = vi.fn();
vi.mock('@/app/actions/expenses', () => ({
  deleteExpense: (...args: unknown[]) => mockDeleteExpense(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function groups(categoryId: string | null = null): ExpenseGroup[] {
  const e = expenseFactory({
    id: 'e1',
    amountMinor: 1500,
    note: 'Coffee',
    categoryId,
  });
  return [
    {
      key: '2026-08-01',
      label: 'Today',
      expenses: [e],
      total: { amountMinor: 1500, currency: 'RSD' },
    },
  ];
}

describe('HistoryList', () => {
  it('shows an empty state when there are no groups', () => {
    render(
      <HistoryList
        groups={[]}
        categories={[]}
        members={[]}
        currentUserId="u1"
      />
    );
    expect(
      screen.getByText(/Nothing logged this month yet/)
    ).toBeInTheDocument();
  });

  it('renders a category name and amount for each expense', () => {
    render(
      <HistoryList
        groups={groups('category-1')}
        categories={[category({ id: 'category-1', name: 'Groceries' })]}
        members={[member()]}
        currentUserId="u1"
      />
    );
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('shows each expense’s currency code next to its amount', () => {
    render(
      <HistoryList
        groups={groups('category-1')}
        categories={[category({ id: 'category-1', name: 'Groceries' })]}
        members={[member()]}
        currentUserId="u1"
      />
    );
    expect(screen.getByText('1.500 RSD')).toBeInTheDocument();
  });

  it('shows both currencies on a day that mixes them, with no day total', () => {
    const rsdExpense = expenseFactory({
      id: 'e1',
      amountMinor: 1500,
      note: 'Coffee',
    });
    const eurExpense = expenseFactory({
      id: 'e2',
      amountMinor: 8500,
      currency: 'EUR',
      note: 'Hotel',
    });
    render(
      <HistoryList
        groups={[
          {
            key: '2026-08-01',
            label: 'Today',
            expenses: [rsdExpense, eurExpense],
            total: null,
          },
        ]}
        categories={[]}
        members={[]}
        currentUserId="u1"
      />
    );
    expect(screen.getByText('1.500 RSD')).toBeInTheDocument();
    expect(screen.getByText('85,00 EUR')).toBeInTheDocument();
  });

  it('requires a confirm click before deleting', async () => {
    mockDeleteExpense.mockResolvedValue({ ok: true });
    render(
      <HistoryList
        groups={groups()}
        categories={[]}
        members={[]}
        currentUserId="u1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove?' }));

    await waitFor(() =>
      expect(mockDeleteExpense).toHaveBeenCalledWith(
        'e1',
        '2026-08-01T00:00:00.000Z'
      )
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Expense removed');
  });

  it('shows an error toast and re-opens the confirm state when delete fails', async () => {
    mockDeleteExpense.mockResolvedValue({ ok: false, error: 'Network error' });
    render(
      <HistoryList
        groups={groups()}
        categories={[]}
        members={[]}
        currentUserId="u1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove?' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Network error')
    );
  });
});
