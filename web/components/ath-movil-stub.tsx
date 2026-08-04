"use client";

import { useEffect, useState } from "react";
import {
  buildDecodeIndex,
  CART_B64_KEY,
  CART_CODEC_KEY,
  encodeCartToMetadataV1,
  sleep,
} from "@ricos/shared";

import { useCart } from "@/lib/cart-context";
import type { OrderServiceMode } from "@/lib/commerce/domain/order-service-mode";
import {
  DINE_IN_UNAVAILABLE_CODE,
  STORE_CLOSED_CODE,
} from "@/lib/commerce/domain/store-hours";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/domain/menu-version-policy";
import { ORDER_CONFIRMATION_ERROR_CODE } from "@/lib/commerce/order-confirmation";
import { athReferenceErrorMessageForCode } from "@/lib/commerce/ath-movil-client";
import {
  errorMessageForCode,
  fetchOrderConfirmationStatus,
  isOrderConfirmed,
} from "@/lib/commerce/order-confirmation-client";
import {
  ATH_PAYMENT_ERROR_CODE,
  type AthPaymentErrorCode,
} from "@/lib/commerce/web-api/ath-movil/domain/ath-payment-error-codes";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { fullRedirect } from "@/lib/navigation/full-redirect";
import { formatUsd, orderTotalsForCart } from "@/lib/pricing";

const ATH_MIN_GRAND_TOTAL_CENTS = 100;
const ATH_MAX_GRAND_TOTAL_CENTS = 150000;
const ATH_POLL_INTERVAL_MS = 1_000;

const ATH_PAYMENT_ERROR_CODES = new Set<string>(Object.values(ATH_PAYMENT_ERROR_CODE));

function isAthPaymentErrorCode(code: string | undefined): code is AthPaymentErrorCode {
  return typeof code === "string" && ATH_PAYMENT_ERROR_CODES.has(code);
}

type AthPaymentPhase = "preparing" | "waiting" | "error";

export type AthMovilContactProps = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceMode: OrderServiceMode;
};

