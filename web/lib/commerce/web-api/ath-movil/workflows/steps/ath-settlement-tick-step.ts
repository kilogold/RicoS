import type { Client } from "@libsql/client";
import { sleep as delay } from "@ricos/shared";
import { FatalError, RetryableError } from "workflow";
import { ATH_SETTLEMENT_POLL_INTERVAL } from "@/lib/commerce/web-api/ath-movil/domain/ath-orchestration-constants";
import {
  AthPaymentApiError,
  authorizePayment,
  findPayment,
} from "@/lib/commerce/web-api/ath-movil/adapters/http/athm-payment-api-client";
import { ATH_ECOMMERCE_STATUS } from "@/lib/commerce/web-api/ath-movil/domain/ath-orchestration-types";
import { executeAthIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { markAthExpired } from "@/lib/commerce/web-api/ath-movil/workflows/steps/mark-ath-expired-step";
import {
  getPendingPurchaseOrderMetadata,
  getPurchaseOrderByReference,
  updatePendingPurchaseOrderMetadata,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

type AthSettlementTickResult = "continue" | "paid" | "expired";

type AthSettlementTickStepInput = {
  orderReference: string;
  publicToken: string;
  authToken: string;
  settlementDeadlineAt: number;
};

type AthSettlementTickInput = {
  orderReference: string;
  publicToken: string;
  authToken: string;
  attempt: number;
};

type FinalizeAthPaidOrderParams = {
  orderReference: string;
  referenceNumber: string;
  grandTotalCents: number;
  ecommerceId: string;
};

function isFatalAthError(err: AthPaymentApiError): boolean {
  if (err.params.code !== "api_error") return false;
  if (typeof err.params.status !== "number") return false;
  return err.params.status >= 400 && err.params.status < 500 && err.params.status !== 429;
}

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

async function finalizeAthPaidOrder(
  db: Client,
  params: FinalizeAthPaidOrderParams,
): Promise<{ ok: true } | { ok: false; code: string; detail: string }> {
  const referenceNumber = params.referenceNumber.trim();
  const orderReference = params.orderReference.trim();
  if (!referenceNumber || !orderReference) {
    return { ok: false, code: "invalid_finalize_input", detail: "missing_reference_or_order_reference" };
  }

  const outcome = await executeAthIngressEvent(db, {
    provider: "athmovil",
    paymentIngressEventId: `evt_ath_${referenceNumber}`,
    paymentReferenceId: orderReference,
    grandTotalCents: params.grandTotalCents,
    currency: "usd",
    metadata: {
      ecommerceId: params.ecommerceId,
      athReferenceNumber: referenceNumber,
    },
  });
  if (!outcome.ok) {
    return {
      ok: false,
      code: "ath_finalize_failed",
      detail: `${outcome.status}:${JSON.stringify(outcome.body)}`,
    };
  }
  return { ok: true };
}

async function runAthSettlementTick(
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

export async function athSettlementTickStep(
  input: AthSettlementTickStepInput,
): Promise<AthSettlementTickResult> {
  "use step";

  const db = await getWebhookDb();
  let attempt = 0;

  while (Date.now() < input.settlementDeadlineAt) {
    attempt += 1;
    try {
      const result = await runAthSettlementTick(db, {
        orderReference: input.orderReference,
        publicToken: input.publicToken,
        authToken: input.authToken,
        attempt,
      });
      if (result !== "continue") {
        return result;
      }
    } catch (err) {
      if (err instanceof AthPaymentApiError) {
        if (isFatalAthError(err)) {
          throw new FatalError(err.message);
        }
        throw new RetryableError(err.message);
      }
      throw err;
    }

    await delay(ATH_SETTLEMENT_POLL_INTERVAL);
  }

  return "continue";
}
