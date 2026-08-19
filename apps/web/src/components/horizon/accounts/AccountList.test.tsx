import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { AccountList } from './AccountList';
import { horizonAccount } from '@/test/factories';

const mockAdd = vi.fn();
const mockEdit = vi.fn();
const mockMove = vi.fn();
vi.mock('@/app/actions/horizon-accounts', () => ({
  addHorizonAccount: (...args: unknown[]) => mockAdd(...args),
  editHorizonAccount: (...args: unknown[]) => mockEdit(...args),
  moveHorizonAccount: (...args: unknown[]) => mockMove(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountList', () => {
  it('shows the empty state when there are no accounts', () => {
    render(<AccountList accounts={[]} />);
    expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument();
  });

  it('lists active accounts, and puts archived ones under their own heading', () => {
    render(
      <AccountList
        accounts={[
          horizonAccount({ id: 'a1', name: 'Checking' }),
          horizonAccount({ id: 'a2', name: 'Old savings', archived: true }),
        ]}
      />
    );
    expect(screen.getByText('Checking')).toBeInTheDocument();
    expect(screen.getByText('Old savings')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /archived/i })
    ).toBeInTheDocument();
  });

  it('adds an account through the add form', async () => {
    mockAdd.mockResolvedValue({ ok: true });
    render(<AccountList accounts={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /add account/i }));
    fireEvent.change(screen.getByPlaceholderText(/account name/i), {
      target: { value: 'New wallet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New wallet', currency: 'RSD' })
      )
    );
  });

  it('moves an account up via the action', async () => {
    mockMove.mockResolvedValue({ ok: true });
    render(
      <AccountList
        accounts={[
          horizonAccount({ id: 'a1', name: 'First', sortOrder: 0 }),
          horizonAccount({ id: 'a2', name: 'Second', sortOrder: 1 }),
        ]}
      />
    );

    const [, secondMoveUp] = screen.getAllByRole('button', {
      name: /move up/i,
    });
    fireEvent.click(secondMoveUp);

    await waitFor(() => expect(mockMove).toHaveBeenCalledWith('a2', 'up'));
  });

  it('shows an error toast when saving an edit fails', async () => {
    mockEdit.mockResolvedValue({ ok: false, error: 'Nope' });
    render(
      <AccountList
        accounts={[horizonAccount({ id: 'a1', name: 'Checking' })]}
      />
    );

    fireEvent.click(screen.getByText('Checking'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Nope'));
  });
});
