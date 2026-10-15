/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { CART_B64_KEY, CART_CODEC_ID_V1, CART_CODEC_KEY } from "@ricos/shared";
import type { KitchenOrderPayload } from "../../../../domain";
import type { HeliusIngressPayment } from "../ingress/parse-helius-ingress-payload";
import {
  insertPendingPurchaseOrderIfNew,
  getPurchaseOrderByReference,
  listPrintJobs,
  markSolanaPurchaseOrderPaidIfNew,
  migrate,
} from "../../../../../infrastructure/turso/webhook-db";
import {
  heliusPaymentToNormalizedEvent,
  resolveHeliusSolanaPayPending,
} from "./resolve-helius-solana-pay-pending";
import { parseHeliusIngressPayload } from "../ingress/parse-helius-ingress-payload";
import solflareTransfer from "../ingress/fixtures/solflare-transfer-devnet.json";
import { executeSolanaIngressEvent } from "../../../kitchen-order-dispatch/use-cases/execute-ingress-event";

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

  test("settles the Solflare Transfer regression once and recognizes a replay", async () => {
    const confirmedReference = "2im2A4NiydVdBa46rmF7oRp2HFUkKMGZNsVCStSixt9c";
    const confirmedSignature = solflareTransfer.transaction.signatures[0];
    const parsed = parseHeliusIngressPayload({
      headers: {},
      config: {
        authHeaderName: "x-helius-auth",
        expectedUsdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        expectedRecipient: "EEHj6a2oScEN2nKT7rN9n2UKT2jLbGQtJnNK5cC5MDJb",
      },
      body: [solflareTransfer],
    });
    expect(parsed.kind).toBe("ok");
    if (parsed.kind !== "ok") return;
    expect(parsed.events).toHaveLength(1);
    const confirmedPayment = parsed.events[0];
    await insertPending(db, confirmedReference, { grandTotalCents: 673 });

    const resolved = await resolveHeliusSolanaPayPending(db, confirmedPayment, confirmedSignature);
    expect(resolved).toEqual({ ok: true, orderReference: confirmedReference, duplicateWebhook: false });
    if (!resolved.ok) return;

    // Exercise settlement against the in-memory DB without notifying a real kitchen relay.
    const queueUrl = process.env.PRINT_BELL_QUEUE_URL;
    process.env.PRINT_BELL_QUEUE_URL = "";
    try {
      const event = heliusPaymentToNormalizedEvent(confirmedPayment, resolved.orderReference);
      const context = { orderReference: resolved.orderReference, transactionSignature: confirmedSignature };
      expect(await executeSolanaIngressEvent(db, event, context)).toEqual({ ok: true });
      expect(await getPurchaseOrderByReference(db, confirmedReference)).toMatchObject({
        status: "paid",
        grandTotalCents: 673,
        paymentIngressEventId: `evt_helius_${confirmedSignature}`,
      });

      expect(await resolveHeliusSolanaPayPending(db, confirmedPayment, confirmedSignature)).toEqual({
        ok: true, orderReference: confirmedReference, duplicateWebhook: true,
      });
      expect(await executeSolanaIngressEvent(db, event, context)).toEqual({ ok: true });
      expect(await listPrintJobs(db)).toHaveLength(1);
    } finally {
      if (queueUrl === undefined) delete process.env.PRINT_BELL_QUEUE_URL;
      else process.env.PRINT_BELL_QUEUE_URL = queueUrl;
    }
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
