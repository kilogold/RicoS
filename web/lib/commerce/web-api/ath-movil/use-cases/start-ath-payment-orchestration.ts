import type { Client } from "@libsql/client";
import {
  toUsLocalPhoneDigits,
  US_PHONE_DIGIT_COUNT,
} from "@/lib/commerce/domain/customer-contact";
import { createPayment } from "@/lib/commerce/web-api/ath-movil/adapters/http/athm-payment-api-client";
import {
  ATH_ORCHESTRATION_TIMEOUT_SECONDS,
  ATH_SETTLEMENT_BUDGET_MS,
} from "@/lib/commerce/web-api/ath-movil/domain/ath-orchestration-constants";
import { updatePendingPurchaseOrderMetadata } from "@/lib/infrastructure/turso/webhook-db";

export async function startAthPaymentOrchestration(
  db: Client,
  params: {
    orderReference: string;
    publicToken: string;
    totalCents: number;
    serviceMode: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
  },
): Promise<{
  ecommerceId: string;
  authToken: string;
  expiresAt: number;
  startedAt: number;
  settlementDeadlineAt: number;
}> {
  const startedAt = Date.now();
  const expiresAt = startedAt + ATH_ORCHESTRATION_TIMEOUT_SECONDS * 1000;
  const settlementDeadlineAt = startedAt + ATH_SETTLEMENT_BUDGET_MS;
  // ATH Móvil only accepts 10-digit local numbers; discard US country code (+1).
  const phoneDigits = toUsLocalPhoneDigits(params.customerPhone);
  if (phoneDigits.length !== US_PHONE_DIGIT_COUNT) {
    throw new Error("ath_invalid_phone_number");
  }

  const payment = await createPayment({
    env: "production",
    publicToken: params.publicToken,
    timeoutSeconds: ATH_ORCHESTRATION_TIMEOUT_SECONDS,
    total: params.totalCents / 100,
    subtotal: params.totalCents / 100,
    tax: 0,
    metadata1: params.orderReference,
    metadata2: params.serviceMode.slice(0, 40),
    phoneNumber: phoneDigits,
    customerName: params.customerName,
    customerEmail: params.customerEmail ?? undefined,
  });

  const metadataSaved = await updatePendingPurchaseOrderMetadata(db, {
    orderReference: params.orderReference,
    paymentIntentExpiresAt: expiresAt,
    metadata: {
      "athm:ecommerceId": payment.ecommerceId,
      "athm:startedAt": String(startedAt),
      "athm:expiresAt": String(expiresAt),
      "athm:settlementDeadlineAt": String(settlementDeadlineAt),
    },
  });
  if (!metadataSaved) {
    throw new Error("ath_context_not_saved");
  }

  return {
    ecommerceId: payment.ecommerceId,
    authToken: payment.authToken,
    expiresAt,
    startedAt,
    settlementDeadlineAt,
  };
}
