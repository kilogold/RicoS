import { NextResponse } from "next/server";
import { getStripeClient, getStripeWebhookSecret, getWebhookDb } from "@/lib/webhook-backend/runtime";
import { parseStripeIngressEvent } from "@/lib/webhook-backend/ingress/stripe-adapter";
import { executeIngressEvent } from "@/lib/webhook-backend/ingress/execute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let db;
  let stripe;
  let webhookSecret;
  try {
    db = await getWebhookDb();
    stripe = getStripeClient();
    webhookSecret = getStripeWebhookSecret();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Stripe webhook misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const parsed = await parseStripeIngressEvent({
    rawBody,
    signature: req.headers.get("stripe-signature") ?? undefined,
    stripe,
    webhookSecret,
  });

  if (parsed.kind === "error") {
    console.error("Stripe ingress rejected:", parsed.message);
    return new NextResponse(parsed.message, { status: parsed.status });
  }

  if (parsed.kind === "ignore") {
    return NextResponse.json({ received: true, ignored: true });
  }

  const outcome = await executeIngressEvent(db, parsed.event);
  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  return NextResponse.json({ received: true });
}
