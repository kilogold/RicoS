import { handleStripeWebhookPost } from "@/lib/commerce/web-api/stripe-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleStripeWebhookPost(req);
}
