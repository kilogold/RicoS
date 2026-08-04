import { describe, expect, test } from "bun:test";
import type { MenuCatalogFile } from "@ricos/shared";
import { orderCategoriesByThemes } from "./menu-editor-utils";

function menuWithThemes(themes: MenuCatalogFile["themes"]): MenuCatalogFile {
  const categories = [
    { id: "cat_z", title: { en: "Z", es: "Z" }, notes: [], items: [] },
    { id: "cat_a", title: { en: "A", es: "A" }, notes: [], items: [] },
    { id: "cat_b", title: { en: "B", es: "B" }, notes: [], items: [] },
    { id: "cat_u", title: { en: "U", es: "U" }, notes: [], items: [] },
  ];
  return {
    catalogVersion: 1,
    publishedAt: "2026-01-01T00:00:00.000Z",
    restaurant: { en: "R", es: "R" },
    menuName: { en: "M", es: "M" },
    themes,
    categories,
    orderFees: { serviceFeeRate: 0.05 },
  };
}

describe("orderCategoriesByThemes", () => {
  test("orders by theme keys then category ids within each theme", () => {
    const menu = menuWithThemes({
      dinner: ["cat_b", "cat_a"],
      lunch: ["cat_z"],
    });
    expect(orderCategoriesByThemes(menu).map((c) => c.id)).toEqual(["cat_b", "cat_a", "cat_z", "cat_u"]);
  });

  test("appends unassigned categories in catalog array order", () => {
    const menu = menuWithThemes({ all_day: ["cat_a"] });
    expect(orderCategoriesByThemes(menu).map((c) => c.id)).toEqual(["cat_a", "cat_z", "cat_b", "cat_u"]);
  });
});
