"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CartLine } from "@/lib/commerce/web-client/cart/cart-context";
import { totalCents } from "@/lib/commerce/web-client/cart/pricing";

export type SelectedPaymentMethod = "stripe" | "solana" | "ath-movil";

export function useCheckoutPaymentState(params: {
  lines: CartLine[];
  checkoutErrorTitle: string;
}) {
  const { lines, checkoutErrorTitle } = params;
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState<SelectedPaymentMethod | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cartTotalCents = totalCents(lines);
  const displayTotalCents =
    selectedMethod === "stripe" && clientSecret && amountCents > 0 ? amountCents : cartTotalCents;

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

      const res = await fetch("/api/stripe/payment-intent", {
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
        if (!cancelled) setError(data.error ?? checkoutErrorTitle);
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
  }, [checkoutErrorTitle, lines, router, selectedMethod]);

  return {
    amountCents,
    cartTotalCents,
    clientSecret,
    displayTotalCents,
    error,
    goBackToPaymentSelection,
    selectedMethod,
    setSelectedMethod,
  };
}
