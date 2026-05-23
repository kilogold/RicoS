import { handleStaffPrintReceiptRequest } from "@/lib/commerce/web-api/staff-order-management/adapters/http";
import { requireStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const unauthorized = requireStaffPublishAuth(req);
  if (unauthorized) return unauthorized;

  let body: { orderReference?: unknown };
  try {
    body = (await req.json()) as { orderReference?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const orderReference = body.orderReference;
  if (typeof orderReference !== "string" || !orderReference.trim()) {
    return NextResponse.json({ error: "invalid_orderReference" }, { status: 400 });
  }

  return handleStaffPrintReceiptRequest(orderReference);
}
