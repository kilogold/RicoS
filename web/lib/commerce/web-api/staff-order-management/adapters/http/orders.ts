import { NextResponse } from "next/server";

export async function handleStaffOrdersPost(): Promise<Response> {
  return NextResponse.json({ error: "staff_order_management_not_implemented" }, { status: 501 });
}
