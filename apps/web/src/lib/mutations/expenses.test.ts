import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { createExpense, updateExpense, deleteExpense } from './expenses';

const UPDATED_AT = '2026-08-01T00:00:00.000Z';

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
  it('returns not_found when the id is not in this household', async () => {
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
        updated_at: UPDATED_AT,
      },
    ]);
    const result = await updateExpense(
      client,
      'h1',
      'e1',
      { amountMinor: 200 },
      UPDATED_AT
    );
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns conflict when the id exists but updated_at has moved on', async () => {
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
        updated_at: '2026-08-02T00:00:00.000Z', // moved on since the caller read it
      },
    ]);
    const result = await updateExpense(
      client,
      'h1',
      'e1',
      { amountMinor: 200 },
      UPDATED_AT // stale token
    );
    expect(result).toEqual({ ok: false, reason: 'conflict' });
    // Nothing was written on a conflict.
    expect(db.rows('expenses')[0].amount_minor).toBe(100);
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
        updated_at: UPDATED_AT,
      },
    ]);
    const result = await updateExpense(
      client,
      'h1',
      'e1',
      { amountMinor: 200 },
      UPDATED_AT
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.expense).toMatchObject({
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
        updated_at: UPDATED_AT,
      },
    ]);
    const result = await updateExpense(
      client,
      'h1',
      'e1',
      { categoryId: null },
      UPDATED_AT
    );
    expect(result.ok && result.expense.categoryId).toBeNull();
  });
});

describe('deleteExpense', () => {
  it('returns not_found when the id is not in this household', async () => {
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
        updated_at: UPDATED_AT,
      },
    ]);
    const result = await deleteExpense(client, 'h1', 'e1', UPDATED_AT);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(db.rows('expenses')).toHaveLength(1);
  });

  it('returns conflict, and does not delete, when updated_at has moved on', async () => {
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
        updated_at: '2026-08-02T00:00:00.000Z',
      },
    ]);
    const result = await deleteExpense(client, 'h1', 'e1', UPDATED_AT);
    expect(result).toEqual({ ok: false, reason: 'conflict' });
    expect(db.rows('expenses')).toHaveLength(1);
  });

  it('removes the row and returns ok when it matches', async () => {
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
        updated_at: UPDATED_AT,
      },
    ]);
    const result = await deleteExpense(client, 'h1', 'e1', UPDATED_AT);
    expect(result).toEqual({ ok: true });
    expect(db.rows('expenses')).toHaveLength(0);
  });
});
