import {
  getPurchaseOrderByReference,
  type PurchaseOrderStatus,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { sleep } from "@ricos/shared";
import {
  ORDER_CONFIRMATION_ERROR_CODE,
  type OrderConfirmationErrorCode,
} from "@/lib/commerce/order-confirmation";

const CONFIRMED_STATUSES: ReadonlySet<PurchaseOrderStatus> = new Set([
  "paid",
  "acknowledged",
  "fulfilled",
  "refunding",
  "refunded",
]);

const WEBHOOK_SETTLE_ATTEMPTS = 5;
const WEBHOOK_SETTLE_DELAY_MS = 1000;

/** Base58 Solana address (reference pubkey). */
const SOLANA_REFERENCE_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type SolanaOrderConfirmationResult =
  | { ok: true; orderStatus: PurchaseOrderStatus }
  | {
      ok: false;
      code: OrderConfirmationErrorCode;
      detail: string;
    };

function logSolanaConfirmationMismatch(params: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      scope: "solana_confirmation_mismatch",
      severity: "error",
      ...params,
    }),
  );
}

/**
 * Confirms the Turso purchase order exists and reached a post-payment status before
 * showing the Solana Pay return URL success UI. Retries while the row is still
 * `pending` so Helius ingress can settle after on-chain payment.
 */
export async function verifySolanaOrderConfirmation(params: {
  orderReference: string | null;
  transactionSignature?: string | null;
}): Promise<SolanaOrderConfirmationResult> {
  const orderReference = params.orderReference?.trim() ?? "";
  const transactionSignature = params.transactionSignature?.trim() ?? "";

  if (!orderReference || !SOLANA_REFERENCE_RE.test(orderReference)) {
    return {
      ok: false,
      code: ORDER_CONFIRMATION_ERROR_CODE.INVALID_REFERENCE,
      detail: "missing_or_invalid_order_reference",
    };
  }

  const db = await getWebhookDb();

  for (let attempt = 1; attempt <= WEBHOOK_SETTLE_ATTEMPTS; attempt += 1) {
    const order = await getPurchaseOrderByReference(db, orderReference);

    if (!order) {
      logSolanaConfirmationMismatch({
        orderReference,
        transactionSignature: transactionSignature || null,
        orderStatus: null,
        detail: "no_purchase_order_row_after_solana_payment",
        attempts: attempt,
      });
      return {
        ok: false,
        code: ORDER_CONFIRMATION_ERROR_CODE.MISSING_ORDER,
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

    logSolanaConfirmationMismatch({
      orderReference,
      transactionSignature: transactionSignature || null,
      orderStatus: order.status,
      detail:
        order.status === "pending"
          ? "order_still_pending_after_solana_payment"
          : "order_not_in_confirmed_status",
      attempts: attempt,
    });
    return {
      ok: false,
      code: ORDER_CONFIRMATION_ERROR_CODE.ORDER_NOT_CONFIRMED,
      detail: `status_${order.status}`,
    };
  }

  logSolanaConfirmationMismatch({
    orderReference,
    transactionSignature: transactionSignature || null,
    detail: "verification_exhausted",
  });
  return {
    ok: false,
    code: ORDER_CONFIRMATION_ERROR_CODE.ORDER_NOT_CONFIRMED,
    detail: "verification_exhausted",
  };
}
