import type { PurchaseOrderRecord } from "@/lib/infrastructure/turso/webhook-db";
import { refundPayment } from "@/lib/commerce/web-api/ath-movil/adapters/http/athm-payment-api-client";

/** Prefix for `purchase_orders.payment_ingress_event_id` on ATH Móvil-settled orders. */
const ATH_INGRESS_EVENT_PREFIX = "evt_ath_";

export type AthStaffRefundErrorCode =
  | "server_misconfigured"
  | "missing_payment_reference"
  | "ath_refund_failed";

export async function executeAthStaffRefund(params: {
  order: Pick<PurchaseOrderRecord, "orderReference" | "paymentIngressEventId">;
  amountCents: number;
}): Promise<
  | { ok: true; athRefundReferenceNumber: string }
  | { ok: false; code: AthStaffRefundErrorCode; detail?: string }
> {
  const ingressId = params.order.paymentIngressEventId?.trim();
  if (!ingressId?.startsWith(ATH_INGRESS_EVENT_PREFIX)) {
    return {
      ok: false,
      code: "missing_payment_reference",
      detail: "order has no ATH Móvil payment ingress event",
    };
  }

  const referenceNumber = ingressId.slice(ATH_INGRESS_EVENT_PREFIX.length).trim();
  if (!referenceNumber) {
    return {
      ok: false,
      code: "missing_payment_reference",
      detail: "payment ingress event has no ATH reference number",
    };
  }

  const publicToken = process.env.NEXT_PUBLIC_ATH_MOVIL_PUBLIC_TOKEN?.trim();
  const privateToken = process.env.ATH_MOVIL_PRIVATE_TOKEN?.trim();
  if (!publicToken || !privateToken) {
    return { ok: false, code: "server_misconfigured", detail: "ATH Móvil tokens not configured" };
  }

  const CENTS_PER_DOLLAR = 100;
  const amount = (params.amountCents / CENTS_PER_DOLLAR).toFixed(2);

  try {
    const refund = await refundPayment({
      publicToken,
      privateToken,
      referenceNumber,
      amount,
    });
    return { ok: true, athRefundReferenceNumber: refund.refundReferenceNumber };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ath staff refund failed:", message);
    return { ok: false, code: "ath_refund_failed", detail: message };
  }
}
