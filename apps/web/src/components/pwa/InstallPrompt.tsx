'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';

const DISMISSED_KEY = 'kapa:install-prompt-dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const noopSubscribe = () => () => {};

/**
 * True once mounted in the browser, false during SSR and the hydration
 * render. Lets components read client-only globals (matchMedia,
 * localStorage, navigator) without a hydration mismatch — a subscription
 * with differing client/server snapshots is the correct tool here, not an
 * effect that calls setState.
 */
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/**
 * Reads the one-time browser facts this component needs. Lazy `useState`
 * initializers run once at mount rather than on every render, so `dismissed`
 * has a single source of truth afterwards (updated locally by `dismiss()`,
 * not re-read from storage each render). The `typeof window` guard keeps
 * this safe to call during the (window-less) SSR/hydration pass — its
 * result is simply unused until `useIsClient()` flips true.
 */
function useInstallFacts() {
  const [standalone] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(display-mode: standalone)').matches
  );
  const [isIOS] = useState(
    () =>
      typeof window !== 'undefined' &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !('MSStream' in window)
  );
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && !!localStorage.getItem(DISMISSED_KEY)
  );
  return { standalone, isIOS, dismissed, setDismissed };
}

/**
 * A once-per-visitor nudge to add Kapa to the home screen. Chromium fires
 * `beforeinstallprompt`, which we capture and defer; iOS Safari has no such
 * event, so it gets the share-sheet instructions instead. Renders nothing
 * once the app is already installed (standalone display mode) or once the
 * visitor has dismissed it.
 */
export function InstallPrompt() {
  const t = useTranslations('PWA');
  const isClient = useIsClient();
  const { standalone, isIOS, dismissed, setDismissed } = useInstallFacts();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  if (!isClient) return null; // avoid a hydration mismatch — these all read browser-only state
  if (standalone || dismissed) return null;
  if (!deferred && !isIOS) return null; // nothing to offer yet on this browser

  return (
    <div className="rounded-lg border border-sand-300 bg-surface px-5 py-4 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-ink">{t('installTitle')}</p>
        <p className="text-sm text-ink-muted">
          {isIOS ? t('installIOS') : t('installAndroid')}
        </p>
      </div>
      <div className="flex gap-3">
        {deferred && (
          <Button variant="primary" onClick={install} className="text-sm">
            {t('install')}
          </Button>
        )}
        <Button variant="ghost" onClick={dismiss} className="text-sm">
          {t('notNow')}
        </Button>
      </div>
    </div>
  );
}
