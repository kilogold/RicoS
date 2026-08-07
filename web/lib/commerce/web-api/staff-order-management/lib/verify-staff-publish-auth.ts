import {
  readAdminCookieFromRequest,
  verifyAdminSession,
} from "@/lib/admin-passkey/admin-cookie";
import { NextResponse } from "next/server";

export async function verifyStaffPublishAuthFromRequest(req: Request): Promise<boolean> {
  const cookieValue = readAdminCookieFromRequest(req);
  const session = await verifyAdminSession(cookieValue);
  return session.ok;
}

export async function requireStaffPublishAuth(req: Request): Promise<Response | null> {
  if (await verifyStaffPublishAuthFromRequest(req)) {
    return null;
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
