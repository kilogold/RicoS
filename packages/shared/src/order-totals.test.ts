import { describe, expect, test } from "bun:test";
import {
  computeOrderTotalsFromLines,
  type PricedLineForTotals,
} from "./order-totals";

const prTaxRates = { salesTaxRate: 0.105, municipalTaxRate: 0.01 };
const serviceFeeRate = 0.05;

describe("computeOrderTotalsFromLines", () => {
  test("zero rates return subtotal as grand total", () => {
    const totals = computeOrderTotalsFromLines(
      [{ lineExtendedTotalCents: 1000, salesTaxRate: 0, municipalTaxRate: 0 }],
      0,
    );
    expect(totals).toEqual({
      subtotalCents: 1000,
      serviceChargeCents: 0,
      salesTaxCents: 0,
      municipalTaxCents: 0,
      grandTotalCents: 1000,
    });
  });

  test("PR-style rates on $10 single line", () => {
    const totals = computeOrderTotalsFromLines(
      [{ lineExtendedTotalCents: 1000, ...prTaxRates }],
      serviceFeeRate,
    );
    expect(totals.subtotalCents).toBe(1000);
    expect(totals.serviceChargeCents).toBe(50);
    expect(totals.salesTaxCents).toBe(110);
    expect(totals.municipalTaxCents).toBe(11);
    expect(totals.grandTotalCents).toBe(1171);
  });

  test("two lines with identical rates sum per-line rounded taxes", () => {
    const totals = computeOrderTotalsFromLines(
      [
        { lineExtendedTotalCents: 500, ...prTaxRates },
        { lineExtendedTotalCents: 500, ...prTaxRates },
      ],
      serviceFeeRate,
    );
    expect(totals.subtotalCents).toBe(1000);
    expect(totals.serviceChargeCents).toBe(50);
    expect(totals.salesTaxCents).toBe(110);
    expect(totals.municipalTaxCents).toBe(10);
    expect(totals.grandTotalCents).toBe(1170);
  });

  test("mixed tax rates weight per line", () => {
    const totals = computeOrderTotalsFromLines(
      [
        { lineExtendedTotalCents: 1000, salesTaxRate: 0.105, municipalTaxRate: 0.01 },
        { lineExtendedTotalCents: 1000, salesTaxRate: 0, municipalTaxRate: 0 },
      ],
      serviceFeeRate,
    );
    expect(totals.subtotalCents).toBe(2000);
    expect(totals.serviceChargeCents).toBe(100);
    expect(totals.salesTaxCents).toBe(110);
    expect(totals.municipalTaxCents).toBe(11);
    expect(totals.grandTotalCents).toBe(2221);
  });

  test("rejects negative line extended total", () => {
    expect(() =>
      computeOrderTotalsFromLines(
        [{ lineExtendedTotalCents: -1, salesTaxRate: 0, municipalTaxRate: 0 }],
        0,
      ),
    ).toThrow();
  });
});
