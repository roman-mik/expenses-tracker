/**
 * Horizon Zod schemas, same idiom as `@/lib/validation` — one source of truth
 * shared by the server actions and (eventually) the UI forms.
 */
import { z } from 'zod';
import { CURRENCIES } from '@/lib/types';
import { ACCOUNT_TYPES } from './types';

export const horizonAccountCreateSchema = z.object({
  name: z.string().min(1).max(60),
  currency: z.enum(CURRENCIES),
  type: z.enum(ACCOUNT_TYPES),
  // MAY be negative (overdraft) — no .nonnegative(), matching the DB's lack
  // of a check constraint on sign.
  currentBalanceMinor: z.number().int().optional(),
  includeInTotal: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const horizonAccountUpdateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    currency: z.enum(CURRENCIES).optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
    currentBalanceMinor: z.number().int().optional(),
    includeInTotal: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes given.');

export const horizonSettingsUpdateSchema = z.object({
  reportingCurrency: z.enum(CURRENCIES),
});

export const reconcileAccountBalanceSchema = z.object({
  accountId: z.string().min(1),
  balanceMinor: z.number().int(),
  note: z.string().max(500).optional(),
});

export const reconcileBalancesSchema = z.object({
  balances: z.array(reconcileAccountBalanceSchema).min(1),
});

export type HorizonAccountCreateInput = z.infer<
  typeof horizonAccountCreateSchema
>;
export type HorizonAccountUpdateInput = z.infer<
  typeof horizonAccountUpdateSchema
>;
export type HorizonSettingsUpdateInput = z.infer<
  typeof horizonSettingsUpdateSchema
>;
export type ReconcileAccountBalanceInput = z.infer<
  typeof reconcileAccountBalanceSchema
>;
export type ReconcileBalancesInput = z.infer<typeof reconcileBalancesSchema>;
