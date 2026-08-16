'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { HouseholdMember } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  joinHousehold as joinHouseholdAction,
  mintInvite as mintInviteAction,
} from '@/app/actions/household';

export function HouseholdPanel({
  members,
  invite,
  currentUserId,
}: {
  members: HouseholdMember[];
  invite: string | null;
  currentUserId: string;
}) {
  const t = useTranslations('Household');
  const toast = useToast();
  const [code, setCode] = useState(invite);
  const [joinCode, setJoinCode] = useState('');
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<null | 'invite' | 'join'>(null);
  const [copied, setCopied] = useState(false);

  const shared = members.length > 1;

  function mintInvite() {
    setPending('invite');
    startTransition(async () => {
      const result = await mintInviteAction();
      if (result.ok) {
        setCode(result.code ?? null);
      } else {
        toast.error(result.error);
      }
      setPending(null);
    });
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the code is visible to copy manually */
    }
  }

  function submitJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setPending('join');
    startTransition(async () => {
      const result = await joinHouseholdAction({ code: joinCode.trim() });
      if (result.ok) {
        setJoinCode('');
        toast.success(t('joinedHousehold'));
      } else {
        toast.error(result.error);
      }
      setPending(null);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Members */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {shared ? t('sharingThisCap') : t('justYou')}
        </h2>
        <ul className="flex flex-col divide-y divide-sand-300/60">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between py-3"
            >
              <span className="text-ink/80">
                {m.displayName?.trim() ||
                  (m.userId === currentUserId ? t('you') : t('member'))}
                {m.userId === currentUserId ? (
                  <span className="text-ink-muted"> · {t('youSuffix')}</span>
                ) : null}
              </span>
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Invite */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {t('inviteSomeone')}
        </h2>
        <p className="text-sm text-ink-muted">{t('inviteDescription')}</p>
        {code ? (
          <div className="flex items-center gap-3">
            <code className="flex-1 rounded-lg bg-surface px-4 py-3 font-heading text-2xl tracking-widest text-center shadow-sm">
              {code}
            </code>
            <Button
              type="button"
              onClick={copyCode}
              variant="secondary"
              className="text-sm"
            >
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
        ) : null}
        <Button
          type="button"
          onClick={mintInvite}
          disabled={pending === 'invite'}
          className="py-3"
        >
          {pending === 'invite'
            ? t('generating')
            : code
              ? t('generateNewCode')
              : t('generateCode')}
        </Button>
      </section>

      {/* Join */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {t('joinHousehold')}
        </h2>
        <p className="text-sm text-ink-muted">{t('joinDescription')}</p>
        <form onSubmit={submitJoin} className="flex items-center gap-3">
          <label className="flex-1">
            <span className="sr-only">{t('joinHousehold')}</span>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t('codePlaceholder')}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              className="w-full rounded-lg bg-surface px-4 py-3 tracking-widest shadow-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <Button
            type="submit"
            disabled={pending === 'join' || !joinCode.trim()}
            variant="secondary"
            className="text-sm"
          >
            {pending === 'join' ? t('joining') : t('join')}
          </Button>
        </form>
      </section>
    </div>
  );
}
