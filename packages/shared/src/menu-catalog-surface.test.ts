import { describe, expect, test } from "bun:test";
import { buildDecodeIndex } from "./menu-versions/index";
import { encodeCartToMetadataV1, decodeCartFromMetadataV1 } from "./cart-codec";
import { createMenuCatalogSurface } from "./menu-catalog-surface";
import type { MenuDocument } from "./menu-types";

const sandwichCatalog: MenuDocument = {
  restaurant: { en: "R", es: "R" },
  menuName: { en: "M", es: "M" },
  orderFees: { serviceFeeRate: 0.05 },
  categories: [
    {
      id: "cat_sandwiches",
      title: { en: "Sandwiches", es: "Sandwiches" },
      notes: [],
      items: [
        {
          id: "item_turkey_sandwich",
          name: { en: "Turkey Sandwich", es: "Turkey Sandwich" },
          description: { en: "", es: "" },
          priceCents: 799,
          station: "B",
          salesTaxRate: 0.105,
          municipalTaxRate: 0.01,
          modifierGroups: [
            {
              id: "mod_sandwich_format",
              title: { en: "Make it a Combo", es: "Hazlo Combo" },
              selectionType: "single",
              required: true,
              minSelections: 1,
              maxSelections: 1,
              options: [
                { id: "opt_format_individual", label: { en: "Individual", es: "Individual" } },
                {
                  id: "opt_format_combo",
                  label: { en: "Combo", es: "Combo" },
                  priceDeltaCents: 399,
                },
              ],
            },
            {
              id: "mod_combo_side",
              title: { en: "Combo Side", es: "Lado" },
              selectionType: "single",
              required: true,
              minSelections: 1,
              maxSelections: 1,
              visibleWhen: {
                groupId: "mod_sandwich_format",
                optionIds: ["opt_format_combo"],
              },
              options: [
                { id: "opt_side_fries", label: { en: "Fries", es: "Papas" } },
                { id: "opt_side_sorullos", label: { en: "Sorullos", es: "Sorullos" } },
              ],
            },
            {
              id: "mod_combo_drink",
              title: { en: "Soft Drink", es: "Refresco" },
              selectionType: "single",
              required: true,
              minSelections: 1,
              maxSelections: 1,
              visibleWhen: {
                groupId: "mod_sandwich_format",
                optionIds: ["opt_format_combo"],
              },
              options: [{ id: "opt_drink_coke", label: { en: "Coke", es: "Coca-Cola" } }],
            },
          ],
        },
      ],
    },
  ],
};

describe("createMenuCatalogSurface visibleWhen", () => {
  const surface = createMenuCatalogSurface(sandwichCatalog);

  test("Individual order validates without combo side or drink", () => {
    const result = surface.validateSelectionsForItem("item_turkey_sandwich", {
      mod_sandwich_format: ["opt_format_individual"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toEqual({
        mod_sandwich_format: ["opt_format_individual"],
      });
    }
  });

  test("Combo order requires side and drink", () => {
    const missingSide = surface.validateSelectionsForItem("item_turkey_sandwich", {
      mod_sandwich_format: ["opt_format_combo"],
      mod_combo_drink: ["opt_drink_coke"],
    });
    expect(missingSide.ok).toBe(false);

    const complete = surface.validateSelectionsForItem("item_turkey_sandwich", {
      mod_sandwich_format: ["opt_format_combo"],
      mod_combo_side: ["opt_side_fries"],
      mod_combo_drink: ["opt_drink_coke"],
    });
    expect(complete.ok).toBe(true);
  });

  test("Combo surcharge applies only when combo selected", () => {
    const individual = surface.getModifierSurchargeCents("item_turkey_sandwich", {
      mod_sandwich_format: ["opt_format_individual"],
    });
    const combo = surface.getModifierSurchargeCents("item_turkey_sandwich", {
      mod_sandwich_format: ["opt_format_combo"],
      mod_combo_side: ["opt_side_fries"],
      mod_combo_drink: ["opt_drink_coke"],
    });
    expect(individual).toBe(0);
    expect(combo).toBe(399);
    expect(surface.getLineUnitPriceCents("item_turkey_sandwich", {
      mod_sandwich_format: ["opt_format_combo"],
      mod_combo_side: ["opt_side_fries"],
      mod_combo_drink: ["opt_drink_coke"],
    })).toBe(1198);
  });

  test("rejects stale inactive combo selections", () => {
    const result = surface.validateSelectionsForItem("item_turkey_sandwich", {
      mod_sandwich_format: ["opt_format_individual"],
      mod_combo_side: ["opt_side_fries"],
    });
    expect(result.ok).toBe(false);
  });

  test("display lines omit inactive groups", () => {
    const lines = surface.getSelectionDisplayLines(
      "item_turkey_sandwich",
      { mod_sandwich_format: ["opt_format_individual"] },
      "en",
    );
    expect(lines).toEqual(["Make it a Combo: Individual"]);
  });
});

describe("cart codec visibleWhen", () => {
  const decodeIndex = buildDecodeIndex(1, sandwichCatalog);
  const lookup = () => decodeIndex;

  test("encodes Individual without combo groups", () => {
    const encoded = encodeCartToMetadataV1(
      1,
      [
        {
          itemId: "item_turkey_sandwich",
          quantity: 1,
          selections: { mod_sandwich_format: ["opt_format_individual"] },
        },
      ],
      decodeIndex,
    );
    const decoded = decodeCartFromMetadataV1(encoded.metadata, lookup);
    expect(decoded.lines[0]?.selections).toEqual({
      mod_sandwich_format: ["opt_format_individual"],
    });
  });

  test("encodes full Combo selections", () => {
    const selections = {
      mod_sandwich_format: ["opt_format_combo"],
      mod_combo_side: ["opt_side_fries"],
      mod_combo_drink: ["opt_drink_coke"],
    };
    const encoded = encodeCartToMetadataV1(
      1,
      [{ itemId: "item_turkey_sandwich", quantity: 1, selections }],
      decodeIndex,
    );
    const decoded = decodeCartFromMetadataV1(encoded.metadata, lookup);
    expect(decoded.lines[0]?.lineUnitTotalCents).toBe(1198);
    expect(decoded.lines[0]?.selections).toEqual(selections);
  });

  test("rejects Combo missing required side at encode time", () => {
    expect(() =>
      encodeCartToMetadataV1(
        1,
        [
          {
            itemId: "item_turkey_sandwich",
            quantity: 1,
            selections: {
              mod_sandwich_format: ["opt_format_combo"],
              mod_combo_drink: ["opt_drink_coke"],
            },
          },
        ],
        decodeIndex,
      ),
    ).toThrow(/mod_combo_side is required/);
  });
});
