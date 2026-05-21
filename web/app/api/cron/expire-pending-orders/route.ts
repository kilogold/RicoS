import { purgePendingPurchaseOrders } from "@/lib/commerce/web-api/order-maintenance/use-cases/purge-pending-purchase-orders";
import { verifyCronAuth } from "@/lib/commerce/web-api/order-maintenance/lib/verify-cron-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron only invokes scheduled jobs with GET (no POST option in vercel.json crons).
// This route mutates data (hard-deletes pending orders); GET is a platform constraint, not an
// HTTP design choice. Access is gated by CRON_SECRET Bearer auth, not by verb.

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
