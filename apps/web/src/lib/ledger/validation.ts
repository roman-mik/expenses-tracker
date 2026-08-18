/**
 * Ledger Zod schemas, same idiom as `@/lib/validation` — one source of truth
 * shared by the server actions and (eventually) the UI forms.
 */
import { z } from 'zod';
import { CURRENCIES } from '@/lib/types';
import { ACCOUNT_TYPES } from './types';

export const ledgerAccountCreateSchema = z.object({
  name: z.string().min(1).max(60),
  currency: z.enum(CURRENCIES),
  type: z.enum(ACCOUNT_TYPES),
  // MAY be negative (overdraft) — no .nonnegative(), matching the DB's lack
  // of a check constraint on sign.
  currentBalanceMinor: z.number().int().optional(),
  includeInTotal: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const ledgerAccountUpdateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    currency: z.enum(CURRENCIES).optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
    currentBalanceMinor: z.number().int().optional(),
    includeInTotal: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes given.');

export const ledgerSettingsUpdateSchema = z.object({
  reportingCurrency: z.enum(CURRENCIES),
});

export type LedgerAccountCreateInput = z.infer<
  typeof ledgerAccountCreateSchema
>;
export type LedgerAccountUpdateInput = z.infer<
  typeof ledgerAccountUpdateSchema
>;
export type LedgerSettingsUpdateInput = z.infer<
  typeof ledgerSettingsUpdateSchema
>;
