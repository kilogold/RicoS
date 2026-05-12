"use client";

import { CheckoutForm } from "@/components/checkout-form";
import { CheckoutOrderSummary } from "@/components/checkout-order-summary";
import { SolanaPayStub } from "@/components/solana-pay-stub";
import { StoreHoursBanners } from "@/app/_client/store-hours-banners";
import { useStoreSession } from "@/app/_client/store-session-context";
import { useCart } from "@/lib/cart-context";
import {
  validateCustomerContact,
  type NormalizedCustomerContact,
} from "@/lib/commerce/customer-contact";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/menu-version-policy";
import {
  DINE_IN_UNAVAILABLE_CODE,
  STORE_CLOSED_CODE,
} from "@/lib/commerce/store-hours";
import {
  ORDER_SERVICE_MODE_DINE_IN,
  ORDER_SERVICE_MODE_TAKEOUT,
  type OrderServiceMode,
} from "@/lib/commerce/order-service-mode";
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

type CheckoutPhase = "service" | "contact" | "payment";

export default function CheckoutPage() {
  const { lines, clear } = useCart();
  const { language } = useLanguage();
  const { status } = useStoreSession();
  const { surface, menuVersionSeen } = useMenuRuntime();
  const copy = getAppStrings(language);
  const router = useRouter();

  const [phase, setPhase] = useState<CheckoutPhase>("service");
  const [selectedServiceMode, setSelectedServiceMode] = useState<OrderServiceMode | null>(null);
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
  const dineInUnavailable = status === "last_call";
  const selectedServiceModeLabel =
    selectedServiceMode === ORDER_SERVICE_MODE_DINE_IN ? copy.dineInLabel : copy.takeoutLabel;

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

  const resetPaymentState = useCallback(() => {
    setSelectedMethod(null);
    setClientSecret(null);
    setAmountCents(0);
    setError(null);
  }, []);

  const handleSelectServiceMode = useCallback(
    (mode: OrderServiceMode) => {
      if (mode === ORDER_SERVICE_MODE_DINE_IN && dineInUnavailable) {
        setError(copy.dineInUnavailableDuringLastCall);
        return;
      }
      setSelectedServiceMode(mode);
      setPhase("contact");
      resetPaymentState();
    },
    [copy.dineInUnavailableDuringLastCall, dineInUnavailable, resetPaymentState],
  );

  const handleEditServiceMode = useCallback(() => {
    setPhase("service");
    resetPaymentState();
  }, [resetPaymentState]);

  const handleContinueToPayment = useCallback(() => {
    if (!selectedServiceMode) {
      setPhase("service");
      return;
    }
    if (selectedServiceMode === ORDER_SERVICE_MODE_DINE_IN && dineInUnavailable) {
      setPhase("service");
      setError(copy.dineInUnavailableDuringLastCall);
      return;
    }
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
  }, [
    copy.dineInUnavailableDuringLastCall,
    customerName,
    customerPhone,
    customerEmail,
    dineInUnavailable,
    selectedServiceMode,
  ]);

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

    if (
      phase !== "payment" ||
      !lockedContact ||
      !selectedServiceMode ||
      selectedMethod !== "stripe"
    ) {
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
          serviceMode: selectedServiceMode,
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
        if (res.status === 403 && data.code === STORE_CLOSED_CODE) {
          clear();
          router.replace("/");
          return;
        }
        if (res.status === 403 && data.code === DINE_IN_UNAVAILABLE_CODE) {
          setPhase("service");
          setError(data.error ?? copy.dineInUnavailableDuringLastCall);
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
    selectedServiceMode,
    selectedMethod,
    copy.dineInUnavailableDuringLastCall,
  ]);

  if (lines.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <StoreHoursBanners />
      <div className="mb-8">
        <Link href="/" className="text-sm text-[#f4c430] hover:underline">
          ← {copy.backToMenu}
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
          {copy.payForPickup}
        </h1>
        <p className="mt-2 text-white/70">
          {phase === "service" ? (
            copy.checkoutPhaseServiceIntro
          ) : phase === "contact" ? (
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

      {phase === "service" ? (
        <section className="mb-8 rounded-xl border border-white/10 bg-[#0c2340]/60 p-4">
          <h2 className="text-lg font-semibold text-[#f4c430]">{copy.serviceModeHeading}</h2>
          {error ? (
            <p className="mt-3 text-sm text-amber-200/90" role="status">
              {error}
            </p>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleSelectServiceMode(ORDER_SERVICE_MODE_TAKEOUT)}
              className="min-h-40 rounded-xl border border-white/15 bg-[#0c2340]/80 px-5 py-5 text-left text-white shadow-lg transition hover:border-[#f4c430]/50 hover:bg-[#0c2340]"
            >
              <span className="mb-4 flex h-20 w-full items-center justify-center rounded-lg bg-black/20 text-[#f4c430]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 96 96"
                  className="h-16 w-16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                >
                  <path d="M25 36h46l-5 42H30L25 36Z" />
                  <path d="M36 36c0-10 5-18 12-18s12 8 12 18" />
                  <path d="M33 51h30" />
                  <path d="M38 64h20" />
                </svg>
              </span>
              <span className="block text-xl font-semibold text-[#f4c430]">
                {copy.takeoutLabel}
              </span>
              <span className="mt-2 block text-sm text-white/70">
                {copy.takeoutDescription}
              </span>
            </button>
            <button
              type="button"
              disabled={dineInUnavailable}
              onClick={() => handleSelectServiceMode(ORDER_SERVICE_MODE_DINE_IN)}
              className="min-h-40 rounded-xl border border-white/15 bg-[#0c2340]/80 px-5 py-5 text-left text-white shadow-lg transition hover:border-[#f4c430]/50 hover:bg-[#0c2340] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="mb-4 flex h-20 w-full items-center justify-center rounded-lg bg-black/20 text-[#f4c430]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 96 96"
                  className="h-16 w-16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                >
                  <circle cx="48" cy="52" r="24" />
                  <circle cx="48" cy="52" r="12" />
                  <path d="M19 16v64" />
                  <path d="M12 16v18" />
                  <path d="M26 16v18" />
                  <path d="M12 34h14" />
                  <path d="M77 16v64" />
                  <path d="M77 16c9 7 9 21 0 28" />
                </svg>
              </span>
              <span className="block text-xl font-semibold text-[#f4c430]">
                {copy.dineInLabel}
              </span>
              <span className="mt-2 block text-sm text-white/70">
                {copy.dineInDescription}
              </span>
            </button>
          </div>
          {dineInUnavailable ? (
            <p className="mt-3 text-sm text-red-100/90" role="status">
              {copy.dineInUnavailableDuringLastCall}
            </p>
          ) : null}
        </section>
      ) : (
        <>
          {selectedServiceMode ? (
            <section className="mb-8 rounded-xl border border-white/10 bg-[#0c2340]/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#f4c430]">
                    {copy.serviceModeHeading}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-white/90">
                    {selectedServiceModeLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEditServiceMode}
                  className="shrink-0 text-sm font-medium text-[#f4c430] hover:underline"
                >
                  {copy.editServiceMode}
                </button>
              </div>
            </section>
          ) : null}

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
          ) : null}

          {phase === "payment" ? (
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

          {selectedMethod === "solana" && lockedContact && selectedServiceMode ? (
            <SolanaPayStub
              customerName={lockedContact.customerName}
              customerPhone={lockedContact.customerPhone}
              customerEmail={lockedContact.customerEmail ?? ""}
              serviceMode={selectedServiceMode}
            />
          ) : null}

          {selectedMethod === "ath-movil" ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-white">
              <h2 className="text-lg font-semibold text-[#f4c430]">{copy.athMovilStubTitle}</h2>
              <p className="mt-2 text-sm text-white/75">{copy.athMovilStubBody}</p>
            </div>
          ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
