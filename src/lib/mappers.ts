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
  Money,
  Profile,
} from './types';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  currency: string;
  timezone: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  archived: boolean;
}

export interface BudgetSettingsRow {
  monthly_cap: number;
  nudge_enabled: boolean;
  nudge_pct: number;
}

export interface ExpenseRow {
  id: string;
  category_id: string | null;
  amount_minor: number;
  currency: string;
  note: string | null;
  spent_at: string;
}

const money = (n: number): Money => n as Money;

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
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
  };
}
