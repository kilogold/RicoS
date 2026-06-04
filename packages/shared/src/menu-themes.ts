import { getThemeScheduleStatus } from "./menu-theme-availability";
import type { MenuCategory, MenuDocument } from "./menu-types";

export type ThemedMenuSection = {
  theme: string;
  categories: MenuCategory[];
  /** True when the theme has no schedule or is currently within its availability window. */
  scheduleActive: boolean;
};

export type BuildThemedMenuSectionsOptions = {
  now?: Date;
};

/**
 * Resolve themes into display sections (theme order, then category order within each theme).
 * Parse-time validation guarantees every theme id exists in catalog.categories.
 */
export function buildThemedMenuSections(
  catalog: MenuDocument,
  options?: BuildThemedMenuSectionsOptions,
): ThemedMenuSection[] {
  const now = options?.now ?? new Date();
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
    const status = getThemeScheduleStatus(catalog, theme, now);
    sections.push({
      theme,
      categories,
      scheduleActive: status === "always" || status === "active",
    });
  }

  return sections;
}
