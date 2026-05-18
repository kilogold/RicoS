import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  insertPendingPurchaseOrderIfNew,
  listPrintJobs,
  markStripePurchaseOrderPaidIfNew,
  migrate,
  markPurchaseOrderAcknowledged,
} from "@/lib/infrastructure/turso/webhook-db";
import { manualPrintPurchaseOrder } from "./manual-print-purchase-order";

function payload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_manual_print_test",
    paymentReferenceId: "pi_manual_print_test",
    serviceMode: "takeout",
    customerName: "Manual Print Customer",
    subtotalCents: 1200,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    grandTotalCents: 1200,
    currency: "usd",
    intent: "manual-print",
    lines: [
      {
        id: "item_1",
        quantity: 1,
        selections: {},
        unitBasePriceCents: 1200,
        selectedModifiers: [],
        lineUnitTotalCents: 1200,
        lineExtendedTotalCents: 1200,
        itemLabel: "Test Item",
        selectionLines: [],
      },
    ],
    ...overrides,
  };
}

describe("manualPrintPurchaseOrder", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  async function seedPaidOrder(): Promise<void> {
    expect(
      await insertPendingPurchaseOrderIfNew(db, {
        orderReference: "pi_manual_print_test",
        paymentProvider: "stripe",
        paymentIntentExpiresAt: null,
        grandTotalCents: 1200,
        currency: "usd",
        payload: payload({ paymentIngressEventId: "", paymentReferenceId: "pi_manual_print_test" }),
        customerName: "Manual Print Customer",
        customerPhone: "555-0200",
        customerEmail: null,
      }),
    ).toBe(true);
    await markStripePurchaseOrderPaidIfNew(db, {
      orderReference: "pi_manual_print_test",
      payload: payload({ intent: "paid", paymentIngressEventId: "evt_manual_print_test" }),
    });
  }

  test("enqueues manual-print job for acknowledged order", async () => {
    await seedPaidOrder();
    await markPurchaseOrderAcknowledged(db, "evt_manual_print_test");

    const before = await listPrintJobs(db);
    expect(before.filter((j) => j.intent === "manual-print")).toHaveLength(0);

    const result = await manualPrintPurchaseOrder(db, "pi_manual_print_test");
    expect(result).toEqual({ ok: true });

    const after = await listPrintJobs(db);
    expect(after.filter((j) => j.intent === "manual-print")).toHaveLength(1);
  });

  test("enqueues manual-print for pending order", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "pi_pending",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 500,
      currency: "usd",
      payload: payload({ paymentIngressEventId: "", paymentReferenceId: "pi_pending" }),
      customerName: "Pending",
      customerPhone: "555-0201",
      customerEmail: null,
    });

    const result = await manualPrintPurchaseOrder(db, "pi_pending");
    expect(result).toEqual({ ok: true });

    const jobs = await listPrintJobs(db);
    expect(jobs.filter((j) => j.intent === "manual-print")).toHaveLength(1);
    expect(jobs[0]?.orderReference).toBe("pi_pending");
  });

  test("allows multiple manual-print jobs per order", async () => {
    await seedPaidOrder();
    await manualPrintPurchaseOrder(db, "pi_manual_print_test");
    await manualPrintPurchaseOrder(db, "pi_manual_print_test");
    await manualPrintPurchaseOrder(db, "pi_manual_print_test");

    const manualJobs = (await listPrintJobs(db)).filter((j) => j.intent === "manual-print");
    expect(manualJobs).toHaveLength(3);
  });

  test("returns not_found for unknown order", async () => {
    const result = await manualPrintPurchaseOrder(db, "pi_missing");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});
