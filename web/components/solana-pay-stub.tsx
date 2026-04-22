"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  createCartRequest,
  createSolanaPayRequest,
  toMinorUnits,
  verifyPayment,
  waitForConfirmation,
} from "@solana-commerce/headless";
import { usePaymentStatus } from "@solana-commerce/react";
import {
  createRecipient,
  createSPLToken,
} from "@solana-commerce/solana-pay";
import {
  CART_B64_KEY,
  CURRENT_MENU_VERSION,
  encodeCartToMetadataV1,
  getDecodeIndex,
} from "@ricos/shared";
import type { Address } from "@solana/addresses";
import { generateKeyPairSigner } from "@solana/signers";
import { createSolanaClient } from "gill";

import { useCart } from "@/lib/cart-context";
import type { CartLine } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { formatUsd, linesWithItems, totalCents } from "@/lib/pricing";

// Devnet settings. Swap the merchant wallet + mint for mainnet when going live.
const MERCHANT_WALLET = "EEHj6a2oScEN2nKT7rN9n2UKT2jLbGQtJnNK5cC5MDJb";
const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_DECIMALS = 6;

// The pay link is built as if every amount were SOL (9 decimal places). USDC only
// has 6, so without a fix the dollar amount in the link is wrong. We bump the
// number before building the link; verification still uses the real USDC amount.
// https://github.com/solana-foundation/commerce-kit/blob/6164d5104f3d1bd4cfbb637075f000d6ac23d6c3/packages/solana-pay/src/encode-url.ts#L59-L85
const SOLANA_PAY_URL_ENCODER_DECIMALS = 9;

function splMinorUnitsForSolanaPayUrl(
  minorUnits: bigint,
  tokenDecimals: number,
): bigint {
  if (tokenDecimals > SOLANA_PAY_URL_ENCODER_DECIMALS) {
    throw new Error("Token decimals exceed Solana Pay URL encoder (9)");
  }
  return (
    minorUnits *
    BigInt(10) ** BigInt(SOLANA_PAY_URL_ENCODER_DECIMALS - tokenDecimals)
  );
}
const RPC_URL_OR_MONIKER =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "devnet";
const POLL_INTERVAL_MS = 2500;
const CONFIRMATION_TIMEOUT_MS = 90_000;

function encodeCartMemo(lines: CartLine[]): string {
  const decodeIndex = getDecodeIndex(CURRENT_MENU_VERSION);
  if (!decodeIndex) {
    throw new Error(`Menu version ${CURRENT_MENU_VERSION} is not registered`);
  }
  const encoded = encodeCartToMetadataV1(
    CURRENT_MENU_VERSION,
    lines.map((line) => ({
      itemId: line.id,
      quantity: line.quantity,
      selections: line.selections,
    })),
    decodeIndex,
  );
  const payload = encoded.metadata[CART_B64_KEY];
  if (!payload) {
    throw new Error("Missing encoded cart payload");
  }
  return payload;
}

