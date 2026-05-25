import { getHeliusApiKey } from "@/lib/infrastructure/helius/config";
import { solanaRpcUrl } from "@/lib/infrastructure/helius/solana-rpc";

type UnknownRecord = Record<string, unknown>;

function heliusEnhancedApiBase(): string {
  const rpc = solanaRpcUrl().toLowerCase();
  return rpc.includes("devnet")
    ? "https://api-devnet.helius-rpc.com"
    : "https://api-mainnet.helius-rpc.com";
}

export async function fetchHeliusEnhancedTransaction(
  signature: string,
): Promise<UnknownRecord | null> {
  const apiKey = getHeliusApiKey();
  const url = `${heliusEnhancedApiBase()}/v0/transactions?api-key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions: [signature] }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Helius enhanced transactions failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0];
  return typeof first === "object" && first !== null && !Array.isArray(first)
    ? (first as UnknownRecord)
    : null;
}
