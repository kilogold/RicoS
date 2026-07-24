"use client";

import { AthMovilStub } from "@/components/ath-movil-stub";
import { CheckoutForm } from "@/components/checkout-form";
import { CheckoutOrderSummary } from "@/components/checkout-order-summary";
import { SiteHeader } from "@/components/site/site-header";
import { SolanaPayStub } from "@/components/solana-pay-stub";
import { StoreHoursBanners } from "@/app/_client/store-hours-banners";
import { useStoreSession } from "@/app/_client/store-session-context";
import { useCart } from "@/lib/cart-context";
import {
  CUSTOMER_PHONE_FORMATTED_MAX_LEN,
  formatUsPhoneInput,
  validateCustomerContact,
  type NormalizedCustomerContact,
} from "@/lib/commerce/domain/customer-contact";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/web-api/staff-order-management/lib/menu-version-policy";
import {
  DINE_IN_UNAVAILABLE_CODE,
  STORE_CLOSED_CODE,
} from "@/lib/commerce/domain/store-hours";
import {
  ORDER_SERVICE_MODE_DINE_IN,
  ORDER_SERVICE_MODE_TAKEOUT,
  type OrderServiceMode,
} from "@/lib/commerce/web-api/staff-order-management/lib/order-service-mode";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { formatUsd, orderTotalsForCart } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe-client";
import { Elements } from "@stripe/react-stripe-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fullRedirect } from "@/lib/navigation/full-redirect";

type SelectedPaymentMethod = "stripe" | "solana" | "ath-movil";

type CheckoutPhase = "service" | "contact" | "payment";

