"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "error"; message: string };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const router = useRouter();
  const supabase = createClient();

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "signing" });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    // refresh() re-runs server components so they see the freshly-set session.
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-heading)] text-4xl text-[var(--color-accent)]">
          Kapa
        </h1>
        <p className="mt-2 text-[var(--color-ink)]/70">Sign in to your cap.</p>
      </header>

      <form onSubmit={signIn} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-[var(--radius-md)] border border-[var(--color-sand-300)] bg-[var(--color-surface)] px-4 py-3 outline-none focus-visible:border-[var(--color-accent)]"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="rounded-[var(--radius-md)] border border-[var(--color-sand-300)] bg-[var(--color-surface)] px-4 py-3 outline-none focus-visible:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={status.kind === "signing"}
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 font-medium text-white disabled:opacity-60"
        >
          {status.kind === "signing" ? "Signing in…" : "Sign in"}
        </button>
        {status.kind === "error" && (
          <p className="text-sm text-[var(--color-accent-700)]">{status.message}</p>
        )}
      </form>
    </main>
  );
}
