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

const formatGroup = {
  id: "mod_format",
  title: { en: "Format", es: "Formato" },
  selectionType: "single",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  options: [
    { id: "opt_individual", label: { en: "Individual", es: "Individual" } },
    { id: "opt_combo", label: { en: "Combo", es: "Combo" }, priceDeltaCents: 399 },
  ],
};

const sideGroup = {
  id: "mod_combo_side",
  title: { en: "Side", es: "Lado" },
  selectionType: "single",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  visibleWhen: { groupId: "mod_format", optionIds: ["opt_combo"] },
  options: [{ id: "opt_fries", label: { en: "Fries", es: "Papas" } }],
};

describe("parseMenuCatalogFile visibleWhen", () => {
  test("accepts modifier group with visibleWhen", () => {
    const parsed = parseMenuCatalogFile(
      catalogWithItem({
        ...minimalItem,
        station: "B",
        modifierGroups: [formatGroup, sideGroup],
      }),
    );
    const groups = parsed.catalog.categories[0]?.items[0]?.modifierGroups ?? [];
    expect(groups[1]?.visibleWhen).toEqual({
      groupId: "mod_format",
      optionIds: ["opt_combo"],
    });
  });

  test("rejects visibleWhen with empty optionIds", () => {
    expect(() =>
      parseMenuCatalogFile(
        catalogWithItem({
          ...minimalItem,
          station: "B",
          modifierGroups: [
            {
              ...sideGroup,
              visibleWhen: { groupId: "mod_format", optionIds: [] },
            },
          ],
        }),
      ),
    ).toThrow(/visibleWhen optionIds/);
  });

  test("rejects visibleWhen with missing groupId", () => {
    expect(() =>
      parseMenuCatalogFile(
        catalogWithItem({
          ...minimalItem,
          station: "B",
          modifierGroups: [
            {
              ...sideGroup,
              visibleWhen: { optionIds: ["opt_combo"] },
            },
          ],
        }),
      ),
    ).toThrow(/visibleWhen groupId/);
  });
});
