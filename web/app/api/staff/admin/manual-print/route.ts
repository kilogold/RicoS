import { handleStaffManualPrintRequest } from "@/lib/commerce/web-api/staff-order-management/adapters/http";
import { verifyStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  if (!verifyStaffPublishAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  return handleStaffManualPrintRequest(orderReference);
}
