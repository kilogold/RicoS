/**
 * Versioned menu catalog registry.
 *
 * Each entry is an immutable snapshot of the menu at publish time. The codec
 * stamps a `menuVersion` integer on every encoded cart; decoders resolve that
 * integer through this registry to recover prices and modifier definitions.
 *
 * Invariants:
 * - A version, once published, MUST NOT be mutated. Add a new version instead.
 * - Item / group / option ordering within a version is load-bearing: the codec
 *   references them by positional index.
 * - `CURRENT_MENU_VERSION` is what the web app stamps on new carts. The
 *   webhook consumer accepts any registered version (historical decode).
 */

import type {
  DecodeIndex,
  DecodeIndexGroup,
  DecodeIndexItem,
} from "../cart-codec.js";
import type { MenuDocument } from "../menu-types";
import { menuVersion1 } from "./v1";

/** Immutable snapshot of the menu at publish time. */
export type MenuVersion = {
  version: number;
  publishedAt: string;
  catalog: MenuDocument;
};

/**
 * Registry of all published menu versions.
 * Keyed by version integer. Do not mutate at runtime.
 */
export const MENU_VERSIONS: Readonly<Record<number, MenuVersion>> = Object.freeze({
  [menuVersion1.version]: menuVersion1,
});

/** Version stamped on carts produced by the current build of the web app. */
export const CURRENT_MENU_VERSION: number = menuVersion1.version;

/** Returns the raw MenuVersion snapshot for a given version integer, or undefined. */
export function getMenuVersion(version: number): MenuVersion | undefined {
  return MENU_VERSIONS[version];
}

/** Lists all published menu versions in ascending version order. */
export function listPublishedVersions(): MenuVersion[] {
  return Object.values(MENU_VERSIONS).sort((a, b) => a.version - b.version);
}

/**
 * Builds a DecodeIndex from a menu catalog.
 * Pure function; ordering matches `categories[*].items[*]` in the source.
 */
export function buildDecodeIndex(
  version: number,
  catalog: MenuDocument,
): DecodeIndex {
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
        groups,
      });
    }
  }
  return { version, items };
}

const decodeIndexCache = new Map<number, DecodeIndex>();

/**
 * Returns the decode index for a given menu version, memoized across calls.
 * Used by the codec as a `DecodeIndexLookup` callback.
 */
export function getDecodeIndex(version: number): DecodeIndex | undefined {
  const cached = decodeIndexCache.get(version);
  if (cached) return cached;
  const entry = MENU_VERSIONS[version];
  if (!entry) return undefined;
  const built = buildDecodeIndex(entry.version, entry.catalog);
  decodeIndexCache.set(version, built);
  return built;
}

/**
 * Deterministic JSON serialization with sorted object keys.
 *
 * Used as the input to content hashing so the hash is stable across runtimes
 * that may enumerate object keys in different orders. Arrays keep their order
 * (array order IS semantic for menu data: it defines the decode index).
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
