import { NextResponse } from "next/server";
import { deletePending } from "@/lib/webhook-backend/db";
import { getPrintAckSecret, getWebhookDb } from "@/lib/webhook-backend/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let db;
  try {
    db = await getWebhookDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Print ack misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const printAckSecret = getPrintAckSecret();
  if (printAckSecret) {
    const key = req.headers.get("x-print-ack-key");
    if (key !== printAckSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { stripeEventId?: unknown };
  try {
    body = (await req.json()) as { stripeEventId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stripeEventId = body.stripeEventId;
  if (typeof stripeEventId !== "string" || !stripeEventId.startsWith("evt_")) {
    return NextResponse.json({ error: "Invalid stripeEventId" }, { status: 400 });
  }

  await deletePending(db, stripeEventId);
  return new NextResponse(null, { status: 204 });
}
