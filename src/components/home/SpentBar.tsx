import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

export function SpentBar({
  spent,
  cap,
  spentPct,
  currency,
}: {
  spent: number;
  cap: number;
  spentPct: number;
  currency: Currency;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-4 rounded-full bg-sand-300 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${spentPct}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-ink/60">
        <span>
          <strong className="text-accent-700">{formatMoney(spent, currency)}</strong>{' '}
          spent
        </span>
        <span>of {formatMoney(cap, currency)}</span>
      </div>
    </div>
  );
}
