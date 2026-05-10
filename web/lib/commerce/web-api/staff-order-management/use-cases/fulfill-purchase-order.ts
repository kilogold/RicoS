import type { Client } from "@libsql/client";
import {
  type PurchaseOrderStatus,
  getPurchaseOrderByReference,
  markPurchaseOrderFulfilled,
} from "@/lib/infrastructure/turso/webhook-db";

export type FulfillPurchaseOrderResult =
  | { ok: true; orderReference: string }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "cannot_fulfill"; status: PurchaseOrderStatus };

/** `acknowledged` → `fulfilled` only. */
export async function fulfillPurchaseOrder(
  db: Client,
  orderReference: string,
): Promise<FulfillPurchaseOrderResult> {
  const ref = orderReference.trim();
  const updated = await markPurchaseOrderFulfilled(db, ref);
  if (updated) return { ok: true, orderReference: ref };

  const row = await getPurchaseOrderByReference(db, ref);
  if (!row) return { ok: false, error: "not_found" };
  return { ok: false, error: "cannot_fulfill", status: row.status };
}
