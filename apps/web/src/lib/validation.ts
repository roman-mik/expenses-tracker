/**
 * Shared client + server validation (Zod). One source of truth so the web
 * form, the API, and a future mobile client can never drift.
 *
 * Note: `currency` is optional on expense create/update — when omitted, the
 * server defaults it to the household's currency. Either way, a DB check
 * constraint (0013_expense_currency_choice.sql) is the real backstop against
 * a spoofed value, since RLS alone can't validate it.
 */
import { z } from 'zod';
import { CATEGORY_COLORS } from './category-colors';
import { CURRENCIES } from './types';

export const expenseCreateSchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  spentAt: z.string().datetime().optional(),
});

export const expenseUpdateSchema = expenseCreateSchema.partial();

export const capUpdateSchema = z.object({
  monthlyCap: z.number().int().nonnegative(),
  nudgeEnabled: z.boolean().optional(),
  nudgePct: z.number().int().min(1).max(100).optional(),
});

export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.enum(CATEGORY_COLORS),
  sortOrder: z.number().int().optional(),
});

export const categoryUpdateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    color: z.enum(CATEGORY_COLORS).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes given.');

export const joinHouseholdSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

// Trimmed, 1-40 chars — matches the "short attribution label" use in the UI
// (TodayList / HistoryList / HouseholdPanel). Empty/whitespace-only clears it.
export const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .transform((v) => (v ? v : null)),
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
export type CapUpdateInput = z.infer<typeof capUpdateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type DisplayNameInput = z.infer<typeof displayNameSchema>;
