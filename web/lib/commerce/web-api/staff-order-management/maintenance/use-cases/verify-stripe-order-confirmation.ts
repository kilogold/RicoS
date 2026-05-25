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

const WEBHOOK_SETTLE_ATTEMPTS = 5;
const WEBHOOK_SETTLE_DELAY_MS = 1000;

export type StripeOrderConfirmationResult =
  | { ok: true; orderStatus: PurchaseOrderStatus }
  | {
      ok: false;
      code:
        | "invalid_payment_intent"
        | "payment_not_succeeded"
        | "missing_order"
        | "order_not_confirmed";
      detail: string;
    };

function logStripeConfirmationMismatch(params: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      scope: "stripe_confirmation_mismatch",
      severity: "error",
      ...params,
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Confirms the Turso purchase order exists and reached a post-payment status before
 * showing the Stripe return URL success UI. Loudly logs when Stripe reports success
 * but the order row is missing (e.g. pending purge) or never left `pending`.
 */
export async function verifyStripeOrderConfirmation(params: {
  paymentIntentId: string | null;
  redirectStatus: string | null;
}): Promise<StripeOrderConfirmationResult> {
  const paymentIntentId = params.paymentIntentId?.trim() ?? "";
  const redirectStatus = params.redirectStatus?.trim() ?? "";

  if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) {
    return {
      ok: false,
      code: "invalid_payment_intent",
      detail: "missing_or_invalid_payment_intent",
    };
  }

  if (redirectStatus !== "succeeded") {
    logStripeConfirmationMismatch({
      paymentIntentId,
      redirectStatus: redirectStatus || null,
      detail: "stripe_redirect_not_succeeded",
    });
    return {
      ok: false,
      code: "payment_not_succeeded",
      detail: redirectStatus ? `redirect_status_${redirectStatus}` : "redirect_status_missing",
    };
  }

  const db = await getWebhookDb();

  for (let attempt = 1; attempt <= WEBHOOK_SETTLE_ATTEMPTS; attempt += 1) {
    const order = await getPurchaseOrderByReference(db, paymentIntentId);

    if (!order) {
      logStripeConfirmationMismatch({
        paymentIntentId,
        redirectStatus,
        orderStatus: null,
        detail: "no_purchase_order_row_after_stripe_success",
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

    logStripeConfirmationMismatch({
      paymentIntentId,
      redirectStatus,
      orderStatus: order.status,
      detail:
        order.status === "pending"
          ? "order_still_pending_after_stripe_success"
          : "order_not_in_confirmed_status",
      attempts: attempt,
    });
    return {
      ok: false,
      code: "order_not_confirmed",
      detail: `status_${order.status}`,
    };
  }

  logStripeConfirmationMismatch({
    paymentIntentId,
    redirectStatus,
    detail: "verification_exhausted",
  });
  return {
    ok: false,
    code: "order_not_confirmed",
    detail: "verification_exhausted",
  };
}
