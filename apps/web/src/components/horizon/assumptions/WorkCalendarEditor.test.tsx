import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { WorkCalendarEditor } from './WorkCalendarEditor';

const mockSetWorkCalendar = vi.fn();
const mockAddHoliday = vi.fn();
const mockDeleteHoliday = vi.fn();
vi.mock('@/app/actions/horizon-income', () => ({
  setWorkCalendar: (...args: unknown[]) => mockSetWorkCalendar(...args),
  addHoliday: (...args: unknown[]) => mockAddHoliday(...args),
  deleteHoliday: (...args: unknown[]) => mockDeleteHoliday(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkCalendarEditor', () => {
  it('shows Mon-Fri selected by default', () => {
    render(
      <WorkCalendarEditor
        initialCalendar={{ workingWeekdays: [1, 2, 3, 4, 5] }}
        initialHolidays={[]}
      />
    );
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Sun' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('toggles a weekday and saves it', async () => {
    mockSetWorkCalendar.mockResolvedValue({ ok: true });
    render(
      <WorkCalendarEditor
        initialCalendar={{ workingWeekdays: [1, 2, 3, 4, 5] }}
        initialHolidays={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sat' }));

    await waitFor(() =>
      expect(mockSetWorkCalendar).toHaveBeenCalledWith({
        workingWeekdays: [1, 2, 3, 4, 5, 6],
      })
    );
    expect(screen.getByRole('button', { name: 'Sat' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('reverts and shows an error toast when saving the calendar fails', async () => {
    mockSetWorkCalendar.mockResolvedValue({ ok: false, error: 'Nope' });
    render(
      <WorkCalendarEditor
        initialCalendar={{ workingWeekdays: [1, 2, 3, 4, 5] }}
        initialHolidays={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sat' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Nope'));
    expect(screen.getByRole('button', { name: 'Sat' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('lists holidays and adds a new one', async () => {
    mockAddHoliday.mockResolvedValue({ ok: true });
    render(
      <WorkCalendarEditor
        initialCalendar={{ workingWeekdays: [1, 2, 3, 4, 5] }}
        initialHolidays={[{ id: 'h1', date: '2026-01-01', name: "New Year" }]}
      />
    );
    expect(screen.getByText("New Year")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-05-01' },
    });
    fireEvent.change(screen.getByPlaceholderText('Holiday name'), {
      target: { value: 'Labor Day' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add holiday' }));

    await waitFor(() =>
      expect(mockAddHoliday).toHaveBeenCalledWith({
        date: '2026-05-01',
        name: 'Labor Day',
      })
    );
  });

  it('removes a holiday', async () => {
    mockDeleteHoliday.mockResolvedValue({ ok: true });
    render(
      <WorkCalendarEditor
        initialCalendar={{ workingWeekdays: [1, 2, 3, 4, 5] }}
        initialHolidays={[{ id: 'h1', date: '2026-01-01', name: "New Year" }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove holiday' }));

    await waitFor(() => expect(mockDeleteHoliday).toHaveBeenCalledWith('h1'));
  });
});
