import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  createLedgerAccount,
  updateLedgerAccount,
  moveLedgerAccount,
} from './accounts';

describe('createLedgerAccount', () => {
  it('appends after the current highest sort_order when none is given', async () => {
    const { client, db } = fakeSupabase();
    db.seed('ledger_accounts', [
      {
        id: 'a1',
        household_id: 'h1',
        name: 'Checking',
        currency: 'RSD',
        current_balance_minor: 0,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
      {
        id: 'a2',
        household_id: 'h1',
        name: 'Savings',
        currency: 'EUR',
        current_balance_minor: 0,
        type: 'savings',
        include_in_total: true,
        sort_order: 3,
        archived: false,
      },
    ]);
    const created = await createLedgerAccount(client, 'h1', {
      name: 'Business',
      currency: 'USD',
      type: 'business',
    });
    expect(created.sortOrder).toBe(4);
  });

  it('defaults balance to 0 and includeInTotal to true', async () => {
    const { client } = fakeSupabase();
    const created = await createLedgerAccount(client, 'h1', {
      name: 'Checking',
      currency: 'RSD',
      type: 'personal',
    });
    expect(created.currentBalanceMinor).toBe(0);
    expect(created.includeInTotal).toBe(true);
    expect(created.sortOrder).toBe(0);
  });

  it('accepts a negative starting balance (overdraft)', async () => {
    const { client } = fakeSupabase();
    const created = await createLedgerAccount(client, 'h1', {
      name: 'Checking',
      currency: 'RSD',
      type: 'personal',
      currentBalanceMinor: -500,
    });
    expect(created.currentBalanceMinor).toBe(-500);
  });
});

describe('updateLedgerAccount', () => {
  it('returns null when the id is not in this household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('ledger_accounts', [
      {
        id: 'a1',
        household_id: 'other',
        name: 'Checking',
        currency: 'RSD',
        current_balance_minor: 0,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
    ]);
    expect(
      await updateLedgerAccount(client, 'h1', 'a1', { archived: true })
    ).toBeNull();
  });

  it('archives an account', async () => {
    const { client, db } = fakeSupabase();
    db.seed('ledger_accounts', [
      {
        id: 'a1',
        household_id: 'h1',
        name: 'Checking',
        currency: 'RSD',
        current_balance_minor: 0,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
    ]);
    const updated = await updateLedgerAccount(client, 'h1', 'a1', {
      archived: true,
    });
    expect(updated?.archived).toBe(true);
  });

  it('updates the balance, including to a negative value', async () => {
    const { client, db } = fakeSupabase();
    db.seed('ledger_accounts', [
      {
        id: 'a1',
        household_id: 'h1',
        name: 'Checking',
        currency: 'RSD',
        current_balance_minor: 1000,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
    ]);
    const updated = await updateLedgerAccount(client, 'h1', 'a1', {
      currentBalanceMinor: -200,
    });
    expect(updated?.currentBalanceMinor).toBe(-200);
  });
});

describe('moveLedgerAccount', () => {
  function seedThree(db: ReturnType<typeof fakeSupabase>['db']) {
    db.seed('ledger_accounts', [
      {
        id: 'a',
        household_id: 'h1',
        name: 'A',
        currency: 'RSD',
        current_balance_minor: 0,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
      {
        id: 'b',
        household_id: 'h1',
        name: 'B',
        currency: 'RSD',
        current_balance_minor: 0,
        type: 'personal',
        include_in_total: true,
        sort_order: 1,
        archived: false,
      },
      {
        id: 'c',
        household_id: 'h1',
        name: 'C',
        currency: 'RSD',
        current_balance_minor: 0,
        type: 'personal',
        include_in_total: true,
        sort_order: 2,
        archived: false,
      },
    ]);
  }

  it('swaps sort_order with the previous sibling', async () => {
    const { client, db } = fakeSupabase();
    seedThree(db);
    expect(await moveLedgerAccount(client, 'h1', 'b', 'up')).toBe(true);
    const rows = db.rows('ledger_accounts');
    expect(rows.find((r) => r.id === 'a')?.sort_order).toBe(1);
    expect(rows.find((r) => r.id === 'b')?.sort_order).toBe(0);
  });

  it('is a no-op at the top of the list', async () => {
    const { client, db } = fakeSupabase();
    seedThree(db);
    expect(await moveLedgerAccount(client, 'h1', 'a', 'up')).toBe(false);
  });

  it('is a no-op at the bottom of the list', async () => {
    const { client, db } = fakeSupabase();
    seedThree(db);
    expect(await moveLedgerAccount(client, 'h1', 'c', 'down')).toBe(false);
  });

  it('returns false for an id not in this household', async () => {
    const { client, db } = fakeSupabase();
    seedThree(db);
    expect(await moveLedgerAccount(client, 'h1', 'missing', 'down')).toBe(
      false
    );
  });
});