export function AthMovilStub({
  customerName,
  customerPhone,
  customerEmail,
  serviceMode,
}: AthMovilContactProps) {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const { lines, clear } = useCart();
  const { catalog, menuVersionSeen, surface } = useMenuRuntime();

  const [snapshot] = useState(() => ({
    cartLines: lines.map((line) => ({
      itemId: line.id,
      quantity: line.quantity,
      selections: line.selections,
    })),
    grandTotalCents: orderTotalsForCart(lines, surface, catalog.orderFees).grandTotalCents,
    menuVersion: menuVersionSeen,
    catalogSnapshot: catalog,
  }));

  const [phase, setPhase] = useState<AthPaymentPhase>("preparing");
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;

      setPhase("preparing");
      setReference(null);
      setError(null);

      const { grandTotalCents, cartLines, menuVersion, catalogSnapshot } = snapshot;
      if (
        grandTotalCents < ATH_MIN_GRAND_TOTAL_CENTS ||
        grandTotalCents > ATH_MAX_GRAND_TOTAL_CENTS
      ) {
        setError("ATH Móvil supports totals between $1.00 and $1500.00.");
        setPhase("error");
        return;
      }

      if (!customerName.trim() || !customerPhone.trim()) {
        setError("ATH Móvil requires a valid phone number.");
        setPhase("error");
        return;
      }

      const decodeIndex = buildDecodeIndex(menuVersion, catalogSnapshot);
      const encoded = encodeCartToMetadataV1(
        menuVersion,
        cartLines,
        decodeIndex,
      );
      const cartCodec = encoded.metadata[CART_CODEC_KEY];
      const cartB64 = encoded.metadata[CART_B64_KEY];
      if (!cartCodec || !cartB64) {
        setError(copy.checkoutErrorTitle);
        setPhase("error");
        return;
      }

      const referenceRes = await fetch("/api/ath-movil/reference", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: {
            [CART_CODEC_KEY]: cartCodec,
            [CART_B64_KEY]: cartB64,
          },
          grandTotalCents,
          currency: "usd",
          menuVersionSeen: menuVersion,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          serviceMode,
          ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
        }),
      });
      const referenceBody = (await referenceRes.json().catch(() => null)) as {
        error?: string;
        code?: string;
        reference?: string;
      } | null;

      if (cancelled) return;

      if (!referenceRes.ok) {
        if (referenceRes.status === 409 && referenceBody?.code === MENU_VERSION_CONFLICT_CODE) {
          clear();
          fullRedirect("/?menuUpdated=1");
          return;
        }
        if (referenceRes.status === 403 && referenceBody?.code === STORE_CLOSED_CODE) {
          clear();
          fullRedirect("/");
          return;
        }
        if (referenceRes.status === 403 && referenceBody?.code === DINE_IN_UNAVAILABLE_CODE) {
          setError(referenceBody.error ?? copy.dineInUnavailableDuringLastCall);
          setPhase("error");
          return;
        }
        setError(
          isAthPaymentErrorCode(referenceBody?.code)
            ? athReferenceErrorMessageForCode(referenceBody.code, copy)
            : (referenceBody?.error ?? copy.checkoutErrorTitle),
        );
        setPhase("error");
        return;
      }

      const orderReference = referenceBody?.reference;
      if (typeof orderReference !== "string" || orderReference.length === 0) {
        setError(copy.checkoutErrorTitle);
        setPhase("error");
        return;
      }
      if (orderReference.length > 40) {
        setError("ATH Móvil metadata1 supports up to 40 characters.");
        setPhase("error");
        return;
      }

      setReference(orderReference);
      setPhase("waiting");
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    snapshot,
    customerName,
    customerPhone,
    customerEmail,
    serviceMode,
    clear,
    copy.checkoutErrorTitle,
    copy.dineInUnavailableDuringLastCall,
    retryKey,
  ]);

  useEffect(() => {
    if (phase !== "waiting" || !reference) return;

    let cancelled = false;

    const params = new URLSearchParams({
      provider: "ath-movil",
      reference,
    });

    const poll = async () => {
      while (!cancelled) {
        const body = await fetchOrderConfirmationStatus(params);
        if (cancelled) return;

        if (!body) {
          await sleep(ATH_POLL_INTERVAL_MS);
          continue;
        }

        if (body.ok) {
          if (isOrderConfirmed(body.orderStatus)) {
            const successParams = new URLSearchParams({
              provider: "ath-movil",
              reference,
            });
            fullRedirect(`/order/success?${successParams.toString()}`);
            return;
          }
          if (body.orderStatus === "expired") {
            setError(
              errorMessageForCode(ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_EXPIRED, copy),
            );
            setPhase("error");
            return;
          }
          if (body.orderStatus === "pending") {
            await sleep(ATH_POLL_INTERVAL_MS);
            continue;
          }
          setError(copy.orderConfirmationNotConfirmed);
          setPhase("error");
          return;
        }

        if (body.code === ORDER_CONFIRMATION_ERROR_CODE.MISSING_ORDER) {
          await sleep(ATH_POLL_INTERVAL_MS);
          continue;
        }

        setError(errorMessageForCode(body.code, copy));
        setPhase("error");
        return;
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [phase, reference, copy]);

  return (
    <div className="rounded-xl border border-foreground/10 bg-surface p-6 text-foreground">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-accent">{copy.athMovilStubTitle}</h2>
        <StatusPill phase={phase} />
      </header>

      <p className="mt-2 text-sm text-muted">
        {snapshot.grandTotalCents > 0
          ? copy.athMovilStubBody.replace(
              "{total}",
              formatUsd(snapshot.grandTotalCents, language),
            )
          : copy.athMovilStubBody}
      </p>

      {error ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-accent">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((n) => n + 1)}
            className="rounded-lg border border-foreground/15 px-3 py-2 text-xs text-foreground hover:border-accent/60"
          >
            Retry
          </button>
        </div>
      ) : phase === "preparing" ? (
        <div className="mt-4 rounded-lg border border-dashed border-foreground/15 bg-background p-4 text-xs text-muted">
          {copy.preparingSecureCheckout}
        </div>
      ) : reference ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-foreground/80">{copy.athMovilWaitingHint}</p>
          <p className="break-all rounded-lg bg-background px-3 py-2 font-mono text-xs text-muted">
            {copy.orderReferenceLabel}: {reference}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ phase }: { phase: AthPaymentPhase }) {
  const label =
    phase === "preparing"
      ? "Preparing"
      : phase === "waiting"
        ? "Waiting for payment"
        : "Error";
  return (
    <span className="rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
      {label}
    </span>
  );
}
