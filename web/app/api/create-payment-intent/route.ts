import {
  CURRENT_MENU_VERSION,
  encodeCartToMetadataV1,
  getDecodeIndex,
  getItemById,
  normalizeSelections,
  validateSelectionsForItem,
  type CartLineInput,
} from "@ricos/shared";
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

  const rawLines = (
    body as {
      lines?: { id: string; quantity: number; selections?: Record<string, string[]> }[];
    }
  )?.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return NextResponse.json(
      { error: "Cart must include at least one line" },
      { status: 400 },
    );
  }

  const codecLines: CartLineInput[] = [];
  for (const line of rawLines) {
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
    if (!getItemById(line.id)) {
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
    codecLines.push({
      itemId: line.id,
      quantity: line.quantity,
      selections: normalizeSelections(validation.normalized),
    });
  }

  const decodeIndex = getDecodeIndex(CURRENT_MENU_VERSION);
  if (!decodeIndex) {
    return NextResponse.json(
      { error: `Menu version ${CURRENT_MENU_VERSION} not registered` },
      { status: 500 },
    );
  }

  let encoded;
  try {
    encoded = encodeCartToMetadataV1(CURRENT_MENU_VERSION, codecLines, decodeIndex);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (encoded.amountCents < 50) {
    return NextResponse.json({ error: "Amount too small" }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecret);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: encoded.amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: encoded.metadata,
  });

  if (!paymentIntent.client_secret) {
    return NextResponse.json(
      { error: "Could not create payment" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    amountCents: encoded.amountCents,
  });
}
