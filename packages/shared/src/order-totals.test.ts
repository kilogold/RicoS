import { describe, expect, test } from "bun:test";
import { computeOrderTotals } from "./order-totals";
import type { OrderFeeRates } from "./menu-types";

const prRates: OrderFeeRates = {
  serviceFeeRate: 0.05,
  salesTaxRate: 0.105,
  municipalTaxRate: 0.01,
};

describe("computeOrderTotals", () => {
  test("zero rates return subtotal as grand total", () => {
    const totals = computeOrderTotals(1000, {
      serviceFeeRate: 0,
      salesTaxRate: 0,
      municipalTaxRate: 0,
    });
    expect(totals).toEqual({
      subtotalCents: 1000,
      serviceChargeCents: 0,
      salesTaxCents: 0,
      municipalTaxCents: 0,
      grandTotalCents: 1000,
    });
  });

  test("PR-style rates on $10 subtotal", () => {
    const totals = computeOrderTotals(1000, prRates);
    expect(totals.subtotalCents).toBe(1000);
    expect(totals.serviceChargeCents).toBe(50);
    expect(totals.salesTaxCents).toBe(110);
    expect(totals.municipalTaxCents).toBe(11);
    expect(totals.grandTotalCents).toBe(1171);
  });

  test("rejects negative subtotal", () => {
    expect(() => computeOrderTotals(-1, prRates)).toThrow();
  });
});
