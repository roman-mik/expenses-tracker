import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { getCategories } from './categories';

describe('getCategories', () => {
  it('returns categories for the household, ordered by sort_order', async () => {
    const { client, db } = fakeSupabase();
    db.seed('categories', [
      {
        id: 'c2',
        household_id: 'h1',
        name: 'Fun',
        color: 'accent-500',
        sort_order: 1,
        archived: false,
      },
      {
        id: 'c1',
        household_id: 'h1',
        name: 'Groceries',
        color: 'sage-500',
        sort_order: 0,
        archived: false,
      },
      {
        id: 'c3',
        household_id: 'other',
        name: 'Nope',
        color: 'sage-500',
        sort_order: 0,
        archived: false,
      },
    ]);
    const result = await getCategories(client, 'h1');
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('returns an empty array when the household has no categories', async () => {
    const { client } = fakeSupabase();
    expect(await getCategories(client, 'h1')).toEqual([]);
  });
});
