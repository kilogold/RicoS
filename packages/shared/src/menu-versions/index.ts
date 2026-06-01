/**
 * Decode index construction and canonical JSON for menu manifests.
 * Runtime decode-index lookup uses the bundled menu for the active deployment version.
 */

import type {
  DecodeIndex,
  DecodeIndexGroup,
  DecodeIndexItem,
} from "../cart-codec";
import type { MenuDocument } from "../menu-types";

/**
 * Builds a DecodeIndex from a menu catalog.
 * Pure function; ordering matches `categories[*].items[*]` in the source.
 */
export function buildDecodeIndex(version: number, catalog: MenuDocument): DecodeIndex {
  const items: DecodeIndexItem[] = [];
  for (const category of catalog.categories) {
    for (const item of category.items) {
      const groups: DecodeIndexGroup[] = (item.modifierGroups ?? []).map((g) => ({
        id: g.id,
        selectionType: g.selectionType,
        required: g.required,
        minSelections: g.minSelections,
        maxSelections: g.maxSelections,
        options: g.options.map((opt) => ({
          id: opt.id,
          surchargeCents: opt.priceDeltaCents ?? 0,
        })),
      }));
      items.push({
        id: item.id,
        priceCents: item.priceCents,
        salesTaxRate: item.salesTaxRate,
        municipalTaxRate: item.municipalTaxRate,
        groups,
      });
    }
  }
  return { version, items, orderFees: catalog.orderFees } as DecodeIndex;
}

/**
 * Deterministic JSON serialization with sorted object keys.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(nested as Record<string, unknown>).sort();
      for (const key of keys) {
        sorted[key] = (nested as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return nested;
  });
}
