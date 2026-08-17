import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { HouseholdPanel } from './HouseholdPanel';
import { member } from '@/test/factories';

const mockMintInvite = vi.fn();
const mockJoinHousehold = vi.fn();
const mockLeaveHousehold = vi.fn();
vi.mock('@/app/actions/household', () => ({
  mintInvite: (...args: unknown[]) => mockMintInvite(...args),
  joinHousehold: (...args: unknown[]) => mockJoinHousehold(...args),
  leaveHousehold: (...args: unknown[]) => mockLeaveHousehold(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HouseholdPanel', () => {
  it('shows "Just you" with a single member', () => {
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' })]}
        invite={null}
        currentUserId="u1"
      />
    );
    expect(screen.getByText('Just you')).toBeInTheDocument();
  });

  it('mints an invite code on request', async () => {
    mockMintInvite.mockResolvedValue({ ok: true, code: 'NEWCODE1' });
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' })]}
        invite={null}
        currentUserId="u1"
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite code' })
    );

    await waitFor(() =>
      expect(screen.getByText('NEWCODE1')).toBeInTheDocument()
    );
  });

  it('shows an error toast when minting fails', async () => {
    mockMintInvite.mockResolvedValue({
      ok: false,
      error: 'Could not create a code',
    });
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' })]}
        invite={null}
        currentUserId="u1"
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite code' })
    );

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Could not create a code')
    );
  });

  it('joins a household by code', async () => {
    mockJoinHousehold.mockResolvedValue({ ok: true });
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' })]}
        invite={null}
        currentUserId="u1"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('ABCD1234'), {
      target: { value: 'abcd1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Joined the household')
    );
    expect(mockJoinHousehold).toHaveBeenCalledWith({ code: 'ABCD1234' });
  });

  it('shows translated copy for a stable join error code, not raw server text', async () => {
    mockJoinHousehold.mockResolvedValue({
      ok: false,
      error:
        "You'd need to leave your current household first — it has other members",
    });
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' })]}
        invite={null}
        currentUserId="u1"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('ABCD1234'), {
      target: { value: 'abcd1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "You'd need to leave your current household first — it has other members"
      )
    );
  });

  it('falls back to a generic message for an unrecognized error code', async () => {
    mockJoinHousehold.mockResolvedValue({ ok: false, error: 'Could not join' });
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' })]}
        invite={null}
        currentUserId="u1"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('ABCD1234'), {
      target: { value: 'abcd1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Could not join')
    );
  });

  it('does not show a leave option for a solo household', () => {
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' })]}
        invite={null}
        currentUserId="u1"
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Leave household' })
    ).not.toBeInTheDocument();
  });

  it('leaves the household after a two-step confirm', async () => {
    mockLeaveHousehold.mockResolvedValue({ ok: true });
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' }), member({ userId: 'u2' })]}
        invite={null}
        currentUserId="u1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave household' }));
    expect(mockLeaveHousehold).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Leave for good?' }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "You've left — welcome to your new household"
      )
    );
    expect(mockLeaveHousehold).toHaveBeenCalledTimes(1);
  });

  it('shows a friendly error when leaving fails', async () => {
    mockLeaveHousehold.mockResolvedValue({
      ok: false,
      error: "You're the only member — there's nothing to leave",
    });
    render(
      <HouseholdPanel
        members={[member({ userId: 'u1' }), member({ userId: 'u2' })]}
        invite={null}
        currentUserId="u1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave household' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave for good?' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "You're the only member — there's nothing to leave"
      )
    );
  });
});
