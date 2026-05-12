import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  getPurchaseOrderByReference,
  insertPendingPurchaseOrderIfNew,
  listPaidPurchaseOrdersForKitchen,
  markPurchaseOrderAcknowledged,
  markPurchaseOrderExpired,
  markPurchaseOrderFulfilled,
  markSolanaPurchaseOrderPaidIfNew,
  markStripePurchaseOrderPaidIfNew,
  migrate,
  sumConfirmedRefundsForOrder,
  tryInsertRefundIfWithinOrderTotal,
  updateRefundConfirmation,
} from "./webhook-db";

function payload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_test_1",
    paymentReferenceId: "order_1",
    amountCents: 1000,
    currency: "usd",
    lines: [
      {
        id: "item_1",
        quantity: 1,
        selections: {},
        unitBasePriceCents: 1000,
        selectedModifiers: [],
        lineUnitTotalCents: 1000,
        lineExtendedTotalCents: 1000,
        itemLabel: "Test Item",
        selectionLines: [],
      },
    ],
    ...overrides,
  };
}

async function statusHistory(db: Client, orderReference: string): Promise<string[]> {
  const result = await db.execute({
    sql: `
      SELECT status
      FROM status_history
      WHERE order_reference = ?
      ORDER BY status_id ASC
    `,
    args: [orderReference],
  });
  return (result.rows ?? []).map((row) => String(row.status ?? row.STATUS));
}

async function statusIds(db: Client, orderReference: string): Promise<number[]> {
  const result = await db.execute({
    sql: `
      SELECT status_id
      FROM status_history
      WHERE order_reference = ?
      ORDER BY status_id ASC
    `,
    args: [orderReference],
  });
  return (result.rows ?? []).map((row) => Number(row.status_id ?? row.STATUS_ID));
}

describe("webhook-db payment persistence", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: "file::memory:" });
    await migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  test("creates only the expected application tables", async () => {
    const result = await db.execute(`
      SELECT name
      FROM sqlite_schema
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `);

    expect((result.rows ?? []).map((row) => String(row.name))).toEqual([
      "menu_versions",
      "purchase_orders",
      "refunds",
      "status_history",
    ]);
  });

  test("stores pending order contact data and can mark it expired", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "solana_ref_1",
      paymentProvider: "helius",
      paymentIntentExpiresAt: 123,
      amountCents: 1000,
      currency: "usd",
      payload: payload({
        paymentIngressEventId: "",
        paymentReferenceId: "solana_ref_1",
      }),
      metadata: { cart_codec: "rcs-cart-v1", cart_b64: "abc" },
      customerName: "Ada",
      customerPhone: "555-0100",
      customerEmail: null,
    });

    const pending = await getPurchaseOrderByReference(db, "solana_ref_1");
    expect(pending?.status).toBe("pending");
    expect(pending?.paymentIntentExpiresAt).toBe(123);
    expect(pending?.customerName).toBe("Ada");

    expect(await markPurchaseOrderExpired(db, "solana_ref_1")).toBe(true);
    expect((await getPurchaseOrderByReference(db, "solana_ref_1"))?.status).toBe("expired");
    expect(await statusHistory(db, "solana_ref_1")).toEqual(["pending", "expired"]);
    expect(await statusIds(db, "solana_ref_1")).toEqual([1, 2]);
  });

  test("moves paid orders through kitchen ack and fulfillment", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "solana_ref_2",
      paymentProvider: "helius",
      paymentIntentExpiresAt: null,
      amountCents: 1000,
      currency: "usd",
      payload: payload({
        paymentIngressEventId: "",
        paymentReferenceId: "solana_ref_2",
      }),
      customerName: "Grace",
      customerPhone: "555-0101",
      customerEmail: "grace@example.com",
    });

    const paidPayload = payload({
      paymentIngressEventId: "evt_helius_sig_1",
      paymentReferenceId: "solana_ref_2",
    });
    expect(
      await markSolanaPurchaseOrderPaidIfNew(db, {
        orderReference: "solana_ref_2",
        payload: paidPayload,
      }),
    ).toBe(true);
    expect(
      await markSolanaPurchaseOrderPaidIfNew(db, {
        orderReference: "solana_ref_2",
        payload: paidPayload,
      }),
    ).toBe(false);

    expect((await listPaidPurchaseOrdersForKitchen(db)).map((row) => row.paymentIngressEventId)).toEqual([
      "evt_helius_sig_1",
    ]);
    expect(await markPurchaseOrderAcknowledged(db, "evt_helius_sig_1")).toBe(true);
    expect(await listPaidPurchaseOrdersForKitchen(db)).toEqual([]);
    expect(await markPurchaseOrderFulfilled(db, "solana_ref_2")).toBe(true);

    expect((await getPurchaseOrderByReference(db, "solana_ref_2"))?.status).toBe("fulfilled");
    expect(await statusHistory(db, "solana_ref_2")).toEqual([
      "pending",
      "paid",
      "acknowledged",
      "fulfilled",
    ]);
    expect(await statusIds(db, "solana_ref_2")).toEqual([1, 2, 3, 4]);
  });

  test("status ids restart at one for each order reference", async () => {
    for (const orderReference of ["order_a", "order_b"]) {
      await insertPendingPurchaseOrderIfNew(db, {
        orderReference,
        paymentProvider: "stripe",
        paymentIntentExpiresAt: null,
        amountCents: 1000,
        currency: "usd",
        payload: payload({
          paymentIngressEventId: "",
          paymentReferenceId: orderReference,
        }),
        customerName: "Per Order",
        customerPhone: "555-0103",
        customerEmail: null,
      });
    }

    expect(await statusIds(db, "order_a")).toEqual([1]);
    expect(await statusIds(db, "order_b")).toEqual([1]);
  });

  test("preserves refund reservation guard against over-refunding", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "pi_1",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      amountCents: 1000,
      currency: "usd",
      payload: payload({
        paymentIngressEventId: "",
        paymentReferenceId: "pi_1",
      }),
      customerName: "Lin",
      customerPhone: "555-0102",
      customerEmail: "lin@example.com",
    });

    await markStripePurchaseOrderPaidIfNew(db, {
      orderReference: "pi_1",
      payload: payload({
        paymentIngressEventId: "evt_stripe_1",
        paymentReferenceId: "pi_1",
      }),
    });

    const reserved = await tryInsertRefundIfWithinOrderTotal(db, {
      orderReference: "pi_1",
      amountCents: 600,
    });
    expect(reserved?.amountCents).toBe(600);

    const overdrawn = await tryInsertRefundIfWithinOrderTotal(db, {
      orderReference: "pi_1",
      amountCents: 500,
    });
    expect(overdrawn).toBeNull();

    await updateRefundConfirmation(db, reserved!.id, {
      stripeRefundConfirmation: "re_1",
    });
    expect(await sumConfirmedRefundsForOrder(db, "pi_1")).toBe(600);
  });
});
