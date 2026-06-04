import { requiredEnv } from "@/lib/shared/config/server-env";

function heliusCluster(): "devnet" | "mainnet" {
  const cluster = requiredEnv("HELIUS_SOLANA_CLUSTER");
  if (cluster !== "devnet" && cluster !== "mainnet") {
    throw new Error(
      `Invalid HELIUS_SOLANA_CLUSTER: "${cluster}". Expected "devnet" or "mainnet".`,
    );
  }
  return cluster;
}

export function getHeliusApiKey(): string {
  return requiredEnv("HELIUS_API_KEY");
}

export function getHeliusRpcUrl(): string {
  const cluster = heliusCluster();
  const apiKey = encodeURIComponent(requiredEnv("HELIUS_API_KEY"));
  return `https://${cluster}.helius-rpc.com/?api-key=${apiKey}`;
}

export function getHeliusEnhancedApiBase(): string {
  return `https://api-${heliusCluster()}.helius-rpc.com`;
}
