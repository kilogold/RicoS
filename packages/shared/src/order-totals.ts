import type { DecodeIndex, HydratedCartLine } from "./cart-codec";

export type OrderTotals = {
  subtotalCents: number;
  serviceChargeCents: number;
  salesTaxCents: number;
  municipalTaxCents: number;
  grandTotalCents: number;
};

export type PricedLineForTotals = {
  lineExtendedTotalCents: number;
  salesTaxRate: number;
  municipalTaxRate: number;
};

/**
 * Itemized order totals from cart lines and menu-wide service fee rate.
 *
 * Per line: service fee and taxes apply to that line's extended total, then sums.
 * When all lines share the same tax rates, this matches the legacy aggregate formula.
 */
export function computeOrderTotalsFromLines(
  lines: PricedLineForTotals[],
  serviceFeeRate: number,
): OrderTotals {
  if (!Number.isFinite(serviceFeeRate) || serviceFeeRate < 0 || serviceFeeRate >= 1) {
    throw new Error("serviceFeeRate must be a number in [0, 1)");
  }

  let subtotalCents = 0;
  let serviceChargeCents = 0;
  let salesTaxCents = 0;
  let municipalTaxCents = 0;

  for (const line of lines) {
    const extended = line.lineExtendedTotalCents;
    if (!Number.isInteger(extended) || extended < 0) {
      throw new Error("lineExtendedTotalCents must be a non-negative integer");
    }
    subtotalCents += extended;
    const afterServiceCents = Math.round(extended * (1 + serviceFeeRate));
    serviceChargeCents += afterServiceCents - extended;
    salesTaxCents += Math.round(afterServiceCents * line.salesTaxRate);
    municipalTaxCents += Math.round(afterServiceCents * line.municipalTaxRate);
  }

  const grandTotalCents = subtotalCents + serviceChargeCents + salesTaxCents + municipalTaxCents;

  return {
    subtotalCents,
    serviceChargeCents,
    salesTaxCents,
    municipalTaxCents,
    grandTotalCents,
  };
}

/** Resolve per-line tax rates from the decode index and compute checkout totals. */
export function computeOrderTotalsFromHydratedCart(
  lines: HydratedCartLine[],
  decodeIndex: DecodeIndex,
): OrderTotals {
  const taxByItemId = new Map(
    decodeIndex.items.map((item) => [
      item.id,
      { salesTaxRate: item.salesTaxRate, municipalTaxRate: item.municipalTaxRate },
    ]),
  );

  const pricedLines: PricedLineForTotals[] = lines.map((line) => {
    const rates = taxByItemId.get(line.id);
    if (!rates) {
      throw new Error(`Unknown item for order totals: ${line.id}`);
    }
    return {
      lineExtendedTotalCents: line.lineExtendedTotalCents,
      salesTaxRate: rates.salesTaxRate,
      municipalTaxRate: rates.municipalTaxRate,
    };
  });

  return computeOrderTotalsFromLines(pricedLines, decodeIndex.orderFees.serviceFeeRate);
}
