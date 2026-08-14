'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addExpense } from '@/app/actions/expenses';
import { formatMoney } from '@/lib/format';
import { CURRENCY_EXPONENT, type Category, type Currency } from '@/lib/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

export function AddExpenseForm({
  categories,
  currency,
  remaining,
}: {
  categories: Category[];
  currency: Currency;
  remaining: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [digits, setDigits] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The keypad enters whole major units (the design has no decimals); convert
  // to minor units for storage.
  const major = digits === '' ? 0 : Number(digits);
  const amountMinor = major * 10 ** CURRENCY_EXPONENT[currency];
  const leftAfter = remaining - amountMinor;

  const press = (k: string) =>
    setDigits((d) => (d === '' && k === '0' ? '' : (d + k).slice(0, 12)));
  const backspace = () => setDigits((d) => d.slice(0, -1));

  const canSubmit = amountMinor > 0 && !pending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await addExpense({
        amountMinor,
        categoryId: categoryId ?? undefined,
        note: note.trim() || undefined,
      });
      if (result.ok) {
        router.push('/');
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-7">
      {/* Amount */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-5xl">
            {formatMoney(amountMinor, currency)}
          </span>
          <span className="font-semibold text-ink/55">{currency}</span>
        </div>
        <p className={`text-sm ${leftAfter < 0 ? 'text-accent-700' : 'text-ink/55'}`}>
          {formatMoney(leftAfter, currency)} left after this
        </p>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.slice(0, 9).map((k) => (
          <KeypadButton key={k} onClick={() => press(k)}>
            {k}
          </KeypadButton>
        ))}
        <KeypadButton onClick={backspace} aria-label="Delete">
          ⌫
        </KeypadButton>
        <KeypadButton onClick={() => press('0')}>0</KeypadButton>
        <span aria-hidden />
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const selected = c.id === categoryId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(selected ? null : c.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-accent text-white'
                  : 'bg-surface text-ink/70 hover:bg-sand-300'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Note */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        maxLength={500}
        className="rounded-md bg-surface px-4 py-3 text-ink placeholder:text-ink/40 outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      {error ? <p className="text-sm text-accent-700">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="rounded-lg bg-accent text-white font-semibold py-4 shadow-md hover:bg-accent-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? 'Saving…' : 'Add expense'}
      </button>
    </div>
  );
}

function KeypadButton({
  children,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-surface py-4 text-xl font-medium text-ink hover:bg-sand-300 active:bg-sand-400 transition-colors"
      {...rest}
    >
      {children}
    </button>
  );
}
