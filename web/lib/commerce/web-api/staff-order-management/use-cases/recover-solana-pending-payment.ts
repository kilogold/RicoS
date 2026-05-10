import type { Client } from "@libsql/client";
import type { NormalizedIngressEvent } from "@/lib/commerce/domain";
import { executeSolanaIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { getPendingPaymentsByReferences } from "@/lib/infrastructure/turso/webhook-db";

export type RecoverSolanaPendingPaymentResult =
  | { ok: true }
  | { ok: false; error: "pending_payment_not_found" | "invalid_pending_metadata" }
  | { ok: false; status: number; body: Record<string, string> };

/**
 * Manual recovery: same atomic persist as the Helius webhook for a valid
 * `pending_payments` row + tx signature.
 */
export async function recoverSolanaPendingPayment(
  db: Client,
  orderReference: string,
  transactionSignature: string,
): Promise<RecoverSolanaPendingPaymentResult> {
  const ref = orderReference.trim();
  const sig = transactionSignature.trim();

  const pending = (await getPendingPaymentsByReferences(db, [ref])).get(ref);
  if (!pending) return { ok: false, error: "pending_payment_not_found" };

  let meta: { metadata?: Record<string, string | undefined>; amountCents?: number; currency?: string };
  try {
    meta = JSON.parse(pending.metadataJson);
  } catch {
    return { ok: false, error: "invalid_pending_metadata" };
  }
  if (
    typeof meta.amountCents !== "number" ||
    typeof meta.currency !== "string" ||
    typeof meta.metadata !== "object" ||
    meta.metadata === null
  ) {
    return { ok: false, error: "invalid_pending_metadata" };
  }

  const event: NormalizedIngressEvent = {
    provider: "helius",
    paymentIngressEventId: `evt_helius_${sig}`,
    paymentReferenceId: ref,
    amountCents: meta.amountCents,
    currency: meta.currency,
    metadata: meta.metadata,
  };

  const ingress = await executeSolanaIngressEvent(db, event, {
    orderReference: ref,
    transactionSignature: sig,
  });
  if (!ingress.ok) return { ok: false, status: ingress.status, body: ingress.body };

  console.log(
    JSON.stringify({
      scope: "solana_recover_manual",
      orderReference: ref,
      transactionSignature: sig,
      at: Date.now(),
    }),
  );

  return { ok: true };
}
