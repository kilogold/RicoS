import { afterEach, describe, expect, mock, test } from "bun:test";
import type { PurchaseOrderLine } from "@ricos/shared";
import type { PrinterAdapter } from "../../component/ticket-printing/types";
import { _clearPrintJobRegistryForTests } from "./print-job-state";
import { createPrintJobHandler } from "./order-paid-handler";

const ackCalls: string[] = [];

mock.module("../relay/ack", () => ({
  postPrintAck: async ({ printJobId }: { printJobId: string }) => {
    ackCalls.push(printJobId);
  },
}));

function trackingAdapter(name: string): PrinterAdapter & { prints: string[] } {
  const prints: string[] = [];
  return {
    prints,
    async print(text: string) {
      prints.push(name);
      if (name === "B" && prints.filter((p) => p === "B").length === 1) {
        throw new Error("printer B offline");
      }
    },
  };
}

function line(id: string, station: PurchaseOrderLine["station"]): PurchaseOrderLine {
  return {
    id,
    quantity: 1,
    selections: {},
    unitBasePriceCents: 400,
    selectedModifiers: [],
    lineUnitTotalCents: 400,
    lineExtendedTotalCents: 400,
    station,
    itemLabel: id,
    selectionLines: [],
  };
}

afterEach(() => {
  ackCalls.length = 0;
  _clearPrintJobRegistryForTests();
});

describe("createPrintJobHandler", () => {
  test("retries only failed destination after partial success", async () => {
    const printerA = trackingAdapter("A");
    const printerB = trackingAdapter("B");
    const handler = createPrintJobHandler(
      { printerA, printerB },
      1,
      1,
      "http://localhost",
      undefined,
    );

    const job = {
      printJobId: "job-partial-1",
      payload: {
        paymentIngressEventId: "evt_1",
        paymentReferenceId: "pi_1",
        customerName: "Partial",
        serviceMode: "takeout" as const,
        subtotalCents: 800,
        serviceChargeCents: 0,
        salesTaxCents: 0,
        municipalTaxCents: 0,
        grandTotalCents: 800,
        currency: "usd",
        intent: "paid" as const,
        lines: [line("cereal", "A"), line("waffle", "B")],
      },
    };

    await expect(handler(job)).rejects.toThrow("printer B offline");
    expect(printerA.prints).toEqual(["A"]);
    expect(printerB.prints).toEqual(["B"]);
    expect(ackCalls).toHaveLength(0);

    await handler(job);
    expect(printerA.prints).toEqual(["A"]);
    expect(printerB.prints).toEqual(["B", "B"]);
    expect(ackCalls).toEqual(["job-partial-1"]);
  });
});
