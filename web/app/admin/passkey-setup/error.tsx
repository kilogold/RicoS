"use client";

export default function AdminPasskeySetupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-12 text-slate-100">
      <h1 className="text-lg font-semibold text-rose-300">Passkey setup unavailable</h1>
      <p className="mt-2 text-sm text-slate-400">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-[44px] rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-600"
      >
        Retry
      </button>
    </main>
  );
}
