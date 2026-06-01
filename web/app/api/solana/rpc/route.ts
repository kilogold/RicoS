import { handleSolanaRpcProxyRequest } from "@/lib/commerce/web-api/solana-payment/adapters/http";

export async function POST(req: Request) {
  return handleSolanaRpcProxyRequest(req);
}
