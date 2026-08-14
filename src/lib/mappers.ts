/**
 * Row → domain mappers, applied at the data-access edge so snake_case DB shapes
 * never leak into kapa-math or the UI. When `npm run gen:types` is wired up,
 * swap the local Row interfaces below for the generated Supabase types.
 */
import type {
  BudgetSettings,
  Category,
  Currency,
  Expense,
  Household,
  Money,
  Profile,
} from './types';

import { Database } from './supabase/database.types';

type Tables = Database['public']['Tables'];

type Row<T extends keyof Tables> = Tables[T]['Row'];

export type ProfileRow = Row<'profiles'>;

export type HouseholdRow = Row<'households'>;

export type CategoryRow = Row<'categories'>;

export type BudgetSettingsRow = Row<'budget_settings'>;

export type ExpenseRow = Row<'expenses'>;

const money = (n: number): Money => n as Money;

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
  };
}

export function toHousehold(row: HouseholdRow): Household {
  return {
    id: row.id,
    currency: row.currency as Currency,
    timezone: row.timezone,
  };
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

export function toBudgetSettings(row: BudgetSettingsRow): BudgetSettings {
  return {
    monthlyCap: money(row.monthly_cap),
    nudgeEnabled: row.nudge_enabled,
    nudgePct: row.nudge_pct,
  };
}

export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    categoryId: row.category_id,
    amountMinor: money(row.amount_minor),
    currency: row.currency as Currency,
    note: row.note,
    spentAt: row.spent_at,
    addedBy: row.user_id,
  };
}
