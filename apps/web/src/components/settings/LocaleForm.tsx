'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setLocale } from '@/app/actions/profile';
import { locales, type Locale } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function LocaleForm({ initialLocale }: { initialLocale: Locale }) {
  const t = useTranslations('Settings');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [locale, setLocaleValue] = useState<Locale>(initialLocale);

  const localeLabel: Record<Locale, string> = {
    en: t('localeEn'),
    ru: t('localeRu'),
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await setLocale(locale);
      if (result.ok) {
        toast.success(t('languageSaved'));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {t('language')}
        </span>
        <select
          value={locale}
          onChange={(e) => setLocaleValue(e.target.value as Locale)}
          className="rounded-lg bg-surface px-4 py-3 shadow-sm outline-none focus:ring-2 focus:ring-accent/40"
        >
          {locales.map((l) => (
            <option key={l} value={l}>
              {localeLabel[l]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-ink-muted">{t('languageHelp')}</p>
      <Button type="submit" disabled={pending} className="py-3">
        {pending ? tCommon('saving') : t('saveLanguage')}
      </Button>
    </form>
  );
}
