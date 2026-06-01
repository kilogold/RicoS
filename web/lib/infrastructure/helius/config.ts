import { requiredEnv } from "@/lib/shared/config/server-env";

export type HeliusSolanaCluster = "devnet" | "mainnet";

export function getHeliusApiKey(): string {
  return requiredEnv("HELIUS_API_KEY");
}

export function getHeliusSolanaCluster(): HeliusSolanaCluster {
  const raw = process.env.HELIUS_SOLANA_CLUSTER?.trim().toLowerCase();
  if (raw === "mainnet" || raw === "mainnet-beta") {
    return "mainnet";
  }
  return "devnet";
}

export function getHeliusRpcUrl(): string {
  const apiKey = getHeliusApiKey();
  const cluster = getHeliusSolanaCluster();
  const host =
    cluster === "devnet"
      ? "https://devnet.helius-rpc.com"
      : "https://mainnet.helius-rpc.com";
  return `${host}/?api-key=${encodeURIComponent(apiKey)}`;
}

export function getHeliusEnhancedApiBase(): string {
  return getHeliusSolanaCluster() === "devnet"
    ? "https://api-devnet.helius-rpc.com"
    : "https://api-mainnet.helius-rpc.com";
}
