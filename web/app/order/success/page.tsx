"use client";

import {
  parseOrderConfirmationProvider,
  type OrderConfirmationProvider,
} from "@/lib/commerce/web-api/staff-order-management/lib/order-confirmation-provider";
import { useCart } from "@/lib/cart-context";
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
      code?: string;
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
  const ecommerceId = searchParams.get("ecommerceId");
  const [state, setState] = useState<ConfirmationState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    const strings = getAppStrings(language);

    async function verify() {
      if (!provider) {
        setState({
          phase: "error",
          message: strings.orderConfirmationInvalidSession,
          code: "invalid_provider",
        });
        return;
      }

      if (provider === "stripe" && !paymentIntent) {
        setState({
          phase: "error",
          message: strings.orderConfirmationInvalidSession,
          code: "invalid_payment_intent",
        });
        return;
      }

      if ((provider === "solana" || provider === "ath-movil") && !paymentReference) {
        setState({
          phase: "error",
          message: strings.orderConfirmationInvalidSession,
          code: "invalid_reference",
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
            message: errorMessageForCode("payment_expired", strings),
            code: "payment_expired",
          });
          return;
        }
        setState({
          phase: "error",
          message: errorMessageForCode("order_not_confirmed", strings),
          code: "order_not_confirmed",
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
      <p className="mt-2 rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-white/80 break-all">
        {copy.transactionSignatureLabel}: {transactionSignature}
      </p>
    ) : null;

  const ecommerceIdBlock =
    provider === "ath-movil" && ecommerceId ? (
      <p className="mt-2 rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-white/80 break-all">
        ecommerceId: {ecommerceId}
      </p>
    ) : null;

  if (state.phase === "loading") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="rounded-2xl border border-[#f4c430]/40 bg-[#0c2340]/90 p-10 shadow-2xl">
          <p className="text-white/75">{copy.orderConfirmationVerifying}</p>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="rounded-2xl border border-red-400/50 bg-[#0c2340]/90 p-10 shadow-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-red-300">
            RicoS
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white" role="alert">
            {copy.orderConfirmationErrorTitle}
          </h1>
          <p className="mt-4 text-left text-white/85" role="alert">
            {state.message}
          </p>
          {paymentRefBlock}
          {signatureBlock}
          {ecommerceIdBlock}
          {redirectStatus ? (
            <p className="mt-2 text-xs text-white/50">
              {copy.statusLabel}: {redirectStatus}
            </p>
          ) : null}
          <Link
            href="/"
            className="mt-10 inline-flex rounded-xl bg-[#f4c430] px-6 py-3 font-semibold text-[#0c2340] shadow-lg hover:brightness-95"
          >
            {copy.backToMenu}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="rounded-2xl border border-[#f4c430]/40 bg-[#0c2340]/90 p-10 shadow-2xl">
        <p className="text-sm font-medium uppercase tracking-widest text-[#f4c430]">
          RicoS
        </p>
        <h1 className="mt-3 text-3xl font-bold text-white">{copy.orderConfirmed}</h1>
        <p className="mt-4 text-white/75">{copy.orderConfirmedMessage}</p>
        {paymentRefBlock}
        {signatureBlock}
        {ecommerceIdBlock}
        {redirectStatus ? (
          <p className="mt-2 text-xs text-white/50">
            {copy.statusLabel}: {redirectStatus}
          </p>
        ) : null}
        <Link
          href="/"
          className="mt-10 inline-flex rounded-xl bg-[#f4c430] px-6 py-3 font-semibold text-[#0c2340] shadow-lg hover:brightness-95"
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
      <p className="mt-6 rounded-lg bg-black/20 px-3 py-2 font-mono text-sm text-white/90">
        {refs.copy.paymentIntentLabel}: {refs.paymentIntent}
      </p>
    );
  }
  if ((provider === "solana" || provider === "ath-movil") && refs.paymentReference) {
    return (
      <p className="mt-6 rounded-lg bg-black/20 px-3 py-2 font-mono text-sm text-white/90 break-all">
        {refs.copy.orderReferenceLabel}: {refs.paymentReference}
      </p>
    );
  }
  return null;
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-white/70">{getAppStrings("es").loading}</div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
