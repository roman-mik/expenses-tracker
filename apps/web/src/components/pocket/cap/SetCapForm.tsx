'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setCap } from '@/app/actions/cap';
import { formatMoney } from '@/lib/format';
import { remaining, safeDaily } from '@/lib/pocket-math';
import type { Currency } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

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
  const t = useTranslations('Cap');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [cap, setCapValue] = useState(
    Math.min(Math.max(initialCap || MIN, MIN), MAX)
  );
  const [nudgeEnabled, setNudgeEnabled] = useState(initialNudgeEnabled);

  // Same pure math the API uses, so consequences match the home screen exactly.
  const rem = remaining(cap, spent);
  const perDay = safeDaily(rem, daysLeft);
  const perWeek = perDay * 7;

  const save = () => {
    startTransition(async () => {
      const result = await setCap({
        monthlyCap: cap,
        nudgeEnabled,
        nudgePct: initialNudgePct,
      });
      if (result.ok) {
        toast.success(t('capUpdated'));
        router.push('/pocket');
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {t('monthlyCap')}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-5xl">
            {formatMoney(cap, currency)}
          </span>
          <span className="font-semibold text-ink-muted">{currency}</span>
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
        aria-label={t('monthlyCapAria')}
      />

      <div className="rounded-lg bg-surface p-5 flex flex-col gap-3">
        <Consequence
          label={t('safeADay')}
          value={`${formatMoney(Math.round(perDay), currency)} ${currency}`}
        />
        <Consequence
          label={t('safeAWeek')}
          value={`${formatMoney(Math.round(perWeek), currency)} ${currency}`}
        />
        <Consequence
          label={t('alreadySpent')}
          value={`${formatMoney(spent, currency)} ${currency}`}
        />
      </div>

      <label className="flex items-center justify-between">
        <span className="text-ink/80">
          {t('nudgeMe', { pct: initialNudgePct })}
        </span>
        <input
          type="checkbox"
          checked={nudgeEnabled}
          onChange={(e) => setNudgeEnabled(e.target.checked)}
          className="size-5 accent-accent"
        />
      </label>

      <Button type="button" onClick={save} disabled={pending} className="py-4">
        {pending ? tCommon('saving') : t('saveCap')}
      </Button>
    </div>
  );
}

function Consequence({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
