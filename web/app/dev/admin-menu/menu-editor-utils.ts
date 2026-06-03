import type { MenuCatalogFile, MenuCategory, MenuItem, ModifierGroup, ModifierOption } from "@ricos/shared";

export const CENTS_PER_DOLLAR = 100;
export const DOLLAR_STEP = "0.05";
const TAX_PERCENT_MULTIPLIER = 100;

export function formatDollars(cents: number): string {
  return (cents / CENTS_PER_DOLLAR).toFixed(2);
}

export function parseDollars(value: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.round(numberValue * CENTS_PER_DOLLAR);
}

export function formatPercent(rate: number): string {
  return (rate * TAX_PERCENT_MULTIPLIER).toFixed(3).replace(/\.?0+$/, "");
}

export function parsePercent(value: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return numberValue / TAX_PERCENT_MULTIPLIER;
}

export function slugifyId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

export function itemDisplayName(item: MenuItem): string {
  return item.name.en.trim() || item.name.es.trim() || item.id;
}

export function makeNewCategory(existingCategories: MenuCategory[]): MenuCategory {
  const suffix = String(existingCategories.length + 1).padStart(2, "0");
  return {
    id: `cat_new_${Date.now().toString(36)}_${suffix}`,
    title: { en: "New category", es: "Nueva categoria" },
    notes: [],
    items: [],
  };
}

export function makeNewItem(existingItems: MenuItem[]): MenuItem {
  const suffix = String(existingItems.length + 1).padStart(2, "0");
  return {
    id: `item_new_${Date.now().toString(36)}_${suffix}`,
    name: { en: "New item", es: "Nuevo articulo" },
    description: { en: "", es: "" },
    priceCents: 0,
    salesTaxRate: 0.105,
    municipalTaxRate: 0.01,
    station: "default",
    modifierGroups: [],
  };
}

export function makeModifierGroup(existingGroups: ModifierGroup[] = []): ModifierGroup {
  const suffix = String(existingGroups.length + 1).padStart(2, "0");
  return {
    id: `mod_new_${Date.now().toString(36)}_${suffix}`,
    title: { en: "Choices", es: "Opciones" },
    selectionType: "single",
    required: false,
    minSelections: 0,
    maxSelections: 1,
    options: [],
  };
}

export function makeModifierOption(existingOptions: ModifierOption[] = []): ModifierOption {
  const suffix = String(existingOptions.length + 1).padStart(2, "0");
  return {
    id: `opt_new_${Date.now().toString(36)}_${suffix}`,
    label: { en: "New option", es: "Nueva opcion" },
  };
}

export function findSelectedItem(menu: MenuCatalogFile, categoryId: string, itemId: string) {
  const category = menu.categories.find((candidate) => candidate.id === categoryId);
  const item = category?.items.find((candidate) => candidate.id === itemId);
  return { category, item };
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildFieldPath(...parts: Array<string | number>): string {
  return parts.join(".");
}

export function countEditedItems(menu: MenuCatalogFile, baselineMenu: MenuCatalogFile): number {
  let count = 0;
  for (const category of menu.categories) {
    const baselineCategory = baselineMenu.categories.find((candidate) => candidate.id === category.id);
    for (const item of category.items) {
      const baselineItem = baselineCategory?.items.find((candidate) => candidate.id === item.id);
      if (!baselineItem || !valuesEqual(item, baselineItem)) count++;
    }
  }
  return count;
}

export function findCategory(menu: MenuCatalogFile, categoryId: string): MenuCategory | undefined {
  return menu.categories.find((category) => category.id === categoryId);
}

/** Categories in theme order, then category order within each theme; unassigned last. */
export function orderCategoriesByThemes(menu: MenuCatalogFile): MenuCategory[] {
  const byId = new Map(menu.categories.map((category) => [category.id, category]));
  const ordered: MenuCategory[] = [];
  const seen = new Set<string>();

  for (const themeName of Object.keys(menu.themes)) {
    for (const categoryId of menu.themes[themeName] ?? []) {
      if (seen.has(categoryId)) continue;
      const category = byId.get(categoryId);
      if (!category) continue;
      seen.add(categoryId);
      ordered.push(category);
    }
  }

  for (const category of menu.categories) {
    if (!seen.has(category.id)) ordered.push(category);
  }

  return ordered;
}

export function isCategoryEmpty(menu: MenuCatalogFile, categoryId: string): boolean {
  const category = findCategory(menu, categoryId);
  return category !== undefined && category.items.length === 0;
}

export function canDeleteCategory(menu: MenuCatalogFile, categoryId: string): boolean {
  return isCategoryEmpty(menu, categoryId);
}

export function isThemeEmpty(menu: MenuCatalogFile, themeName: string): boolean {
  return (menu.themes[themeName] ?? []).length === 0;
}

/** Empty themes may be deleted; cannot remove the only theme while categories still exist. */
export function canDeleteTheme(menu: MenuCatalogFile, themeName: string): boolean {
  if (!isThemeEmpty(menu, themeName)) return false;
  const themeCount = Object.keys(menu.themes).length;
  if (themeCount <= 1 && menu.categories.length > 0) return false;
  return true;
}

export function initialEditorSelection(menu: MenuCatalogFile) {
  const firstCategoryId =
    Object.values(menu.themes)[0]?.[0] ?? menu.categories[0]?.id ?? "";
  const firstCategory =
    menu.categories.find((category) => category.id === firstCategoryId) ?? menu.categories[0];
  return {
    categoryId: firstCategoryId,
    itemId: firstCategory?.items[0]?.id ?? "",
    structureTheme: Object.keys(menu.themes)[0] ?? "",
  };
}
