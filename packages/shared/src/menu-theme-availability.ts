import type {
  Language,
  MenuDocument,
  ThemeAvailability,
  ThemeAvailabilityMap,
  ThemeTimeWindow,
  Weekday,
} from "./menu-types";

export const MENU_STORE_TIMEZONE = "America/Puerto_Rico";

const WEEKDAY_ORDER: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const WEEKDAY_SHORT_EN: Record<Weekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

const WEEKDAY_SHORT_ES: Record<Weekday, string> = {
  sun: "Dom",
  mon: "Lun",
  tue: "Mar",
  wed: "Mié",
  thu: "Jue",
  fri: "Vie",
  sat: "Sáb",
};

const MINUTES_PER_HOUR = 60;
const MIN_CLOCK_HOUR = 0;
const MAX_CLOCK_HOUR = 23;
const MIN_CLOCK_MINUTE = 0;
const MAX_CLOCK_MINUTE = 59;

const HH_MM_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** Minutes since local midnight [0, 1439]. */
export function parseThemeTimeHHMM(name: string, raw: string): number {
  const trimmed = raw.trim();
  const match = HH_MM_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(`${name} must be HH:MM (24h), got: ${JSON.stringify(raw)}`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < MIN_CLOCK_HOUR ||
    hour > MAX_CLOCK_HOUR ||
    minute < MIN_CLOCK_MINUTE ||
    minute > MAX_CLOCK_MINUTE
  ) {
    throw new Error(`${name} out of range (hour 0–23, minute 0–59): ${JSON.stringify(raw)}`);
  }
  return hour * MINUTES_PER_HOUR + minute;
}

export function isValidWeekday(raw: string): raw is Weekday {
  return (WEEKDAY_ORDER as string[]).includes(raw);
}

function storeLocalWeekdayAndMinutes(now: Date, timeZone: string): { weekday: Weekday; minutes: number } {
  const FORMAT_LOCALE = "en-US";
  const formatter = new Intl.DateTimeFormat(FORMAT_LOCALE, {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const parsePart = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "";
  const weekdayMap: Record<string, Weekday> = {
    Sun: "sun",
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
    Sat: "sat",
  };
  const weekday = weekdayMap[weekdayShort];
  if (!weekday) {
    throw new Error(`Unsupported weekday from formatter: ${weekdayShort}`);
  }

  const minutes = parsePart("hour") * MINUTES_PER_HOUR + parsePart("minute");
  return { weekday, minutes };
}

/**
 * True when current store-local weekday and time fall in the availability rule.
 */
export function isThemeScheduleActive(
  availability: ThemeAvailability,
  now: Date,
  timeZone: string = MENU_STORE_TIMEZONE,
): boolean {
  const { weekday, minutes } = storeLocalWeekdayAndMinutes(now, timeZone);
  if (!availability.days.includes(weekday)) return false;

  for (const window of availability.windows) {
    const startMin = parseThemeTimeHHMM("window.start", window.start);
    const endMin = parseThemeTimeHHMM("window.end", window.end);
    if (minutes >= startMin && minutes < endMin) return true;
  }
  return false;
}

export type ThemeScheduleStatus = "always" | "active" | "inactive";

export function getThemeScheduleStatus(
  catalog: MenuDocument,
  theme: string,
  now: Date,
  timeZone: string = MENU_STORE_TIMEZONE,
): ThemeScheduleStatus {
  const availability = catalog.themeAvailability?.[theme];
  if (!availability) return "always";
  return isThemeScheduleActive(availability, now, timeZone) ? "active" : "inactive";
}

function formatMinutesForDisplay(minutes: number, language: Language): string {
  const hour = Math.floor(minutes / MINUTES_PER_HOUR);
  const minute = minutes % MINUTES_PER_HOUR;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (language === "es") {
    return `${pad(hour)}:${pad(minute)}`;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad(minute)} ${period}`;
}

function formatDayRanges(days: Weekday[], language: Language): string {
  const labels = language === "es" ? WEEKDAY_SHORT_ES : WEEKDAY_SHORT_EN;
  const sorted = [...new Set(days)].sort((a, b) => WEEKDAY_INDEX[a] - WEEKDAY_INDEX[b]);
  if (sorted.length === 0) return "";

  const ranges: string[] = [];
  let rangeStart = sorted[0]!;
  let rangeEnd = rangeStart;

  for (let i = 1; i < sorted.length; i++) {
    const day = sorted[i]!;
    if (WEEKDAY_INDEX[day] === WEEKDAY_INDEX[rangeEnd] + 1) {
      rangeEnd = day;
      continue;
    }
    ranges.push(
      rangeStart === rangeEnd
        ? labels[rangeStart]
        : `${labels[rangeStart]}–${labels[rangeEnd]}`,
    );
    rangeStart = day;
    rangeEnd = day;
  }
  ranges.push(
    rangeStart === rangeEnd
      ? labels[rangeStart]
      : `${labels[rangeStart]}–${labels[rangeEnd]}`,
  );
  return ranges.join(", ");
}

function formatWindow(window: ThemeTimeWindow, language: Language): string {
  const startMin = parseThemeTimeHHMM("window.start", window.start);
  const endMin = parseThemeTimeHHMM("window.end", window.end);
  return `${formatMinutesForDisplay(startMin, language)}–${formatMinutesForDisplay(endMin, language)}`;
}

/** Human-readable schedule for storefront banners. */
export function formatThemeAvailabilityLabel(
  availability: ThemeAvailability,
  language: Language,
): string {
  const daysPart = formatDayRanges(availability.days, language);
  const windowsPart = availability.windows
    .map((w) => formatWindow(w, language))
    .join(language === "es" ? "; " : "; ");
  return `${daysPart} · ${windowsPart}`;
}

export type { ThemeAvailabilityMap };
