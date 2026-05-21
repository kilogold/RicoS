import { purgePendingPurchaseOrders } from "@/lib/commerce/web-api/order-maintenance/use-cases/purge-pending-purchase-orders";
import { verifyCronAuth } from "@/lib/commerce/web-api/order-maintenance/lib/verify-cron-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await purgePendingPurchaseOrders();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("pending_order_purge_failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
