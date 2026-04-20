"use client";

import { formatUsd } from "@/lib/pricing";
import { useCart } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useState } from "react";

export function CheckoutForm({ amountCents }: { amountCents: number }) {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const stripe = useStripe();
  const elements = useElements();
  const { clear } = useCart();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/success`,
      },
    });

    if (error) {
      if (error.type === "card_error" || error.type === "validation_error") {
        setErrorMessage(error.message ?? copy.paymentFailedFallback);
      } else {
        setErrorMessage(copy.paymentUnexpectedError);
      }
      setLoading(false);
      return;
    }

    clear();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="rounded-xl border border-white/10 bg-[#0c2340]/80 p-4">
        <PaymentElement />
      </div>
      {errorMessage ? (
        <p className="text-sm text-red-300" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="rounded-xl bg-[#f4c430] px-4 py-3 text-lg font-semibold text-[#0c2340] shadow-lg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? copy.processing
          : `${copy.payCtaPrefix} ${formatUsd(amountCents, language)}`}
      </button>
    </form>
  );
}
