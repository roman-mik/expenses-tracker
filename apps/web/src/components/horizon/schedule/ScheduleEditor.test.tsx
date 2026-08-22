import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { ScheduleEditor } from './ScheduleEditor';
import { incomeSchedule } from '@/test/factories';

const mockAdd = vi.fn();
const mockDelete = vi.fn();

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

const calendar = { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ScheduleEditor', () => {
  it('shows the empty state and summarizes existing schedules', () => {
    render(
      <ScheduleEditor
        schedules={[incomeSchedule({ dayOfMonth: 15 })]}
        calendar={calendar}
        onAdd={mockAdd}
        onRemove={mockDelete}
      />
    );
    expect(screen.getByText('Day 15 of each month')).toBeInTheDocument();
  });

  it('adds a dayOfMonth schedule', async () => {
    mockAdd.mockResolvedValue({ ok: true });
    render(
      <ScheduleEditor
        schedules={[]}
        calendar={calendar}
        onAdd={mockAdd}
        onRemove={mockDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));
    fireEvent.change(screen.getByLabelText('Day of month'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));

    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'dayOfMonth', dayOfMonth: 20 })
      )
    );
  });

  it('removes a schedule', async () => {
    mockDelete.mockResolvedValue({ ok: true });
    render(
      <ScheduleEditor
        schedules={[incomeSchedule({ id: 'sched-1' })]}
        calendar={calendar}
        onAdd={mockAdd}
        onRemove={mockDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove schedule' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('sched-1'));
  });

  it('sends coversPeriod for dayOfMonth but omits it for kinds with no defined semantics', async () => {
    mockAdd.mockResolvedValue({ ok: true });
    render(
      <ScheduleEditor
        schedules={[]}
        calendar={calendar}
        onAdd={mockAdd}
        onRemove={mockDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));
    fireEvent.change(screen.getByLabelText('This payment covers'), {
      target: { value: 'next' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));

    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'dayOfMonth', coversPeriod: 'next' })
      )
    );

    mockAdd.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Every N days' }));
    expect(
      screen.queryByLabelText('This payment covers')
    ).not.toBeInTheDocument();
  });

  it('shows upcoming dates merged across schedules', () => {
    render(
      <ScheduleEditor
        schedules={[
          incomeSchedule({ id: 's1', kind: 'monthEnd', dayOfMonth: null }),
        ]}
        calendar={calendar}
        onAdd={mockAdd}
        onRemove={mockDelete}
      />
    );
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });
});
