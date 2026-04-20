import { getItemById, type MenuItem } from "@ricos/shared";
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
    const item = getItemById(line.id);
    if (!item) continue;
    sum += item.priceCents * line.quantity;
  }
  return sum;
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
