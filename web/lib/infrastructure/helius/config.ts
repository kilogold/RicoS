import { requiredEnv } from "@/lib/shared/config/server-env";

export function getHeliusApiKey(): string {
  return requiredEnv("HELIUS_API_KEY");
}

export function getHeliusRpcUrl(): string {
  const cluster = requiredEnv("NEXT_PUBLIC_HELIUS_SOLANA_CLUSTER");
  const apiKey = encodeURIComponent(requiredEnv("HELIUS_API_KEY"));
  return `https://${cluster}.helius-rpc.com/?api-key=${apiKey}`;
}

export function getHeliusEnhancedApiBase(): string {
  const cluster = requiredEnv("NEXT_PUBLIC_HELIUS_SOLANA_CLUSTER");
  return `https://api-${cluster}.helius-rpc.com`;
}
