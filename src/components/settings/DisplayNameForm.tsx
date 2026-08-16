'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setDisplayName } from '@/app/actions/profile';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function DisplayNameForm({
  initialDisplayName,
}: {
  initialDisplayName: string | null;
}) {
  const t = useTranslations('Settings');
  const tCommon = useTranslations('Common');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialDisplayName ?? '');

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await setDisplayName({ displayName: name });
      if (result.ok) {
        toast.success(t('nameSaved'));
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {t('yourName')}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={40}
          className="rounded-lg bg-surface px-4 py-3 shadow-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>
      <p className="text-sm text-ink-muted">{t('nameHelp')}</p>
      <Button type="submit" disabled={pending} className="py-3">
        {pending ? tCommon('saving') : t('saveName')}
      </Button>
    </form>
  );
}
