'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCap } from '@/app/actions/cap';
import { formatMoney } from '@/lib/format';
import { remaining, safeDaily } from '@/lib/kapa-math';
import type { Currency } from '@/lib/types';

const MIN = 20_000;
const MAX = 300_000;
const STEP = 1_000;

export function SetCapForm({
  currency,
  spent,
  daysLeft,
  initialCap,
  initialNudgeEnabled,
  initialNudgePct,
}: {
  currency: Currency;
  spent: number;
  daysLeft: number;
  initialCap: number;
  initialNudgeEnabled: boolean;
  initialNudgePct: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cap, setCapValue] = useState(
    Math.min(Math.max(initialCap || MIN, MIN), MAX)
  );
  const [nudgeEnabled, setNudgeEnabled] = useState(initialNudgeEnabled);
  const [error, setError] = useState<string | null>(null);

  // Same pure math the API uses, so consequences match the home screen exactly.
  const rem = remaining(cap, spent);
  const perDay = safeDaily(rem, daysLeft);
  const perWeek = perDay * 7;

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setCap({
        monthlyCap: cap,
        nudgeEnabled,
        nudgePct: initialNudgePct,
      });
      if (result.ok) {
        router.push('/');
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-semibold tracking-wider uppercase text-ink/50">
          Monthly cap
        </span>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-5xl">
            {formatMoney(cap, currency)}
          </span>
          <span className="font-semibold text-ink/55">{currency}</span>
        </div>
      </div>

      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={cap}
        onChange={(e) => setCapValue(Number(e.target.value))}
        className="w-full accent-accent"
        aria-label="Monthly cap"
      />

      <div className="rounded-lg bg-surface p-5 flex flex-col gap-3">
        <Consequence
          label="Safe a day"
          value={`${formatMoney(Math.round(perDay), currency)} ${currency}`}
        />
        <Consequence
          label="Safe a week"
          value={`${formatMoney(Math.round(perWeek), currency)} ${currency}`}
        />
        <Consequence
          label="Already spent this month"
          value={`${formatMoney(spent, currency)} ${currency}`}
        />
      </div>

      <label className="flex items-center justify-between">
        <span className="text-ink/80">Nudge me at {initialNudgePct}%</span>
        <input
          type="checkbox"
          checked={nudgeEnabled}
          onChange={(e) => setNudgeEnabled(e.target.checked)}
          className="size-5 accent-accent"
        />
      </label>

      {error ? <p className="text-sm text-accent-700">{error}</p> : null}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-lg bg-accent text-white font-semibold py-4 shadow-md hover:bg-accent-600 transition-colors disabled:opacity-40"
      >
        {pending ? 'Saving…' : 'Save cap'}
      </button>
    </div>
  );
}

function Consequence({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink/60">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
