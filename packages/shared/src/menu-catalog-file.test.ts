import { describe, expect, test } from "bun:test";
import {
  buildManifestForHash,
  parseExpandedMenuCatalogFile,
  parseMenuCatalogFile,
} from "./menu-catalog-file";
import { compactMenuCatalogForDisk } from "./menu-catalog-compact";

const minimalItem = {
  id: "item_test",
  name: { en: "Test", es: "Test" },
  description: { en: "", es: "" },
  priceCents: 100,
  salesTaxRate: 0.1,
  municipalTaxRate: 0.01,
};

const defaultThemes = { T: ["cat_1"] };

function catalogWithItem(item: Record<string, unknown>) {
  return {
    catalogVersion: 1,
    publishedAt: "2026-01-01T00:00:00.000Z",
    restaurant: { en: "R", es: "R" },
    menuName: { en: "M", es: "M" },
    themes: defaultThemes,
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

function catalogWithRegistry(
  item: Record<string, unknown>,
  registry: Record<string, unknown>,
  refs: string[],
) {
  return {
    catalogVersion: 1,
    publishedAt: "2026-01-01T00:00:00.000Z",
    restaurant: { en: "R", es: "R" },
    menuName: { en: "M", es: "M" },
    themes: defaultThemes,
    orderFees: { serviceFeeRate: 0.05 },
    modifierGroups: registry,
    categories: [
      {
        id: "cat_1",
        title: { en: "C", es: "C" },
        notes: [],
        items: [{ ...item, modifierGroupRefs: refs }],
      },
    ],
  };
}

describe("parseMenuCatalogFile visibleWhen", () => {
  test("accepts modifier group with visibleWhen via registry", () => {
    const parsed = parseMenuCatalogFile(
      catalogWithRegistry(
        { ...minimalItem, station: "B" },
        { mod_format: formatGroup, mod_combo_side: sideGroup },
        ["mod_format", "mod_combo_side"],
      ),
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
        catalogWithRegistry(
          { ...minimalItem, station: "B" },
          { mod_combo_side: { ...sideGroup, visibleWhen: { groupId: "mod_format", optionIds: [] } } },
          ["mod_combo_side"],
        ),
      ),
    ).toThrow(/visibleWhen optionIds/);
  });

  test("rejects visibleWhen with missing groupId", () => {
    expect(() =>
      parseMenuCatalogFile(
        catalogWithRegistry(
          { ...minimalItem, station: "B" },
          { mod_combo_side: { ...sideGroup, visibleWhen: { optionIds: ["opt_combo"] } } },
          ["mod_combo_side"],
        ),
      ),
    ).toThrow(/visibleWhen groupId/);
  });

  test("rejects inline modifierGroups on item", () => {
    expect(() =>
      parseMenuCatalogFile(
        catalogWithItem({ ...minimalItem, station: "B", modifierGroups: [formatGroup] }),
      ),
    ).toThrow(/inline modifierGroups are not allowed/);
  });
});

describe("parseMenuCatalogFile compact refs", () => {
  test("resolves category-level modifierGroupRefs", () => {
    const parsed = parseMenuCatalogFile({
      ...catalogWithItem({ ...minimalItem, station: "B" }),
      modifierGroups: {
        mod_format: formatGroup,
      },
      categories: [
        {
          id: "cat_1",
          title: { en: "C", es: "C" },
          notes: [],
          modifierGroupRefs: ["mod_format"],
          items: [{ ...minimalItem, station: "B" }, { ...minimalItem, id: "item_2", station: "B" }],
        },
      ],
    });
    const item1Groups = parsed.catalog.categories[0]?.items[0]?.modifierGroups ?? [];
    const item2Groups = parsed.catalog.categories[0]?.items[1]?.modifierGroups ?? [];
    expect(item1Groups.map((g) => g.id)).toEqual(["mod_format"]);
    expect(item2Groups.map((g) => g.id)).toEqual(["mod_format"]);
  });

  test("item refs override category refs", () => {
    const parsed = parseMenuCatalogFile({
      ...catalogWithItem({ ...minimalItem, station: "B" }),
      modifierGroups: {
        mod_format: formatGroup,
        mod_combo_side: sideGroup,
      },
      categories: [
        {
          id: "cat_1",
          title: { en: "C", es: "C" },
          notes: [],
          modifierGroupRefs: ["mod_format"],
          items: [
            { ...minimalItem, station: "B" },
            { ...minimalItem, id: "item_2", station: "B", modifierGroupRefs: ["mod_combo_side"] },
          ],
        },
      ],
    });
    const item1Groups = parsed.catalog.categories[0]?.items[0]?.modifierGroups ?? [];
    const item2Groups = parsed.catalog.categories[0]?.items[1]?.modifierGroups ?? [];
    expect(item1Groups.map((g) => g.id)).toEqual(["mod_format"]);
    expect(item2Groups.map((g) => g.id)).toEqual(["mod_combo_side"]);
  });

  test("rejects inline modifierGroups on item (no refs needed)", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...catalogWithItem({ ...minimalItem, station: "B" }),
        modifierGroups: { mod_format: formatGroup },
        categories: [
          {
            id: "cat_1",
            title: { en: "C", es: "C" },
            notes: [],
            items: [{ ...minimalItem, station: "B", modifierGroups: [formatGroup] }],
          },
        ],
      }),
    ).toThrow(/inline modifierGroups are not allowed/);
  });

  test("rejects unknown modifier ref", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...catalogWithItem({ ...minimalItem, station: "B" }),
        modifierGroups: { mod_format: formatGroup },
        categories: [
          {
            id: "cat_1",
            title: { en: "C", es: "C" },
            notes: [],
            items: [{ ...minimalItem, station: "B", modifierGroupRefs: ["mod_missing"] }],
          },
        ],
      }),
    ).toThrow(/unknown modifier group/);
  });

  test("rejects duplicate ref id", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...catalogWithItem({ ...minimalItem, station: "B" }),
        modifierGroups: { mod_format: formatGroup },
        categories: [
          {
            id: "cat_1",
            title: { en: "C", es: "C" },
            notes: [],
            items: [{ ...minimalItem, station: "B", modifierGroupRefs: ["mod_format", "mod_format"] }],
          },
        ],
      }),
    ).toThrow(/duplicate id/);
  });
});

