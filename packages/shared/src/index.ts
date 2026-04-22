/**
 * Public surface for `@ricos/shared`.
 *
 * This module re-exports menu type definitions, the versioned menu registry,
 * the cart metadata codec, and helpers used by the storefront and webhook
 * consumer.
 *
 * The "current menu" used by the UI is pinned to `CURRENT_MENU_VERSION`.
 */

import {
  CURRENT_MENU_VERSION,
  MENU_VERSIONS,
  getDecodeIndex,
} from "./menu-versions/index";
import {
  decodeCartFromMetadataV1,
  type HydratedCartLine,
} from "./cart-codec";
import type {
  Language,
  LocalizedText,
  MenuCategory,
  MenuDocument,
  MenuItem,
  ModifierGroup,
} from "./menu-types";

export type {
  Language,
  LocalizedText,
  MenuCategory,
  MenuDocument,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  SelectionType,
} from "./menu-types";

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

export {
  CURRENT_MENU_VERSION,
  MENU_VERSIONS,
  buildDecodeIndex,
  canonicalJson,
  getDecodeIndex,
  getMenuVersion,
  listPublishedVersions,
  type MenuVersion,
} from "./menu-versions/index";

export const DEFAULT_LANGUAGE: Language = "es";

/** Resolves the menu document for the current build-stamped version. */
function resolveCurrentMenuDocument(): MenuDocument {
  const entry = MENU_VERSIONS[CURRENT_MENU_VERSION];
  if (!entry) {
    throw new Error(`CURRENT_MENU_VERSION ${CURRENT_MENU_VERSION} missing from MENU_VERSIONS`);
  }
  return entry.catalog;
}

/**
 * Currently displayed menu (matches `CURRENT_MENU_VERSION`).
 * UI components read from this; encoders stamp `CURRENT_MENU_VERSION` so the
 * displayed menu and the encoded cart are guaranteed to agree.
 */
export const MENU: MenuDocument = resolveCurrentMenuDocument();

const itemIndex = new Map<string, MenuItem>();
const itemCategoryIndex = new Map<string, MenuCategory>();

for (const cat of MENU.categories) {
  for (const item of cat.items) {
    itemIndex.set(item.id, item);
    itemCategoryIndex.set(item.id, cat);
  }
}

export function getItemById(id: string): MenuItem | undefined {
  return itemIndex.get(id);
}

export function listAllItems(): MenuItem[] {
  return [...itemIndex.values()];
}

export function getCategoryForItem(itemId: string): MenuCategory | undefined {
  return itemCategoryIndex.get(itemId);
}

export function getModifierGroupsForItem(itemId: string): ModifierGroup[] {
  const item = getItemById(itemId);
  if (!item?.modifierGroups?.length) {
    return [];
  }
  return item.modifierGroups;
}

export function resolveLocalizedText(
  value: LocalizedText,
  language: Language,
): string {
  return value[language] ?? value.en;
}

export type LineSelections = Record<string, string[]>;

export function normalizeSelections(selections: LineSelections = {}): LineSelections {
  const sortedGroupIds = Object.keys(selections).sort();
  const normalized: LineSelections = {};
  for (const groupId of sortedGroupIds) {
    const raw = selections[groupId];
    if (!Array.isArray(raw)) continue;
    const optionIds = [...new Set(raw.filter(Boolean))].sort();
    normalized[groupId] = optionIds;
  }
  return normalized;
}

export function selectionSignature(selections: LineSelections = {}): string {
  const normalized = normalizeSelections(selections);
  return Object.keys(normalized)
    .map((groupId) => `${groupId}:${normalized[groupId].join(",")}`)
    .join(";");
}

export function validateSelectionsForItem(
  itemId: string,
  inputSelections: LineSelections = {},
): { ok: true; normalized: LineSelections } | { ok: false; error: string } {
  const groups = getModifierGroupsForItem(itemId);
  const normalized = normalizeSelections(inputSelections);

  if (groups.length === 0) {
    if (Object.keys(normalized).length > 0) {
      return { ok: false, error: "Selections are not allowed for this item." };
    }
    return { ok: true, normalized: {} };
  }

  const allowedGroupIds = new Set(groups.map((g) => g.id));
  for (const groupId of Object.keys(normalized)) {
    if (!allowedGroupIds.has(groupId)) {
      return { ok: false, error: `Unknown modifier group: ${groupId}` };
    }
  }

  for (const group of groups) {
    const values = normalized[group.id] ?? [];
    const validOptionIds = new Set(group.options.map((opt) => opt.id));
    const groupLabel = resolveLocalizedText(group.title, "en");
    if (values.some((optionId) => !validOptionIds.has(optionId))) {
      return { ok: false, error: `Invalid option in ${groupLabel}.` };
    }
    if (group.selectionType === "single" && values.length > 1) {
      return { ok: false, error: `${groupLabel} allows only one selection.` };
    }
    if (values.length < group.minSelections || values.length > group.maxSelections) {
      return { ok: false, error: `${groupLabel} selection count is out of range.` };
    }
    if (group.required && values.length === 0) {
      return { ok: false, error: `${groupLabel} is required.` };
    }
  }

  return { ok: true, normalized };
}

export function getModifierSurchargeCents(
  itemId: string,
  selections: LineSelections = {},
): number {
  const groups = getModifierGroupsForItem(itemId);
  if (groups.length === 0) {
    return 0;
  }
  const normalized = normalizeSelections(selections);
  let sum = 0;
  for (const group of groups) {
    const picked = normalized[group.id] ?? [];
    if (picked.length === 0) continue;
    const optionIndex = new Map(group.options.map((option) => [option.id, option]));
    for (const optionId of picked) {
      const option = optionIndex.get(optionId);
      if (!option) continue;
      const delta = option.priceDeltaCents ?? 0;
      if (Number.isFinite(delta)) {
        sum += delta;
      }
    }
  }
  return sum;
}

export function getLineUnitPriceCents(
  itemId: string,
  selections: LineSelections = {},
): number | null {
  const item = getItemById(itemId);
  if (!item) {
    return null;
  }
  return item.priceCents + getModifierSurchargeCents(itemId, selections);
}

/** Cart line shape used by kitchen ticket formatting (post-decode). */
export type KitchenCartLineFromMetadata = HydratedCartLine;

/**
 * Decode Stripe PaymentIntent metadata into hydrated kitchen ticket lines using
 * the in-process menu-version registry. Suitable for consumers that ship the
 * full registry in-code (e.g. the webhook proxy during startup seed).
 */
export function parseKitchenLinesFromStripeMetadata(
  metadata: Record<string, string | undefined>,
): KitchenCartLineFromMetadata[] {
  const { lines } = decodeCartFromMetadataV1(metadata, getDecodeIndex);
  return lines;
}

export function getSelectionDisplayLines(
  itemId: string,
  selections: LineSelections = {},
  language: Language = "en",
): string[] {
  const groups = getModifierGroupsForItem(itemId);
  const normalized = normalizeSelections(selections);
  const rows: string[] = [];
  for (const group of groups) {
    const picked = normalized[group.id] ?? [];
    if (picked.length === 0) continue;
    const labels = picked
      .map((id) => group.options.find((opt) => opt.id === id)?.label)
      .map((label) => (label ? resolveLocalizedText(label, language) : undefined))
      .filter((label): label is string => Boolean(label));
    if (labels.length === 0) continue;
    rows.push(`${resolveLocalizedText(group.title, language)}: ${labels.join(", ")}`);
  }
  return rows;
}
