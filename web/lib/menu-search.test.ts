import { describe, expect, test } from "bun:test";
import type { MenuCategory, MenuItem, ThemedMenuSection } from "@ricos/shared";
import {
  countItemsInThemedSections,
  filterThemedMenuSections,
  menuItemMatchesSearch,
  normalizeMenuSearchQuery,
} from "./menu-search";

function item(partial: Partial<MenuItem> & Pick<MenuItem, "id" | "name">): MenuItem {
  return {
    description: { en: "", es: "" },
    priceCents: 100,
    station: "default",
    thumbnailPathname: "menu-thumbnails/x.webp",
    salesTaxRate: 0.105,
    municipalTaxRate: 0,
    ...partial,
  };
}

function category(
  partial: Partial<MenuCategory> & Pick<MenuCategory, "id" | "title" | "items">,
): MenuCategory {
  return {
    notes: [],
    ...partial,
  };
}

const burger = item({
  id: "burger",
  name: { en: "Classic Burger", es: "Hamburguesa Clasica" },
  description: { en: "Beef patty with cheese", es: "Carne con queso" },
});

const salad = item({
  id: "salad",
  name: { en: "Garden Salad", es: "Ensalada" },
  description: { en: "Fresh greens", es: "Verduras frescas" },
});

const burgersCat = category({
  id: "cat_burgers",
  title: { en: "Burgers", es: "Hamburguesas" },
  items: [burger],
});

const saladsCat = category({
  id: "cat_salads",
  title: { en: "Salads", es: "Ensaladas" },
  items: [salad],
});

const sections: ThemedMenuSection[] = [
  { theme: "Lunch", categories: [burgersCat, saladsCat], scheduleActive: true },
  {
    theme: "Sides",
    categories: [
      category({
        id: "cat_empty",
        title: { en: "Empty", es: "Vacio" },
        items: [],
      }),
    ],
    scheduleActive: true,
  },
];

describe("normalizeMenuSearchQuery", () => {
  test("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeMenuSearchQuery("  Classic   Burger  ")).toBe("classic burger");
  });
});

describe("menuItemMatchesSearch", () => {
  test("matches item name", () => {
    expect(menuItemMatchesSearch(burger, burgersCat, "burger", "en")).toBe(true);
  });

  test("matches description only", () => {
    expect(menuItemMatchesSearch(burger, burgersCat, "patty", "en")).toBe(true);
  });

  test("matches category title", () => {
    expect(menuItemMatchesSearch(salad, saladsCat, "salads", "en")).toBe(true);
  });

  test("is case insensitive", () => {
    expect(menuItemMatchesSearch(burger, burgersCat, "CLASSIC", "en")).toBe(true);
  });

  test("returns false when nothing matches", () => {
    expect(menuItemMatchesSearch(burger, burgersCat, "pizza", "en")).toBe(false);
  });
});

describe("filterThemedMenuSections", () => {
  test("empty query returns original sections reference", () => {
    const result = filterThemedMenuSections(sections, "   ", "en");
    expect(result).toBe(sections);
  });

  test("name match keeps item and parent category/theme", () => {
    const result = filterThemedMenuSections(sections, "burger", "en");
    expect(result).toHaveLength(1);
    expect(result[0]?.theme).toBe("Lunch");
    expect(result[0]?.categories).toHaveLength(1);
    expect(result[0]?.categories[0]?.id).toBe("cat_burgers");
    expect(result[0]?.categories[0]?.items.map((i) => i.id)).toEqual(["burger"]);
  });

  test("description-only match", () => {
    const result = filterThemedMenuSections(sections, "greens", "en");
    expect(result[0]?.categories[0]?.items.map((i) => i.id)).toEqual(["salad"]);
  });

  test("category title match includes all items in that category", () => {
    const result = filterThemedMenuSections(sections, "salads", "en");
    expect(result[0]?.categories[0]?.id).toBe("cat_salads");
    expect(result[0]?.categories[0]?.items.map((i) => i.id)).toEqual(["salad"]);
  });

  test("non-matching query returns empty array", () => {
    expect(filterThemedMenuSections(sections, "xyz-nope", "en")).toEqual([]);
  });

  test("prunes empty categories and themes", () => {
    const result = filterThemedMenuSections(sections, "burger", "en");
    expect(result.some((s) => s.theme === "Sides")).toBe(false);
    expect(result[0]?.categories.some((c) => c.id === "cat_salads")).toBe(false);
  });
});

describe("countItemsInThemedSections", () => {
  test("sums items across sections", () => {
    expect(countItemsInThemedSections(sections)).toBe(2);
    expect(countItemsInThemedSections(filterThemedMenuSections(sections, "burger", "en"))).toBe(1);
  });
});
