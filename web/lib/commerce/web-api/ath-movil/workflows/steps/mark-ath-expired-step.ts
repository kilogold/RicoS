import type { Client } from "@libsql/client";
import { getPurchaseOrderByReference, setPurchaseOrderStatus } from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

export async function markAthExpired(
  params: { orderReference: string; reason: string },
  db?: Client,
): Promise<void> {
  const client = db ?? (await getWebhookDb());
  const order = await getPurchaseOrderByReference(client, params.orderReference);
  if (!order || order.status !== "pending") return;
  await setPurchaseOrderStatus(client, params.orderReference, "expired");
  console.info(
    JSON.stringify({
      scope: "athm_settled_expired",
      orderReference: params.orderReference,
      reason: params.reason,
    }),
  );
}

export async function markAthExpiredStep(orderReference: string, reason: string): Promise<void> {
  "use step";

  const db = await getWebhookDb();
  await markAthExpired({ orderReference, reason }, db);
}
