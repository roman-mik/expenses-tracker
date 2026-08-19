import { getTranslations } from 'next-intl/server';

type ScreenKey =
  | 'today'
  | 'timeline'
  | 'moneyIn'
  | 'moneyOut'
  | 'scenarios'
  | 'targetRate'
  | 'assumptions';

/** Shared shape for the seven horizon screens until each gets real content. */
export async function HorizonPlaceholder({ screen }: { screen: ScreenKey }) {
  const tRail = await getTranslations('Horizon.rail');
  const tPlaceholder = await getTranslations('Horizon.placeholder');

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl">{tRail(screen)}</h1>
      <p className="mt-2 text-ink-muted">{tPlaceholder(screen)}</p>
    </div>
  );
}
