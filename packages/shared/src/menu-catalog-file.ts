/**
 * On-disk `menu.json`: release fields plus `MenuDocument` body.
 * Hashing uses the full manifest (not `catalog_json` alone).
 */

import { canonicalJson } from "./menu-versions/index";
import { resolveMenuCatalogRaw } from "./menu-catalog-compact";
import type {
  LocalizedText,
  MenuCategory,
  MenuDocument,
  MenuItem,
  MenuThemes,
  ModifierGroup,
  ModifierOption,
  ModifierVisibilityRule,
  OrderFeeRates,
  PrintStation,
} from "./menu-types";

/** Same key shape as root `menu.json` (serializable manifest for hashing). */
export type MenuCatalogFile = MenuDocument & {
  catalogVersion: number;
  publishedAt: string;
};

export type ParsedMenuCatalogFile = {
  catalogVersion: number;
  publishedAtIso: string;
  catalog: MenuDocument;
};

function isLocalizedText(x: unknown): x is LocalizedText {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as LocalizedText).en === "string" &&
    typeof (x as LocalizedText).es === "string"
  );
}

function parseModifierOption(raw: unknown, ctx: string): ModifierOption {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid menu: ${ctx} option`);
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) throw new Error(`Invalid menu: ${ctx} option id`);
  if (!isLocalizedText(o.label)) throw new Error(`Invalid menu: ${ctx} option label`);
  const out: ModifierOption = { id: o.id, label: o.label };
  if (o.priceDeltaCents !== undefined) {
    if (typeof o.priceDeltaCents !== "number" || !Number.isFinite(o.priceDeltaCents)) {
      throw new Error(`Invalid menu: ${ctx} option priceDeltaCents`);
    }
    out.priceDeltaCents = o.priceDeltaCents;
  }
  return out;
}

function parseModifierVisibilityRule(raw: unknown, ctx: string): ModifierVisibilityRule {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid menu: ${ctx} visibleWhen`);
  const v = raw as Record<string, unknown>;
  if (typeof v.groupId !== "string" || !v.groupId) {
    throw new Error(`Invalid menu: ${ctx} visibleWhen groupId`);
  }
  if (!Array.isArray(v.optionIds) || v.optionIds.length === 0) {
    throw new Error(`Invalid menu: ${ctx} visibleWhen optionIds`);
  }
  const optionIds: string[] = [];
  for (let i = 0; i < v.optionIds.length; i++) {
    const optionId = v.optionIds[i];
    if (typeof optionId !== "string" || !optionId) {
      throw new Error(`Invalid menu: ${ctx} visibleWhen optionIds[${i}]`);
    }
    optionIds.push(optionId);
  }
  return { groupId: v.groupId, optionIds };
}

