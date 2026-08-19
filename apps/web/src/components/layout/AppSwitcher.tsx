import Link from 'next/link';
import { useTranslations } from 'next-intl';

type App = 'kapa' | 'horizon';

function tabClassName(active: boolean, hideOnMobile: boolean) {
  return [
    hideOnMobile ? 'hidden lg:inline-flex' : 'inline-flex',
    'rounded-md px-2.5 py-1 text-sm font-medium',
    active ? 'bg-accent-600 text-white' : 'text-ink-muted hover:text-ink',
  ].join(' ');
}

/**
 * Two-tab control marking which app the user is in. Used on Kapa's home
 * (`AppHeader`) and inside `HorizonRail`. The Horizon tab hides below `lg`
 * when rendered on the Kapa side — `/horizon` gates on desktop anyway, so a
 * phone-visible link there is a dead end. Inside `HorizonRail` this
 * component only ever renders above `lg` already, so nothing needs hiding.
 */
export function AppSwitcher({ current }: { current: App }) {
  const t = useTranslations('Nav');

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-sand-300 bg-surface p-1">
      <Link
        href="/"
        aria-current={current === 'kapa' ? 'page' : undefined}
        className={tabClassName(current === 'kapa', false)}
      >
        {t('kapa')}
      </Link>
      <Link
        href="/horizon"
        aria-current={current === 'horizon' ? 'page' : undefined}
        className={tabClassName(current === 'horizon', current === 'kapa')}
      >
        {t('horizon')}
      </Link>
    </div>
  );
}
