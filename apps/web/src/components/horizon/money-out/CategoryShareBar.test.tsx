import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/intl';
import { CategoryShareBar } from './CategoryShareBar';
import type { CategoryShare } from '@/lib/horizon/spending/spending-math';
import type { Money } from '@/lib/types';

function share(partial: Partial<CategoryShare> = {}): CategoryShare {
  return {
    category: 'housing',
    totalMinor: 0 as Money,
    sharePct: 0,
    hasMissingRate: false,
    ...partial,
  };
}

describe('CategoryShareBar', () => {
  it('renders nothing when there are no shares', () => {
    const { container } = render(
      <CategoryShareBar shares={[]} reportingCurrency="RSD" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one segment per category, with percentages summing to 100%', () => {
    render(
      <CategoryShareBar
        shares={[
          share({
            category: 'housing',
            totalMinor: 60000 as Money,
            sharePct: 60,
          }),
          share({ category: 'debt', totalMinor: 40000 as Money, sharePct: 40 }),
        ]}
        reportingCurrency="RSD"
      />
    );

    expect(screen.getByText(/Housing/)).toBeInTheDocument();
    expect(screen.getByText(/Debt/)).toBeInTheDocument();
    expect(screen.getByText(/60%/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  it('flags a category with a missing FX rate instead of dropping it', () => {
    render(
      <CategoryShareBar
        shares={[
          share({
            category: 'subscriptions',
            totalMinor: 0 as Money,
            sharePct: 0,
            hasMissingRate: true,
          }),
        ]}
        reportingCurrency="RSD"
      />
    );

    expect(screen.getByText(/Subscriptions · 0%/)).toBeInTheDocument();
    expect(screen.getByText('missing rate')).toBeInTheDocument();
  });
});
