import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import { subscribeOrder } from "@/lib/infrastructure/sse/order-paid-bus";
import {
  insertPendingPurchaseOrderIfNew,
  markStripePurchaseOrderPaidIfNew,
  markPurchaseOrderAcknowledged,
  migrate,
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
      payload: payload(),
    });
  }

  test("publishes manual-print intent for acknowledged order", async () => {
    await seedPaidOrder();
    await markPurchaseOrderAcknowledged(db, "evt_manual_print_test");

    const received: KitchenOrderPayload[] = [];
    const unsubscribe = subscribeOrder((p) => received.push(p));

    const result = await manualPrintPurchaseOrder(db, "pi_manual_print_test");
    unsubscribe();

    expect(result).toEqual({ ok: true });
    expect(received).toHaveLength(1);
    expect(received[0]?.intent).toBe("manual-print");
    expect(received[0]?.paymentIngressEventId).toBe("evt_manual_print_test");
  });

  test("publishes manual-print for pending order with synthetic ingress id", async () => {
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

    const received: KitchenOrderPayload[] = [];
    const unsubscribe = subscribeOrder((p) => received.push(p));

    const result = await manualPrintPurchaseOrder(db, "pi_pending");
    unsubscribe();

    expect(result).toEqual({ ok: true });
    expect(received[0]?.intent).toBe("manual-print");
    expect(received[0]?.paymentIngressEventId).toBe("PENDING PAYMENT. NO SALE.");
  });

  test("returns not_found for unknown order", async () => {
    const result = await manualPrintPurchaseOrder(db, "pi_missing");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});
