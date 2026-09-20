"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          needsCode ? { email, code } : { email },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      if (data.needsCode) {
        setNeedsCode(true);
        return;
      }
      if (data.user?.onboardingComplete) {
        router.push("/");
      } else {
        router.push("/onboarding");
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4">
      <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        Welcome
      </p>
      <p className="mt-2 text-[var(--muted)]">
        Sign in to save your travel profile. We’ll remember what you like — so the
        next trip doesn’t start from zero.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={needsCode || pending}
            className="mt-1 w-full border border-[var(--line)] bg-[var(--surface)] px-3 py-3 outline-none focus:border-[var(--accent)]"
            placeholder="you@email.com"
          />
        </label>

        {needsCode && (
          <label className="block text-sm">
            <span className="text-[var(--muted)]">6-digit code</span>
            <input
              inputMode="numeric"
              pattern="\d{4,6}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={pending}
              className="mt-1 w-full border border-[var(--line)] bg-[var(--surface)] px-3 py-3 outline-none focus:border-[var(--accent)]"
              placeholder="123456"
              autoFocus
            />
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Demo OTP: any 6 digits (real SMS later).
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-[var(--accent)] py-3 text-[var(--sand)] disabled:opacity-50"
        >
          {pending ? "Please wait…" : needsCode ? "Verify & continue" : "Continue"}
        </button>
      </form>
    </div>
  );
}
