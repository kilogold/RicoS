import {
  deletePurchaseOrderByReference,
  listPendingPurchaseOrders,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

export type PurgePendingPurchaseOrdersResult = {
  found: number;
  deleted: number;
};

/** Nightly cron: log and hard-delete every purchase order still in `pending`. */
export async function purgePendingPurchaseOrders(): Promise<PurgePendingPurchaseOrdersResult> {
  const db = await getWebhookDb();
  const pending = await listPendingPurchaseOrders(db);

  let deleted = 0;
  for (const order of pending) {
    console.log(
      JSON.stringify({
        scope: "pending_order_purge",
        orderReference: order.orderReference,
        paymentProvider: order.paymentProvider,
        createdAt: order.createdAt,
        grandTotalCents: order.grandTotalCents,
        currency: order.currency,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
      }),
    );
    if (await deletePurchaseOrderByReference(db, order.orderReference)) {
      deleted += 1;
    }
  }

  return { found: pending.length, deleted };
}
