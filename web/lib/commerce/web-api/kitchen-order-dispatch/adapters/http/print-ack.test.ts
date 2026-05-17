import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  type KitchenOrderPayload,
  PENDING_PAYMENT_NO_SALE_INGRESS_ID,
} from "@/lib/commerce/domain";
import {
  insertPendingPurchaseOrderIfNew,
  markStripePurchaseOrderPaidIfNew,
  migrate,
  markPurchaseOrderAcknowledged,
} from "@/lib/infrastructure/turso/webhook-db";

mock.module("@/lib/infrastructure/turso/webhook-db-runtime", () => ({
  getWebhookDb: async () => testDb,
}));

let testDb: Client;

import { handlePrintAckRequest } from "./index";

function payload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_print_ack",
    paymentReferenceId: "pi_print_ack",
    serviceMode: "takeout",
    customerName: "Ack Customer",
    subtotalCents: 800,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    grandTotalCents: 800,
    currency: "usd",
    intent: "manual-print",
    lines: [],
    ...overrides,
  };
}

async function statusHistory(client: Client, orderReference: string): Promise<string[]> {
  const result = await client.execute({
    sql: `SELECT status FROM status_history WHERE order_reference = ? ORDER BY status_id ASC`,
    args: [orderReference],
  });
  return (result.rows ?? []).map((row) =>
    String((row as Record<string, unknown>).status ?? (row as Record<string, unknown>).STATUS),
  );
}

describe("handlePrintAckRequest", () => {
  beforeEach(async () => {
    testDb = createClient({ url: ":memory:" });
    await migrate(testDb);
    await insertPendingPurchaseOrderIfNew(testDb, {
      orderReference: "pi_print_ack",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 800,
      currency: "usd",
      payload: payload({ paymentIngressEventId: "", paymentReferenceId: "pi_print_ack" }),
      customerName: "Ack Customer",
      customerPhone: "555-0300",
      customerEmail: null,
    });
    await markStripePurchaseOrderPaidIfNew(testDb, {
      orderReference: "pi_print_ack",
      payload: payload({ intent: "paid", paymentIngressEventId: "evt_print_ack" }),
    });
  });

  afterEach(() => {
    testDb.close();
  });

  test("paid intent advances lifecycle and echoes intent", async () => {
    const res = await handlePrintAckRequest(
      new Request("http://localhost/api/print/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIngressEventId: "evt_print_ack",
          intent: "paid",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ intent: "paid" });
    expect(await statusHistory(testDb, "pi_print_ack")).toEqual([
      "pending",
      "paid",
      "acknowledged",
    ]);
  });

  test("manual-print intent echoes intent without lifecycle change", async () => {
    await markPurchaseOrderAcknowledged(testDb, "evt_print_ack");

    const res = await handlePrintAckRequest(
      new Request("http://localhost/api/print/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIngressEventId: "evt_print_ack",
          intent: "manual-print",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ intent: "manual-print" });
    expect(await statusHistory(testDb, "pi_print_ack")).toEqual([
      "pending",
      "paid",
      "acknowledged",
    ]);
  });

  test("accepts pending-payment sentinel for manual-print ack", async () => {
    const res = await handlePrintAckRequest(
      new Request("http://localhost/api/print/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIngressEventId: PENDING_PAYMENT_NO_SALE_INGRESS_ID,
          intent: "manual-print",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ intent: "manual-print" });
    expect(await statusHistory(testDb, "pi_print_ack")).toEqual(["pending", "paid"]);
  });

  test("defaults intent to paid when omitted", async () => {
    const res = await handlePrintAckRequest(
      new Request("http://localhost/api/print/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIngressEventId: "evt_print_ack" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ intent: "paid" });
  });
});
