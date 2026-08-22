import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { IncomeStreamList } from './IncomeStreamList';
import { horizonAccount, incomeStream } from '@/test/factories';

const mockAdd = vi.fn();
const mockEdit = vi.fn();
vi.mock('@/app/actions/horizon-income', () => ({
  addIncomeStream: (...args: unknown[]) => mockAdd(...args),
  editIncomeStream: (...args: unknown[]) => mockEdit(...args),
  addIncomeSchedule: vi.fn(),
  deleteIncomeSchedule: vi.fn(),
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

describe('IncomeStreamList', () => {
  it('shows the empty state when there are no streams', () => {
    render(
      <IncomeStreamList
        streams={[]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
      />
    );
    expect(screen.getByText(/no income streams yet/i)).toBeInTheDocument();
  });

  it('lists streams with their derived monthly amount and kind badge', () => {
    render(
      <IncomeStreamList
        streams={[incomeStream({ name: 'Freelance' })]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
      />
    );
    expect(screen.getByText('Freelance')).toBeInTheDocument();
    expect(screen.getByText('Hourly')).toBeInTheDocument();
  });

  it('adds an hourly stream through the add form', async () => {
    mockAdd.mockResolvedValue({ ok: true });
    render(
      <IncomeStreamList
        streams={[]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add income stream/i }));
    fireEvent.change(screen.getByPlaceholderText('Stream name'), {
      target: { value: 'Contract work' },
    });
    fireEvent.change(screen.getByLabelText('Hourly rate'), {
      target: { value: '1500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'hourly',
          name: 'Contract work',
          hourlyRateMinor: 1500,
          hoursPerDay: 8,
        })
      )
    );
  });

  it('shows a prompt to add an account first when there are none', () => {
    render(
      <IncomeStreamList
        streams={[]}
        schedules={[]}
        accounts={[]}
        calendar={calendar}
      />
    );
    expect(screen.getByText(/add an account first/i)).toBeInTheDocument();
  });

  it('archives a stream via the row action', async () => {
    mockEdit.mockResolvedValue({ ok: true });
    render(
      <IncomeStreamList
        streams={[incomeStream({ name: 'Freelance' })]}
        schedules={[]}
        accounts={accounts}
        calendar={calendar}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /archive income stream/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive?' }));

    await waitFor(() =>
      expect(mockEdit).toHaveBeenCalledWith('stream-1', { archived: true })
    );
  });
});
