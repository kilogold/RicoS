import type { Client } from "@libsql/client";
import {
  toUsLocalPhoneDigits,
  US_PHONE_DIGIT_COUNT,
} from "@/lib/commerce/domain/customer-contact";
import { createPayment } from "@/lib/commerce/web-api/ath-movil/adapters/http/athm-payment-api-client";
import { updatePendingPurchaseOrderMetadata } from "@/lib/infrastructure/turso/webhook-db";

export const ATH_ORCHESTRATION_TIMEOUT_SECONDS = 600;

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
): Promise<{ ecommerceId: string; expiresAt: number }> {
  const startedAt = Date.now();
  const expiresAt = startedAt + ATH_ORCHESTRATION_TIMEOUT_SECONDS * 1000;
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
      "athm:authToken": payment.authToken,
      "athm:startedAt": String(startedAt),
      "athm:expiresAt": String(expiresAt),
    },
  });
  if (!metadataSaved) {
    throw new Error("ath_context_not_saved");
  }

  return { ecommerceId: payment.ecommerceId, expiresAt };
}
