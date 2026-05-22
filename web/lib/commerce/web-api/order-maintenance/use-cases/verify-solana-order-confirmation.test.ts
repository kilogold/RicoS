import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  insertPendingPurchaseOrderIfNew,
  markSolanaPurchaseOrderPaidIfNew,
  migrate,
} from "@/lib/infrastructure/turso/webhook-db";

const originalDbUrl = process.env.TURSO_DATABASE_URL;
const originalDbToken = process.env.TURSO_DATABASE_AUTH_TOKEN;

function payload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_test",
    paymentReferenceId: "So11111111111111111111111111111111111111112",
    serviceMode: "takeout",
    customerName: "Test",
    subtotalCents: 1000,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    grandTotalCents: 1000,
    currency: "usdc",
    intent: "manual-print",
    lines: [],
    ...overrides,
  };
}

describe("verifySolanaOrderConfirmation", () => {
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
    const { verifySolanaOrderConfirmation } = await import("./verify-solana-order-confirmation");
    const result = await verifySolanaOrderConfirmation({
      orderReference: "not-a-valid-address",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_reference");
    }
  });

  test("returns missing_order when row deleted after payment", async () => {
    const orderReference = "So11111111111111111111111111111111111111112";
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference,
      paymentProvider: "helius",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usdc",
      payload: payload({ paymentReferenceId: orderReference }),
      customerName: "Ada",
      customerPhone: "555-0100",
      customerEmail: null,
    });

    const { verifySolanaOrderConfirmation } = await import("./verify-solana-order-confirmation");
    const { deletePurchaseOrderByReference } = await import("@/lib/infrastructure/turso/webhook-db");

    await deletePurchaseOrderByReference(db, orderReference);

    const result = await verifySolanaOrderConfirmation({ orderReference });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_order");
    }
  });

  test("returns confirmed when order is paid", async () => {
    const orderReference = "So11111111111111111111111111111111111111111";
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference,
      paymentProvider: "helius",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usdc",
      payload: payload({ paymentReferenceId: orderReference }),
      customerName: "Ada",
      customerPhone: "555-0100",
      customerEmail: null,
    });
    await markSolanaPurchaseOrderPaidIfNew(db, {
      orderReference,
      payload: payload({
        paymentIngressEventId: "evt_paid",
        paymentReferenceId: orderReference,
      }),
    });

    const { verifySolanaOrderConfirmation } = await import("./verify-solana-order-confirmation");
    const result = await verifySolanaOrderConfirmation({
      orderReference,
      transactionSignature: "5".repeat(88),
    });

    expect(result).toEqual({ ok: true, orderStatus: "paid" });
  });
});
