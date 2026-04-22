import menuData from "./menu.json" with { type: "json" };

export type SelectionType = "single" | "multiple";
export type Language = "en" | "es";
export type LocalizedText = {
  en: string;
  es: string;
};

export const DEFAULT_LANGUAGE: Language = "es";

export type ModifierOption = {
  id: string;
  label: LocalizedText;
};

export type ModifierGroup = {
  id: string;
  title: LocalizedText;
  selectionType: SelectionType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  priceCents: number;
  modifierGroups?: ModifierGroup[];
};

export type MenuCategory = {
  id: string;
  title: LocalizedText;
  notes: LocalizedText[];
  items: MenuItem[];
};

export type MenuDocument = {
  restaurant: LocalizedText;
  menuName: LocalizedText;
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

/** Cart line shape used by kitchen ticket formatting (Stripe PaymentIntent metadata). */
export type KitchenCartLineFromMetadata = {
  id: string;
  quantity: number;
  selections: LineSelections;
};

/**
 * Parse `line_count` / `line_*` JSON blobs from Stripe PaymentIntent.metadata
 * into cart lines for kitchen tickets. Unknown menu ids are still included (warn only).
 */
export function parseKitchenLinesFromStripeMetadata(
  metadata: Record<string, string | undefined>,
): KitchenCartLineFromMetadata[] {
  const countRaw = metadata.line_count;
  const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
  const lines: KitchenCartLineFromMetadata[] = [];
  if (!Number.isFinite(count) || count <= 0) {
    return lines;
  }
  for (let i = 0; i < count; i += 1) {
    const raw = metadata[`line_${i}`];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("Invalid line metadata JSON:", raw);
      continue;
    }
    const data = parsed as {
      i?: unknown;
      q?: unknown;
      s?: unknown;
    };
    const id = typeof data.i === "string" ? data.i : "";
    const quantity = typeof data.q === "number" ? data.q : Number.NaN;
    const selections =
      data.s && typeof data.s === "object"
        ? normalizeSelections(data.s as Record<string, string[]>)
        : {};
    if (id && Number.isFinite(quantity) && quantity > 0) {
      if (!getItemById(id)) {
        console.warn("Unknown menu id in metadata:", id);
      }
      lines.push({ id, quantity, selections });
    }
  }
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
