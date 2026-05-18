import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  insertPendingPurchaseOrderIfNew,
  listPrintJobs,
  markStripePurchaseOrderPaidIfNew,
  migrate,
} from "@/lib/infrastructure/turso/webhook-db";

mock.module("@/lib/infrastructure/turso/webhook-db-runtime", () => ({
  getWebhookDb: async () => testDb,
}));

let testDb: Client;

import { handlePrintJobsRequest } from "./index";

function payload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_jobs_test",
    paymentReferenceId: "pi_jobs_test",
    serviceMode: "takeout",
    customerName: "Jobs Customer",
    subtotalCents: 500,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    grandTotalCents: 500,
    currency: "usd",
    intent: "paid",
    lines: [],
    ...overrides,
  };
}

describe("handlePrintJobsRequest", () => {
  beforeEach(async () => {
    testDb = createClient({ url: ":memory:" });
    await migrate(testDb);
    await insertPendingPurchaseOrderIfNew(testDb, {
      orderReference: "pi_jobs_test",
      paymentProvider: "stripe",
      paymentIntentExpiresAt: null,
      grandTotalCents: 500,
      currency: "usd",
      payload: payload({ paymentIngressEventId: "", paymentReferenceId: "pi_jobs_test" }),
      customerName: "Jobs Customer",
      customerPhone: "555-0400",
      customerEmail: null,
    });
    await markStripePurchaseOrderPaidIfNew(testDb, {
      orderReference: "pi_jobs_test",
      payload: payload({ intent: "paid", paymentIngressEventId: "evt_jobs_test" }),
    });
  });

  afterEach(() => {
    testDb.close();
  });

  test("returns hydrated pending jobs", async () => {
    const res = await handlePrintJobsRequest(new Request("http://localhost/api/print/jobs"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jobs: Array<{ printJobId: string; payload: KitchenOrderPayload }>;
    };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]?.payload.intent).toBe("paid");
    expect(body.jobs[0]?.payload.customerName).toBe("Jobs Customer");
    expect(body.jobs[0]?.printJobId).toBe((await listPrintJobs(testDb))[0]?.printJobId);
  });
});