export function SolanaPayStub() {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const { lines, clear } = useCart();

  // Cart contract: items do NOT mutate while this component is mounted. Take a
  // one-shot snapshot so request construction / reference generation don't
  // re-fire on unrelated re-renders (e.g. language toggles, status pills).
  const [snapshot] = useState(() => {
    const snapCents = totalCents(lines);
    return {
      cents: snapCents,
      amountMinor:
        snapCents > 0 ? toMinorUnits(snapCents / 100, USDC_DECIMALS) : BigInt(0),
      cartLines: lines.map((line) => ({
        id: line.id,
        quantity: line.quantity,
        selections: line.selections,
      })),
      products: linesWithItems(lines).map(({ line, item }) => ({
        id: item.id,
        name: item.name,
        quantity: line.quantity,
        price: (item.priceCents / 100) * line.quantity,
        currency: "USDC",
      })),
    };
  });
  const { cents, amountMinor, cartLines, products } = snapshot;

  const rpc = useMemo(
    () => createSolanaClient({ urlOrMoniker: RPC_URL_OR_MONIKER }).rpc,
    [],
  );

  // Keep the status machine in a ref so async callbacks always see the latest
  // dispatchers without retriggering effects.
  const payment = usePaymentStatus();
  const paymentRef = useRef(payment);
  paymentRef.current = payment;

  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState<URL | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [referenceAddress, setReferenceAddress] = useState<Address | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Build URL + QR once per mount (re-runnable via retryKey).
  useEffect(() => {
    paymentRef.current.reset();
    setQr(null);
    setUrl(null);
    setSignature(null);
    setReferenceAddress(null);

    if (cents <= 0) return;

    let cancelled = false;
    const run = async () => {
      let memo: string;
      try {
        memo = encodeCartMemo(cartLines);
      } catch (err) {
        paymentRef.current.handleError(
          err instanceof Error ? err : "Failed to encode cart memo",
        );
        return;
      }

      let ephemeralReference: Address;
      try {
        const signer = await generateKeyPairSigner();
        ephemeralReference = signer.address;
      } catch (err) {
        paymentRef.current.handleError(
          err instanceof Error ? err : "Failed to generate reference address",
        );
        return;
      }
      if (cancelled) return;
      setReferenceAddress(ephemeralReference);

      const cart = createCartRequest(MERCHANT_WALLET, products, {
        currency: "USDC",
        label: "RicoS",
        message: "Thanks for your order!",
        memo,
      });

      const res = await createSolanaPayRequest(
        {
          recipient: createRecipient(cart.recipient),
          amount: splMinorUnitsForSolanaPayUrl(amountMinor, USDC_DECIMALS),
          splToken: createSPLToken(USDC_DEVNET_MINT),
          reference: ephemeralReference,
          label: cart.label,
          message: cart.message,
          memo: cart.memo,
        },
        {
          size: 288,
          background: "#ffffff",
          color: "#111827",
          errorCorrectionLevel: "M",
          margin: 2,
        },
      );
      if (cancelled) return;
      setQr(res.qr);
      setUrl(res.url);
      paymentRef.current.setStatus("scanning");
    };

    run()
      .catch((err) => {
        if (cancelled) return;
        paymentRef.current.handleError(
          err instanceof Error ? err : "Payment request failed",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [retryKey, cents, amountMinor, cartLines, products]);

  // Poll the reference for a landed signature, then verify + confirm on-chain.
  useEffect(() => {
    if (!qr || !referenceAddress) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      while (!cancelled) {
        let landed: string | undefined;
        try {
          const sigs = await rpc
            .getSignaturesForAddress(referenceAddress, { limit: 1 })
            .send();
          landed = sigs[0]?.signature;
        } catch (err) {
          // Tolerate transient RPC errors; keep polling.
          console.warn("Solana Pay RPC poll error:", err);
        }

        if (landed) {
          setSignature(landed);
          paymentRef.current.setStatus("confirming");

          const confirmed = await waitForConfirmation(
            rpc,
            landed,
            CONFIRMATION_TIMEOUT_MS,
          );
          if (cancelled) return;
          if (!confirmed) {
            paymentRef.current.handleTimeout();
            return;
          }

          const result = await verifyPayment(
            rpc,
            landed,
            Number(amountMinor),
            MERCHANT_WALLET,
            USDC_DEVNET_MINT,
          );
          if (cancelled) return;

          if (result.verified) {
            paymentRef.current.handleSuccess();
            // Intentionally do not touch the cart or router here. Success is
            // rendered inline; the "Return to menu" button handles cleanup so
            // all Solana Pay prototype concerns stay inside this component.
          } else {
            paymentRef.current.handleError(
              result.error ?? "On-chain verification failed",
            );
          }
          return;
        }

        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, POLL_INTERVAL_MS);
        });
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [qr, rpc, amountMinor, referenceAddress]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-white">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-[#f4c430]">
          {copy.solanaPayStubTitle}
        </h2>
        <StatusPill status={payment.status} />
      </header>

      <p className="mt-2 text-sm text-white/75">
        {cents > 0
          ? `Scan with a Solana wallet to pay ${formatUsd(cents, language)} in USDC (devnet).`
          : copy.solanaPayStubBody}
      </p>

      {payment.error ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-red-300">{payment.error}</p>
          {payment.canRetry ? (
            <button
              type="button"
              onClick={() => {
                payment.retry();
                setRetryKey((n) => n + 1);
              }}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white hover:border-[#f4c430]/60"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : payment.status === "success" ? (
        <div className="mt-4 space-y-3 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-4">
          <p className="text-sm font-medium text-emerald-300">
            Payment verified on-chain.
          </p>
          {signature ? (
            <p className="break-all font-mono text-[10px] text-emerald-200/80">
              sig: {signature}
            </p>
          ) : null}
          <Link
            href="/"
            onClick={() => clear()}
            className="inline-flex rounded-lg bg-[#f4c430] px-3 py-2 text-xs font-semibold text-[#0c2340] hover:brightness-95"
          >
            Return to menu
          </Link>
        </div>
      ) : qr && url ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          {/* createSolanaPayRequest returns a raw SVG string (not a data URL),
              so we inline it instead of feeding an <img src>. */}
          <div
            role="img"
            aria-label="Solana Pay QR code"
            className="h-64 w-64 rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <a
            href={url.toString()}
            className="text-xs text-[#f4c430] underline underline-offset-4"
          >
            Open in wallet
          </a>
          {signature ? (
            <p className="break-all text-center font-mono text-[10px] text-white/50">
              sig: {signature}
            </p>
          ) : null}
        </div>
      ) : cents > 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-white/15 bg-white/3 p-4 text-xs text-white/60">
          {copy.loading}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-white/15 bg-white/3 p-4 text-xs text-white/60">
          Add items to your cart to generate a payment request.
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "scanning"
      ? "Waiting for payment"
      : status === "confirming"
        ? "Confirming"
        : status === "success"
          ? "Paid"
          : status === "error"
            ? "Error"
            : status === "timeout"
              ? "Timed out"
              : "Ready";
  return (
    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
      {label}
    </span>
  );
}