const expandedItem = {
  ...minimalItem,
  station: "B" as const,
  modifierGroups: [formatGroup, sideGroup],
};

const expandedCatalogBase = {
  catalogVersion: 1,
  publishedAt: "2026-01-01T00:00:00.000Z",
  restaurant: { en: "R", es: "R" },
  menuName: { en: "M", es: "M" },
  themes: { T: ["cat"] },
  orderFees: { serviceFeeRate: 0.05 },
};

describe("parseExpandedMenuCatalogFile", () => {
  test("accepts editor manifest after compact GitHub load", () => {
    const compact = {
      ...expandedCatalogBase,
      modifierGroups: { mod_format: formatGroup, mod_combo_side: sideGroup },
      categories: [
        {
          id: "cat",
          title: { en: "C", es: "C" },
          notes: [],
          modifierGroupRefs: ["mod_format", "mod_combo_side"],
          items: [{ ...minimalItem, station: "B" }],
        },
      ],
    };
    const fromGit = parseMenuCatalogFile(compact);
    const editorManifest = buildManifestForHash({
      catalogVersion: fromGit.catalogVersion,
      publishedAtMs: Date.parse(fromGit.publishedAtIso),
      catalog: fromGit.catalog,
    });
    expect(() => parseMenuCatalogFile(editorManifest)).toThrow(/inline modifierGroups are not allowed/);
    const expanded = parseExpandedMenuCatalogFile(editorManifest);
    expect(expanded.catalog.categories[0]?.items[0]?.modifierGroups?.map((g) => g.id)).toEqual([
      "mod_format",
      "mod_combo_side",
    ]);
  });
});

