import type { Client } from "@libsql/client";
import {
  getRefundByAthRefundReferenceNumber,
  getPurchaseOrderByIngressEventId,
  setPurchaseOrderStatus,
  sumConfirmedRefundsForOrder,
  tryInsertRefundIfWithinOrderTotal,
} from "@/lib/infrastructure/turso/webhook-db";
import type { NormalizedAthRefundEvent } from "@/lib/commerce/web-api/ath-movil/adapters/ingress/parse-ath-ingress-event";

export type AthRefundIngressResult =
  | { ok: true; ignored: true }
  | { ok: true; ignored: false; orderReference: string; status: "refunding" | "refunded" }
  | { ok: false; code: "refund_exceeds_order_total" | "invalid_order_state"; detail: string };

export async function executeAthRefundIngressEvent(
  db: Client,
  event: NormalizedAthRefundEvent,
): Promise<AthRefundIngressResult> {
  const paymentIngressEventId = `evt_ath_${event.athReferenceNumber}`;
  const order = await getPurchaseOrderByIngressEventId(db, paymentIngressEventId);
  if (!order) {
    console.warn(
      JSON.stringify({
        scope: "ath_refund_no_matching_order",
        severity: "warn",
        referenceNumber: event.athReferenceNumber,
        refundTotalCents: event.refundTotalCents,
        refundIngressEventId: event.refundIngressEventId,
      }),
    );
    return { ok: true, ignored: true };
  }

  if (order.status === "pending" || order.status === "expired") {
    return { ok: false, code: "invalid_order_state", detail: `status_${order.status}` };
  }

  const inserted = await tryInsertRefundIfWithinOrderTotal(db, {
    orderReference: order.orderReference,
    amountCents: event.refundTotalCents,
    athRefundReferenceNumber: event.refundIngressEventId,
  });

  // Duplicate ATH refund webhook (same ingress id) is idempotent.
  if (!inserted) {
    const existing = await getRefundByAthRefundReferenceNumber(db, event.refundIngressEventId);
    if (existing) {
      const total = await sumConfirmedRefundsForOrder(db, order.orderReference);
      const status = total >= order.grandTotalCents ? "refunded" : "refunding";
      await setPurchaseOrderStatus(db, order.orderReference, status);
      return { ok: true, ignored: false, orderReference: order.orderReference, status };
    }
    return { ok: false, code: "refund_exceeds_order_total", detail: "reservation_rejected" };
  }

  const total = await sumConfirmedRefundsForOrder(db, order.orderReference);
  const status = total >= order.grandTotalCents ? "refunded" : "refunding";
  await setPurchaseOrderStatus(db, order.orderReference, status);

  return { ok: true, ignored: false, orderReference: order.orderReference, status };
}
