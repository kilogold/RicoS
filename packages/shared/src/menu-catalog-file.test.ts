import { describe, expect, test } from "bun:test";
import { parseMenuCatalogFile } from "./menu-catalog-file";

const minimalItem = {
  id: "item_test",
  name: { en: "Test", es: "Test" },
  description: { en: "", es: "" },
  priceCents: 100,
  salesTaxRate: 0.1,
  municipalTaxRate: 0.01,
};

function catalogWithItem(item: Record<string, unknown>) {
  return {
    catalogVersion: 1,
    publishedAt: "2026-01-01T00:00:00.000Z",
    restaurant: { en: "R", es: "R" },
    menuName: { en: "M", es: "M" },
    orderFees: { serviceFeeRate: 0.05 },
    categories: [
      {
        id: "cat_1",
        title: { en: "C", es: "C" },
        notes: [],
        items: [item],
      },
    ],
  };
}

describe("parseMenuCatalogFile station", () => {
  test("rejects item without station", () => {
    expect(() => parseMenuCatalogFile(catalogWithItem(minimalItem))).toThrow(/station/);
  });

  test("rejects invalid station", () => {
    expect(() =>
      parseMenuCatalogFile(catalogWithItem({ ...minimalItem, station: "kitchen" })),
    ).toThrow(/station/);
  });

  test("accepts valid station", () => {
    const parsed = parseMenuCatalogFile(catalogWithItem({ ...minimalItem, station: "B" }));
    expect(parsed.catalog.categories[0]?.items[0]?.station).toBe("B");
  });
});
