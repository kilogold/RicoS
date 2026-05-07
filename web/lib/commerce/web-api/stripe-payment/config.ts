import { requiredEnv } from "@/lib/shared/config/server-env";

export function getStripeWebhookSecret(): string {
  return requiredEnv("STRIPE_WEBHOOK_SECRET");
}
