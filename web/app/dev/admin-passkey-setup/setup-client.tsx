"use client";

import { registerAdminPasskey } from "@/lib/admin-passkey/client";
import { useState } from "react";

type AdminPasskeySetupClientProps = {
  passkeyCount: number;
  maxAllowed: number;
};

export default function AdminPasskeySetupClient({
  passkeyCount,
  maxAllowed,
}: AdminPasskeySetupClientProps) {
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeySetupSecret, setPasskeySetupSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isBootstrap = passkeyCount === 0;

  async function submitPasskeyRegistration(): Promise<void> {
    setMessage(null);
    setBusy(true);
    try {
      const result = await registerAdminPasskey({
        setupSecret: isBootstrap ? passkeySetupSecret.trim() || undefined : undefined,
        name: passkeyName.trim() || undefined,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMessage("Passkey registered.");
      setPasskeySetupSecret("");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-12 text-slate-100">
      <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Admin passkey setup</h1>
      <p className="mt-2 text-sm text-slate-400">
        {isBootstrap
          ? "Register the first admin passkey using your setup secret."
          : "Register an additional passkey. An existing admin passkey must approve."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {passkeyCount} of {maxAllowed} passkeys registered.
      </p>

      <div className="mt-6 space-y-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Label (optional)</span>
          <input
            type="text"
            value={passkeyName}
            onChange={(e) => setPasskeyName(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2.5 outline-none focus:border-sky-500 sm:text-sm"
            placeholder="e.g. MacBook Touch ID"
          />
        </label>

        {isBootstrap ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Setup secret</span>
            <input
              type="password"
              autoComplete="off"
              value={passkeySetupSecret}
              onChange={(e) => setPasskeySetupSecret(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2.5 font-mono outline-none focus:border-sky-500 sm:text-sm"
              placeholder="ADMIN_SETUP_SECRET"
            />
          </label>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void submitPasskeyRegistration()}
          className="min-h-[44px] rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy
            ? "Waiting for passkey…"
            : isBootstrap
              ? "Register passkey"
              : "Register another passkey"}
        </button>

        {message ? (
          <p className="text-xs text-slate-400" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
