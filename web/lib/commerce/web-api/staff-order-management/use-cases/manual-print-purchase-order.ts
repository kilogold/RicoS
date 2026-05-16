import type { Client } from "@libsql/client";
import {
  type KitchenOrderPayload,
  PENDING_PAYMENT_NO_SALE_INGRESS_ID,
} from "@/lib/commerce/domain";
import { publishOrder } from "@/lib/infrastructure/sse/order-paid-bus";
import { getPurchaseOrderByReference } from "@/lib/infrastructure/turso/webhook-db";

export type ManualPrintPurchaseOrderResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "missing_customer_name" };

export async function manualPrintPurchaseOrder(
  db: Client,
  orderReference: string,
): Promise<ManualPrintPurchaseOrderResult> {
  const ref = orderReference.trim();
  const order = await getPurchaseOrderByReference(db, ref);
  if (!order) {
    return { ok: false, error: "not_found" };
  }

  const customerName = order.customerName?.trim();
  if (!customerName) {
    return { ok: false, error: "missing_customer_name" };
  }

  const paymentIngressEventId =
    order.paymentIngressEventId?.trim() ||
    order.payload.paymentIngressEventId?.trim() ||
    PENDING_PAYMENT_NO_SALE_INGRESS_ID;

  const payload: KitchenOrderPayload = {
    ...order.payload,
    paymentIngressEventId,
    paymentReferenceId: order.orderReference,
    amountCents: order.amountCents,
    currency: order.currency,
    customerName,
    intent: "manual-print",
  };

  publishOrder(payload);
  return { ok: true };
}
