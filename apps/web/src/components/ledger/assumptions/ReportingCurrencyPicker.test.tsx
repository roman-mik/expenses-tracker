import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { ReportingCurrencyPicker } from './ReportingCurrencyPicker';

const mockSetCurrency = vi.fn();
vi.mock('@/app/actions/ledger-settings', () => ({
  setLedgerReportingCurrency: (...args: unknown[]) => mockSetCurrency(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReportingCurrencyPicker', () => {
  it('renders all currency options with the initial currency selected', () => {
    render(<ReportingCurrencyPicker initialCurrency="RSD" />);

    expect(screen.getByRole('radio', { name: 'RSD' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'EUR' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('radio', { name: 'USD' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('radio', { name: 'RUB' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('updates currency selection and shows success toast when action succeeds', async () => {
    mockSetCurrency.mockResolvedValue({ ok: true });
    render(<ReportingCurrencyPicker initialCurrency="RSD" />);

    fireEvent.click(screen.getByRole('radio', { name: 'EUR' }));

    await waitFor(() =>
      expect(mockSetCurrency).toHaveBeenCalledWith({
        reportingCurrency: 'EUR',
      })
    );
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Reporting currency updated.'
      )
    );
    expect(screen.getByRole('radio', { name: 'EUR' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('shows error toast and reverts selection when action fails', async () => {
    mockSetCurrency.mockResolvedValue({
      ok: false,
      error: 'Save failed',
    });
    render(<ReportingCurrencyPicker initialCurrency="RSD" />);

    fireEvent.click(screen.getByRole('radio', { name: 'EUR' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Save failed')
    );
    expect(screen.getByRole('radio', { name: 'RSD' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});
