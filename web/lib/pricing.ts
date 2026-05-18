import {
  computeOrderTotalsFromLines,
  type MenuCatalogSurface,
  type MenuDocument,
  type MenuItem,
  type OrderFeeRates,
  type OrderTotals,
  type Language,
} from "@ricos/shared";
import type { CartLine } from "@/lib/cart-context";

export function linesWithItems(
  lines: CartLine[],
  surface: MenuCatalogSurface,
): { line: CartLine; item: MenuItem }[] {
  const out: { line: CartLine; item: MenuItem }[] = [];
  for (const line of lines) {
    const item = surface.getItemById(line.id);
    if (item) out.push({ line, item });
  }
  return out;
}

export function subtotalCents(lines: CartLine[], surface: MenuCatalogSurface): number {
  let sum = 0;
  for (const line of lines) {
    sum += lineTotalCents(line, surface);
  }
  return sum;
}

export function orderTotalsForCart(
  lines: CartLine[],
  surface: MenuCatalogSurface,
  orderFees: OrderFeeRates,
): OrderTotals {
  const pricedLines = linesWithItems(lines, surface).map(({ line, item }) => ({
    lineExtendedTotalCents: lineTotalCents(line, surface),
    salesTaxRate: item.salesTaxRate,
    municipalTaxRate: item.municipalTaxRate,
  }));
  return computeOrderTotalsFromLines(pricedLines, orderFees.serviceFeeRate);
}

export function orderTotalsForCatalog(
  lines: CartLine[],
  surface: MenuCatalogSurface,
  catalog: MenuDocument,
): OrderTotals {
  return orderTotalsForCart(lines, surface, catalog.orderFees);
}

export function lineUnitPriceCents(line: CartLine, surface: MenuCatalogSurface): number {
  const unit = surface.getLineUnitPriceCents(line.id, line.selections);
  return unit ?? 0;
}

export function lineTotalCents(line: CartLine, surface: MenuCatalogSurface): number {
  return lineUnitPriceCents(line, surface) * line.quantity;
}

export function formatUsd(cents: number, language: Language = "en"): string {
  const locale = language === "es" ? "es-PR" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
