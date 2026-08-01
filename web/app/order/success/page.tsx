"use client";

import { ConfirmationCard, ConfirmationLoadingCard } from "@/components/order/confirmation-card";
import { SiteHeader } from "@/components/site/site-header";
import {
  parseOrderConfirmationProvider,
  type OrderConfirmationProvider,
} from "@/lib/commerce/web-api/staff-order-management/lib/order-confirmation-provider";
import { useCart } from "@/lib/cart-context";
import {
  ORDER_CONFIRMATION_ERROR_CODE,
  type OrderConfirmationErrorCode,
} from "@/lib/commerce/order-confirmation";
import {
  errorMessageForCode,
  fetchOrderConfirmationStatus,
  isOrderConfirmed,
  failureKindForCode,
  type ConfirmationApiResponse,
} from "@/lib/commerce/order-confirmation-client";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { STORE_INFO } from "@/lib/site/store-info";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type ConfirmationState =
  | { phase: "loading" }
  | { phase: "confirmed" }
  | { phase: "failed"; message: string }
  | { phase: "unknown"; message: string };

function failureState(
  code: OrderConfirmationErrorCode | undefined,
  message: string,
): ConfirmationState {
  return failureKindForCode(code) === "definitive"
    ? { phase: "failed", message }
    : { phase: "unknown", message };
}

function withStorePhone(template: string): string {
  return template.replace("{phone}", STORE_INFO.phoneDisplay);
}

function orderReferenceForProvider(
  provider: OrderConfirmationProvider | null,
  paymentIntent: string | null,
  paymentReference: string | null,
): string | null {
  if (provider === "stripe" && paymentIntent) {
    return paymentIntent;
  }
  if ((provider === "solana" || provider === "ath-movil") && paymentReference) {
    return paymentReference;
  }
  return null;
}

function SuccessContent() {
  const { language } = useLanguage();
  const { clear } = useCart();
  const copy = getAppStrings(language);
  const searchParams = useSearchParams();
  const provider = parseOrderConfirmationProvider(searchParams.get("provider"));
  const paymentIntent = searchParams.get("payment_intent");
  const redirectStatus = searchParams.get("redirect_status");
  const paymentReference = searchParams.get("reference");
  const transactionSignature = searchParams.get("signature");
  const [state, setState] = useState<ConfirmationState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    const strings = getAppStrings(language);

    async function verify() {
      if (!provider) {
        setState(
          failureState(
            ORDER_CONFIRMATION_ERROR_CODE.INVALID_PROVIDER,
            strings.orderConfirmationInvalidSession,
          ),
        );
        return;
      }

      if (provider === "stripe" && !paymentIntent) {
        setState(
          failureState(
            ORDER_CONFIRMATION_ERROR_CODE.INVALID_PAYMENT_INTENT,
            strings.orderConfirmationInvalidSession,
          ),
        );
        return;
      }

      if ((provider === "solana" || provider === "ath-movil") && !paymentReference) {
        setState(
          failureState(
            ORDER_CONFIRMATION_ERROR_CODE.INVALID_REFERENCE,
            strings.orderConfirmationInvalidSession,
          ),
        );
        return;
      }

      const params = new URLSearchParams({ provider });
      if (provider === "stripe") {
        params.set("payment_intent", paymentIntent!);
        if (redirectStatus) params.set("redirect_status", redirectStatus);
      } else {
        params.set("reference", paymentReference!);
        if (transactionSignature) params.set("signature", transactionSignature);
      }

      let body: ConfirmationApiResponse | null;
      try {
        body = await fetchOrderConfirmationStatus(params);
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (!body) {
        setState({
          phase: "unknown",
          message: strings.orderConfirmationUnknownMessage,
        });
        return;
      }

      if (body.ok) {
        if (isOrderConfirmed(body.orderStatus)) {
          clear();
          setState({ phase: "confirmed" });
          return;
        }
        if (body.orderStatus === "expired") {
          setState(
            failureState(
              ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_EXPIRED,
              errorMessageForCode(ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_EXPIRED, strings),
            ),
          );
          return;
        }
        setState(
          failureState(
            ORDER_CONFIRMATION_ERROR_CODE.ORDER_NOT_CONFIRMED,
            errorMessageForCode(ORDER_CONFIRMATION_ERROR_CODE.ORDER_NOT_CONFIRMED, strings),
          ),
        );
        return;
      }

      setState(failureState(body.code, errorMessageForCode(body.code, strings)));
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [
    provider,
    paymentIntent,
    redirectStatus,
    paymentReference,
    transactionSignature,
    clear,
    language,
  ]);

  const orderReference = orderReferenceForProvider(provider, paymentIntent, paymentReference);

  if (state.phase === "loading") {
    return <ConfirmationLoadingCard message={copy.orderConfirmationVerifying} />;
  }

  if (state.phase === "failed") {
    return (
      <ConfirmationCard
        variant="failed"
        title={copy.orderConfirmationErrorTitle}
        message={state.message}
        orderReference={orderReference}
        orderReferenceLabel={copy.orderReferenceLabel}
        callStoreMessage={withStorePhone(copy.orderConfirmationCallStore)}
      >
        <Link
          href="/"
          className="inline-flex w-full max-w-xs justify-center rounded-full bg-accent px-8 py-3.5 text-lg font-semibold text-white shadow-lg hover:brightness-95"
        >
          {copy.backToMenu}
        </Link>
      </ConfirmationCard>
    );
  }

  if (state.phase === "unknown") {
    const callAriaLabel = withStorePhone(copy.orderConfirmationCallStore);

    return (
      <ConfirmationCard
        variant="unknown"
        title={copy.orderConfirmationUnknownTitle}
        message={state.message}
        orderReference={orderReference}
        orderReferenceLabel={copy.orderReferenceLabel}
        callStoreMessage={withStorePhone(copy.orderConfirmationCallStore)}
      >
        <a
          href={`tel:${STORE_INFO.phoneDial}`}
          aria-label={callAriaLabel}
          className="inline-flex w-full max-w-xs justify-center rounded-full bg-accent px-8 py-3.5 text-lg font-semibold text-white shadow-lg hover:brightness-95"
        >
          {STORE_INFO.phoneDisplay}
        </a>
        <Link
          href="/"
          className="text-base font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          {copy.backToMenu}
        </Link>
      </ConfirmationCard>
    );
  }

  return (
    <ConfirmationCard
      variant="confirmed"
      title={copy.orderConfirmed}
      message={copy.orderConfirmedMessage}
      callStoreMessage={withStorePhone(copy.orderConfirmedCallStore)}
      orderReference={orderReference}
      orderReferenceLabel={copy.orderReferenceLabel}
    >
      <Link
        href="/"
        className="inline-flex w-full max-w-xs justify-center rounded-full bg-accent px-8 py-3.5 text-lg font-semibold text-white shadow-lg hover:brightness-95"
      >
        {copy.orderMore}
      </Link>
    </ConfirmationCard>
  );
}

export default function OrderSuccessPage() {
  return (
    <>
      <SiteHeader />
      <Suspense
        fallback={
          <ConfirmationLoadingCard message={getAppStrings("es").orderConfirmationVerifying} />
        }
      >
        <SuccessContent />
      </Suspense>
    </>
  );
}
