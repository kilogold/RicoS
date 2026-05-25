import { parseOrderConfirmationProvider } from "@/lib/commerce/web-api/staff-order-management/lib/order-confirmation-provider";
import { verifySolanaOrderConfirmation } from "@/lib/commerce/web-api/staff-order-management/maintenance/use-cases/verify-solana-order-confirmation";
import { verifyStripeOrderConfirmation } from "@/lib/commerce/web-api/staff-order-management/maintenance/use-cases/verify-stripe-order-confirmation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = parseOrderConfirmationProvider(url.searchParams.get("provider"));

  if (!provider) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_provider",
        detail: "missing_or_unsupported_provider",
        provider: null,
      },
      { status: 400 },
    );
  }

  if (provider === "stripe") {
    const paymentIntentId = url.searchParams.get("payment_intent");
    const redirectStatus = url.searchParams.get("redirect_status");

    if (!paymentIntentId) {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_payment_intent",
          detail: "missing_payment_intent",
          provider: "stripe",
        },
        { status: 400 },
      );
    }

    const result = await verifyStripeOrderConfirmation({
      paymentIntentId,
      redirectStatus,
    });

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        orderStatus: result.orderStatus,
        provider: "stripe",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        detail: result.detail,
        provider: "stripe",
      },
      { status: result.code === "invalid_payment_intent" ? 400 : 409 },
    );
  }

  if (provider === "solana") {
    const solanaPayReference = url.searchParams.get("reference");
    const transactionSignature = url.searchParams.get("signature");

    if (!solanaPayReference) {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_reference",
          detail: "missing_reference",
          provider: "solana",
        },
        { status: 400 },
      );
    }

    const result = await verifySolanaOrderConfirmation({
      orderReference: solanaPayReference,
      transactionSignature,
    });

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        orderStatus: result.orderStatus,
        provider: "solana",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        detail: result.detail,
        provider: "solana",
      },
      { status: result.code === "invalid_reference" ? 400 : 409 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      code: "invalid_provider",
      detail: "unsupported_provider",
      provider: null,
    },
    { status: 400 },
  );
}
