import type { Client } from "@libsql/client";
import { enqueuePrintJob } from "@/lib/infrastructure/turso/webhook-db";
import { getPurchaseOrderByReference } from "@/lib/infrastructure/turso/webhook-db";

export type ManualPrintPurchaseOrderResult =
  | { ok: true }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "missing_customer_name" };

export async function manualPrintPurchaseOrder(
  db: Client,
  orderReference: string,
): Promise<ManualPrintPurchaseOrderResult> {
  const ref = orderReference.trim();
  const order = await getPurchaseOrderByReference(db, ref);
  if (!order) {
    return { ok: false, error: "not_found" };
  }

  const customerName = order.customerName?.trim();
  if (!customerName) {
    return { ok: false, error: "missing_customer_name" };
  }

  await enqueuePrintJob(db, { orderReference: ref, intent: "manual-print" });
  return { ok: true };
}
