import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { markAthExpired } from "@/lib/commerce/web-api/ath-movil/use-cases/mark-ath-expired";

export async function markAthExpiredStep(orderReference: string, reason: string): Promise<void> {
  "use step";

  const db = await getWebhookDb();
  await markAthExpired({ orderReference, reason }, db);
}
