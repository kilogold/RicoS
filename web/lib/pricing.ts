import {
  getItemById,
  getLineUnitPriceCents,
  type Language,
  type MenuItem,
} from "@ricos/shared";
import type { CartLine } from "@/lib/cart-context";

export function linesWithItems(
  lines: CartLine[],
): { line: CartLine; item: MenuItem }[] {
  const out: { line: CartLine; item: MenuItem }[] = [];
  for (const line of lines) {
    const item = getItemById(line.id);
    if (item) out.push({ line, item });
  }
  return out;
}

export function totalCents(lines: CartLine[]): number {
  let sum = 0;
  for (const line of lines) {
    sum += lineTotalCents(line);
  }
  return sum;
}

export function lineUnitPriceCents(line: CartLine): number {
  const unit = getLineUnitPriceCents(line.id, line.selections);
  return unit ?? 0;
}

export function lineTotalCents(line: CartLine): number {
  return lineUnitPriceCents(line) * line.quantity;
}

export function formatUsd(cents: number, language: Language = "en"): string {
  const locale = language === "es" ? "es-PR" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
