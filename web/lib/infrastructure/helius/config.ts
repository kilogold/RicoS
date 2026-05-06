import { optionalEnv, requiredEnv } from "@/lib/infrastructure/shared/env";

export type HeliusIngressConfig = {
  authHeaderName: string;
  authHeaderValue?: string;
  expectedUsdcMint: string;
  expectedRecipient: string;
};

export function getHeliusIngressConfig(): HeliusIngressConfig {
  return {
    authHeaderName: optionalEnv("HELIUS_WEBHOOK_AUTH_HEADER_NAME")?.toLowerCase() || "x-helius-auth",
    authHeaderValue: optionalEnv("HELIUS_WEBHOOK_AUTH_HEADER_VALUE"),
    expectedUsdcMint: requiredEnv("HELIUS_USDC_MINT"),
    expectedRecipient: requiredEnv("HELIUS_MERCHANT_RECIPIENT"),
  };
}

export function heliusWebhookEnabled(): boolean {
  return optionalEnv("HELIUS_WEBHOOK_ENABLED") === "1";
}

export function heliusWebhookDebug(): boolean {
  return optionalEnv("HELIUS_WEBHOOK_DEBUG") === "1";
}