function parseModifierGroup(raw: unknown, ctx: string): ModifierGroup {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid menu: ${ctx} group`);
  const g = raw as Record<string, unknown>;
  if (typeof g.id !== "string" || !g.id) throw new Error(`Invalid menu: ${ctx} group id`);
  if (!isLocalizedText(g.title)) throw new Error(`Invalid menu: ${ctx} group title`);
  if (g.selectionType !== "single" && g.selectionType !== "multiple") {
    throw new Error(`Invalid menu: ${ctx} group selectionType`);
  }
  if (typeof g.required !== "boolean") throw new Error(`Invalid menu: ${ctx} group required`);
  if (typeof g.minSelections !== "number" || !Number.isInteger(g.minSelections)) {
    throw new Error(`Invalid menu: ${ctx} group minSelections`);
  }
  if (typeof g.maxSelections !== "number" || !Number.isInteger(g.maxSelections)) {
    throw new Error(`Invalid menu: ${ctx} group maxSelections`);
  }
  if (!Array.isArray(g.options)) throw new Error(`Invalid menu: ${ctx} group options`);
  const group: ModifierGroup = {
    id: g.id,
    title: g.title,
    selectionType: g.selectionType,
    required: g.required,
    minSelections: g.minSelections,
    maxSelections: g.maxSelections,
    options: g.options.map((opt, i) => parseModifierOption(opt, `${ctx}[${i}]`)),
  };
  if (g.visibleWhen !== undefined) {
    group.visibleWhen = parseModifierVisibilityRule(g.visibleWhen, `${ctx}.visibleWhen`);
  }
  return group;
}

function parsePrintStation(raw: unknown, ctx: string): PrintStation {
  if (raw !== "A" && raw !== "B" && raw !== "default") {
    throw new Error(`Invalid menu: ${ctx} station must be "A", "B", or "default"`);
  }
  return raw;
}

function parseMenuItem(raw: unknown, ctx: string): MenuItem {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid menu: ${ctx} item`);
  const it = raw as Record<string, unknown>;
  if (typeof it.id !== "string" || !it.id) throw new Error(`Invalid menu: ${ctx} item id`);
  if (!isLocalizedText(it.name)) throw new Error(`Invalid menu: ${ctx} item name`);
  if (!isLocalizedText(it.description)) throw new Error(`Invalid menu: ${ctx} item description`);
  if (typeof it.priceCents !== "number" || !Number.isInteger(it.priceCents)) {
    throw new Error(`Invalid menu: ${ctx} item priceCents`);
  }
  if (it.station === undefined) {
    throw new Error(`Invalid menu: ${ctx} item station is required`);
  }
  const item: MenuItem = {
    id: it.id,
    name: it.name,
    description: it.description,
    priceCents: it.priceCents,
    station: parsePrintStation(it.station, `${ctx}.station`),
    salesTaxRate: parseDecimalFeeRate(it.salesTaxRate, `${ctx}.salesTaxRate`),
    municipalTaxRate: parseDecimalFeeRate(it.municipalTaxRate, `${ctx}.municipalTaxRate`),
  };
  if (it.modifierGroups !== undefined) {
    if (!Array.isArray(it.modifierGroups)) {
      throw new Error(`Invalid menu: ${ctx} item modifierGroups`);
    }
    item.modifierGroups = it.modifierGroups.map((mg, i) =>
      parseModifierGroup(mg, `${ctx}.modifierGroups[${i}]`),
    );
  }
  return item;
}

