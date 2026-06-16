import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  getPurchaseOrderByReference,
  insertPendingPurchaseOrderIfNew,
  markAthMovilPurchaseOrderPaidIfNew,
  migrate,
  sumConfirmedRefundsForOrder,
} from "@/lib/infrastructure/turso/webhook-db";
import { executeAthRefundIngressEvent } from "./execute-ath-refund-ingress";

function payload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_test",
    paymentReferenceId: "ath_paid_1",
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

describe("executeAthRefundIngressEvent", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  afterEach(async () => {
    await db.close();
  });

  test("records refund and transitions order to refunding", async () => {
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference: "ath_paid_1",
      paymentProvider: "athmovil",
      paymentIntentExpiresAt: null,
      grandTotalCents: 1000,
      currency: "usd",
      payload: payload({ paymentReferenceId: "ath_paid_1" }),
      customerName: "Ada",
      customerPhone: "555-0100",
      customerEmail: null,
    });
    await markAthMovilPurchaseOrderPaidIfNew(db, {
      orderReference: "ath_paid_1",
      payload: payload({
        paymentIngressEventId: "evt_ath_1024264030-8a36",
        paymentReferenceId: "ath_paid_1",
        intent: "paid",
      }),
    });

    const result = await executeAthRefundIngressEvent(db, {
      provider: "athmovil",
      refundIngressEventId: "evt_ath_refund_1",
      athReferenceNumber: "1024264030-8a36",
      refundTotalCents: 400,
      currency: "usd",
    });

    expect(result).toEqual({
      ok: true,
      ignored: false,
      orderReference: "ath_paid_1",
      status: "refunding",
    });
    expect(await sumConfirmedRefundsForOrder(db, "ath_paid_1")).toBe(400);
    expect((await getPurchaseOrderByReference(db, "ath_paid_1"))?.status).toBe("refunding");
  });

  test("ignores out-of-band ATH refund without a paid order", async () => {
    const result = await executeAthRefundIngressEvent(db, {
      provider: "athmovil",
      refundIngressEventId: "evt_ath_refund_orphan",
      athReferenceNumber: "no-such-payment",
      refundTotalCents: 500,
      currency: "usd",
    });

    expect(result).toEqual({ ok: true, ignored: true });
  });
});
