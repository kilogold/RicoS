import { handlePrintAckRequest } from "@/lib/commerce/web-api/kitchen-order-dispatch/adapters/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handlePrintAckRequest(req);
}
