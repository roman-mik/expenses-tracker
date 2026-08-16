'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signIn as signInAction } from '@/app/actions/auth';

type Status =
  { kind: 'idle' } | { kind: 'signing' } | { kind: 'error'; message: string };

export function LoginForm({ initialError }: { initialError?: string }) {
  const t = useTranslations('Login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>(
    initialError ? { kind: 'error', message: initialError } : { kind: 'idle' }
  );

  const router = useRouter();

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'signing' });
    const result = await signInAction(email, password);
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    // refresh() re-runs server components so they see the freshly-set session.
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={signIn} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="sr-only">{t('emailPlaceholder')}</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-sand-300)] bg-[var(--color-surface)] px-4 py-3 outline-none focus-visible:border-[var(--color-accent)]"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="sr-only">{t('passwordPlaceholder')}</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('passwordPlaceholder')}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-sand-300)] bg-[var(--color-surface)] px-4 py-3 outline-none focus-visible:border-[var(--color-accent)]"
        />
      </label>
      <button
        type="submit"
        disabled={status.kind === 'signing'}
        className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {status.kind === 'signing' ? t('signingIn') : t('signIn')}
      </button>
      {status.kind === 'error' && (
        <p className="text-sm text-[var(--color-accent-700)]">
          {status.message}
        </p>
      )}
    </form>
  );
}
