import { handleSolanaRpcProxyRequest } from "@/lib/infrastructure/helius/solana-rpc-proxy";

export async function POST(req: Request) {
  return handleSolanaRpcProxyRequest(req);
}
