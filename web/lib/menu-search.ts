/**
 * Client-side menu search helpers.
 *
 * Mental model: the storefront already has a themed tree
 *   Theme → Category → Items
 * Search does not flatten that into a results list. It walks the same tree,
 * keeps items that match the query, then drops empty categories and themes
 * so MenuGrid can keep rendering the usual layout with a smaller dataset.
 *
 * Example — query "burger":
 *   Lunch
 *     Burgers  → [Classic Burger]   ← kept
 *     Salads   → [Garden Salad]     ← dropped (no match)
 *   Sides
 *     Empty    → []                 ← dropped (no items left)
 * Result: only Lunch → Burgers → Classic Burger.
 */

import type {
  Language,
  LocalizedText,
  MenuCategory,
  MenuItem,
  ThemedMenuSection,
} from "@ricos/shared";

/**
 * Turn raw input into a stable comparison string.
 * "  Classic   Burger  " → "classic burger"
 * so casing and extra spaces never change match behavior.
 */
export function normalizeMenuSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Pick the string we search against for a bilingual field.
 * Prefer the active language; if that slot is blank, fall back to the other.
 * Example: language "es" and name.es is empty → use name.en.
 */
function localizedForSearch(value: LocalizedText, language: Language): string {
  const primary = value[language]?.trim();
  if (primary) return primary;
  const fallback = language === "en" ? value.es : value.en;
  return fallback?.trim() ?? "";
}

/**
 * Does this item belong in the search results?
 *
 * We treat the query as a substring against three fields (any one is enough):
 *   1. item name         — "burger" matches "Classic Burger"
 *   2. item description  — "patty" matches "Beef patty with cheese"
 *   3. category title    — "salads" keeps every item under Salads
 *
 * Matching is case-insensitive via normalizeMenuSearchQuery.
 * An empty/whitespace query matches everything (caller usually short-circuits first).
 */
export function menuItemMatchesSearch(
  item: MenuItem,
  category: MenuCategory,
  query: string,
  language: Language,
): boolean {
  const q = normalizeMenuSearchQuery(query);

  // Early out:
  // Empty query = "not searching" → every item matches, stays visible.
  // (filterThemedMenuSections usually returns early before calling us;
  // this is the defensive default for direct callers.)
  if (!q) return true;

  const haystacks = [
    localizedForSearch(item.name, language),
    localizedForSearch(item.description, language),
    localizedForSearch(category.title, language),
  ];

  return haystacks.some((text) => text.toLowerCase().includes(q));
}

/**
 * Narrow a full themed menu to only matching branches.
 *
 * Flow for a non-empty query:
 *   1. For each theme, filter each category's items with menuItemMatchesSearch.
 *   2. Drop categories that ended up with zero items.
 *   3. Drop themes that ended up with zero categories.
 *
 * Empty query returns the original `sections` reference unchanged — no copy,
 * so the "not searching" path stays cheap and identity-stable.
 */
export function filterThemedMenuSections(
  sections: ThemedMenuSection[],
  query: string,
  language: Language,
): ThemedMenuSection[] {
  const q = normalizeMenuSearchQuery(query);
  if (!q) return sections;

  // Walk the themed tree and prune non-matches from the inside out.
  return sections
    // For each theme section, keep theme metadata but rebuild its categories.
    .map((section) => ({
      ...section, // e.g. theme name, scheduleActive — unchanged
      categories: section.categories
        // For each category, keep category metadata but rebuild its items.
        .map((category) => ({
          ...category, // e.g. id, title, notes — unchanged
          items: category.items
            // Keep only items whose name, description, or category title matches q.
            .filter((item) => menuItemMatchesSearch(item, category, q, language),
          ),
        }))
        // Drop categories that have no matching items left (empty headings).
        .filter((category) => category.items.length > 0),
    }))
    // Drop themes that have no categories left (empty theme blocks).
    .filter((section) => section.categories.length > 0);
}

/**
 * How many item cards would MenuGrid render for these sections?
 * Used for the "Showing N items for 'query'" status line.
 */
export function countItemsInThemedSections(sections: ThemedMenuSection[]): number {
  return sections.reduce(
    (total_sum, section) =>
      total_sum + section.categories.reduce((categories_sum, category) => categories_sum + category.items.length, 0),
    0
  );
}
