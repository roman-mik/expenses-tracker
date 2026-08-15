import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddExpenseForm } from './AddExpenseForm';
import { category } from '@/test/factories';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockAddExpense = vi.fn();
const mockUpdateExpense = vi.fn();
vi.mock('@/app/actions/expenses', () => ({
  addExpense: (...args: unknown[]) => mockAddExpense(...args),
  updateExpense: (...args: unknown[]) => mockUpdateExpense(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddExpenseForm', () => {
  it('disables submit until an amount is entered', () => {
    render(
      <AddExpenseForm categories={[]} currency="RSD" remaining={10_000} />
    );
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    fireEvent.click(screen.getByText('5'));
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeEnabled();
  });

  it('shows a live "left after this" preview as digits are entered', () => {
    render(
      <AddExpenseForm categories={[]} currency="RSD" remaining={10_000} />
    );
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('0'));
    fireEvent.click(screen.getByText('0'));
    expect(screen.getByText(/9\.500 left after this/)).toBeInTheDocument();
  });

  it('flags going negative after this expense', () => {
    render(<AddExpenseForm categories={[]} currency="RSD" remaining={100} />);
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('0'));
    fireEvent.click(screen.getByText('0'));
    expect(screen.getByText(/left after this/)).toHaveClass('text-accent-700');
  });

  it('submits and navigates home on success', async () => {
    mockAddExpense.mockResolvedValue({ ok: true });
    render(
      <AddExpenseForm
        categories={[category({ id: 'c1', name: 'Groceries' })]}
        currency="RSD"
        remaining={10_000}
      />
    );
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('Groceries'));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() =>
      expect(mockAddExpense).toHaveBeenCalledWith({
        amountMinor: 5,
        categoryId: 'c1',
        note: undefined,
      })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Expense added');
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('shows an error toast and does not navigate on failure', async () => {
    mockAddExpense.mockResolvedValue({ ok: false, error: 'Could not save' });
    render(
      <AddExpenseForm categories={[]} currency="RSD" remaining={10_000} />
    );
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Could not save')
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
