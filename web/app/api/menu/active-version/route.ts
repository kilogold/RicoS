import { getLatestMenuRuntime } from "@/lib/commerce/web-api/staff-order-management/lib/menu-runtime";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const menu = await getLatestMenuRuntime();
    return NextResponse.json({ version: menu.version });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
