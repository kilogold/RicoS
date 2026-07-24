"use client";

import {
  parseOrderConfirmationProvider,
  type OrderConfirmationProvider,
} from "@/lib/commerce/web-api/staff-order-management/lib/order-confirmation-provider";
import { SiteHeader } from "@/components/site/site-header";
import { useCart } from "@/lib/cart-context";
import {
  ORDER_CONFIRMATION_ERROR_CODE,
  type OrderConfirmationErrorCode,
} from "@/lib/commerce/order-confirmation";
import {
  errorMessageForCode,
  fetchOrderConfirmationStatus,
  isOrderConfirmed,
  type ConfirmationApiResponse,
} from "@/lib/commerce/order-confirmation-client";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type ConfirmationState =
  | { phase: "loading" }
  | { phase: "confirmed" }
  | {
      phase: "error";
      message: string;
      code?: OrderConfirmationErrorCode;
    };

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
        setState({
          phase: "error",
          message: strings.orderConfirmationInvalidSession,
          code: ORDER_CONFIRMATION_ERROR_CODE.INVALID_PROVIDER,
        });
        return;
      }

      if (provider === "stripe" && !paymentIntent) {
        setState({
          phase: "error",
          message: strings.orderConfirmationInvalidSession,
          code: ORDER_CONFIRMATION_ERROR_CODE.INVALID_PAYMENT_INTENT,
        });
        return;
      }

      if ((provider === "solana" || provider === "ath-movil") && !paymentReference) {
        setState({
          phase: "error",
          message: strings.orderConfirmationInvalidSession,
          code: ORDER_CONFIRMATION_ERROR_CODE.INVALID_REFERENCE,
        });
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
          phase: "error",
          message: strings.orderConfirmationNotConfirmed,
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
          setState({
            phase: "error",
            message: errorMessageForCode(
              ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_EXPIRED,
              strings,
            ),
            code: ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_EXPIRED,
          });
          return;
        }
        setState({
          phase: "error",
          message: errorMessageForCode(
            ORDER_CONFIRMATION_ERROR_CODE.ORDER_NOT_CONFIRMED,
            strings,
          ),
          code: ORDER_CONFIRMATION_ERROR_CODE.ORDER_NOT_CONFIRMED,
        });
        return;
      }

      setState({
        phase: "error",
        message: errorMessageForCode(body.code, strings),
        code: body.code,
      });
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

  const paymentRefBlock = paymentRefForProvider(provider, {
    paymentIntent,
    paymentReference,
    copy,
  });

  const signatureBlock =
    provider === "solana" && transactionSignature ? (
      <p className="mt-2 rounded-lg bg-background px-3 py-2 font-mono text-xs text-muted break-all">
        {copy.transactionSignatureLabel}: {transactionSignature}
      </p>
    ) : null;

  if (state.phase === "loading") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="rounded-2xl border border-accent/30 bg-surface p-10 shadow-2xl">
          <p className="text-muted">{copy.orderConfirmationVerifying}</p>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="rounded-2xl border border-red-400/50 bg-surface p-10 shadow-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-accent">
            RicoS
          </p>
          <h1 className="mt-3 text-3xl font-bold text-foreground" role="alert">
            {copy.orderConfirmationErrorTitle}
          </h1>
          <p className="mt-4 text-left text-foreground/85" role="alert">
            {state.message}
          </p>
          {paymentRefBlock}
          {signatureBlock}
          {redirectStatus ? (
            <p className="mt-2 text-xs text-muted">
              {copy.statusLabel}: {redirectStatus}
            </p>
          ) : null}
          <Link
            href="/"
            className="mt-10 inline-flex rounded-xl bg-accent px-6 py-3 font-semibold text-white shadow-lg hover:brightness-95"
          >
            {copy.backToMenu}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="rounded-2xl border border-accent/30 bg-surface p-10 shadow-2xl">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">
          RicoS
        </p>
        <h1 className="mt-3 text-3xl font-bold text-foreground">{copy.orderConfirmed}</h1>
        <p className="mt-4 text-muted">{copy.orderConfirmedMessage}</p>
        {paymentRefBlock}
        {signatureBlock}
        {redirectStatus ? (
          <p className="mt-2 text-xs text-muted">
            {copy.statusLabel}: {redirectStatus}
          </p>
        ) : null}
        <Link
          href="/"
          className="mt-10 inline-flex rounded-xl bg-accent px-6 py-3 font-semibold text-white shadow-lg hover:brightness-95"
        >
          {copy.orderMore}
        </Link>
      </div>
    </div>
  );
}

function paymentRefForProvider(
  provider: OrderConfirmationProvider | null,
  refs: {
    paymentIntent: string | null;
    paymentReference: string | null;
    copy: ReturnType<typeof getAppStrings>;
  },
) {
  if (provider === "stripe" && refs.paymentIntent) {
    return (
      <p className="mt-6 rounded-lg bg-background px-3 py-2 font-mono text-sm text-foreground/90 break-all">
        {refs.copy.paymentIntentLabel}: {refs.paymentIntent}
      </p>
    );
  }
  if ((provider === "solana" || provider === "ath-movil") && refs.paymentReference) {
    return (
      <p className="mt-6 rounded-lg bg-background px-3 py-2 font-mono text-sm text-foreground/90">
        {refs.copy.orderReferenceLabel}: {refs.paymentReference}
      </p>
    );
  }
  return null;
}

export default function OrderSuccessPage() {
  return (
    <>
      <SiteHeader />
      <Suspense
        fallback={
          <div className="py-24 text-center text-muted">{getAppStrings("es").loading}</div>
        }
      >
        <SuccessContent />
      </Suspense>
    </>
  );
}
