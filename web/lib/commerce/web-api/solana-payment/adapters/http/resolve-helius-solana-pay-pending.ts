import type { Client } from "@libsql/client";
import type { NormalizedIngressEvent } from "@/lib/commerce/domain";
import type { HeliusIngressPayment } from "@/lib/commerce/web-api/solana-payment/adapters/ingress/parse-helius-ingress-payload";
import {
  getPurchaseOrdersByReferences,
  type PurchaseOrderRecord,
} from "@/lib/infrastructure/turso/webhook-db";

export type HeliusPendingResolution =
  | { ok: true; orderReference: string; duplicateWebhook: boolean }
  | {
      ok: false;
      code:
        | "solana_pay_reference_unknown"
        | "solana_pay_pending_expired"
        | "solana_pay_duplicate_payment";
      detail: string;
      orderReference: string;
    };

function logHeliusSolanaPayDuplicatePayment(params: {
  orderReference: string;
  originalPaymentIngressEventId: string | null;
  duplicatePaymentIngressEventId: string;
  duplicateTransactionSignature: string;
  grandTotalCents: number;
  currency: string;
}): void {
  console.error(
    JSON.stringify({
      scope: "helius_solana_pay_duplicate_payment",
      severity: "error",
      detail: "same_order_reference_paid_by_different_transaction",
      ...params,
    }),
  );
}

function pendingOrderMatchesPayment(
  order: PurchaseOrderRecord,
  payment: Pick<HeliusIngressPayment, "grandTotalCents" | "currency">,
): boolean {
  return (
    Math.floor(order.grandTotalCents) === Math.floor(payment.grandTotalCents) &&
    order.currency.trim().toLowerCase() === payment.currency.trim().toLowerCase()
  );
}

/**
 * Among TransferChecked remaining-account candidates, require exactly one
 * `purchase_orders` row, then apply paid-duplicate / pending-amount checks.
 */
export async function resolveHeliusSolanaPayPending(
  db: Client,
  payment: HeliusIngressPayment,
  transactionSignature: string,
): Promise<HeliusPendingResolution> {
  const candidates = [
    ...new Set(
      payment.orderReferenceCandidates
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    ),
  ];

  if (candidates.length === 0) {
    return {
      ok: false,
      code: "solana_pay_reference_unknown",
      detail: "missing_order_reference",
      orderReference: "",
    };
  }
  if (!transactionSignature) {
    return {
      ok: false,
      code: "solana_pay_reference_unknown",
      detail: "missing_transaction_signature",
      orderReference: "",
    };
  }

  const rows = await getPurchaseOrdersByReferences(db, candidates);
  const hits = candidates.filter((c) => rows.has(c));

  if (hits.length === 0) {
    return {
      ok: false,
      code: "solana_pay_reference_unknown",
      detail: "no_pending_order_row",
      orderReference: "",
    };
  }
  if (hits.length > 1) {
    console.error(
      JSON.stringify({
        scope: "helius_solana_pay_payment_rejected",
        code: "solana_pay_reference_unknown",
        detail: "ambiguous_reference",
        orderReferenceCandidates: candidates,
        matchedOrderReferences: hits,
        paymentIngressEventId: payment.paymentIngressEventId,
        transactionSignature,
      }),
    );
    return {
      ok: false,
      code: "solana_pay_reference_unknown",
      detail: "ambiguous_reference",
      orderReference: hits.join(","),
    };
  }

  const orderReference = hits[0]!;
  const row = rows.get(orderReference)!;

  if (row.status === "paid") {
    if (row.paymentIngressEventId === payment.paymentIngressEventId) {
      return { ok: true, orderReference: row.orderReference, duplicateWebhook: true };
    }
    logHeliusSolanaPayDuplicatePayment({
      orderReference: row.orderReference,
      originalPaymentIngressEventId: row.paymentIngressEventId,
      duplicatePaymentIngressEventId: payment.paymentIngressEventId,
      duplicateTransactionSignature: transactionSignature,
      grandTotalCents: payment.grandTotalCents,
      currency: payment.currency,
    });
    return {
      ok: false,
      code: "solana_pay_duplicate_payment",
      detail: "reference_already_paid_different_tx",
      orderReference: row.orderReference,
    };
  }

  if (row.status === "pending" && pendingOrderMatchesPayment(row, payment)) {
    return { ok: true, orderReference: row.orderReference, duplicateWebhook: false };
  }

  return {
    ok: false,
    code: "solana_pay_pending_expired",
    detail: "no_matching_active_pending",
    orderReference: row.orderReference,
  };
}

export function heliusPaymentToNormalizedEvent(
  payment: HeliusIngressPayment,
  orderReference: string,
): NormalizedIngressEvent {
  return {
    provider: "helius",
    paymentIngressEventId: payment.paymentIngressEventId,
    paymentReferenceId: orderReference,
    grandTotalCents: payment.grandTotalCents,
    currency: payment.currency,
    metadata: payment.metadata,
  };
}
