import { handleHeliusWebhookRequest } from "@/lib/commerce/web-api/solana-payment/adapters/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleHeliusWebhookRequest(req);
}
