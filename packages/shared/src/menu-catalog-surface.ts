/**
 * Bound helpers for a single `MenuDocument` (runtime catalog surface).
 */

import type {
  Language,
  LineSelections,
  LocalizedText,
  MenuCategory,
  MenuDocument,
  MenuItem,
  ModifierGroup,
} from "./menu-types";
import {
  hasStaleInactiveSelections,
  isModifierGroupActive,
  pruneInactiveSelections,
} from "./modifier-visibility";

export type { LineSelections };

export type MenuCatalogSurface = {
  readonly catalog: MenuDocument;
  getItemById: (id: string) => MenuItem | undefined;
  listAllItems: () => MenuItem[];
  getCategoryForItem: (itemId: string) => MenuCategory | undefined;
  getModifierGroupsForItem: (itemId: string) => ModifierGroup[];
  getActiveModifierGroupsForItem: (itemId: string, selections: LineSelections) => ModifierGroup[];
  resolveLocalizedText: (value: LocalizedText, language: Language) => string;
  normalizeSelections: (selections: LineSelections) => LineSelections;
  selectionSignature: (selections: LineSelections) => string;
  validateSelectionsForItem: (
    itemId: string,
    inputSelections: LineSelections,
  ) => { ok: true; normalized: LineSelections } | { ok: false; error: string };
  getModifierSurchargeCents: (itemId: string, selections: LineSelections) => number;
  getLineUnitPriceCents: (itemId: string, selections: LineSelections) => number | null;
  getSelectionDisplayLines: (
    itemId: string,
    selections: LineSelections,
    language: Language,
  ) => string[];
};

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

function resolveLocalizedText(value: LocalizedText, language: Language): string {
  return value[language] ?? value.en;
}

export function createMenuCatalogSurface(catalog: MenuDocument): MenuCatalogSurface {
  const itemIndex = new Map<string, MenuItem>();
  const itemCategoryIndex = new Map<string, MenuCategory>();

  for (const cat of catalog.categories) {
    for (const item of cat.items) {
      itemIndex.set(item.id, item);
      itemCategoryIndex.set(item.id, cat);
    }
  }

  function getItemById(id: string): MenuItem | undefined {
    return itemIndex.get(id);
  }

  function listAllItems(): MenuItem[] {
    return [...itemIndex.values()];
  }

  function getCategoryForItem(itemId: string): MenuCategory | undefined {
    return itemCategoryIndex.get(itemId);
  }

  function getModifierGroupsForItem(itemId: string): ModifierGroup[] {
    const item = getItemById(itemId);
    if (!item?.modifierGroups?.length) {
      return [];
    }
    return item.modifierGroups;
  }

  function getActiveModifierGroupsForItem(
    itemId: string,
    selections: LineSelections = {},
  ): ModifierGroup[] {
    const groups = getModifierGroupsForItem(itemId);
    const normalized = normalizeSelections(selections);
    return groups.filter((group) => isModifierGroupActive(group, normalized));
  }

  function validateSelectionsForItem(
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

    if (hasStaleInactiveSelections(groups, normalized)) {
      return { ok: false, error: "Selections include inactive modifier groups." };
    }

    const pruned = pruneInactiveSelections(groups, normalized);

    const allowedGroupIds = new Set(groups.map((g) => g.id));
    for (const groupId of Object.keys(pruned)) {
      if (!allowedGroupIds.has(groupId)) {
        return { ok: false, error: `Unknown modifier group: ${groupId}` };
      }
    }

    for (const group of groups) {
      if (!isModifierGroupActive(group, pruned)) {
        continue;
      }
      const values = pruned[group.id] ?? [];
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

    return { ok: true, normalized: pruned };
  }

  function getModifierSurchargeCents(itemId: string, selections: LineSelections = {}): number {
    const groups = getModifierGroupsForItem(itemId);
    if (groups.length === 0) {
      return 0;
    }
    const normalized = pruneInactiveSelections(groups, normalizeSelections(selections));
    let sum = 0;
    for (const group of groups) {
      if (!isModifierGroupActive(group, normalized)) {
        continue;
      }
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

  function getLineUnitPriceCents(itemId: string, selections: LineSelections = {}): number | null {
    const item = getItemById(itemId);
    if (!item) {
      return null;
    }
    return item.priceCents + getModifierSurchargeCents(itemId, selections);
  }

  function getSelectionDisplayLines(
    itemId: string,
    selections: LineSelections = {},
    language: Language = "en",
  ): string[] {
    const groups = getModifierGroupsForItem(itemId);
    const normalized = pruneInactiveSelections(groups, normalizeSelections(selections));
    const rows: string[] = [];
    for (const group of groups) {
      if (!isModifierGroupActive(group, normalized)) {
        continue;
      }
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

  return {
    catalog,
    getItemById,
    listAllItems,
    getCategoryForItem,
    getModifierGroupsForItem,
    getActiveModifierGroupsForItem,
    resolveLocalizedText,
    normalizeSelections,
    selectionSignature,
    validateSelectionsForItem,
    getModifierSurchargeCents,
    getLineUnitPriceCents,
    getSelectionDisplayLines,
  };
}

export type { Language };
