import { describe, expect, test } from "bun:test";
import { buildThemedMenuSections } from "./menu-themes";
import type { MenuDocument } from "./menu-types";

function catalog(themes: MenuDocument["themes"], categories: MenuDocument["categories"]): MenuDocument {
  return {
    restaurant: { en: "R", es: "R" },
    menuName: { en: "M", es: "M" },
    themes,
    categories,
    orderFees: { serviceFeeRate: 0.05 },
  };
}

describe("buildThemedMenuSections", () => {
  test("orders themes and categories per themes map", () => {
    const doc = catalog(
      {
        Breakfast: ["cat_a", "cat_b"],
        Lunch: ["cat_c"],
      },
      [
        { id: "cat_a", title: { en: "A", es: "A" }, notes: [], items: [] },
        { id: "cat_b", title: { en: "B", es: "B" }, notes: [], items: [] },
        { id: "cat_c", title: { en: "C", es: "C" }, notes: [], items: [] },
      ],
    );

    const sections = buildThemedMenuSections(doc);
    expect(sections.map((s) => s.theme)).toEqual(["Breakfast", "Lunch"]);
    expect(sections[0]?.categories.map((c) => c.id)).toEqual(["cat_a", "cat_b"]);
    expect(sections[1]?.categories.map((c) => c.id)).toEqual(["cat_c"]);
    expect(sections.every((s) => s.scheduleActive)).toBe(true);
  });

  test("sets scheduleActive from themeAvailability and now", () => {
    const doc = catalog(
      { Lunch: ["cat_c"] },
      [{ id: "cat_c", title: { en: "C", es: "C" }, notes: [], items: [] }],
    );
    doc.themeAvailability = {
      Lunch: {
        days: ["mon"],
        windows: [{ start: "11:00", end: "15:00" }],
      },
    };

    const active = buildThemedMenuSections(doc, { now: new Date("2026-06-01T16:00:00.000Z") });
    expect(active[0]?.scheduleActive).toBe(true);

    const inactive = buildThemedMenuSections(doc, { now: new Date("2026-06-06T16:00:00.000Z") });
    expect(inactive[0]?.scheduleActive).toBe(false);
  });
});
