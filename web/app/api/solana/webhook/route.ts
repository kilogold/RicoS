import { handleHeliusWebhookPost } from "@/lib/commerce/web-api/solana-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleHeliusWebhookPost(req);
}
