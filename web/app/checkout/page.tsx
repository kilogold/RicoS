"use client";

import { CheckoutForm } from "@/components/checkout-form";
import { CheckoutOrderSummary } from "@/components/checkout-order-summary";
import { SolanaPayStub } from "@/components/solana-pay-stub";
import { useCart } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { formatUsd, totalCents } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe-client";
import { Elements } from "@stripe/react-stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type SelectedPaymentMethod = "stripe" | "solana" | "ath-movil";

export default function CheckoutPage() {
  const { lines } = useCart();
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState<SelectedPaymentMethod | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cartTotalCents = totalCents(lines);
  const displayTotalCents =
    selectedMethod === "stripe" && clientSecret && amountCents > 0
      ? amountCents
      : cartTotalCents;

  const goBackToPaymentSelection = useCallback(() => {
    setSelectedMethod(null);
    setClientSecret(null);
    setAmountCents(0);
    setError(null);
  }, []);

  useEffect(() => {
    if (lines.length === 0) {
      router.replace("/");
      return;
    }

    if (selectedMethod !== "stripe") {
      return;
    }

    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setClientSecret(null);
      setAmountCents(0);
      setError(null);

      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const data = (await res.json()) as {
        error?: string;
        clientSecret?: string;
        amountCents?: number;
      };
      if (!res.ok) {
        if (!cancelled) setError(data.error ?? copy.checkoutErrorTitle);
        return;
      }
      if (!cancelled && data.clientSecret && data.amountCents != null) {
        setClientSecret(data.clientSecret);
        setAmountCents(data.amountCents);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [copy.checkoutErrorTitle, lines, router, selectedMethod]);

  if (lines.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-8">
        <Link href="/" className="text-sm text-[#f4c430] hover:underline">
          ← {copy.backToMenu}
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
          {copy.payForPickup}
        </h1>
        <p className="mt-2 text-white/70">
          {selectedMethod === null ? (
            copy.checkoutSelectPaymentMethod
          ) : (
            <>
              {copy.guestCheckoutMessage} {copy.totalLabel}{" "}
              <span className="font-semibold text-[#f4c430]">
                {formatUsd(displayTotalCents, language)}
              </span>
              .
            </>
          )}
        </p>
      </div>

      <CheckoutOrderSummary lines={lines} />

      {selectedMethod !== null ? (
        <div className="mb-6">
          <button
            type="button"
            onClick={goBackToPaymentSelection}
            className="text-sm font-medium text-[#f4c430] hover:underline"
          >
            ← {copy.changePaymentMethod}
          </button>
        </div>
      ) : null}

      {selectedMethod === null ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setSelectedMethod("stripe")}
            className="rounded-xl border border-white/15 bg-[#0c2340]/80 px-4 py-4 text-left text-white shadow-lg transition hover:border-[#f4c430]/50 hover:bg-[#0c2340]"
          >
            <span className="block text-lg font-semibold text-[#f4c430]">
              {copy.paymentMethodStripeLabel}
            </span>
            <span className="mt-1 block text-sm text-white/70">
              {copy.paymentMethodStripeDescription}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedMethod("solana")}
            className="rounded-xl border border-white/15 bg-[#0c2340]/80 px-4 py-4 text-left text-white shadow-lg transition hover:border-[#f4c430]/50 hover:bg-[#0c2340]"
          >
            <span className="block text-lg font-semibold text-[#f4c430]">
              {copy.paymentMethodSolanaLabel}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedMethod("ath-movil")}
            className="rounded-xl border border-white/15 bg-[#0c2340]/80 px-4 py-4 text-left text-white shadow-lg transition hover:border-[#f4c430]/50 hover:bg-[#0c2340]"
          >
            <span className="block text-lg font-semibold text-[#f4c430]">
              {copy.paymentMethodAthLabel}
            </span>
          </button>
        </div>
      ) : null}

      {selectedMethod === "stripe" ? (
        <>
          {error ? (
            <div className="rounded-2xl border border-red-400/40 bg-[#0c2340]/90 p-6 text-white shadow-xl">
              <h2 className="text-xl font-semibold text-red-200">
                {copy.checkoutErrorTitle}
              </h2>
              <p className="mt-2 text-white/80">{error}</p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-lg bg-[#f4c430] px-4 py-2 font-medium text-[#0c2340]"
              >
                {copy.backToMenu}
              </Link>
            </div>
          ) : !clientSecret ? (
            <div className="py-8 text-center text-white/80">
              <p className="text-lg">{copy.preparingSecureCheckout}</p>
              <p className="mt-2 text-sm text-white/60">
                {copy.totalLabel} {formatUsd(cartTotalCents, language)}
              </p>
            </div>
          ) : (
            <Elements
              stripe={getStripe()}
              options={{
                clientSecret,
                locale: language,
                appearance: {
                  theme: "night",
                  variables: {
                    colorPrimary: "#f4c430",
                    colorBackground: "#0c2340",
                    colorText: "#f8fafc",
                    borderRadius: "12px",
                  },
                },
              }}
            >
              <CheckoutForm amountCents={amountCents} />
            </Elements>
          )}
        </>
      ) : null}

      {selectedMethod === "solana" ? (
        <SolanaPayStub />
      ) : null}

      {selectedMethod === "ath-movil" ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-white">
          <h2 className="text-lg font-semibold text-[#f4c430]">{copy.athMovilStubTitle}</h2>
          <p className="mt-2 text-sm text-white/75">{copy.athMovilStubBody}</p>
        </div>
      ) : null}
    </div>
  );
}
