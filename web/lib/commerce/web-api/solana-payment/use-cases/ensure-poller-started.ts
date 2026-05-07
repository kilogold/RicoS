import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { ensureSolanaPaymentPollerStarted } from "./poller";

export function ensureSolanaPaymentBackendPollerStarted(): void {
  ensureSolanaPaymentPollerStarted(getWebhookDb);
}
