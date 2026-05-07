import { handleCreatePaymentIntentRequest } from "@/lib/commerce/web-api/stripe-payment/adapters/http";

export async function POST(req: Request) {
  return handleCreatePaymentIntentRequest(req);
}
