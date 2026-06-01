import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  ackPrintJob,
  enqueuePrintJob,
  insertPendingPurchaseOrderIfNew,
  listPrintJobs,
  markStripePurchaseOrderPaidIfNew,
  migrate,
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

  test("paid job ack advances lifecycle and clears queue", async () => {
    const jobs = await listPrintJobs(testDb);
    const paidJob = jobs.find((j) => j.intent === "paid");
    expect(paidJob).toBeDefined();

    const res = await handlePrintAckRequest(
      new Request("http://localhost/api/print/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printJobId: paidJob!.printJobId }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await statusHistory(testDb, "pi_print_ack")).toEqual([
      "pending",
      "paid",
      "acknowledged",
    ]);
    expect(await listPrintJobs(testDb)).toEqual([]);
  });

  test("manual-print job ack does not change lifecycle", async () => {
    const jobs = await listPrintJobs(testDb);
    const paidJob = jobs.find((j) => j.intent === "paid");
    expect(paidJob).toBeDefined();
    await ackPrintJob(testDb, paidJob!.printJobId);

    const manualJobId = await enqueuePrintJob(testDb, {
      orderReference: "pi_print_ack",
      intent: "manual-print",
    });
    expect(manualJobId).toBeTruthy();

    const res = await handlePrintAckRequest(
      new Request("http://localhost/api/print/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printJobId: manualJobId }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await statusHistory(testDb, "pi_print_ack")).toEqual([
      "pending",
      "paid",
      "acknowledged",
    ]);
    expect(await listPrintJobs(testDb)).toEqual([]);
  });

  test("ack is idempotent for unknown job id", async () => {
    const res = await handlePrintAckRequest(
      new Request("http://localhost/api/print/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printJobId: "00000000-0000-4000-8000-000000000000" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("rejects missing printJobId", async () => {
    const res = await handlePrintAckRequest(
      new Request("http://localhost/api/print/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });
});
