/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { CART_B64_KEY, CART_CODEC_ID_V1, CART_CODEC_KEY } from "@ricos/shared";
import type { KitchenOrderPayload } from "../../../../domain";
import type { HeliusIngressPayment } from "../ingress/parse-helius-ingress-payload";
import {
  insertPendingPurchaseOrderIfNew,
  markSolanaPurchaseOrderPaidIfNew,
  migrate,
} from "../../../../../infrastructure/turso/webhook-db";
import {
  heliusPaymentToNormalizedEvent,
  resolveHeliusSolanaPayPending,
} from "./resolve-helius-solana-pay-pending";

const orderReference = "8aRWDWCFdJQMYujW1Z22LZbU7Mtki12QJSh6utd3kQ8Z";
const otherReference = "2nT8kNX7YvTBMekVWKqpRdDKQ7z9r8FVq4VNSS3bH4Qo";
const feePayer = "9vd5MkFDviku42mFPrcnLyznVMXfRHQ6Ze5EMjcHcPNJ";
const signature =
  "5STBAon61eFZzjSdZf7kQ2zwGJYYWjFHow61YWHnmKkwuuxCxBw1iUr4ir3DFwGeydfsu1j3obxQsZbJ28QexV7v";

const payment: HeliusIngressPayment = {
  paymentIngressEventId: `evt_helius_${signature}`,
  orderReferenceCandidates: [orderReference],
  grandTotalCents: 399,
  currency: "usdc",
  metadata: {
    [CART_CODEC_KEY]: CART_CODEC_ID_V1,
    [CART_B64_KEY]: "AQQBEwEBAQE",
  },
};

function orderPayload(overrides?: Partial<KitchenOrderPayload>): KitchenOrderPayload {
  return {
    paymentIngressEventId: "",
    paymentReferenceId: orderReference,
    grandTotalCents: 399,
    currency: "usdc",
    serviceMode: "pickup",
    customerName: "Test",
    lines: [],
    intent: "paid",
    subtotalCents: 399,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    ...overrides,
  };
}

async function insertPending(
  db: Client,
  reference: string,
  overrides?: { grandTotalCents?: number },
): Promise<void> {
  await insertPendingPurchaseOrderIfNew(db, {
    orderReference: reference,
    paymentProvider: "helius",
    paymentIntentExpiresAt: null,
    grandTotalCents: overrides?.grandTotalCents ?? 399,
    currency: "usdc",
    payload: orderPayload({
      paymentReferenceId: reference,
      grandTotalCents: overrides?.grandTotalCents ?? 399,
      subtotalCents: overrides?.grandTotalCents ?? 399,
    }),
    customerName: "Test",
    customerPhone: "555-0100",
    customerEmail: null,
  });
}

describe("resolveHeliusSolanaPayPending", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  test("rejects when no candidate matches a purchase order", async () => {
    const result = await resolveHeliusSolanaPayPending(db, payment, signature);
    expect(result).toEqual({
      ok: false,
      code: "solana_pay_reference_unknown",
      detail: "no_pending_order_row",
      orderReference: "",
    });
  });

  test("rejects when two candidates match purchase orders", async () => {
    await insertPending(db, orderReference);
    await insertPending(db, otherReference);
    const result = await resolveHeliusSolanaPayPending(
      db,
      { ...payment, orderReferenceCandidates: [orderReference, otherReference] },
      signature,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("solana_pay_reference_unknown");
    expect(result.detail).toBe("ambiguous_reference");
  });

  test("accepts exactly one pending match among multiple candidates", async () => {
    await insertPending(db, orderReference);
    const result = await resolveHeliusSolanaPayPending(
      db,
      { ...payment, orderReferenceCandidates: [feePayer, orderReference] },
      signature,
    );
    expect(result).toEqual({
      ok: true,
      orderReference,
      duplicateWebhook: false,
    });
  });

  test("rejects pending row when amount does not match", async () => {
    await insertPending(db, orderReference, { grandTotalCents: 100 });
    const result = await resolveHeliusSolanaPayPending(db, payment, signature);
    expect(result).toEqual({
      ok: false,
      code: "solana_pay_pending_expired",
      detail: "no_matching_active_pending",
      orderReference,
    });
  });

  test("treats same ingress id on paid row as duplicate webhook", async () => {
    await insertPending(db, orderReference);
    await markSolanaPurchaseOrderPaidIfNew(db, {
      orderReference,
      payload: orderPayload({
        paymentIngressEventId: payment.paymentIngressEventId,
        paymentReferenceId: orderReference,
      }),
    });
    const result = await resolveHeliusSolanaPayPending(db, payment, signature);
    expect(result).toEqual({
      ok: true,
      orderReference,
      duplicateWebhook: true,
    });
  });

  test("heliusPaymentToNormalizedEvent sets paymentReferenceId from resolved order", () => {
    expect(heliusPaymentToNormalizedEvent(payment, orderReference)).toEqual({
      provider: "helius",
      paymentIngressEventId: payment.paymentIngressEventId,
      paymentReferenceId: orderReference,
      grandTotalCents: 399,
      currency: "usdc",
      metadata: payment.metadata,
    });
  });
});
