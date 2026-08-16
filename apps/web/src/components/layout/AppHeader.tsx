'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import {
  MenuIcon,
  TargetIcon,
  TagIcon,
  UsersIcon,
  GearIcon,
} from '@/components/ui/icons';

const MENU_ID = 'app-menu';

const links = [
  { href: '/cap', labelKey: 'setCap', icon: TargetIcon },
  { href: '/categories', labelKey: 'categories', icon: TagIcon },
  { href: '/household', labelKey: 'household', icon: UsersIcon },
  { href: '/settings', labelKey: 'settings', icon: GearIcon },
] as const;

/**
 * Home's top bar: the wordmark plus a single menu button covering the four
 * secondary destinations (cap, categories, household, settings). Built on the
 * native Popover API — `popover="auto"` gives light-dismiss, Escape, and
 * top-layer rendering for free.
 *
 * The one thing CSS can't do here: a shown popover is promoted to the top
 * layer, where its containing block is the viewport, not any DOM ancestor —
 * so `position: absolute` + `top-full`/`right-0` on the panel can't anchor it
 * under the trigger button (and CSS anchor positioning isn't safe to rely on
 * yet given this PWA targets iOS Safari, see InstallPrompt's iOS handling).
 * This listens for the popover's native `beforetoggle` event and sets the
 * panel's fixed-position coordinates imperatively, no React state involved —
 * matching InstallPrompt's house style of effects that only wire up event
 * listeners.
 */
export function AppHeader() {
  const t = useTranslations('Nav');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    function position(e: Event) {
      if ((e as ToggleEvent).newState !== 'open') return;
      const rect = trigger!.getBoundingClientRect();
      panel!.style.top = `${rect.bottom + 8}px`;
      panel!.style.right = `${window.innerWidth - rect.right}px`;
    }

    panel.addEventListener('beforetoggle', position);
    return () => panel.removeEventListener('beforetoggle', position);
  }, []);

  return (
    <header className="flex items-center justify-between">
      <span className="font-heading text-2xl">Kapa</span>

      <Button
        ref={triggerRef}
        variant="pill"
        className="w-11 px-0"
        popoverTarget={MENU_ID}
        aria-haspopup="true"
        aria-label={t('menu')}
      >
        <MenuIcon />
      </Button>

      <nav
        ref={panelRef}
        id={MENU_ID}
        popover="auto"
        aria-label={t('main')}
        className="fixed flex w-56 flex-col gap-1 rounded-lg border border-sand-300 bg-surface p-2 shadow-lg"
      >
        {links.map(({ href, labelKey, icon: Icon }, i) => (
          <Button
            key={href}
            href={href}
            variant="ghost"
            className="w-full justify-start gap-3 px-3"
            autoFocus={i === 0}
          >
            <Icon className="text-ink-muted" />
            {t(labelKey)}
          </Button>
        ))}
      </nav>
    </header>
  );
}
