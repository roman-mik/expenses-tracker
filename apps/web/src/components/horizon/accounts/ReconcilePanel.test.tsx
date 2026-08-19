import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { ReconcilePanel } from './ReconcilePanel';
import { horizonAccount } from '@/test/factories';

const mockReconcile = vi.fn();
vi.mock('@/app/actions/horizon-balances', () => ({
  reconcileHorizonBalancesAction: (...args: unknown[]) =>
    mockReconcile(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReconcilePanel', () => {
  it('returns null when there are no active accounts', () => {
    const { container } = render(
      <ReconcilePanel
        accounts={[horizonAccount({ id: 'a1', archived: true })]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('opens panel and calculates variance when entering actual balance', async () => {
    render(
      <ReconcilePanel
        accounts={[
          horizonAccount({
            id: 'a1',
            name: 'Checking',
            currency: 'EUR',
            currentBalanceMinor: 10000, // 100.00 EUR
          }),
        ]}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /reconcile balances/i })
    );

    expect(screen.getByText('Reconcile Balances')).toBeInTheDocument();
    expect(screen.getByText(/Checking/)).toBeInTheDocument();

    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '150' } });

    // Variance should be +50,00 EUR
    expect(screen.getByText(/\+50,00 EUR/)).toBeInTheDocument();
  });

  it('submits reconciliation data on button click', async () => {
    mockReconcile.mockResolvedValue({ ok: true });
    render(
      <ReconcilePanel
        accounts={[
          horizonAccount({
            id: 'a1',
            name: 'Checking',
            currency: 'EUR',
            currentBalanceMinor: 10000,
          }),
        ]}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /reconcile balances/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /save reconciliation/i })
    );

    await waitFor(() =>
      expect(mockReconcile).toHaveBeenCalledWith({
        balances: [
          {
            accountId: 'a1',
            balanceMinor: 10000,
          },
        ],
      })
    );
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});
