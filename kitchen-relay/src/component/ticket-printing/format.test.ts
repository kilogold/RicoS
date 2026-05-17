import { describe, expect, test } from "bun:test";
import { formatTicket, printModeFromIntent } from "./format";

const printedAt = new Date("2026-05-17T12:00:00.000Z");

const sampleLines = [
  {
    id: "farina",
    quantity: 2,
    selections: {},
    lineUnitTotalCents: 199,
    lineExtendedTotalCents: 398,
    itemLabel: "Farina",
    selectionLines: ["Base: Milk"],
  },
];

const baseParams = {
  paymentReferenceId: "pi_test_ref",
  customerName: "Jane",
  serviceMode: "takeout" as const,
  currency: "USD",
  subtotalCents: 398,
  serviceChargeCents: 0,
  salesTaxCents: 0,
  municipalTaxCents: 0,
  grandTotalCents: 398,
  lines: sampleLines,
  printedAt,
};

describe("printModeFromIntent", () => {
  test("paid maps to kitchen-order", () => {
    expect(printModeFromIntent("paid")).toBe("kitchen-order");
  });

  test("manual-print maps to customer-receipt", () => {
    expect(printModeFromIntent("manual-print")).toBe("customer-receipt");
  });
});

describe("formatTicket", () => {
  test("customer-receipt includes financial details", () => {
    const text = formatTicket({ ...baseParams, mode: "customer-receipt" });

    expect(text).toContain("RICOS — KITCHEN TICKET");
    expect(text).toContain("Ref: pi_test_ref");
    expect(text).toContain("SUBTOTAL");
    expect(text).toContain("TOTAL");
    expect(text).toContain("2x Farina");
    expect(text).toMatch(/\$3\.98/);
  });

  test("kitchen-order omits header, ref, and money", () => {
    const text = formatTicket({ ...baseParams, mode: "kitchen-order" });

    expect(text).toContain("Time: 2026-05-17T12:00:00.000Z");
    expect(text).toContain("Name: Jane");
    expect(text).toContain("Service: TAKEOUT");
    expect(text).toContain("2x Farina");
    expect(text).toContain("   Base: Milk");
    expect(text).not.toContain("RICOS");
    expect(text).not.toContain("Ref:");
    expect(text).not.toContain("$");
    expect(text).not.toContain("SUBTOTAL");
    expect(text).not.toContain("TOTAL");
  });
});
