import { describe, expect, it } from 'vitest';
import { attributionLabel } from './attribution';
import type { HouseholdMember } from './types';

const labels = {
  you: 'you',
  partner: 'partner',
  formerMember: 'former member',
};

const bob: HouseholdMember = {
  userId: 'bob',
  displayName: 'Bob',
  role: 'member',
};

describe('attributionLabel', () => {
  it('labels the viewer\'s own expense "you"', () => {
    expect(attributionLabel('alice', 'alice', undefined, labels)).toBe('you');
  });

  it("uses the co-member's display name when known", () => {
    expect(attributionLabel('bob', 'alice', bob, labels)).toBe('Bob');
  });

  it('falls back to "partner" when the co-member has no display name set', () => {
    const nameless: HouseholdMember = { ...bob, displayName: null };
    expect(attributionLabel('bob', 'alice', nameless, labels)).toBe('partner');
  });

  it('falls back to "partner" when the co-member has a blank display name', () => {
    const blank: HouseholdMember = { ...bob, displayName: '   ' };
    expect(attributionLabel('bob', 'alice', blank, labels)).toBe('partner');
  });

  it('renders a neutral label for an expense whose attributed member deleted their account', () => {
    // addedBy is null once the FK's ON DELETE SET NULL fires (0007_expense_attribution.sql).
    expect(attributionLabel(null, 'alice', undefined, labels)).toBe(
      'former member'
    );
  });
});
