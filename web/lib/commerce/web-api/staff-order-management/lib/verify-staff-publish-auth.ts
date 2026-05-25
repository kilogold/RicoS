import {
  readAdminCookieFromRequest,
  verifyAdminCookie,
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

export function verifyStaffPublishAuthFromRequest(req: Request): boolean {
  if (verifyStaffPublishAuth(req.headers.get("authorization"))) {
    return true;
  }
  const cookieValue = readAdminCookieFromRequest(req);
  return verifyAdminCookie(cookieValue).ok;
}

export function requireStaffPublishAuth(req: Request): Response | null {
  if (verifyStaffPublishAuthFromRequest(req)) {
    return null;
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
