/**
 * Public surface for `@ricos/shared`.
 *
 * Runtime menu authority is the RicoS-Menu GitHub repo (`MENU_PUBLISH_MENU_JSON_URL`);
 * use `createMenuCatalogSurface` with the active catalog from the remote loader.
 * Codec helpers are version-agnostic.
 */

import {
  decodeCartFromMetadataV1,
  type DecodeIndexLookup,
  type HydratedCartLine,
} from "./cart-codec";
import type { Language } from "./menu-types";

export type {
  Language,
  LineSelections,
  LocalizedText,
  MenuCategory,
  MenuDocument,
  MenuItem,
  MenuThemes,
  ModifierGroup,
  ModifierOption,
  ModifierVisibilityRule,
  ItemTaxRates,
  OrderFeeRates,
  PrintStation,
  SelectionType,
} from "./menu-types";

export {
  hasStaleInactiveSelections,
  isModifierGroupActive,
  pruneInactiveSelections,
} from "./modifier-visibility";

export type { PurchaseOrderLine } from "./purchase-order-line";

export {
  computeOrderTotalsFromHydratedCart,
  computeOrderTotalsFromLines,
  type OrderTotals,
  type PricedLineForTotals,
} from "./order-totals";

export {
  CART_B64_KEY,
  CART_CODEC_ID_V1,
  CART_CODEC_KEY,
  MAX_CART_B64_LENGTH,
  MAX_CART_BINARY_BYTES,
  decodeCartFromMetadataV1,
  encodeCartToMetadataV1,
  type CartLineInput,
  type DecodeIndex,
  type DecodeIndexGroup,
  type DecodeIndexItem,
  type DecodeIndexLookup,
  type DecodeIndexOption,
  type EncodeCartResult,
  type HydratedCart,
  type HydratedCartLine,
  type PricedModifierSelection,
} from "./cart-codec";

export { buildDecodeIndex, canonicalJson } from "./menu-versions/index";

export {
  buildManifestForHash,
  computeMenuContentHash,
  parseMenuCatalogFile,
  type MenuCatalogFile,
  type ParsedMenuCatalogFile,
} from "./menu-catalog-file";

export {
  compactMenuCatalogForDisk,
  resolveMenuCatalogRaw,
  type MenuCatalogFileOnDisk,
} from "./menu-catalog-compact";

export {
  createMenuCatalogSurface,
  normalizeSelections,
  selectionSignature,
  type MenuCatalogSurface,
} from "./menu-catalog-surface";

export {
  buildThemedMenuSections,
  type ThemedMenuSection,
} from "./menu-themes";

export type { KitchenOrderIntent } from "./kitchen-order";
export {
  PENDING_PAYMENT_NO_SALE_INGRESS_ID,
  isKitchenOrderIntent,
  isValidPaymentIngressEventId,
} from "./kitchen-order";

export const DEFAULT_LANGUAGE: Language = "es";

/** @deprecated Prefer `MenuCatalogSurface.resolveLocalizedText`. */
export function resolveLocalizedText(value: import("./menu-types").LocalizedText, language: Language): string {
  return value[language] ?? value.en;
}

export type KitchenCartLineFromMetadata = HydratedCartLine;

/**
 * Decode cart metadata to kitchen lines using the supplied decode-index lookup
 * (e.g. remote `getLatestMenuRuntime()` in the web runtime).
 */
export function parseKitchenLinesFromCartMetadataV1(
  metadata: Record<string, string | undefined>,
  lookup: DecodeIndexLookup,
): KitchenCartLineFromMetadata[] {
  const { lines } = decodeCartFromMetadataV1(metadata, lookup);
  return lines;
}
