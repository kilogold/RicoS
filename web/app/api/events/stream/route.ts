import { handleKitchenOrderEventStream } from "@/lib/commerce/web-api/kitchen-order-dispatch/adapters/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleKitchenOrderEventStream(req);
}
