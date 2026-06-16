/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { parseAthIngressEvent } from "./parse-ath-ingress-event";

describe("parseAthIngressEvent", () => {
  test("parses ecommerce completed case-insensitively", () => {
    const result = parseAthIngressEvent({
      transactionType: "ECOMMERCE",
      status: "completed",
      metadata1: "aabbccddeeff00112233445566778899",
      referenceNumber: "1024264030-8a36",
      ecommerceId: "ec_123",
      total: "13.50",
    });

    expect(result).toEqual({
      kind: "payment",
      event: {
        provider: "athmovil",
        paymentIngressEventId: "evt_ath_1024264030-8a36",
        paymentReferenceId: "aabbccddeeff00112233445566778899",
        grandTotalCents: 1350,
        currency: "usd",
        metadata: {
          ecommerceId: "ec_123",
          athReferenceNumber: "1024264030-8a36",
        },
      },
    });
  });

  test("parses refund completed", () => {
    const result = parseAthIngressEvent({
      transactionType: "refund",
      status: "COMPLETED",
      referenceNumber: "1024264030-8a36",
      dailyTransactionID: "DTX-001",
      total: 5.25,
    });

    expect(result).toEqual({
      kind: "refund",
      event: {
        provider: "athmovil",
        refundIngressEventId: "evt_ath_refund_DTX-001",
        athReferenceNumber: "1024264030-8a36",
        refundTotalCents: 525,
        currency: "usd",
      },
    });
  });

  test("returns ignore for unmatched transaction type", () => {
    const result = parseAthIngressEvent({
      transactionType: "payment",
      status: "completed",
      referenceNumber: "ref-1",
      ecommerceId: "ec-1",
    });

    expect(result).toEqual({
      kind: "ignore",
      reason: "unmatched_transaction_type_or_status",
      transactionType: "payment",
      status: "completed",
      referenceNumber: "ref-1",
      ecommerceId: "ec-1",
    });
  });

  test("requires metadata1 for ecommerce completed", () => {
    const result = parseAthIngressEvent({
      transactionType: "ecommerce",
      status: "completed",
      referenceNumber: "ref-2",
      total: 10,
    });

    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: "ATH ecommerce missing metadata1",
    });
  });
});
