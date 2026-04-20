import menuData from "./menu.json" with { type: "json" };

export type SelectionType = "single" | "multiple";

export type ModifierOption = {
  id: string;
  label: string;
};

export type ModifierGroup = {
  id: string;
  title: string;
  selectionType: SelectionType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  modifierGroups?: ModifierGroup[];
};

export type MenuCategory = {
  id: string;
  title: string;
  notes: string[];
  items: MenuItem[];
};

export type MenuDocument = {
  restaurant: string;
  menuName: string;
  categories: MenuCategory[];
};

export const MENU: MenuDocument = menuData as MenuDocument;

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
    if (values.some((optionId) => !validOptionIds.has(optionId))) {
      return { ok: false, error: `Invalid option in ${group.title}.` };
    }
    if (group.selectionType === "single" && values.length > 1) {
      return { ok: false, error: `${group.title} allows only one selection.` };
    }
    if (values.length < group.minSelections || values.length > group.maxSelections) {
      return { ok: false, error: `${group.title} selection count is out of range.` };
    }
    if (group.required && values.length === 0) {
      return { ok: false, error: `${group.title} is required.` };
    }
  }

  return { ok: true, normalized };
}

export function getSelectionDisplayLines(
  itemId: string,
  selections: LineSelections = {},
): string[] {
  const groups = getModifierGroupsForItem(itemId);
  const normalized = normalizeSelections(selections);
  const rows: string[] = [];
  for (const group of groups) {
    const picked = normalized[group.id] ?? [];
    if (picked.length === 0) continue;
    const labels = picked
      .map((id) => group.options.find((opt) => opt.id === id)?.label)
      .filter((label): label is string => Boolean(label));
    if (labels.length === 0) continue;
    rows.push(`${group.title}: ${labels.join(", ")}`);
  }
  return rows;
}
