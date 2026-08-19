import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { AppSwitcher } from './AppSwitcher';

describe('AppSwitcher', () => {
  it('marks Pocket as current and links to both apps', () => {
    render(<AppSwitcher current="pocket" />);
    expect(screen.getByRole('link', { name: 'Pocket' })).toHaveAttribute(
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
    expect(screen.getByRole('link', { name: 'Pocket' })).toHaveAttribute(
      'href',
      '/pocket'
    );
  });

  it('hides the Horizon tab below lg only when Pocket is current', () => {
    const { unmount } = render(<AppSwitcher current="pocket" />);
    expect(screen.getByRole('link', { name: 'Horizon' }).className).toContain(
      'hidden'
    );
    unmount();

    render(<AppSwitcher current="horizon" />);
    expect(
      screen.getByRole('link', { name: 'Pocket' }).className
    ).not.toContain('hidden');
  });
});
