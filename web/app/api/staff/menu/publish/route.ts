import { handleStaffMenuPublishRequest } from "@/lib/commerce/web-api/staff-order-management/adapters/http";
import { NextResponse } from "next/server";
import { verifyStaffPublishAuth } from "@/lib/commerce/web-api/staff-order-management/lib/verify-staff-publish-auth";

export async function POST(req: Request) {
  if (!verifyStaffPublishAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return handleStaffMenuPublishRequest();
}
