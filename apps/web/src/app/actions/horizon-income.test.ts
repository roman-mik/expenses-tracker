import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/dal', () => ({
  verifySession: vi.fn(),
  getHouseholdId: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { verifySession, getHouseholdId } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  addHoliday,
  addIncomeSchedule,
  addIncomeStream,
  deleteHoliday,
  deleteIncomeSchedule,
  deleteIncomeStream,
  editIncomeStream,
  setWorkCalendar,
} from './horizon-income';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

const hourlyInput = {
  kind: 'hourly',
  accountId: 'a1',
  name: 'Freelance',
  currency: 'RSD',
  hourlyRateMinor: 5000,
  hoursPerDay: 8,
  startDate: '2026-01-01',
};

describe('addIncomeStream', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await addIncomeStream(hourlyInput)).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('rejects invalid input', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addIncomeStream({ kind: 'hourly' });
    expect(result.ok).toBe(false);
  });

  it('creates the stream on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await addIncomeStream(hourlyInput)).toEqual({ ok: true });
  });
});

describe('editIncomeStream', () => {
  it('reports a friendly error when the stream is not found', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await editIncomeStream('missing', { archived: true });
    expect(result).toEqual({
      ok: false,
      error: "That income stream couldn't be found.",
    });
  });
});

describe('deleteIncomeStream', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await deleteIncomeStream('s1')).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('reports a friendly error when nothing matched', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await deleteIncomeStream('missing')).toEqual({
      ok: false,
      error: "That income stream couldn't be found.",
    });
  });
});

describe('addIncomeSchedule / deleteIncomeSchedule', () => {
  it('adds a schedule to a stream', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(
      await addIncomeSchedule('s1', { kind: 'dayOfMonth', dayOfMonth: 15 })
    ).toEqual({ ok: true });
  });

  it('rejects an invalid schedule shape', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addIncomeSchedule('s1', { kind: 'dayOfMonth' });
    expect(result.ok).toBe(false);
  });

  it('reports a friendly error deleting a missing schedule', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await deleteIncomeSchedule('missing')).toEqual({
      ok: false,
      error: "That schedule couldn't be found.",
    });
  });
});

describe('setWorkCalendar', () => {
  it('rejects an out-of-range weekday', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await setWorkCalendar({ workingWeekdays: [7] });
    expect(result.ok).toBe(false);
  });

  it('saves on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await setWorkCalendar({ workingWeekdays: [1, 2, 3, 4, 5] })).toEqual(
      { ok: true }
    );
  });
});

describe('addHoliday / deleteHoliday', () => {
  it('adds a holiday', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(
      await addHoliday({ date: '2026-01-01', name: "New Year's" })
    ).toEqual({ ok: true });
  });

  it('reports a friendly error deleting a missing holiday', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await deleteHoliday('missing')).toEqual({
      ok: false,
      error: "That holiday couldn't be found.",
    });
  });
});
