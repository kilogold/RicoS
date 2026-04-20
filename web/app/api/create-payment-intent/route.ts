import { getItemById, normalizeSelections, validateSelectionsForItem } from "@ricos/shared";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecret = process.env.STRIPE_SECRET_KEY;

export async function POST(req: Request) {
  if (!stripeSecret) {
    return NextResponse.json(
      { error: "Server missing STRIPE_SECRET_KEY" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const lines = (
    body as {
      lines?: { id: string; quantity: number; selections?: Record<string, string[]> }[];
    }
  )?.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json(
      { error: "Cart must include at least one line" },
      { status: 400 },
    );
  }

  const normalizedLines: { id: string; quantity: number; selections: Record<string, string[]> }[] = [];
  let amountCents = 0;
  for (const line of lines) {
    if (
      typeof line.id !== "string" ||
      !line.id ||
      typeof line.quantity !== "number" ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 99
    ) {
      return NextResponse.json({ error: "Invalid line item" }, { status: 400 });
    }
    const item = getItemById(line.id);
    if (!item) {
      return NextResponse.json(
        { error: `Unknown menu item: ${line.id}` },
        { status: 400 },
      );
    }
    const validation = validateSelectionsForItem(
      line.id,
      (line.selections ?? {}) as Record<string, string[]>,
    );
    if (!validation.ok) {
      return NextResponse.json(
        { error: `Invalid selections for ${line.id}: ${validation.error}` },
        { status: 400 },
      );
    }
    normalizedLines.push({
      id: line.id,
      quantity: line.quantity,
      selections: normalizeSelections(validation.normalized),
    });
    amountCents += item.priceCents * line.quantity;
  }

  if (amountCents < 50) {
    return NextResponse.json({ error: "Amount too small" }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecret);
  const metadata: Record<string, string> = {
    line_count: String(normalizedLines.length),
  };
  normalizedLines.forEach((line, index) => {
    metadata[`line_${index}`] = JSON.stringify({
      i: line.id,
      q: line.quantity,
      s: line.selections,
    });
  });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata,
  });

  if (!paymentIntent.client_secret) {
    return NextResponse.json(
      { error: "Could not create payment" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    amountCents,
  });
}
