import { requiredEnv } from "@/lib/shared/config/server-env";
import type { HeliusIngressConfig } from "./adapters/ingress/parse-helius-ingress-payload";

export function getHeliusIngressConfig(): HeliusIngressConfig {
  return {
    authHeaderName:
      process.env.HELIUS_WEBHOOK_AUTH_HEADER_NAME?.trim().toLowerCase() || "x-helius-auth",
    authHeaderValue: process.env.HELIUS_WEBHOOK_AUTH_HEADER_VALUE?.trim(),
    expectedUsdcMint: requiredEnv("HELIUS_USDC_MINT"),
    expectedRecipient: requiredEnv("HELIUS_MERCHANT_RECIPIENT"),
  };
}

export function isHeliusWebhookDebugEnabled(): boolean {
  return process.env.HELIUS_WEBHOOK_DEBUG?.trim() === "1";
}

export function isHeliusWebhookEnabled(): boolean {
  return process.env.HELIUS_WEBHOOK_ENABLED?.trim() === "1";
}

export function getMerchantPrivateKey(): string {
  return requiredEnv("HELIUS_MERCHANT_PRIVATE_KEY");
}
