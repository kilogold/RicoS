import { canonicalJson } from "./menu-versions/index";
import type {
  LocalizedText,
  MenuCategory,
  MenuDocument,
  MenuItem,
  ModifierGroup,
  OrderFeeRates,
} from "./menu-types";

type ModifierGroupRegistryRaw = Record<string, Record<string, unknown>>;

export type MenuItemOnDisk = Omit<MenuItem, "modifierGroups"> & {
  modifierGroupRefs?: string[];
};

export type MenuCategoryOnDisk = Omit<MenuCategory, "items"> & {
  modifierGroupRefs?: string[];
  items: MenuItemOnDisk[];
};

export type MenuCatalogFileOnDisk = {
  catalogVersion: number;
  publishedAt: string;
  restaurant: LocalizedText;
  menuName: LocalizedText;
  categories: MenuCategoryOnDisk[];
  orderFees: OrderFeeRates;
  modifierGroups?: Record<string, ModifierGroup>;
};

type ExpandedMenuCatalogFile = MenuDocument & {
  catalogVersion: number;
  publishedAt: string;
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseModifierGroupRefs(
  rawRefs: unknown,
  ctx: string,
): string[] | undefined {
  if (rawRefs === undefined) return undefined;
  if (!Array.isArray(rawRefs)) {
    throw new Error(`Invalid menu: ${ctx} modifierGroupRefs`);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rawRefs.length; i++) {
    const ref = rawRefs[i];
    if (typeof ref !== "string" || !ref) {
      throw new Error(`Invalid menu: ${ctx} modifierGroupRefs[${i}]`);
    }
    if (seen.has(ref)) {
      throw new Error(`Invalid menu: ${ctx} modifierGroupRefs duplicate id "${ref}"`);
    }
    seen.add(ref);
    out.push(ref);
  }
  return out;
}

function buildRegistry(raw: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const rawRegistry = raw.modifierGroups;
  if (rawRegistry === undefined) return new Map();
  if (!rawRegistry || typeof rawRegistry !== "object" || Array.isArray(rawRegistry)) {
    throw new Error("Invalid menu: modifierGroups");
  }
  const registry = new Map<string, Record<string, unknown>>();
  for (const [id, entry] of Object.entries(rawRegistry as ModifierGroupRegistryRaw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid menu: modifierGroups["${id}"]`);
    }
    const candidate: Record<string, unknown> = deepClone(entry);
    if (candidate.id === undefined) {
      candidate.id = id;
    } else if (candidate.id !== id) {
      throw new Error(`Invalid menu: modifierGroups["${id}"] id mismatch`);
    }
    registry.set(id, candidate);
  }
  return registry;
}

/**
 * Expand compact on-disk refs into inline item.modifierGroups.
 * Items must not carry inline modifierGroups; use modifierGroupRefs + top-level registry.
 */
export function resolveMenuCatalogRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = deepClone(raw);
  const registry = buildRegistry(out);
  const categories = out.categories;
  if (!Array.isArray(categories)) return out;

  for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
    const rawCategory = categories[categoryIndex];
    if (!rawCategory || typeof rawCategory !== "object" || Array.isArray(rawCategory)) continue;
    const category = rawCategory as Record<string, unknown>;
    const categoryCtx = `categories[${categoryIndex}]`;
    const categoryRefs = parseModifierGroupRefs(category.modifierGroupRefs, categoryCtx);
    delete category.modifierGroupRefs;

    const items = category.items;
    if (!Array.isArray(items)) continue;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const rawItem = items[itemIndex];
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
      const item = rawItem as Record<string, unknown>;
      const itemCtx = `${categoryCtx}.items[${itemIndex}]`;
      const itemRefs = parseModifierGroupRefs(item.modifierGroupRefs, itemCtx);
      if (item.modifierGroups !== undefined) {
        throw new Error(`Invalid menu: ${itemCtx} inline modifierGroups are not allowed; use modifierGroupRefs`);
      }
      const refs = itemRefs ?? categoryRefs;
      delete item.modifierGroupRefs;
      if (!refs) continue;
      const groups: Record<string, unknown>[] = refs.map((groupId) => {
        const group = registry.get(groupId);
        if (!group) throw new Error(`Invalid menu: ${itemCtx} unknown modifier group "${groupId}"`);
        return deepClone(group);
      });
      item.modifierGroups = groups;
    }
  }
  delete out.modifierGroups;
  return out;
}

/**
 * Convert expanded catalog into compact on-disk format.
 */
export function compactMenuCatalogForDisk(file: ExpandedMenuCatalogFile): MenuCatalogFileOnDisk {
  const registry = new Map<string, ModifierGroup>();
  const categoriesWithRefs = file.categories.map((category): MenuCategoryOnDisk => {
    const itemPayloads = category.items.map((item) => {
      const refs = (item.modifierGroups ?? []).map((group) => {
        const existing = registry.get(group.id);
        if (!existing) {
          registry.set(group.id, deepClone(group));
        } else if (canonicalJson(existing) !== canonicalJson(group)) {
          throw new Error(`Invalid menu: modifier group id collision "${group.id}"`);
        }
        return group.id;
      });
      const itemOnDisk: MenuItemOnDisk = {
        id: item.id,
        name: deepClone(item.name),
        description: deepClone(item.description),
        priceCents: item.priceCents,
        station: item.station,
        salesTaxRate: item.salesTaxRate,
        municipalTaxRate: item.municipalTaxRate,
      };
      return { itemOnDisk, refs };
    });

    const firstRefs = itemPayloads[0]?.refs;
    const useCategoryRefs =
      !!firstRefs &&
      firstRefs.length > 0 &&
      itemPayloads.every((payload) => canonicalJson(payload.refs) === canonicalJson(firstRefs));

    return {
      id: category.id,
      title: deepClone(category.title),
      notes: deepClone(category.notes),
      ...(useCategoryRefs ? { modifierGroupRefs: firstRefs } : {}),
      items: itemPayloads.map(({ itemOnDisk, refs }) => ({
        ...itemOnDisk,
        ...(!useCategoryRefs && refs.length > 0 ? { modifierGroupRefs: refs } : {}),
      })),
    };
  });

  const compact: MenuCatalogFileOnDisk = {
    catalogVersion: file.catalogVersion,
    publishedAt: file.publishedAt,
    restaurant: deepClone(file.restaurant),
    menuName: deepClone(file.menuName),
    categories: categoriesWithRefs,
    orderFees: deepClone(file.orderFees),
  };
  if (registry.size > 0) {
    compact.modifierGroups = Object.fromEntries(registry.entries());
  }
  return compact;
}
