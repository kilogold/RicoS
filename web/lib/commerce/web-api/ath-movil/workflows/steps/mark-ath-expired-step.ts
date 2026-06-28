import { FatalError, RetryableError } from "workflow";

export async function markAthExpired(
  params: { orderReference: string; reason: string },
  db?: unknown,
): Promise<void> {
  // Keep DB modules out of top-level workflow imports; loading them eagerly
  // pulls libsql into workflow VM evaluation and causes runtime crashes.
  const { getWebhookDb } = await import("@/lib/infrastructure/turso/webhook-db-runtime");
  const { getPurchaseOrderByReference, setPurchaseOrderStatus } = await import(
    "@/lib/infrastructure/turso/webhook-db"
  );
  const client = db ?? (await getWebhookDb());
  const order = await getPurchaseOrderByReference(client as never, params.orderReference);
  if (!order || order.status !== "pending") return;
  await setPurchaseOrderStatus(client as never, params.orderReference, "expired");
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

  try {
    await markAthExpired({ orderReference, reason });
  } catch (err) {
    if (err instanceof FatalError || err instanceof RetryableError) {
      throw err;
    }
    throw new FatalError(err instanceof Error ? err.message : String(err));
  }
}
