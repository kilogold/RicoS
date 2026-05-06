import { handleCreatePaymentIntent } from "@/lib/commerce/web-client/stripe-checkout";

export async function POST(req: Request) {
  return handleCreatePaymentIntent(req);
}
