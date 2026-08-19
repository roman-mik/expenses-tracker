'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { AppSwitcher } from '@/components/layout/AppSwitcher';
import {
  HomeIcon,
  WalletIcon,
  TimelineIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  LayersIcon,
  TargetIcon,
  GearIcon,
} from '@/components/ui/icons';

const links = [
  { href: '/horizon', labelKey: 'today', icon: HomeIcon },
  { href: '/horizon/accounts', labelKey: 'accounts', icon: WalletIcon },
  { href: '/horizon/timeline', labelKey: 'timeline', icon: TimelineIcon },
  { href: '/horizon/money-in', labelKey: 'moneyIn', icon: TrendingUpIcon },
  { href: '/horizon/money-out', labelKey: 'moneyOut', icon: TrendingDownIcon },
  { href: '/horizon/scenarios', labelKey: 'scenarios', icon: LayersIcon },
  { href: '/horizon/target-rate', labelKey: 'targetRate', icon: TargetIcon },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/horizon' ? pathname === href : pathname.startsWith(href);
}

function itemClassName(active: boolean) {
  return [
    'w-full justify-start gap-3 px-3',
    active ? 'bg-surface text-ink font-semibold' : '',
  ].join(' ');
}

/**
 * Horizon's persistent left rail — only ever mounted above `lg` (the desktop
 * gate in `horizon/layout.tsx` keeps it out of the DOM on narrow viewports).
 * Assumptions sits apart at the bottom, matching its "settings position" in
 * the product spec (docs/horizon-user-stories.md §4).
 */
export function HorizonRail() {
  const tNav = useTranslations('Nav');
  const t = useTranslations('Horizon.rail');
  const pathname = usePathname();

  return (
    <nav
      aria-label={tNav('main')}
      className="flex h-full flex-col gap-4 border-r border-sand-300 p-4"
    >
      <div className="flex items-center justify-between">
        <span className="font-heading text-xl">Horizon</span>
        <AppSwitcher current="horizon" />
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
          href="/horizon/assumptions"
          variant="ghost"
          className={itemClassName(isActive(pathname, '/horizon/assumptions'))}
          aria-current={
            isActive(pathname, '/horizon/assumptions') ? 'page' : undefined
          }
        >
          <GearIcon className="text-ink-muted" />
          {t('assumptions')}
        </Button>
      </div>
    </nav>
  );
}