export default function CheckoutPage() {
  const { lines, clear } = useCart();
  const { language } = useLanguage();
  const { status, shoppingEnabled } = useStoreSession();
  const { surface, catalog, menuVersionSeen } = useMenuRuntime();
  const copy = getAppStrings(language);
  const [phase, setPhase] = useState<CheckoutPhase>("service");
  const [selectedServiceMode, setSelectedServiceMode] = useState<OrderServiceMode | null>(null);
  const [lockedContact, setLockedContact] = useState<NormalizedCustomerContact | null>(null);

  const [selectedMethod, setSelectedMethod] = useState<SelectedPaymentMethod | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [grandTotalCents, setGrandTotalCents] = useState(0);
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

  const orderTotals = useMemo(
    () => orderTotalsForCart(lines, surface, catalog.orderFees),
    [lines, surface, catalog.orderFees],
  );
  const displayTotalCents =
    selectedMethod === "stripe" && clientSecret && grandTotalCents > 0
      ? grandTotalCents
      : orderTotals.grandTotalCents;

  const goBackToPaymentSelection = useCallback(() => {
    setSelectedMethod(null);
    setClientSecret(null);
    setGrandTotalCents(0);
    setError(null);
  }, []);

  const resetPaymentState = useCallback(() => {
    setSelectedMethod(null);
    setClientSecret(null);
    setGrandTotalCents(0);
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
    setGrandTotalCents(0);
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
    setGrandTotalCents(0);
    setError(null);
  }, []);

  useEffect(() => {
    if (!shoppingEnabled) {
      clear();
      fullRedirect("/");
    }
  }, [clear, shoppingEnabled]);

  useEffect(() => {
    if (lines.length === 0) {
      fullRedirect("/");
      return;
    }

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/menu/active-version", { cache: "no-store" });
      const data = (await res.json()) as { version?: number };
      if (cancelled || !res.ok || typeof data.version !== "number") return;
      if (data.version !== menuVersionSeen) {
        clear();
        fullRedirect("/?menuUpdated=1");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear, lines.length, menuVersionSeen]);

  useEffect(() => {
    if (lines.length === 0) {
      fullRedirect("/");
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
      setGrandTotalCents(0);
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
        grandTotalCents?: number;
      };
      if (!res.ok) {
        if (cancelled) return;
        if (res.status === 409 && data.code === MENU_VERSION_CONFLICT_CODE) {
          clear();
          fullRedirect("/?menuUpdated=1");
          return;
        }
        if (res.status === 403 && data.code === STORE_CLOSED_CODE) {
          clear();
          fullRedirect("/");
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
      if (!cancelled && data.clientSecret && data.grandTotalCents != null) {
        setClientSecret(data.clientSecret);
        setGrandTotalCents(data.grandTotalCents);
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
    selectedServiceMode,
    selectedMethod,
    copy.dineInUnavailableDuringLastCall,
  ]);

  if (lines.length === 0) {
    return null;
  }

  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-lg px-4 py-10">
        <StoreHoursBanners />
        <div className="mb-8">
          <Link href="/" className="text-sm text-accent hover:underline">
            ← {copy.backToMenu}
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
            {copy.payForPickup}
          </h1>
          <p className="mt-2 text-muted">
            {phase === "service" ? (
              copy.checkoutPhaseServiceIntro
            ) : phase === "contact" ? (
              copy.checkoutPhaseContactIntro
            ) : selectedMethod === null ? (
              copy.checkoutPhasePaymentIntro
            ) : (
              <>
                {copy.guestCheckoutMessage} {copy.grandTotalLabel}{" "}
                <span className="font-semibold text-accent">
                  {formatUsd(displayTotalCents, language)}
                </span>
                .
              </>
            )}
          </p>
        </div>

        <CheckoutOrderSummary lines={lines} />

      {phase === "service" ? (
        <section className="mb-8 rounded-xl border border-foreground/10 bg-surface p-4">
          <h2 className="text-lg font-semibold text-accent">{copy.serviceModeHeading}</h2>
          {error ? (
            <p className="mt-3 text-sm text-amber-800" role="status">
              {error}
            </p>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleSelectServiceMode(ORDER_SERVICE_MODE_TAKEOUT)}
              className="min-h-40 rounded-xl border border-foreground/15 bg-surface px-5 py-5 text-left text-foreground shadow-lg transition hover:border-accent/50 hover:bg-surface"
            >
              <span className="mb-4 flex h-20 w-full items-center justify-center rounded-lg bg-background text-accent">
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
              <span className="block text-xl font-semibold text-accent">
                {copy.takeoutLabel}
              </span>
              <span className="mt-2 block text-sm text-muted">
                {copy.takeoutDescription}
              </span>
            </button>
            <button
              type="button"
              disabled={dineInUnavailable}
              onClick={() => handleSelectServiceMode(ORDER_SERVICE_MODE_DINE_IN)}
              className="min-h-40 rounded-xl border border-foreground/15 bg-surface px-5 py-5 text-left text-foreground shadow-lg transition hover:border-accent/50 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="mb-4 flex h-20 w-full items-center justify-center rounded-lg bg-background text-accent">
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
              <span className="block text-xl font-semibold text-accent">
                {copy.dineInLabel}
              </span>
              <span className="mt-2 block text-sm text-muted">
                {copy.dineInDescription}
              </span>
            </button>
          </div>
          {dineInUnavailable ? (
            <p className="mt-3 text-sm text-red-700" role="status">
              {copy.dineInUnavailableDuringLastCall}
            </p>
          ) : null}
        </section>
      ) : (
        <>
          {selectedServiceMode ? (
            <section className="mb-8 rounded-xl border border-foreground/10 bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-accent">
                    {copy.serviceModeHeading}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-foreground/90">
                    {selectedServiceModeLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEditServiceMode}
                  className="shrink-0 text-sm font-medium text-accent hover:underline"
                >
                  {copy.editServiceMode}
                </button>
              </div>
            </section>
          ) : null}

          {phase === "contact" ? (
            <section className="mb-8 rounded-xl border border-foreground/10 bg-surface p-4">
              <h2 className="text-lg font-semibold text-accent">{copy.pickupContactHeading}</h2>
              <div className="mt-4 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm text-foreground/90">
                  <span>{copy.customerNameLabel}</span>
                  <input
                    type="text"
                    name="customerName"
                    autoComplete="name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-foreground/90">
                  <span>{copy.customerPhoneLabel}</span>
                  <input
                    type="tel"
                    name="customerPhone"
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={CUSTOMER_PHONE_FORMATTED_MAX_LEN}
                    placeholder="(787) 555-1234"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(formatUsPhoneInput(e.target.value))}
                    className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-foreground/90">
                  <span>
                    {copy.customerEmailLabel}{" "}
                    <span className="text-foreground/50">({copy.customerEmailOptionalHint})</span>
                  </span>
                  <input
                    type="email"
                    name="customerEmail"
                    autoComplete="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
                  />
                </label>
              </div>
              {!contactOk ? (
                <p className="mt-3 text-sm text-amber-800" role="status">
                  {customerName.trim() || customerPhone.trim() || customerEmail.trim()
                    ? contactValidation.error
                    : copy.checkoutContactIncomplete}
                </p>
              ) : null}
              <button
                type="button"
                disabled={!contactOk}
                onClick={handleContinueToPayment}
                className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copy.continueToPayment}
              </button>
            </section>
          ) : null}

          {phase === "payment" ? (
            <>
          {lockedContact ? (
            <section className="mb-8 rounded-xl border border-foreground/10 bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-accent">{copy.pickupContactHeading}</h2>
                  <p className="mt-2 text-sm text-foreground/90">{lockedContact.customerName}</p>
                  <p className="text-sm text-foreground/80">{lockedContact.customerPhone}</p>
                  {lockedContact.customerEmail ? (
                    <p className="text-sm text-muted">{lockedContact.customerEmail}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleEditContact}
                  className="shrink-0 text-sm font-medium text-accent hover:underline"
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
                className="text-sm font-medium text-accent hover:underline"
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
                className="rounded-xl border border-foreground/15 bg-surface px-4 py-4 text-left text-foreground shadow-lg transition hover:border-accent/50 hover:bg-surface"
              >
                <span className="block text-lg font-semibold text-accent">
                  {copy.paymentMethodStripeLabel}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {copy.paymentMethodStripeDescription}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod("solana")}
                className="rounded-xl border border-foreground/15 bg-surface px-4 py-4 text-left text-foreground shadow-lg transition hover:border-accent/50 hover:bg-surface"
              >
                <span className="block text-lg font-semibold text-accent">
                  {copy.paymentMethodSolanaLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod("ath-movil")}
                className="rounded-xl border border-foreground/15 bg-surface px-4 py-4 text-left text-foreground shadow-lg transition hover:border-accent/50 hover:bg-surface"
              >
                <span className="block text-lg font-semibold text-accent">
                  {copy.paymentMethodAthLabel}
                </span>
              </button>
            </div>
          ) : null}

          {selectedMethod === "stripe" ? (
            <>
              {error ? (
                <div className="rounded-2xl border border-red-400/40 bg-surface p-6 text-foreground shadow-xl">
                  <h2 className="text-xl font-semibold text-red-700">
                    {copy.checkoutErrorTitle}
                  </h2>
                  <p className="mt-2 text-foreground/80">{error}</p>
                  <Link
                    href="/"
                    className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 font-medium text-white"
                  >
                    {copy.backToMenu}
                  </Link>
                </div>
              ) : !clientSecret ? (
                <div className="py-8 text-center text-foreground/80">
                  <p className="text-lg">{copy.preparingSecureCheckout}</p>
                  <p className="mt-2 text-sm text-foreground/60">
                    {copy.grandTotalLabel} {formatUsd(orderTotals.grandTotalCents, language)}
                  </p>
                </div>
              ) : (
                <Elements
                  stripe={getStripe()}
                  options={{
                    clientSecret,
                    locale: language,
                    appearance: {
                      theme: "stripe",
                      variables: {
                        colorPrimary: "#c72330",
                        colorBackground: "#ffffff",
                        colorText: "#212529",
                        borderRadius: "12px",
                      },
                    },
                  }}
                >
                  <CheckoutForm grandTotalCents={grandTotalCents} />
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

          {selectedMethod === "ath-movil" && lockedContact && selectedServiceMode ? (
            <AthMovilStub
              customerName={lockedContact.customerName}
              customerPhone={lockedContact.customerPhone}
              customerEmail={lockedContact.customerEmail ?? ""}
              serviceMode={selectedServiceMode}
            />
          ) : null}
            </>
          ) : null}
        </>
      )}
      </div>
    </>
  );
}
