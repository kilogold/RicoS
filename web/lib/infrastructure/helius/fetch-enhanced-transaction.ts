import {
  getHeliusApiKey,
  getHeliusEnhancedApiBase,
} from "@/lib/infrastructure/helius/config";

type UnknownRecord = Record<string, unknown>;

export async function fetchHeliusEnhancedTransaction(
  signature: string,
): Promise<UnknownRecord | null> {
  const apiKey = getHeliusApiKey();
  const url = `${getHeliusEnhancedApiBase()}/v0/transactions?api-key=${encodeURIComponent(apiKey)}`;
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
