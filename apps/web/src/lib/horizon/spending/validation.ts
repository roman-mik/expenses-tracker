/**
 * Horizon obligation/spending Zod schemas, same idiom as
 * `@/lib/horizon/income/validation`.
 */
import { z } from 'zod';
import { CURRENCIES } from '@/lib/types';
import {
  CONFIDENCE_VALUES,
  COVERS_PERIOD_VALUES,
  RECURRENCE_VALUES,
  SLIPPAGE_POLICIES,
} from '@/lib/horizon/types';
import {
  CHARGE_CADENCES,
  OBLIGATION_CATEGORIES,
  ONE_OFF_CATEGORIES,
  ONE_OFF_DIRECTIONS,
} from './types';

export const obligationCreateSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(60),
  category: z.enum(OBLIGATION_CATEGORIES),
  amountMinor: z.number().int(),
  currency: z.enum(CURRENCIES),
  recurrence: z.enum(RECURRENCE_VALUES).optional(),
  confidence: z.enum(CONFIDENCE_VALUES).optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export const obligationUpdateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    accountId: z.string().min(1).optional(),
    category: z.enum(OBLIGATION_CATEGORIES).optional(),
    amountMinor: z.number().int().optional(),
    currency: z.enum(CURRENCIES).optional(),
    recurrence: z.enum(RECURRENCE_VALUES).optional(),
    confidence: z.enum(CONFIDENCE_VALUES).optional(),
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes given.');

const scheduleCommonFields = {
  slippagePolicy: z.enum(SLIPPAGE_POLICIES).optional(),
  coversPeriod: z.enum(COVERS_PERIOD_VALUES).optional(),
};

// Schedules are create/delete only, same discipline as income schedules —
// no in-place edit of an existing rule's shape.
export const obligationScheduleCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dayOfMonth'),
    dayOfMonth: z.number().int().min(1).max(31),
    ...scheduleCommonFields,
  }),
  z.object({
    kind: z.literal('monthEnd'),
    ...scheduleCommonFields,
  }),
  z.object({
    kind: z.literal('everyNDays'),
    intervalDays: z.number().int().positive(),
    anchorDate: z.string().min(1),
    ...scheduleCommonFields,
  }),
  z.object({
    kind: z.literal('nthWeekday'),
    nthWeekday: z.number().int().min(1).max(5),
    weekday: z.number().int().min(0).max(6),
    ...scheduleCommonFields,
  }),
  z.object({
    kind: z.literal('oneOff'),
    anchorDate: z.string().min(1),
    ...scheduleCommonFields,
  }),
]);

export const dailyExpenseCreateSchema = z.object({
  accountId: z.string().min(1),
  pocketCategoryId: z.string().min(1).optional(),
  name: z.string().min(1).max(60),
  dailyAmountMinor: z.number().int().positive(),
  currency: z.enum(CURRENCIES),
  chargeCadence: z.enum(CHARGE_CADENCES).optional(),
  capMinor: z.number().int().positive().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1).optional(),
});

export const dailyExpenseUpdateSchema = z
  .object({
    accountId: z.string().min(1).optional(),
    pocketCategoryId: z.string().min(1).nullable().optional(),
    name: z.string().min(1).max(60).optional(),
    dailyAmountMinor: z.number().int().positive().optional(),
    currency: z.enum(CURRENCIES).optional(),
    chargeCadence: z.enum(CHARGE_CADENCES).optional(),
    capMinor: z.number().int().positive().nullable().optional(),
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes given.');

export const oneOffEventCreateSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(60),
  category: z.enum(ONE_OFF_CATEGORIES),
  amountMinor: z.number().int().positive(),
  currency: z.enum(CURRENCIES),
  date: z.string().min(1),
  direction: z.enum(ONE_OFF_DIRECTIONS),
});

export const oneOffEventUpdateSchema = z
  .object({
    accountId: z.string().min(1).optional(),
    name: z.string().min(1).max(60).optional(),
    category: z.enum(ONE_OFF_CATEGORIES).optional(),
    amountMinor: z.number().int().positive().optional(),
    currency: z.enum(CURRENCIES).optional(),
    date: z.string().min(1).optional(),
    direction: z.enum(ONE_OFF_DIRECTIONS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes given.');

export type ObligationCreateInput = z.infer<typeof obligationCreateSchema>;
export type ObligationUpdateInput = z.infer<typeof obligationUpdateSchema>;
export type ObligationScheduleCreateInput = z.infer<
  typeof obligationScheduleCreateSchema
>;
export type DailyExpenseCreateInput = z.infer<typeof dailyExpenseCreateSchema>;
export type DailyExpenseUpdateInput = z.infer<typeof dailyExpenseUpdateSchema>;
export type OneOffEventCreateInput = z.infer<typeof oneOffEventCreateSchema>;
export type OneOffEventUpdateInput = z.infer<typeof oneOffEventUpdateSchema>;
