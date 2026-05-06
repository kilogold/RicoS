import { handlePrintAckPost } from "@/lib/commerce/web-api/kitchen-order-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handlePrintAckPost(req);
}
