/**
 * Shared client + server validation (Zod). One source of truth so the web
 * form, the API, and a future mobile client can never drift.
 *
 * Note: `currency` is intentionally NOT accepted from the client on expense
 * create — the server stamps it from the user's profile so history stays
 * currency-stable and can't be spoofed.
 */
import { z } from "zod";

export const monthParamSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be 'YYYY-MM'");

export const expenseCreateSchema = z.object({
  amountMinor: z.number().int().nonnegative(),
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
  color: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
export type CapUpdateInput = z.infer<typeof capUpdateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
