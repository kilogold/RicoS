import {
  getPurchaseOrderByReference,
  type PurchaseOrderStatus,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

const CONFIRMED_STATUSES: ReadonlySet<PurchaseOrderStatus> = new Set([
  "paid",
  "acknowledged",
  "fulfilled",
  "refunding",
  "refunded",
]);

const ATH_REFERENCE_RE = /^[a-f0-9]{32,40}$/i;

export type AthOrderConfirmationResult =
  | { ok: true; orderStatus: PurchaseOrderStatus }
  | {
      ok: false;
      code: "invalid_reference" | "missing_order";
      detail: string;
    };

function logAthConfirmationMismatch(params: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      scope: "ath_confirmation_mismatch",
      severity: "error",
      ...params,
    }),
  );
}

export async function verifyAthOrderConfirmation(params: {
  orderReference: string | null;
}): Promise<AthOrderConfirmationResult> {
  const orderReference = params.orderReference?.trim() ?? "";
  if (!orderReference || !ATH_REFERENCE_RE.test(orderReference)) {
    return {
      ok: false,
      code: "invalid_reference",
      detail: "missing_or_invalid_order_reference",
    };
  }

  const db = await getWebhookDb();
  const order = await getPurchaseOrderByReference(db, orderReference);
  if (!order) {
    logAthConfirmationMismatch({
      orderReference,
      orderStatus: null,
      detail: "no_purchase_order_row_after_ath_success",
    });
    return {
      ok: false,
      code: "missing_order",
      detail: "purchase_order_not_found",
    };
  }

  if (!CONFIRMED_STATUSES.has(order.status) && order.status !== "pending" && order.status !== "expired") {
    logAthConfirmationMismatch({
      orderReference,
      orderStatus: order.status,
      detail: "order_not_in_confirmed_status",
    });
  }

  return { ok: true, orderStatus: order.status };
}
