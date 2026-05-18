import type { Client } from "@libsql/client";
import {
  computeOrderTotalsFromHydratedCart,
  decodeCartFromMetadataV1,
  encodeCartToMetadataV1,
  type CartLineInput,
} from "@ricos/shared";
import Stripe from "stripe";
import { validateCustomerContact, type CustomerContactInput } from "@/lib/commerce/customer-contact";
import { getLatestMenuRuntime } from "@/lib/commerce/menu-runtime";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/menu-version-policy";
import {
  ORDER_SERVICE_MODE_DINE_IN,
  validateOrderServiceMode,
} from "@/lib/commerce/order-service-mode";
import {
  DINE_IN_UNAVAILABLE_CODE,
  dineInOrderingEnabled,
  getStoreSession,
} from "@/lib/commerce/store-hours";
import { buildKitchenOrderPayload } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/process-ingress-event";
import { insertPendingPurchaseOrderIfNew } from "@/lib/infrastructure/turso/webhook-db";

type RawLine = { id: string; quantity: number; selections?: Record<string, string[]> };

export type CreatePaymentIntentResult =
  | { ok: false; status: number; error: string; code?: string }
  | { ok: true; clientSecret: string; grandTotalCents: number };

export async function createPaymentIntentFromCart(
  rawLines: unknown,
  menuVersionSeen: number | undefined,
  rawContact: CustomerContactInput,
  rawServiceMode: unknown,
  stripe: Stripe,
  db: Client,
): Promise<CreatePaymentIntentResult> {
  const contactCheck = validateCustomerContact(rawContact);
  if (!contactCheck.ok) {
    return { ok: false, status: 400, error: contactCheck.error };
  }
  const contact = contactCheck.value;
  const serviceModeCheck = validateOrderServiceMode(rawServiceMode);
  if (!serviceModeCheck.ok) {
    return { ok: false, status: 400, error: serviceModeCheck.error };
  }
  const serviceMode = serviceModeCheck.value;
  if (
    serviceMode === ORDER_SERVICE_MODE_DINE_IN &&
    !dineInOrderingEnabled(getStoreSession(new Date()))
  ) {
    return {
      ok: false,
      status: 403,
      code: DINE_IN_UNAVAILABLE_CODE,
      error: "Dine-in is unavailable during last call.",
    };
  }
  if (typeof menuVersionSeen !== "number" || !Number.isInteger(menuVersionSeen)) {
    return { ok: false, status: 400, error: "menuVersionSeen is required" };
  }

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { ok: false, status: 400, error: "Cart must include at least one line" };
  }

  const runtime = await getLatestMenuRuntime();
  if (menuVersionSeen !== runtime.version) {
    return {
      ok: false,
      status: 409,
      code: MENU_VERSION_CONFLICT_CODE,
      error: "Menu was updated. Refresh the menu and rebuild your cart.",
    };
  }

  const { surface, decodeIndex, version: activeVersion } = runtime;

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
    if (!surface.getItemById(line.id)) {
      return { ok: false, status: 400, error: `Unknown menu item: ${line.id}` };
    }
    const validation = surface.validateSelectionsForItem(
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
      selections: surface.normalizeSelections(validation.normalized),
    });
  }

  let encoded;
  try {
    encoded = encodeCartToMetadataV1(activeVersion, codecLines, decodeIndex);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 400, error: message };
  }

  const hydratedCart = decodeCartFromMetadataV1(encoded.metadata, (v) =>
    v === activeVersion ? decodeIndex : undefined,
  );
  const orderTotals = computeOrderTotalsFromHydratedCart(hydratedCart.lines, decodeIndex);

  if (orderTotals.grandTotalCents < 50) {
    return { ok: false, status: 400, error: "Amount too small" };
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: orderTotals.grandTotalCents,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: encoded.metadata,
  });

  if (!paymentIntent.client_secret) {
    return { ok: false, status: 500, error: "Could not create payment" };
  }

  const pendingPayload = await buildKitchenOrderPayload(
    db,
    {
      provider: "stripe",
      paymentIngressEventId: "",
      paymentReferenceId: paymentIntent.id,
      grandTotalCents: orderTotals.grandTotalCents,
      currency: "usd",
      metadata: encoded.metadata,
    },
    serviceMode,
    contact.customerName,
  );

  await insertPendingPurchaseOrderIfNew(db, {
    orderReference: paymentIntent.id,
    paymentProvider: "stripe",
    paymentIntentExpiresAt: null,
    grandTotalCents: orderTotals.grandTotalCents,
    currency: "usd",
    payload: pendingPayload,
    metadata: encoded.metadata,
    customerName: contact.customerName,
    customerPhone: contact.customerPhone,
    customerEmail: contact.customerEmail,
  });

  return {
    ok: true,
    clientSecret: paymentIntent.client_secret,
    grandTotalCents: orderTotals.grandTotalCents,
  };
}
