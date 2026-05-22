import { NextResponse } from "next/server";
import type { staffRefundOrder } from "@/lib/commerce/web-api/staff-order-management/use-cases/staff-refund-order";

type StaffRefundResult = Awaited<ReturnType<typeof staffRefundOrder>>;

export function jsonResponseForStaffRefundResult(result: StaffRefundResult): Response {
  if (!result.ok) {
    const statusByCode: Record<NonNullable<(typeof result)["code"]>, number> = {
      order_not_found: 404,
      already_refunded: 409,
      cannot_refund_order_status: 409,
      refund_exceeds_order_total: 409,
      missing_solana_signature: 400,
      server_misconfigured: 500,
      stripe_refund_failed: 502,
    };
    const status = statusByCode[result.code];
    const payload: Record<string, string> = { error: result.code };
    if (result.detail) payload.detail = result.detail;
    return NextResponse.json(payload, { status });
  }

  return NextResponse.json({
    orderReference: result.orderReference,
    refundedTotalCents: result.refundedTotalCents,
    status: result.status,
  });
}
