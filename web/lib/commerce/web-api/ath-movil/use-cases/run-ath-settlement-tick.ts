import type { Client } from "@libsql/client";
import {
  authorizePayment,
  findPayment,
} from "@/lib/commerce/web-api/ath-movil/adapters/http/athm-payment-api-client";
import { ATH_ECOMMERCE_STATUS } from "@/lib/commerce/web-api/ath-movil/domain/ath-orchestration-types";
import { finalizeAthPaidOrder } from "@/lib/commerce/web-api/ath-movil/use-cases/finalize-ath-paid-order";
import { markAthExpired } from "@/lib/commerce/web-api/ath-movil/use-cases/mark-ath-expired";
import {
  getPendingPurchaseOrderMetadata,
  getPurchaseOrderByReference,
  updatePendingPurchaseOrderMetadata,
} from "@/lib/infrastructure/turso/webhook-db";

export type AthSettlementTickResult = "continue" | "paid" | "expired";

type AthSettlementTickInput = {
  orderReference: string;
  publicToken: string;
  authToken: string;
  attempt: number;
};

function readAthContext(metadata: Record<string, string | undefined> | null): {
  ecommerceId: string;
  expiresAt: number;
  authorizedAt: number | null;
} | null {
  if (!metadata) return null;
  const ecommerceId = metadata["athm:ecommerceId"]?.trim();
  const expiresAt = Number(metadata["athm:expiresAt"]);
  const authorizedAtRaw = metadata["athm:authorizedAt"];
  const authorizedAt =
    typeof authorizedAtRaw === "string" && authorizedAtRaw.trim()
      ? Number(authorizedAtRaw)
      : null;
  if (!ecommerceId || !Number.isFinite(expiresAt)) return null;
  return {
    ecommerceId,
    expiresAt,
    authorizedAt: authorizedAt !== null && Number.isFinite(authorizedAt) ? authorizedAt : null,
  };
}

export async function runAthSettlementTick(
  db: Client,
  input: AthSettlementTickInput,
): Promise<AthSettlementTickResult> {
  const order = await getPurchaseOrderByReference(db, input.orderReference);
  if (!order || order.status !== "pending") return "paid";

  const context = readAthContext(getPendingPurchaseOrderMetadata(order));
  if (!context) {
    console.error(
      JSON.stringify({
        scope: "athm_settlement_error",
        orderReference: input.orderReference,
        reason: "missing_context",
      }),
    );
    return "continue";
  }

  if (Date.now() >= context.expiresAt) {
    await markAthExpired({ orderReference: input.orderReference, reason: "ath_expired" }, db);
    return "expired";
  }

  const found = await findPayment({
    ecommerceId: context.ecommerceId,
    publicToken: input.publicToken,
  });
  console.info(
    JSON.stringify({
      scope: "athm_poll_tick",
      orderReference: input.orderReference,
      ecommerceId: context.ecommerceId,
      attempt: input.attempt,
      ecommerceStatus: found.ecommerceStatus,
    }),
  );

  if (found.ecommerceStatus === ATH_ECOMMERCE_STATUS.OPEN) {
    return "continue";
  }

  if (found.ecommerceStatus === ATH_ECOMMERCE_STATUS.CANCEL) {
    await markAthExpired({ orderReference: input.orderReference, reason: "ath_cancelled" }, db);
    return "expired";
  }

  if (found.ecommerceStatus === ATH_ECOMMERCE_STATUS.CONFIRM) {
    console.info(
      JSON.stringify({
        scope: "athm_confirm_seen",
        orderReference: input.orderReference,
        ecommerceId: context.ecommerceId,
      }),
    );

    if (context.authorizedAt === null) {
      await updatePendingPurchaseOrderMetadata(db, {
        orderReference: input.orderReference,
        metadata: {
          "athm:authorizedAt": String(Date.now()),
        },
      });
      const authorized = await authorizePayment({ authToken: input.authToken });
      if (authorized.ecommerceStatus !== ATH_ECOMMERCE_STATUS.COMPLETED) {
        if (authorized.ecommerceStatus === ATH_ECOMMERCE_STATUS.CANCEL) {
          await markAthExpired(
            { orderReference: input.orderReference, reason: "ath_cancelled_on_authorize" },
            db,
          );
          return "expired";
        }
        return "continue";
      }

      const referenceNumber = authorized.referenceNumber?.trim();
      if (!referenceNumber) {
        console.error(
          JSON.stringify({
            scope: "athm_settlement_error",
            orderReference: input.orderReference,
            reason: "authorization_missing_reference_number",
          }),
        );
        return "continue";
      }

      const finalize = await finalizeAthPaidOrder(db, {
        orderReference: input.orderReference,
        referenceNumber,
        ecommerceId: authorized.ecommerceId,
        grandTotalCents: order.grandTotalCents,
      });
      if (!finalize.ok) {
        console.error(
          JSON.stringify({
            scope: "athm_settlement_error",
            orderReference: input.orderReference,
            reason: finalize.code,
            detail: finalize.detail,
          }),
        );
        return "continue";
      }
      await updatePendingPurchaseOrderMetadata(db, {
        orderReference: input.orderReference,
        metadata: {
          "athm:referenceNumber": referenceNumber,
        },
      });
      console.info(
        JSON.stringify({
          scope: "athm_settled_paid",
          orderReference: input.orderReference,
          ecommerceId: authorized.ecommerceId,
          referenceNumber,
        }),
      );
      return "paid";
    }

    return "continue";
  }

  if (found.ecommerceStatus === ATH_ECOMMERCE_STATUS.COMPLETED) {
    const referenceNumber = found.referenceNumber?.trim();
    if (!referenceNumber) {
      console.error(
        JSON.stringify({
          scope: "athm_settlement_error",
          orderReference: input.orderReference,
          reason: "find_completed_missing_reference_number",
        }),
      );
      return "continue";
    }
    const finalize = await finalizeAthPaidOrder(db, {
      orderReference: input.orderReference,
      referenceNumber,
      ecommerceId: found.ecommerceId,
      grandTotalCents: order.grandTotalCents,
    });
    if (!finalize.ok) {
      console.error(
        JSON.stringify({
          scope: "athm_settlement_error",
          orderReference: input.orderReference,
          reason: finalize.code,
          detail: finalize.detail,
        }),
      );
      return "continue";
    }
    await updatePendingPurchaseOrderMetadata(db, {
      orderReference: input.orderReference,
      metadata: {
        "athm:referenceNumber": referenceNumber,
      },
    });
    console.info(
      JSON.stringify({
        scope: "athm_settled_paid",
        orderReference: input.orderReference,
        ecommerceId: found.ecommerceId,
        referenceNumber,
      }),
    );
    return "paid";
  }

  return "continue";
}
