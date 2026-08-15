import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { createCategory, updateCategory, moveCategory } from './categories';

describe('createCategory', () => {
  it('appends after the current highest sort_order when none is given', async () => {
    const { client, db } = fakeSupabase();
    db.seed('categories', [
      {
        id: 'c1',
        household_id: 'h1',
        name: 'Groceries',
        color: 'sage-500',
        sort_order: 0,
        archived: false,
      },
      {
        id: 'c2',
        household_id: 'h1',
        name: 'Fun',
        color: 'accent-500',
        sort_order: 3,
        archived: false,
      },
    ]);
    const created = await createCategory(client, 'h1', {
      name: 'Transport',
      color: 'sage-500',
    });
    expect(created.sortOrder).toBe(4);
  });

  it('starts at 0 for the first category in a household', async () => {
    const { client } = fakeSupabase();
    const created = await createCategory(client, 'h1', {
      name: 'Groceries',
      color: 'sage-500',
    });
    expect(created.sortOrder).toBe(0);
  });
});

describe('updateCategory', () => {
  it('returns null when the id is not in this household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('categories', [
      {
        id: 'c1',
        household_id: 'other',
        name: 'Fun',
        color: 'accent-500',
        sort_order: 0,
        archived: false,
      },
    ]);
    expect(
      await updateCategory(client, 'h1', 'c1', { archived: true })
    ).toBeNull();
  });

  it('archives a category', async () => {
    const { client, db } = fakeSupabase();
    db.seed('categories', [
      {
        id: 'c1',
        household_id: 'h1',
        name: 'Fun',
        color: 'accent-500',
        sort_order: 0,
        archived: false,
      },
    ]);
    const updated = await updateCategory(client, 'h1', 'c1', {
      archived: true,
    });
    expect(updated?.archived).toBe(true);
  });
});

describe('moveCategory', () => {
  function seedThree(db: ReturnType<typeof fakeSupabase>['db']) {
    db.seed('categories', [
      {
        id: 'a',
        household_id: 'h1',
        name: 'A',
        color: 'sage-500',
        sort_order: 0,
        archived: false,
      },
      {
        id: 'b',
        household_id: 'h1',
        name: 'B',
        color: 'sage-500',
        sort_order: 1,
        archived: false,
      },
      {
        id: 'c',
        household_id: 'h1',
        name: 'C',
        color: 'sage-500',
        sort_order: 2,
        archived: false,
      },
    ]);
  }

  it('swaps sort_order with the previous sibling', async () => {
    const { client, db } = fakeSupabase();
    seedThree(db);
    expect(await moveCategory(client, 'h1', 'b', 'up')).toBe(true);
    const rows = db.rows('categories');
    expect(rows.find((r) => r.id === 'a')?.sort_order).toBe(1);
    expect(rows.find((r) => r.id === 'b')?.sort_order).toBe(0);
  });

  it('is a no-op at the top of the list', async () => {
    const { client, db } = fakeSupabase();
    seedThree(db);
    expect(await moveCategory(client, 'h1', 'a', 'up')).toBe(false);
  });

  it('is a no-op at the bottom of the list', async () => {
    const { client, db } = fakeSupabase();
    seedThree(db);
    expect(await moveCategory(client, 'h1', 'c', 'down')).toBe(false);
  });

  it('returns false for an id not in this household', async () => {
    const { client, db } = fakeSupabase();
    seedThree(db);
    expect(await moveCategory(client, 'h1', 'missing', 'down')).toBe(false);
  });
});
