/**
 * Horizon income Zod schemas, same idiom as `@/lib/horizon/validation`.
 */
import { z } from 'zod';
import { CURRENCIES } from '@/lib/types';
import {
  CONFIDENCE_VALUES,
  COVERS_PERIOD_VALUES,
  RECURRENCE_VALUES,
  SLIPPAGE_POLICIES,
} from '@/lib/horizon/types';

const incomeStreamBaseFields = {
  accountId: z.string().min(1),
  name: z.string().min(1).max(60),
  currency: z.enum(CURRENCIES),
  recurrence: z.enum(RECURRENCE_VALUES).optional(),
  confidence: z.enum(CONFIDENCE_VALUES).optional(),
  taxable: z.boolean().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
};

export const incomeStreamCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('hourly'),
    ...incomeStreamBaseFields,
    hourlyRateMinor: z.number().int().positive(),
    hoursPerDay: z.number().positive().max(24),
  }),
  z.object({
    kind: z.literal('fixed'),
    ...incomeStreamBaseFields,
    fixedAmountMinor: z.number().int(),
  }),
  z.object({
    kind: z.literal('variable'),
    ...incomeStreamBaseFields,
    fixedAmountMinor: z.number().int(),
  }),
]);

// Kind is fixed at creation — switching an hourly stream to fixed (or back)
// isn't a B1-B4 requirement, and doing it in place would leave dangling
// hourly/fixed fields to reconcile. Delete and recreate instead.
export const incomeStreamUpdateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    accountId: z.string().min(1).optional(),
    currency: z.enum(CURRENCIES).optional(),
    recurrence: z.enum(RECURRENCE_VALUES).optional(),
    confidence: z.enum(CONFIDENCE_VALUES).optional(),
    taxable: z.boolean().optional(),
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().optional(),
    archived: z.boolean().optional(),
    hourlyRateMinor: z.number().int().positive().optional(),
    hoursPerDay: z.number().positive().max(24).optional(),
    fixedAmountMinor: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes given.');

const scheduleCommonFields = {
  slippagePolicy: z.enum(SLIPPAGE_POLICIES).optional(),
  coversPeriod: z.enum(COVERS_PERIOD_VALUES).optional(),
};

// Schedules are create/delete only in this slice — no in-place edit of an
// existing rule's shape. The UI can offer "edit" as delete-then-recreate.
export const incomeScheduleCreateSchema = z.discriminatedUnion('kind', [
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

export const workCalendarUpdateSchema = z.object({
  workingWeekdays: z.array(z.number().int().min(0).max(6)).min(0).max(7),
});

export const holidayCreateSchema = z.object({
  date: z.string().min(1),
  name: z.string().min(1).max(60),
});

export type IncomeStreamCreateInput = z.infer<typeof incomeStreamCreateSchema>;
export type IncomeStreamUpdateInput = z.infer<typeof incomeStreamUpdateSchema>;
export type IncomeScheduleCreateInput = z.infer<
  typeof incomeScheduleCreateSchema
>;
export type WorkCalendarUpdateInput = z.infer<typeof workCalendarUpdateSchema>;
export type HolidayCreateInput = z.infer<typeof holidayCreateSchema>;
