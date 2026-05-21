import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  insertPendingPurchaseOrderIfNew,
  markStripePurchaseOrderPaidIfNew,
  migrate,
} from "@/lib/infrastructure/turso/webhook-db";

const originalDbUrl = process.env.TURSO_DATABASE_URL;
const originalDbToken = process.env.TURSO_DATABASE_AUTH_TOKEN;

function payload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_test",
    paymentReferenceId: "pi_verify_1",
    serviceMode: "takeout",
    customerName: "Test",
    subtotalCents: 1000,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    grandTotalCents: 1000,
    currency: "usd",
    intent: "manual-print",
    lines: [],
    ...overrides,
  };
}

describe("verifyStripeOrderConfirmation", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
    process.env.TURSO_DATABASE_URL = ":memory:";
    process.env.TURSO_DATABASE_AUTH_TOKEN = "test";

    const runtime = globalThis as typeof globalThis & {
      __ricosWebhookDbRuntime?: { dbPromise: Promise<Client> | null };
    };
    if (!runtime.__ricosWebhookDbRuntime) {
      runtime.__ricosWebhookDbRuntime = { dbPromise: null };
    }
    runtime.__ricosWebhookDbRuntime.dbPromise = Promise.resolve(db);
  });

  afterEach(() => {
    process.env.TURSO_DATABASE_URL = originalDbUrl;
    process.env.TURSO_DATABASE_AUTH_TOKEN = originalDbToken;
    const runtime = globalThis as typeof globalThis & {
      __ricosWebhookDbRuntime?: { dbPromise: Promise<Client> | null };
    };
    if (runtime.__ricosWebhookDbRuntime) {
      runtime.__ricosWebhookDbRuntime.dbPromise = null;
    }
  });

  test("returns missing_order when row deleted after stripe success", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "pi_deleted",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usd",
      payload: payload({ paymentReferenceId: "pi_deleted" }),
      customerName: "Ada",
      customerPhone: "555-0100",
      customerEmail: null,
    });

    const { verifyStripeOrderConfirmation } = await import("./verify-stripe-order-confirmation");
    const { deletePurchaseOrderByReference } = await import("@/lib/infrastructure/turso/webhook-db");

    await deletePurchaseOrderByReference(db, "pi_deleted");

    const result = await verifyStripeOrderConfirmation({
      paymentIntentId: "pi_deleted",
      redirectStatus: "succeeded",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_order");
    }
  });

  test("returns confirmed when order is paid", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "pi_paid",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usd",
      payload: payload({ paymentReferenceId: "pi_paid" }),
      customerName: "Ada",
      customerPhone: "555-0100",
      customerEmail: null,
    });
    await markStripePurchaseOrderPaidIfNew(db, {
      orderReference: "pi_paid",
      payload: payload({
        paymentIngressEventId: "evt_paid",
        paymentReferenceId: "pi_paid",
      }),
    });

    const { verifyStripeOrderConfirmation } = await import("./verify-stripe-order-confirmation");
    const result = await verifyStripeOrderConfirmation({
      paymentIntentId: "pi_paid",
      redirectStatus: "succeeded",
    });

    expect(result).toEqual({ ok: true, orderStatus: "paid" });
  });
});
