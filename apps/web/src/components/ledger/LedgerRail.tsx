'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { AppSwitcher } from '@/components/layout/AppSwitcher';
import {
  HomeIcon,
  TimelineIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  LayersIcon,
  TargetIcon,
  GearIcon,
} from '@/components/ui/icons';

const links = [
  { href: '/ledger', labelKey: 'today', icon: HomeIcon },
  { href: '/ledger/timeline', labelKey: 'timeline', icon: TimelineIcon },
  { href: '/ledger/money-in', labelKey: 'moneyIn', icon: TrendingUpIcon },
  { href: '/ledger/money-out', labelKey: 'moneyOut', icon: TrendingDownIcon },
  { href: '/ledger/scenarios', labelKey: 'scenarios', icon: LayersIcon },
  { href: '/ledger/target-rate', labelKey: 'targetRate', icon: TargetIcon },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/ledger' ? pathname === href : pathname.startsWith(href);
}

function itemClassName(active: boolean) {
  return [
    'w-full justify-start gap-3 px-3',
    active ? 'bg-surface text-ink font-semibold' : '',
  ].join(' ');
}

/**
 * Ledger's persistent left rail — only ever mounted above `lg` (the desktop
 * gate in `ledger/layout.tsx` keeps it out of the DOM on narrow viewports).
 * Assumptions sits apart at the bottom, matching its "settings position" in
 * the product spec (docs/ledger-user-stories.md §4).
 */
export function LedgerRail() {
  const tNav = useTranslations('Nav');
  const t = useTranslations('Ledger.rail');
  const pathname = usePathname();

  return (
    <nav
      aria-label={tNav('main')}
      className="flex h-full flex-col gap-4 border-r border-sand-300 p-4"
    >
      <div className="flex items-center justify-between">
        <span className="font-heading text-xl">Ledger</span>
        <AppSwitcher current="ledger" />
      </div>

      <div className="flex flex-col gap-1">
        {links.map(({ href, labelKey, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Button
              key={href}
              href={href}
              variant="ghost"
              className={itemClassName(active)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="text-ink-muted" />
              {t(labelKey)}
            </Button>
          );
        })}
      </div>

      <div className="mt-auto">
        <Button
          href="/ledger/assumptions"
          variant="ghost"
          className={itemClassName(isActive(pathname, '/ledger/assumptions'))}
          aria-current={
            isActive(pathname, '/ledger/assumptions') ? 'page' : undefined
          }
        >
          <GearIcon className="text-ink-muted" />
          {t('assumptions')}
        </Button>
      </div>
    </nav>
  );
}
