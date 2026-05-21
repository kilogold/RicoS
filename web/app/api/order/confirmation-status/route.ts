import { verifyStripeOrderConfirmation } from "@/lib/commerce/web-api/order-maintenance/use-cases/verify-stripe-order-confirmation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentIntentId = url.searchParams.get("payment_intent");
  const redirectStatus = url.searchParams.get("redirect_status");

  const result = await verifyStripeOrderConfirmation({
    paymentIntentId,
    redirectStatus,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      orderStatus: result.orderStatus,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      code: result.code,
      detail: result.detail,
    },
    { status: result.code === "invalid_payment_intent" ? 400 : 409 },
  );
}
