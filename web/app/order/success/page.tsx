"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const paymentIntent = searchParams.get("payment_intent");
  const redirectStatus = searchParams.get("redirect_status");

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="rounded-2xl border border-[#f4c430]/40 bg-[#0c2340]/90 p-10 shadow-2xl">
        <p className="text-sm font-medium uppercase tracking-widest text-[#f4c430]">
          RicoS
        </p>
        <h1 className="mt-3 text-3xl font-bold text-white">Order confirmed</h1>
        <p className="mt-4 text-white/75">
          Thanks for your order. We&apos;ll prepare it for pickup. Bring this
          confirmation if helpful for the cashier.
        </p>
        {paymentIntent ? (
          <p className="mt-6 rounded-lg bg-black/20 px-3 py-2 font-mono text-sm text-white/90">
            Payment intent: {paymentIntent}
          </p>
        ) : null}
        {redirectStatus ? (
          <p className="mt-2 text-xs text-white/50">Status: {redirectStatus}</p>
        ) : null}
        <Link
          href="/"
          className="mt-10 inline-flex rounded-xl bg-[#f4c430] px-6 py-3 font-semibold text-[#0c2340] shadow-lg hover:brightness-95"
        >
          Order more
        </Link>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-white/70">Loading…</div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
