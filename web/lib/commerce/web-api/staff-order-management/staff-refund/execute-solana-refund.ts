import type { PurchaseOrderRecord } from "@/lib/infrastructure/turso/webhook-db";
import { getHeliusIngressConfig } from "@/lib/commerce/web-api/solana-payment/config";
import { HELIUS_INGRESS_EVENT_PREFIX } from "@/lib/commerce/web-api/staff-order-management/staff-refund/solana/constants";
import { extractUsdcPayerFromHeliusTransaction } from "@/lib/commerce/web-api/staff-order-management/staff-refund/solana/extract-usdc-payer";
import { sendUsdcReimbursement } from "@/lib/commerce/web-api/staff-order-management/staff-refund/solana/send-reimbursement";
import { fetchHeliusEnhancedTransaction } from "@/lib/infrastructure/helius/fetch-enhanced-transaction";

export type SolanaStaffRefundErrorCode =
  | "server_misconfigured"
  | "missing_payment_reference"
  | "payment_payer_not_found"
  | "solana_refund_failed";

export async function executeSolanaStaffRefund(params: {
  order: Pick<PurchaseOrderRecord, "orderReference" | "paymentIngressEventId">;
  amountCents: number;
}): Promise<
  | { ok: true; transactionSignature: string }
  | { ok: false; code: SolanaStaffRefundErrorCode; detail?: string }
> {
  const orderReference = params.order.orderReference.trim();
  if (!orderReference) {
    return { ok: false, code: "missing_payment_reference" };
  }

  const ingressId = params.order.paymentIngressEventId?.trim();
  if (!ingressId?.startsWith(HELIUS_INGRESS_EVENT_PREFIX)) {
    return {
      ok: false,
      code: "missing_payment_reference",
      detail: "order has no Helius payment ingress event",
    };
  }

  const paymentSignature = ingressId.slice(HELIUS_INGRESS_EVENT_PREFIX.length).trim();
  if (!paymentSignature) {
    return {
      ok: false,
      code: "missing_payment_reference",
      detail: "payment ingress event has no transaction signature",
    };
  }

  let transaction: Record<string, unknown> | null;
  try {
    transaction = await fetchHeliusEnhancedTransaction(paymentSignature);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "solana_refund_failed", detail: message };
  }

  if (!transaction) {
    return {
      ok: false,
      code: "payment_payer_not_found",
      detail: "original payment transaction not found",
    };
  }

  let ingressConfig;
  try {
    ingressConfig = getHeliusIngressConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "server_misconfigured", detail: message };
  }

  const payerAddress = extractUsdcPayerFromHeliusTransaction(transaction, {
    expectedMint: ingressConfig.expectedUsdcMint,
    expectedRecipient: ingressConfig.expectedRecipient,
  });
  if (!payerAddress) {
    return {
      ok: false,
      code: "payment_payer_not_found",
      detail: "no matching USDC transfer to merchant in payment transaction",
    };
  }

  return sendUsdcReimbursement({
    payerAddress,
    amountCents: params.amountCents,
    orderReference,
  });
}
