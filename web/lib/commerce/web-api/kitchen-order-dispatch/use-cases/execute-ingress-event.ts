import type { Client } from "@libsql/client";
import type { KitchenOrderPayload, NormalizedIngressEvent } from "@/lib/commerce/domain";
import { publishOrderPaid } from "@/lib/infrastructure/sse/order-paid-bus";
import {
  markSolanaPurchaseOrderPaidIfNew,
  markStripePurchaseOrderPaidIfNew,
} from "@/lib/infrastructure/turso/webhook-db";
import { IngressProcessError, buildKitchenOrderPayload } from "./process-ingress-event";

export type IngressOutcome =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, string> };

/** Stripe ingress: mark the pending `purchase_orders` row paid, then broadcast on first transition. */
export async function executeStripeIngressEvent(
  db: Client,
  event: NormalizedIngressEvent,
): Promise<IngressOutcome> {
  let payload: KitchenOrderPayload;
  try {
    payload = await buildKitchenOrderPayload(db, event);
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
    payload = await buildKitchenOrderPayload(db, event);
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
