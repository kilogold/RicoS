import { describe, expect, test } from "bun:test";
import type { PurchaseOrderLine } from "@ricos/shared";
import type { OrderPaidPayload } from "../relay/types";
import { planPrintSlices, resolveDestination } from "./print-routing";

function line(id: string, station: PurchaseOrderLine["station"]): PurchaseOrderLine {
  return {
    id,
    quantity: 1,
    selections: {},
    unitBasePriceCents: 500,
    selectedModifiers: [],
    lineUnitTotalCents: 500,
    lineExtendedTotalCents: 500,
    station,
    itemLabel: id,
    selectionLines: [],
  };
}

function orderPayload(overrides: Partial<OrderPaidPayload> = {}): OrderPaidPayload {
  return {
    paymentIngressEventId: "evt_routing",
    paymentReferenceId: "pi_routing",
    customerName: "Routing Test",
    serviceMode: "takeout",
    subtotalCents: 1000,
    serviceChargeCents: 0,
    salesTaxCents: 0,
    municipalTaxCents: 0,
    grandTotalCents: 1000,
    currency: "usd",
    intent: "paid",
    lines: [line("item_a", "A"), line("item_b", "B")],
    ...overrides,
  };
}

describe("resolveDestination", () => {
  test("B station maps to B", () => {
    expect(resolveDestination("B")).toBe("B");
  });

  test("A and default map to A", () => {
    expect(resolveDestination("A")).toBe("A");
    expect(resolveDestination("default")).toBe("A");
  });
});

describe("planPrintSlices", () => {
  test("manual-print always prints one slice on A", () => {
    const slices = planPrintSlices(
      orderPayload({ intent: "manual-print", lines: [line("x", "B")] }),
      true,
    );
    expect(slices).toHaveLength(1);
    expect(slices[0]?.destination).toBe("A");
    expect(slices[0]?.lines).toHaveLength(1);
  });

  test("dual paid splits by station", () => {
    const slices = planPrintSlices(orderPayload(), true);
    expect(slices).toHaveLength(2);
    expect(slices.find((s) => s.destination === "A")?.lines.map((l) => l.id)).toEqual(["item_a"]);
    expect(slices.find((s) => s.destination === "B")?.lines.map((l) => l.id)).toEqual(["item_b"]);
  });

  test("single printer coalesces paid lines onto A", () => {
    const slices = planPrintSlices(orderPayload(), false);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.destination).toBe("A");
    expect(slices[0]?.lines).toHaveLength(2);
  });
});
