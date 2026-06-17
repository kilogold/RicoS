import { setTimeout as sleep } from "node:timers/promises";
import { findPayment, authorizePayment } from "@/lib/commerce/web-api/ath-movil/adapters/http/athm-payment-api-client";
import { ATH_ECOMMERCE_STATUS } from "@/lib/commerce/web-api/ath-movil/domain/ath-orchestration-types";
import { finalizeAthPaidOrder } from "@/lib/commerce/web-api/ath-movil/use-cases/finalize-ath-paid-order";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  getPendingPurchaseOrderMetadata,
  getPurchaseOrderByReference,
  setPurchaseOrderStatus,
  updatePendingPurchaseOrderMetadata,
} from "@/lib/infrastructure/turso/webhook-db";

const SETTLEMENT_POLL_INTERVAL_MS = 2_000;
const SETTLEMENT_MAX_ATTEMPTS = 120;

function readAthContext(metadata: Record<string, string | undefined> | null): {
  ecommerceId: string;
  authToken: string;
  expiresAt: number;
} | null {
  if (!metadata) return null;
  const ecommerceId = metadata["athm:ecommerceId"]?.trim();
  const authToken = metadata["athm:authToken"]?.trim();
  const expiresAt = Number(metadata["athm:expiresAt"]);
  if (!ecommerceId || !authToken || !Number.isFinite(expiresAt)) return null;
  return { ecommerceId, authToken, expiresAt };
}

async function markExpiredIfPending(orderReference: string, reason: string): Promise<void> {
  const db = await getWebhookDb();
  const order = await getPurchaseOrderByReference(db, orderReference);
  if (!order || order.status !== "pending") return;
  await setPurchaseOrderStatus(db, orderReference, "expired");
  console.info(JSON.stringify({ scope: "athm_settled_expired", orderReference, reason }));
}

export async function runAthPaymentSettlementLoop(params: {
  orderReference: string;
  publicToken: string;
}): Promise<void> {
  for (let attempt = 1; attempt <= SETTLEMENT_MAX_ATTEMPTS; attempt += 1) {
    const db = await getWebhookDb();
    const order = await getPurchaseOrderByReference(db, params.orderReference);
    if (!order || order.status !== "pending") return;

    const context = readAthContext(getPendingPurchaseOrderMetadata(order));
    if (!context) {
      console.error(JSON.stringify({ scope: "athm_settlement_error", orderReference: params.orderReference, reason: "missing_context" }));
      return;
    }

    if (Date.now() >= context.expiresAt) {
      await markExpiredIfPending(params.orderReference, "ath_expired");
      return;
    }

    try {
      const found = await findPayment({
        ecommerceId: context.ecommerceId,
        publicToken: params.publicToken,
      });
      console.info(
        JSON.stringify({
          scope: "athm_poll_tick",
          orderReference: params.orderReference,
          ecommerceId: context.ecommerceId,
          attempt,
          ecommerceStatus: found.ecommerceStatus,
        }),
      );

      if (found.ecommerceStatus === ATH_ECOMMERCE_STATUS.OPEN) {
        await sleep(SETTLEMENT_POLL_INTERVAL_MS);
        continue;
      }

      if (found.ecommerceStatus === ATH_ECOMMERCE_STATUS.CANCEL) {
        await markExpiredIfPending(params.orderReference, "ath_cancelled");
        return;
      }

      if (found.ecommerceStatus === ATH_ECOMMERCE_STATUS.CONFIRM) {
        console.info(
          JSON.stringify({
            scope: "athm_confirm_seen",
            orderReference: params.orderReference,
            ecommerceId: context.ecommerceId,
          }),
        );
        const authorized = await authorizePayment({ authToken: context.authToken });
        if (authorized.ecommerceStatus !== ATH_ECOMMERCE_STATUS.COMPLETED) {
          if (authorized.ecommerceStatus === ATH_ECOMMERCE_STATUS.CANCEL) {
            await markExpiredIfPending(params.orderReference, "ath_cancelled_on_authorize");
            return;
          }
          await sleep(SETTLEMENT_POLL_INTERVAL_MS);
          continue;
        }

        const referenceNumber = authorized.referenceNumber?.trim();
        if (!referenceNumber) {
          console.error(
            JSON.stringify({
              scope: "athm_settlement_error",
              orderReference: params.orderReference,
              reason: "authorization_missing_reference_number",
            }),
          );
          await sleep(SETTLEMENT_POLL_INTERVAL_MS);
          continue;
        }

        const finalize = await finalizeAthPaidOrder(db, {
          orderReference: params.orderReference,
          referenceNumber,
          ecommerceId: authorized.ecommerceId,
          grandTotalCents: order.grandTotalCents,
        });
        if (!finalize.ok) {
          console.error(
            JSON.stringify({
              scope: "athm_settlement_error",
              orderReference: params.orderReference,
              reason: finalize.code,
              detail: finalize.detail,
            }),
          );
          await sleep(SETTLEMENT_POLL_INTERVAL_MS);
          continue;
        }

        await updatePendingPurchaseOrderMetadata(db, {
          orderReference: params.orderReference,
          metadata: {
            "athm:referenceNumber": referenceNumber,
          },
        });
        console.info(
          JSON.stringify({
            scope: "athm_settled_paid",
            orderReference: params.orderReference,
            ecommerceId: authorized.ecommerceId,
            referenceNumber,
          }),
        );
        return;
      }

      if (found.ecommerceStatus === ATH_ECOMMERCE_STATUS.COMPLETED) {
        const referenceNumber = found.referenceNumber?.trim();
        if (!referenceNumber) {
          console.error(
            JSON.stringify({
              scope: "athm_settlement_error",
              orderReference: params.orderReference,
              reason: "find_completed_missing_reference_number",
            }),
          );
          await sleep(SETTLEMENT_POLL_INTERVAL_MS);
          continue;
        }
        const finalize = await finalizeAthPaidOrder(db, {
          orderReference: params.orderReference,
          referenceNumber,
          ecommerceId: found.ecommerceId,
          grandTotalCents: order.grandTotalCents,
        });
        if (!finalize.ok) {
          console.error(
            JSON.stringify({
              scope: "athm_settlement_error",
              orderReference: params.orderReference,
              reason: finalize.code,
              detail: finalize.detail,
            }),
          );
          await sleep(SETTLEMENT_POLL_INTERVAL_MS);
          continue;
        }
        console.info(
          JSON.stringify({
            scope: "athm_settled_paid",
            orderReference: params.orderReference,
            ecommerceId: found.ecommerceId,
            referenceNumber,
          }),
        );
        return;
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          scope: "athm_settlement_error",
          orderReference: params.orderReference,
          attempt,
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
      await sleep(SETTLEMENT_POLL_INTERVAL_MS);
      continue;
    }
  }

  await markExpiredIfPending(params.orderReference, "ath_settlement_timeout");
}
