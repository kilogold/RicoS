import { handleStripeWebhookRequest } from "@/lib/commerce/web-api/stripe-payment/adapters/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleStripeWebhookRequest(req);
}