function parseMenuCategory(raw: unknown, ctx: string): MenuCategory {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid menu: ${ctx} category`);
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id) throw new Error(`Invalid menu: ${ctx} category id`);
  if (!isLocalizedText(c.title)) throw new Error(`Invalid menu: ${ctx} category title`);
  if (!Array.isArray(c.notes)) throw new Error(`Invalid menu: ${ctx} category notes`);
  const notes: LocalizedText[] = [];
  for (let i = 0; i < c.notes.length; i++) {
    const n = c.notes[i];
    if (!isLocalizedText(n)) throw new Error(`Invalid menu: ${ctx} notes[${i}]`);
    notes.push(n);
  }
  if (!Array.isArray(c.items)) throw new Error(`Invalid menu: ${ctx} category items`);
  return {
    id: c.id,
    title: c.title,
    notes,
    items: c.items.map((it, i) => parseMenuItem(it, `${ctx}.items[${i}]`)),
  };
}

function parseDecimalFeeRate(rawRate: unknown, rateFieldName: string): number {
  if (typeof rawRate !== "number" || !Number.isFinite(rawRate) || rawRate < 0 || rawRate >= 1) {
    throw new Error(`Invalid menu: ${rateFieldName} must be a number in [0, 1)`);
  }
  return rawRate;
}

function parseOrderFees(rawOrderFees: unknown): OrderFeeRates {
  if (!rawOrderFees || typeof rawOrderFees !== "object" || Array.isArray(rawOrderFees)) {
    throw new Error("Invalid menu: orderFees");
  }
  const orderFeesFields = rawOrderFees as Record<string, unknown>;
  return {
    serviceFeeRate: parseDecimalFeeRate(orderFeesFields.serviceFeeRate, "orderFees.serviceFeeRate"),
  };
}

function parseThemes(raw: unknown, categoryIds: Set<string>): MenuThemes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid menu: themes");
  }
  if (categoryIds.size === 0) {
    if (Object.keys(raw as Record<string, unknown>).length > 0) {
      throw new Error("Invalid menu: themes must be empty when there are no categories");
    }
    return {};
  }
  const themes: MenuThemes = {};
  const assigned = new Set<string>();

  for (const [theme, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!theme) throw new Error("Invalid menu: themes empty theme key");
    if (!Array.isArray(value)) throw new Error(`Invalid menu: themes["${theme}"]`);
    const categoryIdList: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const categoryId = value[i];
      if (typeof categoryId !== "string" || !categoryId) {
        throw new Error(`Invalid menu: themes["${theme}"][${i}]`);
      }
      if (!categoryIds.has(categoryId)) {
        throw new Error(`Invalid menu: themes["${theme}"] unknown category "${categoryId}"`);
      }
      if (assigned.has(categoryId)) {
        throw new Error(`Invalid menu: themes duplicate category "${categoryId}"`);
      }
      assigned.add(categoryId);
      categoryIdList.push(categoryId);
    }
    themes[theme] = categoryIdList;
  }

  if (Object.keys(themes).length === 0) throw new Error("Invalid menu: themes");

  for (const categoryId of categoryIds) {
    if (!assigned.has(categoryId)) {
      throw new Error(`Invalid menu: themes missing category "${categoryId}"`);
    }
  }

  return themes;
}

function parseMenuDocumentFromRoot(raw: Record<string, unknown>): MenuDocument {
  if (!isLocalizedText(raw.restaurant)) throw new Error("Invalid menu: restaurant");
  if (!isLocalizedText(raw.menuName)) throw new Error("Invalid menu: menuName");
  if (!Array.isArray(raw.categories)) throw new Error("Invalid menu: categories");
  const categories = raw.categories.map((cat, i) => parseMenuCategory(cat, `categories[${i}]`));
  const categoryIds = new Set(categories.map((category) => category.id));
  const themes = parseThemes(raw.themes, categoryIds);
  return {
    restaurant: raw.restaurant,
    menuName: raw.menuName,
    themes,
    categories,
    orderFees: parseOrderFees(raw.orderFees),
  };
}

/**
 * Validate and parse the on-disk catalog file (e.g. root `menu.json`).
 */
export function parseMenuCatalogFile(raw: unknown): ParsedMenuCatalogFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid menu catalog: expected object");
  }
  const o = raw as Record<string, unknown>;
  const cv = o.catalogVersion;
  if (typeof cv !== "number" || !Number.isInteger(cv) || cv < 1) {
    throw new Error("Invalid menu catalog: catalogVersion must be a positive integer");
  }
  const publishedAtRaw = o.publishedAt;
  if (typeof publishedAtRaw !== "string" || !publishedAtRaw.trim()) {
    throw new Error("Invalid menu catalog: publishedAt");
  }
  const publishedAtMs = Date.parse(publishedAtRaw);
  if (!Number.isFinite(publishedAtMs)) {
    throw new Error("Invalid menu catalog: publishedAt is not a valid date");
  }
  const publishedAtIso = new Date(publishedAtMs).toISOString();
  const resolved = resolveMenuCatalogRaw(o);
  const catalog = parseMenuDocumentFromRoot(resolved);
  return { catalogVersion: cv, publishedAtIso, catalog };
}

/**
 * Reassemble the manifest for hashing (must match `parseMenuCatalogFile` + same ms epoch).
 */
export function buildManifestForHash(params: {
  catalogVersion: number;
  publishedAtMs: number;
  catalog: MenuDocument;
}): MenuCatalogFile {
  const { catalogVersion, publishedAtMs, catalog } = params;
  return {
    catalogVersion,
    publishedAt: new Date(publishedAtMs).toISOString(),
    restaurant: catalog.restaurant,
    menuName: catalog.menuName,
    themes: catalog.themes,
    categories: catalog.categories,
    orderFees: catalog.orderFees,
  };
}

export async function computeMenuContentHash(manifest: MenuCatalogFile): Promise<string> {
  const json = canonicalJson(manifest);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
