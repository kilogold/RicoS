import {
  CURRENT_MENU_VERSION,
  encodeCartToMetadataV1,
  getDecodeIndex,
  getItemById,
  normalizeSelections,
  validateSelectionsForItem,
  type CartLineInput,
} from "@ricos/shared";
import Stripe from "stripe";

type RawLine = { id: string; quantity: number; selections?: Record<string, string[]> };

export type CreatePaymentIntentResult =
  | { ok: false; status: number; error: string }
  | { ok: true; clientSecret: string; amountCents: number };

export async function createPaymentIntentFromCart(
  rawLines: unknown,
  stripe: Stripe,
): Promise<CreatePaymentIntentResult> {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { ok: false, status: 400, error: "Cart must include at least one line" };
  }

  const codecLines: CartLineInput[] = [];
  for (const line of rawLines as RawLine[]) {
    if (
      typeof line.id !== "string" ||
      !line.id ||
      typeof line.quantity !== "number" ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 99
    ) {
      return { ok: false, status: 400, error: "Invalid line item" };
    }
    if (!getItemById(line.id)) {
      return { ok: false, status: 400, error: `Unknown menu item: ${line.id}` };
    }
    const validation = validateSelectionsForItem(
      line.id,
      (line.selections ?? {}) as Record<string, string[]>,
    );
    if (!validation.ok) {
      return {
        ok: false,
        status: 400,
        error: `Invalid selections for ${line.id}: ${validation.error}`,
      };
    }
    codecLines.push({
      itemId: line.id,
      quantity: line.quantity,
      selections: normalizeSelections(validation.normalized),
    });
  }

  const decodeIndex = getDecodeIndex(CURRENT_MENU_VERSION);
  if (!decodeIndex) {
    return {
      ok: false,
      status: 500,
      error: `Menu version ${CURRENT_MENU_VERSION} not registered`,
    };
  }

  let encoded;
  try {
    encoded = encodeCartToMetadataV1(CURRENT_MENU_VERSION, codecLines, decodeIndex);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 400, error: message };
  }

  if (encoded.amountCents < 50) {
    return { ok: false, status: 400, error: "Amount too small" };
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: encoded.amountCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: encoded.metadata,
  });

  if (!paymentIntent.client_secret) {
    return { ok: false, status: 500, error: "Could not create payment" };
  }

  return {
    ok: true,
    clientSecret: paymentIntent.client_secret,
    amountCents: encoded.amountCents,
  };
}
