import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  insertPendingPurchaseOrderIfNew,
  markAthMovilPurchaseOrderPaidIfNew,
  migrate,
} from "@/lib/infrastructure/turso/webhook-db";

const originalDbUrl = process.env.TURSO_DATABASE_URL;
const originalDbToken = process.env.TURSO_DATABASE_AUTH_TOKEN;

function payload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_test",
    paymentReferenceId: "aabbccddeeff00112233445566778899",
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

describe("verifyAthOrderConfirmation", () => {
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

  test("returns invalid_reference for malformed reference", async () => {
    const { verifyAthOrderConfirmation } = await import("./verify-ath-order-confirmation");
    const result = await verifyAthOrderConfirmation({ orderReference: "bad-ref" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_reference");
    }
  });

  test("returns missing_order when row does not exist", async () => {
    const { verifyAthOrderConfirmation } = await import("./verify-ath-order-confirmation");
    const result = await verifyAthOrderConfirmation({
      orderReference: "aabbccddeeff00112233445566778899",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_order");
    }
  });

  test("returns confirmed when order is paid", async () => {
    const orderReference = "aabbccddeeff00112233445566778899";
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference,
      paymentProvider: "athmovil",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usd",
      payload: payload({ paymentReferenceId: orderReference }),
      customerName: "Ada",
      customerPhone: "555-0100",
      customerEmail: null,
    });
    await markAthMovilPurchaseOrderPaidIfNew(db, {
      orderReference,
      payload: payload({
        paymentIngressEventId: "evt_ath_1024264030-8a36",
        paymentReferenceId: orderReference,
      }),
    });

    const { verifyAthOrderConfirmation } = await import("./verify-ath-order-confirmation");
    const result = await verifyAthOrderConfirmation({ orderReference });
    expect(result).toEqual({ ok: true, orderStatus: "paid" });
  });
});
