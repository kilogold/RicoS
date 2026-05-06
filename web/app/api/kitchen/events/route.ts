import { handleKitchenEventsStreamGet } from "@/lib/commerce/web-api/kitchen-order-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleKitchenEventsStreamGet(req);
}
