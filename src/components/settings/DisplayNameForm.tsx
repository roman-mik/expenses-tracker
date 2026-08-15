'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDisplayName } from '@/app/actions/profile';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function DisplayNameForm({
  initialDisplayName,
}: {
  initialDisplayName: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialDisplayName ?? '');

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await setDisplayName({ displayName: name });
      if (result.ok) {
        toast.success('Name saved');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wider uppercase text-ink/50">
          Your name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How should we attribute your expenses?"
          maxLength={40}
          className="rounded-lg bg-surface px-4 py-3 shadow-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>
      <p className="text-sm text-ink/60">
        Shown to anyone sharing your cap, so they know who added what.
      </p>
      <Button type="submit" disabled={pending} className="py-3">
        {pending ? 'Saving…' : 'Save name'}
      </Button>
    </form>
  );
}
