import type { OrderFeeRates } from "./menu-types";

export type OrderTotals = {
  subtotalCents: number;
  serviceChargeCents: number;
  salesTaxCents: number;
  municipalTaxCents: number;
  grandTotalCents: number;
};

/**
 * Itemized order totals from subtotal and catalog fee rates.
 *
 * grandTotal ≈ subtotal × (1 + serviceFeeRate) × (1 + salesTaxRate + municipalTaxRate)
 * with per-component cent rounding.
 */
export function computeOrderTotals(
  subtotalCents: number,
  rates: OrderFeeRates,
): OrderTotals {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error("subtotalCents must be a non-negative integer");
  }

  const afterServiceCents = Math.round(subtotalCents * (1 + rates.serviceFeeRate));
  const serviceChargeCents = afterServiceCents - subtotalCents;
  const salesTaxCents = Math.round(afterServiceCents * rates.salesTaxRate);
  const municipalTaxCents = Math.round(afterServiceCents * rates.municipalTaxRate);
  const grandTotalCents = afterServiceCents + salesTaxCents + municipalTaxCents;

  return {
    subtotalCents,
    serviceChargeCents,
    salesTaxCents,
    municipalTaxCents,
    grandTotalCents,
  };
}
