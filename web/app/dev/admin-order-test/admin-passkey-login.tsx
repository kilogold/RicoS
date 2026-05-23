"use client";

import { signInWithAdminPasskey } from "@/lib/admin-passkey/client";
import { useState } from "react";

export function AdminPasskeyLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithAdminPasskey();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12 text-slate-100">
      <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Admin sign-in</h1>
      <p className="mt-2 text-sm text-slate-400">
        Sign in with your admin passkey to use the order admin panel.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSignIn()}
        className="mt-6 min-h-[48px] rounded-lg bg-sky-600 px-4 py-3 text-base font-medium text-white hover:bg-sky-500 disabled:opacity-50 sm:text-sm"
      >
        {busy ? "Waiting for passkey…" : "Sign in with passkey"}
      </button>
      {error ? (
        <p className="mt-4 text-sm text-rose-400" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
