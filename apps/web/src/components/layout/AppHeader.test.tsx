import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  it('links the menu trigger to the popover panel', () => {
    render(<AppHeader />);
    const trigger = screen.getByRole('button', { name: 'Menu' });
    const panel = document.getElementById('app-menu');

    expect(panel).not.toBeNull();
    expect(trigger.getAttribute('popovertarget')).toBe(panel!.id);
  });

  it('renders the four destinations with correct hrefs', () => {
    // jsdom's default stylesheet hides [popover] panels until opened (it has
    // no showPopover() to open them), so accessible-role queries can't see
    // the links — query with { hidden: true } instead.
    render(<AppHeader />);
    expect(
      screen.getByRole('link', { name: /set cap/i, hidden: true })
    ).toHaveAttribute('href', '/cap');
    expect(
      screen.getByRole('link', { name: /categories/i, hidden: true })
    ).toHaveAttribute('href', '/categories');
    expect(
      screen.getByRole('link', { name: /household/i, hidden: true })
    ).toHaveAttribute('href', '/household');
    expect(
      screen.getByRole('link', { name: /settings/i, hidden: true })
    ).toHaveAttribute('href', '/settings');
  });

  it('renders the app switcher with Kapa marked current', () => {
    render(<AppHeader />);
    expect(screen.getByRole('link', { name: 'Kapa' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Horizon' })).toHaveAttribute(
      'href',
      '/horizon'
    );
  });
});
