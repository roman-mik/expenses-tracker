import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { ToastProvider, useToast } from './Toast';

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('Saved')}>fire-success</button>
      <button onClick={() => toast.error('Broke')}>fire-error</button>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('throws when useToast is used outside the provider', () => {
    const Bare = () => {
      useToast();
      return null;
    };
    expect(() => render(<Bare />)).toThrow(
      'useToast must be used within a ToastProvider'
    );
  });

  it('shows a message on fire and announces it politely', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('fire-success'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('auto-dismisses after 4 seconds', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('fire-error'));
    expect(screen.getByText('Broke')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Broke')).not.toBeInTheDocument();
  });

  it('dismisses on close-button click', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('fire-success'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});
