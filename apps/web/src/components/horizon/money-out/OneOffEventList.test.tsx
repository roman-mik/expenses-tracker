import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { OneOffEventList } from './OneOffEventList';
import { horizonAccount, oneOffEvent, obligation } from '@/test/factories';
import { ObligationList } from './ObligationList';

const mockAdd = vi.fn();
const mockEdit = vi.fn();
const mockDelete = vi.fn();
vi.mock('@/app/actions/horizon-spending', () => ({
  addOneOffEvent: (...args: unknown[]) => mockAdd(...args),
  editOneOffEvent: (...args: unknown[]) => mockEdit(...args),
  deleteOneOffEvent: (...args: unknown[]) => mockDelete(...args),
  addObligation: vi.fn(),
  editObligation: vi.fn(),
  addObligationSchedule: vi.fn(),
  deleteObligationSchedule: vi.fn(),
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

describe('OneOffEventList', () => {
  it('shows the empty state when there are no one-off events', () => {
    render(<OneOffEventList oneOffEvents={[]} accounts={accounts} />);
    expect(screen.getByText(/no one-off events yet/i)).toBeInTheDocument();
  });

  it('lists a one-off event with its direction badge', () => {
    render(
      <OneOffEventList
        oneOffEvents={[
          oneOffEvent({ name: 'Refund', direction: 'in' }),
          oneOffEvent({
            id: 'one-off-event-2',
            name: 'Gift',
            direction: 'out',
          }),
        ]}
        accounts={accounts}
      />
    );
    expect(screen.getByText('Refund')).toBeInTheDocument();
    expect(screen.getByText('Gift')).toBeInTheDocument();
    expect(screen.getByText('Deposit')).toBeInTheDocument();
    expect(screen.getByText('Withdrawal')).toBeInTheDocument();
  });

  it('adds a one-off event through the add form', async () => {
    mockAdd.mockResolvedValue({ ok: true });
    render(<OneOffEventList oneOffEvents={[]} accounts={accounts} />);

    fireEvent.click(screen.getByRole('button', { name: /add one-off event/i }));
    fireEvent.change(screen.getByPlaceholderText('One-off event name'), {
      target: { value: 'Bonus' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '10000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bonus', amountMinor: 10000 })
      )
    );
  });

  it('deletes a one-off event via the row action, without an archive path', async () => {
    mockDelete.mockResolvedValue({ ok: true });
    render(
      <OneOffEventList
        oneOffEvents={[oneOffEvent({ name: 'Refund' })]}
        accounts={accounts}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /delete one-off event/i })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete?' }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('one-off-event-1')
    );
  });

  it('renders visually distinct from recurring obligation rows', () => {
    const { container: obligationContainer } = render(
      <ObligationList
        obligations={[obligation({ name: 'Rent' })]}
        schedules={[]}
        accounts={accounts}
        calendar={{ workingWeekdays: [1, 2, 3, 4, 5], holidays: [] }}
        incomeStreams={[]}
        reportingCurrency="RSD"
        rates={[]}
      />
    );
    const { container: oneOffContainer } = render(
      <OneOffEventList
        oneOffEvents={[oneOffEvent({ name: 'Refund', direction: 'in' })]}
        accounts={accounts}
      />
    );

    expect(
      obligationContainer.querySelector('.bg-emerald-100')
    ).not.toBeInTheDocument();
    expect(
      oneOffContainer.querySelector('.bg-emerald-100')
    ).toBeInTheDocument();
  });
});
