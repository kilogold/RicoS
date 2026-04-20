"use client";

import { CheckoutForm } from "@/components/checkout-form";
import { useCart } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { formatUsd, linesWithItems, totalCents } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe-client";
import { getSelectionDisplayLines, resolveLocalizedText } from "@ricos/shared";
import { Elements } from "@stripe/react-stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CheckoutPage() {
  const { lines } = useCart();
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const summaryLines = linesWithItems(lines);
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lines.length === 0) {
      router.replace("/");
      return;
    }

    let cancelled = false;
    (async () => {
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
  }, [copy.checkoutErrorTitle, lines, router]);

  if (lines.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-red-400/40 bg-[#0c2340]/90 p-6 text-white shadow-xl">
          <h1 className="text-xl font-semibold text-red-200">
            {copy.checkoutErrorTitle}
          </h1>
          <p className="mt-2 text-white/80">{error}</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-[#f4c430] px-4 py-2 font-medium text-[#0c2340]"
          >
            {copy.backToMenu}
          </Link>
        </div>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center text-white/80">
        <p className="text-lg">{copy.preparingSecureCheckout}</p>
        <p className="mt-2 text-sm text-white/60">
          {copy.totalLabel} {formatUsd(totalCents(lines), language)}
        </p>
      </div>
    );
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
          {copy.guestCheckoutMessage} {copy.totalLabel}{" "}
          <span className="font-semibold text-[#f4c430]">
            {formatUsd(amountCents, language)}
          </span>
          .
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#b8d4f0]">
          {copy.orderSummary}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-white/85">
          {summaryLines.map(({ line, item }) => {
            const selections = getSelectionDisplayLines(line.id, line.selections, language);
            return (
              <li key={`${line.id}-${JSON.stringify(line.selections)}`} className="rounded-md bg-white/5 px-3 py-2">
                <p>
                  {line.quantity}x {resolveLocalizedText(item.name, language)} ·{" "}
                  {formatUsd(item.priceCents * line.quantity, language)}
                </p>
                {selections.length > 0 ? (
                  <p className="mt-1 text-xs text-[#b8d4f0]">{selections.join(" · ")}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

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
    </div>
  );
}
