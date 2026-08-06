import {
  readAdminCookieFromRequest,
  verifyAdminSession,
} from "@/lib/admin-passkey/admin-cookie";
import { NextResponse } from "next/server";
import compare from "tsscmp";

export function verifyStaffPublishAuth(authorizationHeader: string | null): boolean {
  const secret = process.env.STAFF_OPERATIONS_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = authorizationHeader ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return false;
  }
  const token = header.slice(prefix.length);
  return compare(token, secret);
}

export async function verifyStaffPublishAuthFromRequest(req: Request): Promise<boolean> {
  if (verifyStaffPublishAuth(req.headers.get("authorization"))) {
    return true;
  }
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