describe("compactMenuCatalogForDisk", () => {
  test("hoists shared refs to category and omits item refs", () => {
    const source = {
      ...expandedCatalogBase,
      categories: [
        {
          id: "cat",
          title: { en: "C", es: "C" },
          notes: [],
          items: [expandedItem, { ...expandedItem, id: "item_2" }],
        },
      ],
    };
    const compact = compactMenuCatalogForDisk(source);
    expect(Object.keys(compact.modifierGroups ?? {})).toEqual(["mod_format", "mod_combo_side"]);
    expect(compact.categories[0]?.modifierGroupRefs).toEqual(["mod_format", "mod_combo_side"]);
    expect(compact.categories[0]?.items[0]?.modifierGroupRefs).toBeUndefined();
    expect(compact.categories[0]?.items[1]?.modifierGroupRefs).toBeUndefined();
  });

  test("round-trips compact → parse → same group ids", () => {
    const source = {
      ...expandedCatalogBase,
      categories: [
        {
          id: "cat",
          title: { en: "C", es: "C" },
          notes: [],
          items: [expandedItem],
        },
      ],
    };
    const compact = compactMenuCatalogForDisk(source);
    const parsed = parseMenuCatalogFile(compact);
    const groups = parsed.catalog.categories[0]?.items[0]?.modifierGroups ?? [];
    expect(groups.map((g) => g.id)).toEqual(["mod_format", "mod_combo_side"]);
  });

  test("throws on id collision with different bodies", () => {
    const run = () =>
      compactMenuCatalogForDisk({
        ...expandedCatalogBase,
        categories: [
          {
            id: "cat",
            title: { en: "C", es: "C" },
            notes: [],
            items: [
              { ...minimalItem, station: "B" as const, modifierGroups: [formatGroup] },
              {
                ...minimalItem,
                id: "item_2",
                station: "B" as const,
                modifierGroups: [{ ...formatGroup, options: [{ id: "x", label: { en: "X", es: "X" } }] }],
              },
            ],
          },
        ],
      });
    expect(run).toThrow(/id collision/);
  });

  test("preserves themes on disk", () => {
    const source = {
      ...expandedCatalogBase,
      themes: { Breakfast: ["cat"], Lunch: ["cat_other"] },
      categories: [
        {
          id: "cat",
          title: { en: "C", es: "C" },
          notes: [],
          items: [expandedItem],
        },
        {
          id: "cat_other",
          title: { en: "O", es: "O" },
          notes: [],
          items: [{ ...expandedItem, id: "item_other" }],
        },
      ],
    };
    const compact = compactMenuCatalogForDisk(source);
    expect(compact.themes).toEqual({ Breakfast: ["cat"], Lunch: ["cat_other"] });
  });
});

describe("parseMenuCatalogFile themes", () => {
  test("rejects missing themes", () => {
    const { themes: _, ...withoutThemes } = catalogWithItem({ ...minimalItem, station: "B" });
    expect(() => parseMenuCatalogFile(withoutThemes)).toThrow(/themes/);
  });

  test("rejects duplicate category in themes", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...catalogWithItem({ ...minimalItem, station: "B" }),
        themes: { A: ["cat_1"], B: ["cat_1"] },
      }),
    ).toThrow(/duplicate category/);
  });

  test("rejects unknown category id in themes", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...catalogWithItem({ ...minimalItem, station: "B" }),
        themes: { T: ["cat_missing"] },
      }),
    ).toThrow(/unknown category/);
  });

  test("rejects category not assigned to any theme", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...catalogWithItem({ ...minimalItem, station: "B" }),
        themes: { T: [] },
      }),
    ).toThrow(/themes missing category/);
  });
});

describe("parseMenuCatalogFile themeAvailability", () => {
  const base = catalogWithItem({ ...minimalItem, station: "B" });

  test("parses valid themeAvailability", () => {
    const parsed = parseMenuCatalogFile({
      ...base,
      themeAvailability: {
        T: { days: ["mon"], windows: [{ start: "11:00", end: "15:00" }] },
      },
    });
    expect(parsed.catalog.themeAvailability?.T?.days).toEqual(["mon"]);
  });

  test("rejects unknown theme in themeAvailability", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...base,
        themeAvailability: {
          Unknown: { days: ["mon"], windows: [{ start: "11:00", end: "15:00" }] },
        },
      }),
    ).toThrow(/unknown theme/);
  });

  test("rejects invalid weekday", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...base,
        themeAvailability: {
          T: { days: ["monday"], windows: [{ start: "11:00", end: "15:00" }] },
        },
      }),
    ).toThrow(/days\[0\]/);
  });

  test("rejects start >= end", () => {
    expect(() =>
      parseMenuCatalogFile({
        ...base,
        themeAvailability: {
          T: { days: ["mon"], windows: [{ start: "15:00", end: "11:00" }] },
        },
      }),
    ).toThrow(/start must be before end/);
  });

  test("round-trips themeAvailability via compact", () => {
    const source = {
      ...expandedCatalogBase,
      themeAvailability: {
        Lunch: { days: ["fri"], windows: [{ start: "11:00", end: "15:00" }] },
      },
      themes: { Breakfast: ["cat"], Lunch: ["cat_other"] },
      categories: [
        {
          id: "cat",
          title: { en: "C", es: "C" },
          notes: [],
          items: [expandedItem],
        },
        {
          id: "cat_other",
          title: { en: "O", es: "O" },
          notes: [],
          items: [{ ...expandedItem, id: "item_other" }],
        },
      ],
    };
    const compact = compactMenuCatalogForDisk(source);
    expect(compact.themeAvailability).toEqual(source.themeAvailability);
    const parsed = parseMenuCatalogFile(compact);
    expect(parsed.catalog.themeAvailability).toEqual(source.themeAvailability);
  });
});
