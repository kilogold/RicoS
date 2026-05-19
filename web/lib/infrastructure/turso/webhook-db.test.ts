import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import { executeStripeIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import {
  getPurchaseOrderByReference,
  insertPendingPurchaseOrderIfNew,
  ackPrintJob,
  enqueuePrintJob,
  listPrintJobs,
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
    serviceMode: "takeout",
    customerName: "Test Customer",
    subtotalCents: 1000,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    grandTotalCents: 1000,
    currency: "usd",
    intent: "manual-print",
    lines: [
      {
        id: "item_1",
        quantity: 1,
        selections: {},
        unitBasePriceCents: 1000,
        selectedModifiers: [],
        lineUnitTotalCents: 1000,
        lineExtendedTotalCents: 1000,
        station: "B",
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
      "print_queue",
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
      grandTotalCents: 1000,
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
    expect(pending?.payload.serviceMode).toBe("takeout");

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
      grandTotalCents: 1000,
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
      serviceMode: "dine_in",
      intent: "paid",
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

    const pendingJobs = await listPrintJobs(db);
    expect(pendingJobs).toHaveLength(1);
    expect(pendingJobs[0]?.intent).toBe("paid");
    expect(pendingJobs[0]?.paymentIngressEventId).toBe("evt_helius_sig_1");

    await ackPrintJob(db, pendingJobs[0]!.printJobId);
    expect(await statusHistory(db, "solana_ref_2")).toEqual(["pending", "paid", "acknowledged"]);
    expect(await listPrintJobs(db)).toEqual([]);
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

  test("paid webhook reuses saved pending ticket payload", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "pi_saved_payload",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usd",
      payload: payload({
        paymentIngressEventId: "",
        paymentReferenceId: "pi_saved_payload",
        serviceMode: "dine_in",
      }),
      customerName: "Saved",
      customerPhone: "555-0104",
      customerEmail: null,
    });

    const outcome = await executeStripeIngressEvent(db, {
      provider: "stripe",
      paymentIngressEventId: "evt_stripe_saved_payload",
      paymentReferenceId: "pi_saved_payload",
      grandTotalCents: 1000,
      currency: "usd",
      metadata: {},
    });

    expect(outcome).toEqual({ ok: true });
    const paid = await getPurchaseOrderByReference(db, "pi_saved_payload");
    expect(paid?.status).toBe("paid");
    expect(paid?.payload.serviceMode).toBe("dine_in");
    expect(paid?.payload.paymentIngressEventId).toBe("evt_stripe_saved_payload");
    expect(paid?.payload.intent).toBe("paid");
    expect(paid?.payload.customerName).toBe("Saved");
    const jobs = await listPrintJobs(db);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.intent).toBe("paid");
    expect(jobs[0]?.orderReference).toBe("pi_saved_payload");
  });

  test("print queue dedupes paid jobs per order", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "pi_dup_paid",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usd",
      payload: payload({
        paymentIngressEventId: "",
        paymentReferenceId: "pi_dup_paid",
      }),
      customerName: "Dup",
      customerPhone: "555-0105",
      customerEmail: null,
    });
    const paidPayload = payload({
      paymentIngressEventId: "evt_dup",
      paymentReferenceId: "pi_dup_paid",
      intent: "paid",
    });
    await markStripePurchaseOrderPaidIfNew(db, {
      orderReference: "pi_dup_paid",
      payload: paidPayload,
    });
    expect(await enqueuePrintJob(db, { orderReference: "pi_dup_paid", intent: "paid" })).toBeNull();
    expect(await listPrintJobs(db)).toHaveLength(1);
  });

  test("print queue allows multiple manual-print jobs", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "pi_multi_manual",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usd",
      payload: payload({
        paymentIngressEventId: "",
        paymentReferenceId: "pi_multi_manual",
      }),
      customerName: "Multi",
      customerPhone: "555-0106",
      customerEmail: null,
    });
    await enqueuePrintJob(db, { orderReference: "pi_multi_manual", intent: "manual-print" });
    await enqueuePrintJob(db, { orderReference: "pi_multi_manual", intent: "manual-print" });
    expect((await listPrintJobs(db)).filter((j) => j.intent === "manual-print")).toHaveLength(2);
  });

  test("print ack is idempotent and only advances paid to acknowledged", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "pi_ack_idempotent",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 500,
      currency: "usd",
      payload: payload({
        paymentIngressEventId: "",
        paymentReferenceId: "pi_ack_idempotent",
      }),
      customerName: "Ack Test",
      customerPhone: "555-0199",
      customerEmail: null,
    });
    const paidPayload = payload({
      paymentIngressEventId: "evt_ack_test",
      paymentReferenceId: "pi_ack_idempotent",
      intent: "paid",
    });
    expect(
      await markStripePurchaseOrderPaidIfNew(db, {
        orderReference: "pi_ack_idempotent",
        payload: paidPayload,
      }),
    ).toBe(true);
    expect(await markPurchaseOrderAcknowledged(db, "evt_ack_test")).toBe(true);
    expect(await markPurchaseOrderAcknowledged(db, "evt_ack_test")).toBe(true);
    expect(await statusHistory(db, "pi_ack_idempotent")).toEqual([
      "pending",
      "paid",
      "acknowledged",
    ]);
    expect(await markPurchaseOrderFulfilled(db, "pi_ack_idempotent")).toBe(true);
    expect(await markPurchaseOrderAcknowledged(db, "evt_ack_test")).toBe(true);
    expect(await statusHistory(db, "pi_ack_idempotent")).toEqual([
      "pending",
      "paid",
      "acknowledged",
      "fulfilled",
    ]);
    expect(await markPurchaseOrderAcknowledged(db, "evt_unknown")).toBe(false);
  });

  test("status ids restart at one for each order reference", async () => {
    for (const orderReference of ["order_a", "order_b"]) {
      await insertPendingPurchaseOrderIfNew(db, {
        orderReference,
        paymentProvider: "stripe",
        paymentIntentExpiresAt: null,
        grandTotalCents: 1000,
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
      grandTotalCents: 1000,
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
