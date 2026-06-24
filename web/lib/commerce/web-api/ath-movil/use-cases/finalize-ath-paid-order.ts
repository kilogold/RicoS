import type { Client } from "@libsql/client";
import { executeAthIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";

export async function finalizeAthPaidOrder(
  db: Client,
  params: {
    orderReference: string;
    referenceNumber: string;
    grandTotalCents: number;
    ecommerceId: string;
  },
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
