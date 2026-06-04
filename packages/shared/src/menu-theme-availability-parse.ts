import { parseThemeTimeHHMM, isValidWeekday } from "./menu-theme-availability";
import type { ThemeAvailability, ThemeAvailabilityMap, ThemeTimeWindow, Weekday } from "./menu-types";

function parseThemeTimeWindow(raw: unknown, ctx: string): ThemeTimeWindow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid menu: ${ctx}`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.start !== "string" || !o.start.trim()) {
    throw new Error(`Invalid menu: ${ctx}.start`);
  }
  if (typeof o.end !== "string" || !o.end.trim()) {
    throw new Error(`Invalid menu: ${ctx}.end`);
  }
  const startMin = parseThemeTimeHHMM(`${ctx}.start`, o.start);
  const endMin = parseThemeTimeHHMM(`${ctx}.end`, o.end);
  if (!(startMin < endMin)) {
    throw new Error(`Invalid menu: ${ctx} start must be before end (same-day window)`);
  }
  return { start: o.start.trim(), end: o.end.trim() };
}

function parseThemeAvailabilityEntry(raw: unknown, theme: string): ThemeAvailability {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid menu: themeAvailability["${theme}"]`);
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.days) || o.days.length === 0) {
    throw new Error(`Invalid menu: themeAvailability["${theme}"].days`);
  }
  const days: Weekday[] = [];
  const seenDays = new Set<Weekday>();
  for (let i = 0; i < o.days.length; i++) {
    const day = o.days[i];
    if (typeof day !== "string" || !isValidWeekday(day)) {
      throw new Error(`Invalid menu: themeAvailability["${theme}"].days[${i}]`);
    }
    if (seenDays.has(day)) {
      throw new Error(`Invalid menu: themeAvailability["${theme}"].days duplicate "${day}"`);
    }
    seenDays.add(day);
    days.push(day);
  }

  if (!Array.isArray(o.windows) || o.windows.length === 0) {
    throw new Error(`Invalid menu: themeAvailability["${theme}"].windows`);
  }
  const windows = o.windows.map((w, i) =>
    parseThemeTimeWindow(w, `themeAvailability["${theme}"].windows[${i}]`),
  );

  return { days, windows };
}

export function parseThemeAvailability(
  raw: unknown,
  themeKeys: Set<string>,
): ThemeAvailabilityMap | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid menu: themeAvailability");
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return undefined;

  const map: ThemeAvailabilityMap = {};
  for (const [theme, value] of entries) {
    if (!theme) throw new Error("Invalid menu: themeAvailability empty theme key");
    if (!themeKeys.has(theme)) {
      throw new Error(`Invalid menu: themeAvailability unknown theme "${theme}"`);
    }
    map[theme] = parseThemeAvailabilityEntry(value, theme);
  }
  return map;
}
