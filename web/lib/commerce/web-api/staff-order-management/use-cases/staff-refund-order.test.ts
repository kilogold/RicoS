import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";
import {
  getPurchaseOrderByReference,
  insertPendingPurchaseOrderIfNew,
  markSolanaPurchaseOrderPaidIfNew,
  migrate,
  sumConfirmedRefundsForOrder,
} from "@/lib/infrastructure/turso/webhook-db";

const executeSolanaStaffRefundMock = mock(async () => ({
  ok: true as const,
  transactionSignature: "refundTxSig111111111111111111111111111111111111111111111111111111",
}));

mock.module("@/lib/commerce/web-api/staff-order-management/staff-refund/execute-solana-refund", () => ({
  executeSolanaStaffRefund: executeSolanaStaffRefundMock,
}));

function orderPayload(overrides: Partial<KitchenOrderPayload> = {}): KitchenOrderPayload {
  return {
    paymentIngressEventId: "evt_helius_paymentSig111111111111111111111111111111111111111111111",
    paymentReferenceId: "8aRWDWCFdJQMYujW1Z22LZbU7Mtki12QJSh6utd3kQ8Z",
    serviceMode: "takeout",
    customerName: "Test",
    subtotalCents: 500,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    grandTotalCents: 500,
    currency: "usdc",
    intent: "manual-print",
    lines: [],
    ...overrides,
  };
}

describe("staffRefundOrder Helius branch", () => {
  let db: Client;
  const orderReference = "8aRWDWCFdJQMYujW1Z22LZbU7Mtki12QJSh6utd3kQ8Z";

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
    executeSolanaStaffRefundMock.mockClear();

    await insertPendingPurchaseOrderIfNew(db, {
      orderReference,
      paymentProvider: "helius",
      paymentIntentExpiresAt: null,
      grandTotalCents: 500,
      currency: "usdc",
      payload: orderPayload({ paymentReferenceId: orderReference }),
      customerName: "Ada",
      customerPhone: "555-0100",
      customerEmail: null,
    });
    await markSolanaPurchaseOrderPaidIfNew(db, {
      orderReference,
      payload: orderPayload({
        paymentReferenceId: orderReference,
        paymentIngressEventId: "evt_helius_paymentSig111111111111111111111111111111111111111111111",
      }),
    });
  });

  afterEach(async () => {
    await db.close();
  });

  test("reserves, sends on-chain refund, confirms proof, updates status", async () => {
    const { staffRefundOrder } = await import("./staff-refund-order");
    const result = await staffRefundOrder(db, {
      orderReference,
      amountCents: 200,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(executeSolanaStaffRefundMock).toHaveBeenCalledTimes(1);
    expect(result.refundedTotalCents).toBe(200);
    expect(result.status).toBe("refunding");

    const total = await sumConfirmedRefundsForOrder(db, orderReference);
    expect(total).toBe(200);

    const order = await getPurchaseOrderByReference(db, orderReference);
    expect(order?.status).toBe("refunding");
  });

  test("rolls back reservation when on-chain send fails", async () => {
    executeSolanaStaffRefundMock.mockImplementationOnce(async () => ({
      ok: false as const,
      code: "solana_refund_failed" as const,
      detail: "simulated failure",
    }));

    const { staffRefundOrder } = await import("./staff-refund-order");
    const result = await staffRefundOrder(db, {
      orderReference,
      amountCents: 100,
    });

    expect(result).toEqual({
      ok: false,
      code: "solana_refund_failed",
      detail: "simulated failure",
    });

    const total = await sumConfirmedRefundsForOrder(db, orderReference);
    expect(total).toBe(0);
  });
});
