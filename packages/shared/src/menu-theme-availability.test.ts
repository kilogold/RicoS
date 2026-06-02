import { describe, expect, test } from "bun:test";
import {
  formatThemeAvailabilityLabel,
  isThemeScheduleActive,
  parseThemeTimeHHMM,
} from "./menu-theme-availability";
import type { ThemeAvailability } from "./menu-types";

const lunchAvailability: ThemeAvailability = {
  days: ["mon", "tue", "wed", "thu", "fri"],
  windows: [{ start: "11:00", end: "15:00" }],
};

/** Monday 2026-06-01 12:00 in America/Puerto_Rico (AST, -04:00). */
const monNoonAst = new Date("2026-06-01T16:00:00.000Z");

/** Saturday 2026-06-06 12:00 AST. */
const satNoonAst = new Date("2026-06-06T16:00:00.000Z");

/** Monday 2026-06-01 15:00 AST (window end exclusive). */
const monThreePmAst = new Date("2026-06-01T19:00:00.000Z");

describe("parseThemeTimeHHMM", () => {
  test("parses valid times", () => {
    expect(parseThemeTimeHHMM("t", "11:00")).toBe(11 * 60);
    expect(parseThemeTimeHHMM("t", "15:00")).toBe(15 * 60);
  });

  test("rejects invalid format", () => {
    expect(() => parseThemeTimeHHMM("t", "11")).toThrow(/HH:MM/);
  });
});

describe("isThemeScheduleActive", () => {
  test("active on weekday inside window", () => {
    expect(isThemeScheduleActive(lunchAvailability, monNoonAst)).toBe(true);
  });

  test("inactive on weekend", () => {
    expect(isThemeScheduleActive(lunchAvailability, satNoonAst)).toBe(false);
  });

  test("inactive at end boundary (half-open)", () => {
    expect(isThemeScheduleActive(lunchAvailability, monThreePmAst)).toBe(false);
  });
});

describe("formatThemeAvailabilityLabel", () => {
  test("formats EN label", () => {
    const label = formatThemeAvailabilityLabel(lunchAvailability, "en");
    expect(label).toContain("Mon–Fri");
    expect(label).toContain("11:00 AM");
    expect(label).toContain("3:00 PM");
  });

  test("formats ES label", () => {
    const label = formatThemeAvailabilityLabel(lunchAvailability, "es");
    expect(label).toContain("Lun–Vie");
    expect(label).toContain("11:00");
    expect(label).toContain("15:00");
  });
});
