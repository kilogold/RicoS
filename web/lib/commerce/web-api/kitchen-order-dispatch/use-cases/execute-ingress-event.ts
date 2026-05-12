import type { Client } from "@libsql/client";
import type { KitchenOrderPayload, NormalizedIngressEvent } from "@/lib/commerce/domain";
import { publishOrderPaid } from "@/lib/infrastructure/sse/order-paid-bus";
import {
  getPurchaseOrderByReference,
  markSolanaPurchaseOrderPaidIfNew,
  markStripePurchaseOrderPaidIfNew,
  type PurchaseOrderRecord,
} from "@/lib/infrastructure/turso/webhook-db";
import { IngressProcessError } from "./process-ingress-event";

export type IngressOutcome =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, string> };

type PersistedOrderPayload = KitchenOrderPayload & {
  metadata?: Record<string, string | undefined>;
};

async function loadPaidPayloadFromPending(
  db: Client,
  orderReference: string,
  event: NormalizedIngressEvent,
): Promise<KitchenOrderPayload> {
  const order = await getPurchaseOrderByReference(db, orderReference);
  if (!order) {
    throw new IngressProcessError("missing_pending_order", `Missing pending order ${orderReference}`);
  }
  assertPaymentMatchesSavedOrder(order, event);
  const savedPayload = omitPersistedMetadata(order.payload as PersistedOrderPayload);
  return {
    ...savedPayload,
    paymentIngressEventId: event.paymentIngressEventId,
    paymentReferenceId: event.paymentReferenceId,
    amountCents: event.amountCents,
    currency: event.currency,
  };
}

function omitPersistedMetadata(payload: PersistedOrderPayload): KitchenOrderPayload {
  const payloadWithoutMetadata: PersistedOrderPayload = { ...payload };
  delete payloadWithoutMetadata.metadata;
  return payloadWithoutMetadata;
}

function assertPaymentMatchesSavedOrder(
  order: PurchaseOrderRecord,
  event: NormalizedIngressEvent,
): void {
  if (order.orderReference !== event.paymentReferenceId) {
    throw new IngressProcessError(
      "payment_mismatch",
      `Payment reference mismatch: ${event.paymentReferenceId} !== ${order.orderReference}`,
    );
  }
  if (Math.floor(order.amountCents) !== Math.floor(event.amountCents)) {
    throw new IngressProcessError(
      "payment_mismatch",
      `Payment amount mismatch: ${event.amountCents} !== ${order.amountCents}`,
    );
  }
  if (order.currency.trim().toLowerCase() !== event.currency.trim().toLowerCase()) {
    throw new IngressProcessError(
      "payment_mismatch",
      `Payment currency mismatch: ${event.currency} !== ${order.currency}`,
    );
  }
}

/** Stripe ingress: mark the pending `purchase_orders` row paid, then broadcast on first transition. */
export async function executeStripeIngressEvent(
  db: Client,
  event: NormalizedIngressEvent,
): Promise<IngressOutcome> {
  let payload: KitchenOrderPayload;
  try {
    payload = await loadPaidPayloadFromPending(db, event.paymentReferenceId, event);
  } catch (err) {
    return ingressErrorToOutcome(err, event);
  }

  try {
    const inserted = await markStripePurchaseOrderPaidIfNew(db, {
      orderReference: event.paymentReferenceId,
      payload,
    });
    if (inserted) {
      try {
        publishOrderPaid(payload);
      } catch (broadcastErr) {
        console.error("SSE broadcast failed (order is persisted):", broadcastErr);
      }
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("purchase_orders insert failed:", message);
    return { ok: false, status: 500, body: { error: "persist_failed" } };
  }
}

/**
 * Solana ingress: mark the pending `purchase_orders` row paid, then broadcast after commit.
 */
export async function executeSolanaIngressEvent(
  db: Client,
  event: NormalizedIngressEvent,
  context: { orderReference: string; transactionSignature: string },
): Promise<IngressOutcome> {
  let payload: KitchenOrderPayload;
  try {
    payload = await loadPaidPayloadFromPending(db, context.orderReference, event);
  } catch (err) {
    return ingressErrorToOutcome(err, event);
  }

  try {
    const inserted = await markSolanaPurchaseOrderPaidIfNew(db, {
      orderReference: context.orderReference,
      payload,
    });
    if (inserted) {
      try {
        publishOrderPaid(payload);
      } catch (broadcastErr) {
        console.error("SSE broadcast failed (order is persisted):", broadcastErr);
      }
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("purchase_orders solana atomic insert failed:", message);
    return { ok: false, status: 500, body: { error: "persist_failed" } };
  }
}

function ingressErrorToOutcome(err: unknown, event: NormalizedIngressEvent): IngressOutcome {
  if (err instanceof IngressProcessError) {
    if (err.code === "persist_failed") {
      console.error("purchase_orders insert failed:", err.message);
      return { ok: false, status: 500, body: { error: err.code } };
    }
    console.error(`Ingress ${event.provider} rejected:`, err.message);
    return { ok: false, status: 400, body: { error: err.code } };
  }
  console.error("Unexpected ingress processing error:", err);
  return { ok: false, status: 500, body: { error: "persist_failed" } };
}
