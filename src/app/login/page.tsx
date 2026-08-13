"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Surface the "signups closed" state redirected from /auth/callback.
  const closed =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "closed";

  const supabase = createClient();
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    setStatus(error ? { kind: "error", message: error.message } : { kind: "sent" });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-heading)] text-4xl text-[var(--color-accent)]">
          Kapa
        </h1>
        <p className="mt-2 text-[var(--color-ink)]/70">Sign in to your cap.</p>
      </header>

      {closed && (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-accent-100)] px-4 py-3 text-sm text-[var(--color-accent-700)]">
          Sign-ups are currently closed. If you already have an account, use the
          email it was created with.
        </p>
      )}

      {status.kind === "sent" ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-sage-100)] px-4 py-3 text-center text-sm">
          Check your inbox — we sent a sign-in link to <strong>{email}</strong>.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-[var(--radius-md)] border border-[var(--color-sand-300)] bg-[var(--color-surface)] px-4 py-3 outline-none focus-visible:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            disabled={status.kind === "sending"}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-3 font-medium text-white disabled:opacity-60"
          >
            {status.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {status.kind === "error" && (
            <p className="text-sm text-[var(--color-accent-700)]">{status.message}</p>
          )}
        </form>
      )}
    </main>
  );
}
