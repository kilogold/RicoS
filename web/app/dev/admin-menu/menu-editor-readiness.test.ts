import { describe, expect, test } from "vitest";
import { collectMenuReadinessIssues } from "./menu-editor-readiness";
import type { MenuCatalogFile } from "@ricos/shared";

function minimalMenu(overrides: Partial<MenuCatalogFile> = {}): MenuCatalogFile {
  return {
    catalogVersion: 1,
    publishedAt: "2026-01-01T00:00:00.000Z",
    restaurant: { en: "R", es: "R" },
    menuName: { en: "M", es: "M" },
    themes: { all_day: ["cat_main"] },
    categories: [
      {
        id: "cat_main",
        title: { en: "Main", es: "Main" },
        notes: [],
        items: [
          {
            id: "item_1",
            name: { en: "Burger", es: "Burger" },
            description: { en: "", es: "" },
            priceCents: 999,
            salesTaxRate: 0.105,
            municipalTaxRate: 0.01,
            station: "default",
          },
        ],
      },
    ],
    orderFees: { serviceFeeRate: 0.05 },
    ...overrides,
  };
}

describe("collectMenuReadinessIssues", () => {
  test("returns no issues for valid minimal menu", () => {
    expect(collectMenuReadinessIssues(minimalMenu())).toEqual([]);
  });

  test("flags zero price", () => {
    const menu = minimalMenu();
    menu.categories[0]!.items[0]!.priceCents = 0;
    const issues = collectMenuReadinessIssues(menu);
    expect(issues.some((i) => i.message.includes("price"))).toBe(true);
  });

  test("flags unassigned category", () => {
    const menu = minimalMenu({
      themes: { all_day: [] },
      categories: [
        {
          id: "cat_main",
          title: { en: "Main", es: "Main" },
          notes: [],
          items: [],
        },
      ],
    });
    const issues = collectMenuReadinessIssues(menu);
    expect(issues.some((i) => i.message.includes("not assigned"))).toBe(true);
  });

  test("flags incomplete visibleWhen", () => {
    const menu = minimalMenu();
    menu.categories[0]!.items[0]!.modifierGroups = [
      {
        id: "mod_side",
        title: { en: "Side", es: "Side" },
        selectionType: "single",
        required: true,
        minSelections: 1,
        maxSelections: 1,
        visibleWhen: { groupId: "mod_missing", optionIds: [] },
        options: [],
      },
    ];
    const issues = collectMenuReadinessIssues(menu);
    expect(issues.length).toBeGreaterThan(0);
  });
});
