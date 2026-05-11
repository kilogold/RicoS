import { NextResponse } from "next/server";
import { assertStoreOpenOr403 } from "@/lib/commerce/store-hours";
import { executeStripeIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { getStripeServerClient } from "@/lib/infrastructure/stripe/server-client";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { getStripeWebhookSecret } from "../../config";
import { parseStripeIngressEvent } from "../ingress/parse-stripe-ingress-event";
import { createPaymentIntentFromCart } from "../../use-cases/create-payment-intent";

export async function handleStripeWebhookRequest(req: Request): Promise<Response> {
  let db;
  let stripe;
  let webhookSecret;
  try {
    db = await getWebhookDb();
    stripe = getStripeServerClient();
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

  const outcome = await executeStripeIngressEvent(db, parsed.event);
  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  return NextResponse.json({ received: true });
}

export async function handleCreatePaymentIntentRequest(req: Request): Promise<Response> {
  let stripe;
  try {
    stripe = getStripeServerClient();
  } catch {
    return NextResponse.json({ error: "Server missing STRIPE_SECRET_KEY" }, { status: 500 });
  }

  const closed = assertStoreOpenOr403();
  if (closed) return closed;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let db;
  try {
    db = await getWebhookDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("create-payment-intent DB misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const parsedBody = body as {
    lines?: { id: string; quantity: number; selections?: Record<string, string[]> }[];
    menuVersionSeen?: unknown;
    customerName?: unknown;
    customerPhone?: unknown;
    customerEmail?: unknown;
  };
  const rawLines = parsedBody?.lines;
  const menuVersionSeen = parsedBody?.menuVersionSeen;

  const result = await createPaymentIntentFromCart(
    rawLines,
    menuVersionSeen as number | undefined,
    {
      customerName: parsedBody?.customerName,
      customerPhone: parsedBody?.customerPhone,
      customerEmail: parsedBody?.customerEmail,
    },
    stripe,
    db,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.code ? { code: result.code } : {}) },
      { status: result.status },
    );
  }

  return NextResponse.json({
    clientSecret: result.clientSecret,
    amountCents: result.amountCents,
  });
}
