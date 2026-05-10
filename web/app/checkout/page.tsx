"use client";

import { CheckoutForm } from "@/components/checkout-form";
import { CheckoutOrderSummary } from "@/components/checkout-order-summary";
import { SolanaPayStub } from "@/components/solana-pay-stub";
import { useCart } from "@/lib/cart-context";
import {
  validateCustomerContact,
  type NormalizedCustomerContact,
} from "@/lib/commerce/customer-contact";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/menu-version-policy";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { formatUsd, totalCents } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe-client";
import { Elements } from "@stripe/react-stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type SelectedPaymentMethod = "stripe" | "solana" | "ath-movil";

type CheckoutPhase = "contact" | "payment";

export default function CheckoutPage() {
  const { lines, clear } = useCart();
  const { language } = useLanguage();
  const { surface, menuVersionSeen } = useMenuRuntime();
  const copy = getAppStrings(language);
  const router = useRouter();

  const [phase, setPhase] = useState<CheckoutPhase>("contact");
  const [lockedContact, setLockedContact] = useState<NormalizedCustomerContact | null>(null);

  const [selectedMethod, setSelectedMethod] = useState<SelectedPaymentMethod | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const contactValidation = useMemo(
    () =>
      validateCustomerContact({
        customerName,
        customerPhone,
        customerEmail: customerEmail || undefined,
      }),
    [customerName, customerPhone, customerEmail],
  );
  const contactOk = contactValidation.ok;

  const cartTotalCents = totalCents(lines, surface);
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

  const handleContinueToPayment = useCallback(() => {
    const result = validateCustomerContact({
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
    });
    if (!result.ok) return;
    setLockedContact(result.value);
    setPhase("payment");
    setSelectedMethod(null);
    setClientSecret(null);
    setAmountCents(0);
    setError(null);
  }, [customerName, customerPhone, customerEmail]);

  const handleEditContact = useCallback(() => {
    setPhase("contact");
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

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/menu/active-version", { cache: "no-store" });
      const data = (await res.json()) as { version?: number };
      if (cancelled || !res.ok || typeof data.version !== "number") return;
      if (data.version !== menuVersionSeen) {
        clear();
        router.replace("/?menuUpdated=1");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear, lines.length, menuVersionSeen, router]);

  useEffect(() => {
    if (lines.length === 0) {
      router.replace("/");
      return;
    }

    if (phase !== "payment" || !lockedContact || selectedMethod !== "stripe") {
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
        body: JSON.stringify({
          lines,
          menuVersionSeen,
          customerName: lockedContact.customerName,
          customerPhone: lockedContact.customerPhone,
          ...(lockedContact.customerEmail ? { customerEmail: lockedContact.customerEmail } : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        clientSecret?: string;
        amountCents?: number;
      };
      if (!res.ok) {
        if (cancelled) return;
        if (res.status === 409 && data.code === MENU_VERSION_CONFLICT_CODE) {
          clear();
          router.replace("/?menuUpdated=1");
          return;
        }
        setError(data.error ?? copy.checkoutErrorTitle);
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
  }, [
    clear,
    copy.checkoutErrorTitle,
    lines,
    lockedContact,
    menuVersionSeen,
    phase,
    router,
    selectedMethod,
  ]);

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
          {phase === "contact" ? (
            copy.checkoutPhaseContactIntro
          ) : selectedMethod === null ? (
            copy.checkoutPhasePaymentIntro
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

      {phase === "contact" ? (
        <section className="mb-8 rounded-xl border border-white/10 bg-[#0c2340]/60 p-4">
          <h2 className="text-lg font-semibold text-[#f4c430]">{copy.pickupContactHeading}</h2>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-white/90">
              <span>{copy.customerNameLabel}</span>
              <input
                type="text"
                name="customerName"
                autoComplete="name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="rounded-lg border border-white/15 bg-[#0c2340] px-3 py-2 text-white placeholder:text-white/40 focus:border-[#f4c430]/50 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/90">
              <span>{copy.customerPhoneLabel}</span>
              <input
                type="tel"
                name="customerPhone"
                autoComplete="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="rounded-lg border border-white/15 bg-[#0c2340] px-3 py-2 text-white placeholder:text-white/40 focus:border-[#f4c430]/50 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-white/90">
              <span>
                {copy.customerEmailLabel}{" "}
                <span className="text-white/50">({copy.customerEmailOptionalHint})</span>
              </span>
              <input
                type="email"
                name="customerEmail"
                autoComplete="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="rounded-lg border border-white/15 bg-[#0c2340] px-3 py-2 text-white placeholder:text-white/40 focus:border-[#f4c430]/50 focus:outline-none"
              />
            </label>
          </div>
          {!contactOk ? (
            <p className="mt-3 text-sm text-amber-200/90" role="status">
              {customerName.trim() || customerPhone.trim() || customerEmail.trim()
                ? contactValidation.error
                : copy.checkoutContactIncomplete}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!contactOk}
            onClick={handleContinueToPayment}
            className="mt-6 w-full rounded-xl bg-[#f4c430] px-4 py-3 text-lg font-semibold text-[#0c2340] shadow-lg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copy.continueToPayment}
          </button>
        </section>
      ) : (
        <>
          {lockedContact ? (
            <section className="mb-8 rounded-xl border border-white/10 bg-[#0c2340]/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#f4c430]">{copy.pickupContactHeading}</h2>
                  <p className="mt-2 text-sm text-white/90">{lockedContact.customerName}</p>
                  <p className="text-sm text-white/80">{lockedContact.customerPhone}</p>
                  {lockedContact.customerEmail ? (
                    <p className="text-sm text-white/70">{lockedContact.customerEmail}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleEditContact}
                  className="shrink-0 text-sm font-medium text-[#f4c430] hover:underline"
                >
                  {copy.editContact}
                </button>
              </div>
            </section>
          ) : null}

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

          {selectedMethod === "solana" && lockedContact ? (
            <SolanaPayStub
              customerName={lockedContact.customerName}
              customerPhone={lockedContact.customerPhone}
              customerEmail={lockedContact.customerEmail ?? ""}
            />
          ) : null}

          {selectedMethod === "ath-movil" ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-white">
              <h2 className="text-lg font-semibold text-[#f4c430]">{copy.athMovilStubTitle}</h2>
              <p className="mt-2 text-sm text-white/75">{copy.athMovilStubBody}</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
