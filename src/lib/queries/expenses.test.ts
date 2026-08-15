import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { listExpenses, getExpense } from './expenses';

function seedHousehold(db: ReturnType<typeof fakeSupabase>['db'], id = 'h1') {
  db.seed('households', [{ id, currency: 'RSD', timezone: 'Europe/Belgrade' }]);
}

describe('listExpenses', () => {
  it('is scoped to the household and ordered newest-first', async () => {
    const { client, db } = fakeSupabase();
    seedHousehold(db);
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: null,
        amount_minor: 100,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: 'u1',
      },
      {
        id: 'e2',
        household_id: 'h1',
        category_id: null,
        amount_minor: 200,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-05T00:00:00.000Z',
        user_id: 'u1',
      },
      {
        id: 'e3',
        household_id: 'other',
        category_id: null,
        amount_minor: 300,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-03T00:00:00.000Z',
        user_id: 'u1',
      },
    ]);
    const result = await listExpenses(client, 'h1');
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('filters by category when categoryId is given', async () => {
    const { client, db } = fakeSupabase();
    seedHousehold(db);
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: 'groceries',
        amount_minor: 100,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: 'u1',
      },
      {
        id: 'e2',
        household_id: 'h1',
        category_id: 'fun',
        amount_minor: 200,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-02T00:00:00.000Z',
        user_id: 'u1',
      },
    ]);
    const result = await listExpenses(client, 'h1', {
      categoryId: 'groceries',
    });
    expect(result.map((e) => e.id)).toEqual(['e1']);
  });

  it('filters to the given month window using the household timezone', async () => {
    const { client, db } = fakeSupabase();
    seedHousehold(db);
    db.seed('expenses', [
      {
        id: 'july',
        household_id: 'h1',
        category_id: null,
        amount_minor: 100,
        currency: 'RSD',
        note: null,
        spent_at: '2026-07-31T20:00:00.000Z',
        user_id: 'u1',
      },
      {
        id: 'aug',
        household_id: 'h1',
        category_id: null,
        amount_minor: 100,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-15T12:00:00.000Z',
        user_id: 'u1',
      },
      {
        id: 'sep',
        household_id: 'h1',
        category_id: null,
        amount_minor: 100,
        currency: 'RSD',
        note: null,
        spent_at: '2026-09-01T00:00:00.000Z',
        user_id: 'u1',
      },
    ]);
    const result = await listExpenses(client, 'h1', { month: '2026-08' });
    expect(result.map((e) => e.id)).toEqual(['aug']);
  });
});

describe('getExpense', () => {
  it('returns null for an id in a different household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'other',
        category_id: null,
        amount_minor: 100,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: 'u1',
      },
    ]);
    expect(await getExpense(client, 'h1', 'e1')).toBeNull();
  });

  it('returns the mapped expense when it belongs to the household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: null,
        amount_minor: 100,
        currency: 'RSD',
        note: 'coffee',
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: 'u1',
      },
    ]);
    expect(await getExpense(client, 'h1', 'e1')).toEqual(
      expect.objectContaining({ id: 'e1', note: 'coffee' })
    );
  });
});
