import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { AppSwitcher } from './AppSwitcher';

describe('AppSwitcher', () => {
  it('marks Kapa as current and links to both apps', () => {
    render(<AppSwitcher current="kapa" />);
    expect(screen.getByRole('link', { name: 'Kapa' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveAttribute(
      'href',
      '/ledger'
    );
    expect(screen.getByRole('link', { name: 'Ledger' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('marks Ledger as current when rendered on the ledger side', () => {
    render(<AppSwitcher current="ledger" />);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Kapa' })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('hides the Ledger tab below lg only when Kapa is current', () => {
    const { unmount } = render(<AppSwitcher current="kapa" />);
    expect(screen.getByRole('link', { name: 'Ledger' }).className).toContain(
      'hidden'
    );
    unmount();

    render(<AppSwitcher current="ledger" />);
    expect(screen.getByRole('link', { name: 'Kapa' }).className).not.toContain(
      'hidden'
    );
  });
});
