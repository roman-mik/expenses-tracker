'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { HouseholdMember } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

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
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState(invite);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<null | 'invite' | 'join'>(null);
  const [copied, setCopied] = useState(false);

  const shared = members.length > 1;

  async function mintInvite() {
    setBusy('invite');
    try {
      const res = await fetch('/api/household/invite', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t('couldNotCreateCode'));
      setCode(body.code as string);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('somethingWentWrong'));
    } finally {
      setBusy(null);
    }
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

  async function submitJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setBusy('join');
    try {
      const res = await fetch('/api/household/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof body?.details === 'string'
            ? body.details
            : (body?.error ?? t('invalidCode'))
        );
      }
      setJoinCode('');
      toast.success(t('joinedHousehold'));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('couldNotJoin'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Members */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink/50">
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
                  <span className="text-ink/45"> · {t('youSuffix')}</span>
                ) : null}
              </span>
              <span className="text-xs uppercase tracking-wide text-ink/45">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Invite */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink/50">
          {t('inviteSomeone')}
        </h2>
        <p className="text-sm text-ink/60">{t('inviteDescription')}</p>
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
          disabled={busy === 'invite'}
          className="py-3"
        >
          {busy === 'invite'
            ? t('generating')
            : code
              ? t('generateNewCode')
              : t('generateCode')}
        </Button>
      </section>

      {/* Join */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink/50">
          {t('joinHousehold')}
        </h2>
        <p className="text-sm text-ink/60">{t('joinDescription')}</p>
        <form onSubmit={submitJoin} className="flex items-center gap-3">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder={t('codePlaceholder')}
            className="flex-1 rounded-lg bg-surface px-4 py-3 tracking-widest shadow-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button
            type="submit"
            disabled={busy === 'join' || !joinCode.trim()}
            variant="secondary"
            className="text-sm"
          >
            {busy === 'join' ? t('joining') : t('join')}
          </Button>
        </form>
      </section>
    </div>
  );
}
