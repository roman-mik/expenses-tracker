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
    expect(screen.getByRole('link', { name: 'Horizon' })).toHaveAttribute(
      'href',
      '/horizon'
    );
    expect(screen.getByRole('link', { name: 'Horizon' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('marks Horizon as current when rendered on the horizon side', () => {
    render(<AppSwitcher current="horizon" />);
    expect(screen.getByRole('link', { name: 'Horizon' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Kapa' })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('hides the Horizon tab below lg only when Kapa is current', () => {
    const { unmount } = render(<AppSwitcher current="kapa" />);
    expect(screen.getByRole('link', { name: 'Horizon' }).className).toContain(
      'hidden'
    );
    unmount();

    render(<AppSwitcher current="horizon" />);
    expect(screen.getByRole('link', { name: 'Kapa' }).className).not.toContain(
      'hidden'
    );
  });
});
