import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { createExpense, updateExpense, deleteExpense } from './expenses';

describe('createExpense', () => {
  it('stamps the currency from the household, not the input', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [{ id: 'h1', currency: 'EUR' }]);
    const expense = await createExpense(client, 'h1', 'u1', {
      amountMinor: 500,
      categoryId: null,
    });
    expect(expense.currency).toBe('EUR');
    expect(expense.addedBy).toBe('u1');
  });

  it('falls back to RSD when the household is unseeded', async () => {
    const { client } = fakeSupabase();
    const expense = await createExpense(client, 'h1', 'u1', {
      amountMinor: 500,
      categoryId: null,
    });
    expect(expense.currency).toBe('RSD');
  });
});

describe('updateExpense', () => {
  it('returns null when the id is not in this household', async () => {
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
    expect(
      await updateExpense(client, 'h1', 'e1', { amountMinor: 200 })
    ).toBeNull();
  });

  it('only touches fields explicitly present in the input', async () => {
    const { client, db } = fakeSupabase();
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: 'groceries',
        amount_minor: 100,
        currency: 'RSD',
        note: 'old note',
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: 'u1',
      },
    ]);
    const updated = await updateExpense(client, 'h1', 'e1', {
      amountMinor: 200,
    });
    expect(updated).toMatchObject({
      amountMinor: 200,
      note: 'old note',
      categoryId: 'groceries',
    });
  });

  it('clears the category when explicitly set to null', async () => {
    const { client, db } = fakeSupabase();
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
    ]);
    const updated = await updateExpense(client, 'h1', 'e1', {
      categoryId: null,
    });
    expect(updated?.categoryId).toBeNull();
  });
});

describe('deleteExpense', () => {
  it('returns false when the id is not in this household', async () => {
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
    expect(await deleteExpense(client, 'h1', 'e1')).toBe(false);
    expect(db.rows('expenses')).toHaveLength(1);
  });

  it('removes the row and returns true when it matches', async () => {
    const { client, db } = fakeSupabase();
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
    ]);
    expect(await deleteExpense(client, 'h1', 'e1')).toBe(true);
    expect(db.rows('expenses')).toHaveLength(0);
  });
});
