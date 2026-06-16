import type { Client } from "@libsql/client";
import { executeAthIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { getPurchaseOrdersByReferences, type PurchaseOrderRecord } from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { parseAthIngressEvent } from "../ingress/parse-ath-ingress-event";
import { executeAthRefundIngressEvent } from "../../use-cases/execute-ath-refund-ingress";

type AthPendingResolution =
  | { ok: true; orderReference: string; duplicateWebhook: boolean }
  | { ok: false; code: "ath_reference_unknown" | "ath_pending_expired" | "ath_duplicate_payment"; detail: string };

export async function handleAthMovilWebhookRequest(body: unknown): Promise<void> {
  let db: Client;
  try {
    db = await getWebhookDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ATH Móvil webhook misconfiguration:", message);
    return;
  }

  const parsed = parseAthIngressEvent(body);
  if (parsed.kind === "error") {
    console.error("ATH ingress rejected:", parsed.message);
    return;
  }

  if (parsed.kind === "ignore") {
    console.info(
      JSON.stringify({
        scope: "ath_webhook_ignored",
        reason: parsed.reason,
        transactionType: parsed.transactionType,
        status: parsed.status,
        referenceNumber: parsed.referenceNumber,
        ecommerceId: parsed.ecommerceId,
      }),
    );
    return;
  }

  if (parsed.kind === "payment") {
    const resolved = await resolveAthPending(db, parsed.event);
    if (!resolved.ok) {
      console.error(
        JSON.stringify({
          scope: "ath_payment_rejected",
          code: resolved.code,
          orderReference: parsed.event.paymentReferenceId,
          paymentIngressEventId: parsed.event.paymentIngressEventId,
          detail: resolved.detail,
        }),
      );
      return;
    }
    if (resolved.duplicateWebhook) return;

    const outcome = await executeAthIngressEvent(db, parsed.event);
    if (!outcome.ok) {
      console.error("ATH ingress processing failed:", {
        paymentIngressEventId: parsed.event.paymentIngressEventId,
        status: outcome.status,
        body: outcome.body,
      });
    }
    return;
  }

  const refundOutcome = await executeAthRefundIngressEvent(db, parsed.event);
  if (!refundOutcome.ok) {
    console.error(
      JSON.stringify({
        scope: "ath_refund_rejected",
        code: refundOutcome.code,
        detail: refundOutcome.detail,
        refundIngressEventId: parsed.event.refundIngressEventId,
        referenceNumber: parsed.event.athReferenceNumber,
      }),
    );
  }
}

function pendingOrderMatchesAthEventPayment(order: PurchaseOrderRecord, eventGrandTotalCents: number): boolean {
  return (
    Math.floor(order.grandTotalCents) === Math.floor(eventGrandTotalCents) &&
    order.currency.trim().toLowerCase() === "usd"
  );
}

async function resolveAthPending(
  db: Client,
  event: { paymentReferenceId: string; paymentIngressEventId: string; grandTotalCents: number },
): Promise<AthPendingResolution> {
  const orderReference = event.paymentReferenceId.trim();
  if (!orderReference) {
    return { ok: false, code: "ath_reference_unknown", detail: "missing_order_reference" };
  }

  const rows = await getPurchaseOrdersByReferences(db, [orderReference]);
  const row = rows.get(orderReference);
  if (!row) {
    return { ok: false, code: "ath_reference_unknown", detail: "no_pending_order_row" };
  }

  if (row.status === "paid") {
    if (row.paymentIngressEventId === event.paymentIngressEventId) {
      return { ok: true, orderReference: row.orderReference, duplicateWebhook: true };
    }
    return { ok: false, code: "ath_duplicate_payment", detail: "reference_already_paid_different_event" };
  }

  if (row.paymentProvider !== "athmovil") {
    return { ok: false, code: "ath_reference_unknown", detail: "provider_mismatch" };
  }

  if (row.status === "pending" && pendingOrderMatchesAthEventPayment(row, event.grandTotalCents)) {
    return { ok: true, orderReference: row.orderReference, duplicateWebhook: false };
  }

  return { ok: false, code: "ath_pending_expired", detail: "no_matching_active_pending" };
}
