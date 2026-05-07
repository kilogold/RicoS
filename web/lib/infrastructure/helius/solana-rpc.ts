import { createSolanaRpc } from "@solana/kit";

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
let cachedRpcUrl: string | null = null;
let cachedRpcClient: ReturnType<typeof createSolanaRpc> | null = null;

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function solanaRpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || DEFAULT_RPC_URL;
}

export function getSolanaRpcClient() {
  const url = solanaRpcUrl();
  if (!cachedRpcClient || cachedRpcUrl !== url) {
    cachedRpcClient = createSolanaRpc(url);
    cachedRpcUrl = url;
  }
  return cachedRpcClient;
}

export async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(solanaRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `ricos-${Date.now()}-${method}`,
      method,
      params,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} failed: ${res.status}`);
  }
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) {
    throw new Error(`RPC ${method} error: ${json.error.message ?? "unknown_error"}`);
  }
  return json.result as T;
}
