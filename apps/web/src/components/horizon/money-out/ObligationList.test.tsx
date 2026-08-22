import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { ObligationList } from './ObligationList';
import {
  horizonAccount,
  obligation,
  obligationSchedule,
} from '@/test/factories';

const mockAdd = vi.fn();
const mockEdit = vi.fn();
vi.mock('@/app/actions/horizon-spending', () => ({
  addObligation: (...args: unknown[]) => mockAdd(...args),
  editObligation: (...args: unknown[]) => mockEdit(...args),
  addObligationSchedule: vi.fn(),
  deleteObligationSchedule: vi.fn(),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

const calendar = { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] };
const accounts = [horizonAccount({ id: 'account-1', name: 'Checking' })];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ObligationList', () => {
  it('shows the empty state when there are no obligations', () => {
    render(
      <ObligationList
        obligations={[]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
        incomeStreams={[]}
        reportingCurrency="RSD"
        rates={[]}
      />
    );
    expect(screen.getByText(/no obligations yet/i)).toBeInTheDocument();
  });

  it('lists obligations with their category, recurrence, and confidence badges', () => {
    render(
      <ObligationList
        obligations={[obligation({ name: 'Rent' })]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
        incomeStreams={[]}
        reportingCurrency="RSD"
        rates={[]}
      />
    );
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Housing')).toBeInTheDocument();
    expect(screen.getByText('Recurring')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('adds an obligation through the add form', async () => {
    mockAdd.mockResolvedValue({ ok: true });
    render(
      <ObligationList
        obligations={[]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
        incomeStreams={[]}
        reportingCurrency="RSD"
        rates={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add obligation/i }));
    fireEvent.change(screen.getByPlaceholderText('Obligation name'), {
      target: { value: 'Electric bill' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '3500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Electric bill', amountMinor: 3500 })
      )
    );
  });

  it('shows a prompt to add an account first when there are none', () => {
    render(
      <ObligationList
        obligations={[]}
        schedules={[]}
        accounts={[]}
        calendar={calendar}
        incomeStreams={[]}
        reportingCurrency="RSD"
        rates={[]}
      />
    );
    expect(screen.getByText(/add an account first/i)).toBeInTheDocument();
  });

  it('archives an obligation via the row action', async () => {
    mockEdit.mockResolvedValue({ ok: true });
    render(
      <ObligationList
        obligations={[obligation({ name: 'Rent' })]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
        incomeStreams={[]}
        reportingCurrency="RSD"
        rates={[]}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /archive obligation/i })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive?' }));

    await waitFor(() =>
      expect(mockEdit).toHaveBeenCalledWith('obligation-1', { archived: true })
    );
  });

  it('shows the next due date labeled with the covered period, derived from the unslipped date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T00:00:00Z'));

    render(
      <ObligationList
        obligations={[obligation({ id: 'obligation-1', name: 'Rent' })]}
        schedules={[
          obligationSchedule({
            id: 'sched-1',
            obligationId: 'obligation-1',
            kind: 'dayOfMonth',
            dayOfMonth: 28,
            coversPeriod: 'next',
            slippagePolicy: 'none',
          }),
        ]}
        accounts={accounts}
        calendar={calendar}
        incomeStreams={[]}
        reportingCurrency="RSD"
        rates={[]}
      />
    );

    expect(screen.getByText(/Next due 2026-01-28/)).toBeInTheDocument();
    expect(screen.getByText(/Covers February 2026/)).toBeInTheDocument();
  });

  it('shows "no upcoming occurrence" when an obligation has no schedule', () => {
    render(
      <ObligationList
        obligations={[obligation({ id: 'obligation-1', name: 'Rent' })]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
        incomeStreams={[]}
        reportingCurrency="RSD"
        rates={[]}
      />
    );
    expect(screen.getByText(/no upcoming occurrence/i)).toBeInTheDocument();
  });
});
