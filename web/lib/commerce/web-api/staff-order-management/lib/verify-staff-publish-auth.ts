import { timingSafeEqual } from "node:crypto";

export function verifyStaffPublishAuth(authorizationHeader: string | null): boolean {
  const secret = process.env.STAFF_MENU_PUBLISH_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = authorizationHeader ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return false;
  }
  const token = header.slice(prefix.length);
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
