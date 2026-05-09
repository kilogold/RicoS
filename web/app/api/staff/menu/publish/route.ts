import { publishMenuFromRepoFile } from "@/lib/commerce/web-api/staff-order-management/use-cases/publish-menu-from-repo-file";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function verifyStaffPublishAuth(req: Request): boolean {
  const secret = process.env.STAFF_MENU_PUBLISH_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = req.headers.get("authorization") ?? "";
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

export async function POST(req: Request) {
  if (!verifyStaffPublishAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const out = await publishMenuFromRepoFile();
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
