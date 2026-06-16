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

const WEBHOOK_SETTLE_ATTEMPTS = 30;
const WEBHOOK_SETTLE_DELAY_MS = 1000;
const ATH_REFERENCE_RE = /^[a-f0-9]{32,40}$/i;

export type AthOrderConfirmationResult =
  | { ok: true; orderStatus: PurchaseOrderStatus }
  | {
      ok: false;
      code: "invalid_reference" | "missing_order" | "order_not_confirmed";
      detail: string;
    };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  for (let attempt = 1; attempt <= WEBHOOK_SETTLE_ATTEMPTS; attempt += 1) {
    const order = await getPurchaseOrderByReference(db, orderReference);

    if (!order) {
      logAthConfirmationMismatch({
        orderReference,
        orderStatus: null,
        detail: "no_purchase_order_row_after_ath_success",
        attempts: attempt,
      });
      return {
        ok: false,
        code: "missing_order",
        detail: "purchase_order_not_found",
      };
    }

    if (CONFIRMED_STATUSES.has(order.status)) {
      return { ok: true, orderStatus: order.status };
    }

    if (order.status === "pending" && attempt < WEBHOOK_SETTLE_ATTEMPTS) {
      await sleep(WEBHOOK_SETTLE_DELAY_MS);
      continue;
    }

    logAthConfirmationMismatch({
      orderReference,
      orderStatus: order.status,
      detail: order.status === "pending" ? "order_still_pending_after_ath_success" : "order_not_in_confirmed_status",
      attempts: attempt,
    });
    return {
      ok: false,
      code: "order_not_confirmed",
      detail: `status_${order.status}`,
    };
  }

  logAthConfirmationMismatch({
    orderReference,
    detail: "verification_exhausted",
  });
  return {
    ok: false,
    code: "order_not_confirmed",
    detail: "verification_exhausted",
  };
}
