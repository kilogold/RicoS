import type { MenuCategory, MenuDocument } from "./menu-types";

export type ThemedMenuSection = {
  theme: string;
  categories: MenuCategory[];
};

/**
 * Resolve themes into display sections (theme order, then category order within each theme).
 * Parse-time validation guarantees every theme id exists in catalog.categories.
 */
export function buildThemedMenuSections(catalog: MenuDocument): ThemedMenuSection[] {
  const byId = new Map(catalog.categories.map((category) => [category.id, category]));
  const sections: ThemedMenuSection[] = [];

  for (const [theme, categoryIds] of Object.entries(catalog.themes)) {
    const categories = categoryIds.map((id) => {
      const category = byId.get(id);
      if (!category) {
        throw new Error(`Invalid menu: themes["${theme}"] unknown category "${id}"`);
      }
      return category;
    });
    sections.push({ theme, categories });
  }

  return sections;
}
