import { NextResponse } from "next/server";
import {
  ORDER_SERVICE_MODE_DINE_IN,
  type OrderServiceMode,
} from "@/lib/commerce/order-service-mode";

/** RicoS store wall clock (IANA). Used only for “what time is it at the store?”. */
const STORE_ZONE = "America/Puerto_Rico";
/**
 * Atlantic Standard Time offset for Puerto Rico (no DST).
 * Used to build “today STORE_CLOSE_TIME at the store” without a timezone search.
 */
const STORE_UTC_OFFSET = "-04:00";

export const STORE_CLOSED_CODE = "STORE_CLOSED" as const;
export const DINE_IN_UNAVAILABLE_CODE = "DINE_IN_UNAVAILABLE" as const;

export class StoreClosedError extends Error {
  readonly code = STORE_CLOSED_CODE;
  constructor(message?: string) {
    super(message ?? "Store is closed for orders.");
    this.name = "StoreClosedError";
  }
}

export type StoreSessionStatus = "closed" | "open" | "last_call";

export type StoreSession = {
  status: StoreSessionStatus;
  closesAt: Date;
};

type HoursOverride = "force-open" | "force-closed";

let cachedClock: { openMin: number; lastCallMin: number; closeMin: number } | undefined;

function readHoursOverride(): HoursOverride | null {
  const raw = process.env.STORE_HOURS_OVERRIDE?.trim();
  if (!raw) return null;
  if (raw === "1") return "force-open";
  if (raw === "2") return "force-closed";
  console.warn("STORE_HOURS_OVERRIDE invalid value; ignoring:", raw);
  return null;
}

/** Minutes since local midnight [0, 1439]. */
function parseStoreTime(name: string, raw: string | undefined): number {
  const trimmedRaw = raw?.trim();
  if (!trimmedRaw) {
    throw new Error(`${name} is required (HH:MM, 24h).`);
  }

  // Match the whole env value as `H` or `HH`, then `:`, then exactly two minute digits.
  // Examples: `8:00`, `08:30`. Capture groups are the hour and minute substrings only;
  // numeric ranges (0–23 / 0–59) are enforced after `Number(...)`, not by the pattern.
  const STORE_TIME_HH_MM_PATTERN = /^(\d{1,2}):(\d{2})$/;
  const timeFormatMatch = STORE_TIME_HH_MM_PATTERN.exec(trimmedRaw);
  if (!timeFormatMatch) {
    throw new Error(`${name} must be HH:MM (24h), got: ${JSON.stringify(raw)}`);
  }

  const hourPart = timeFormatMatch[1];
  const minutePart = timeFormatMatch[2];
  const hourNumber = Number(hourPart);
  const minuteNumber = Number(minutePart);

  const MIN_CLOCK_HOUR = 0;
  const MAX_CLOCK_HOUR = 23;
  const MIN_CLOCK_MINUTE = 0;
  const MAX_CLOCK_MINUTE = 59;
  const MINUTES_PER_CLOCK_HOUR = 60;

  if (
    !Number.isInteger(hourNumber) ||
    !Number.isInteger(minuteNumber) ||
    hourNumber < MIN_CLOCK_HOUR ||
    hourNumber > MAX_CLOCK_HOUR ||
    minuteNumber < MIN_CLOCK_MINUTE ||
    minuteNumber > MAX_CLOCK_MINUTE
  ) {
    throw new Error(`${name} out of range (hour 0–23, minute 0–59): ${JSON.stringify(raw)}`);
  }
  return hourNumber * MINUTES_PER_CLOCK_HOUR + minuteNumber;
}

/**
 * Half-open local-day segments (same calendar day at the store):
 * open [OPEN, LAST), last_call [LAST, CLOSE), closed otherwise.
 */
function storeClock(): { openMin: number; lastCallMin: number; closeMin: number } {
  if (cachedClock) return cachedClock;
  const openMin = parseStoreTime("STORE_OPEN_TIME", process.env.STORE_OPEN_TIME);
  const lastCallMin = parseStoreTime("STORE_LAST_CALL_TIME", process.env.STORE_LAST_CALL_TIME);
  const closeMin = parseStoreTime("STORE_CLOSE_TIME", process.env.STORE_CLOSE_TIME);
  if (!(openMin < lastCallMin && lastCallMin < closeMin)) {
    throw new Error(
      `Store times must satisfy OPEN < LAST_CALL < CLOSE (minutes since midnight). Got OPEN=${openMin} LAST=${lastCallMin} CLOSE=${closeMin}.`,
    );
  }
  cachedClock = { openMin, lastCallMin, closeMin };
  return cachedClock;
}

/** Tests only — env changes between cases. */
export function __resetStoreHoursCacheForTests(): void {
  cachedClock = undefined;
}

function storeLocalFields(now: Date): {
  calendarYear: number;
  calendarMonth: number;
  dayOfMonth: number;
  hourOfDay: number;
  minuteOfHour: number;
  secondOfMinute: number;
} {
  const FORMAT_LOCALE = "en-US";
  const storeWallClockFormatter = new Intl.DateTimeFormat(FORMAT_LOCALE, {
    timeZone: STORE_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const formatParts = storeWallClockFormatter.formatToParts(now);
  const PARSE_INT_RADIX = 10;
  const MISSING_PART_FALLBACK = "0";

  const parsePartToInteger = (partType: Intl.DateTimeFormatPartTypes) =>
    parseInt(
      formatParts.find((part) => part.type === partType)?.value ?? MISSING_PART_FALLBACK,
      PARSE_INT_RADIX,
    );

  return {
    calendarYear: parsePartToInteger("year"),
    calendarMonth: parsePartToInteger("month"),
    dayOfMonth: parsePartToInteger("day"),
    hourOfDay: parsePartToInteger("hour"),
    minuteOfHour: parsePartToInteger("minute"),
    secondOfMinute: parsePartToInteger("second"),
  };
}

function localSecondsSinceMidnight(now: Date): number {
  const wallClock = storeLocalFields(now);
  const SECONDS_PER_HOUR = 3600;
  const SECONDS_PER_MINUTE = 60;
  return (
    wallClock.hourOfDay * SECONDS_PER_HOUR +
    wallClock.minuteOfHour * SECONDS_PER_MINUTE +
    wallClock.secondOfMinute
  );
}

/** Today at STORE_CLOSE_TIME on the store calendar, as a UTC Date. */
function closesAtTonight(now: Date, closeMin: number): Date {
  const localCalendar = storeLocalFields(now);
  const MINUTES_PER_HOUR = 60;
  const DISPLAY_WIDTH = 2;
  const DISPLAY_PAD_CHARACTER = "0";
  const CLOSE_SECONDS_PART = "00";

  const closeHourComponent = Math.floor(closeMin / MINUTES_PER_HOUR);
  const closeMinuteRemainder = closeMin % MINUTES_PER_HOUR;

  const monthPadded = String(localCalendar.calendarMonth).padStart(
    DISPLAY_WIDTH,
    DISPLAY_PAD_CHARACTER,
  );
  const dayPadded = String(localCalendar.dayOfMonth).padStart(
    DISPLAY_WIDTH,
    DISPLAY_PAD_CHARACTER,
  );
  const hourPadded = String(closeHourComponent).padStart(DISPLAY_WIDTH, DISPLAY_PAD_CHARACTER);
  const minutePadded = String(closeMinuteRemainder).padStart(
    DISPLAY_WIDTH,
    DISPLAY_PAD_CHARACTER,
  );

  const isoLocalInstantForClose = `${localCalendar.calendarYear}-${monthPadded}-${dayPadded}T${hourPadded}:${minutePadded}:${CLOSE_SECONDS_PART}${STORE_UTC_OFFSET}`;
  return new Date(isoLocalInstantForClose);
}

function naturalStatus(now: Date): StoreSessionStatus {
  const { openMin, lastCallMin, closeMin } = storeClock();
  const SECONDS_PER_MINUTE = 60;
  const secondsSinceLocalMidnight = localSecondsSinceMidnight(now);
  const openWindowStartSeconds = openMin * SECONDS_PER_MINUTE;
  const lastCallWindowStartSeconds = lastCallMin * SECONDS_PER_MINUTE;
  const orderingCutoffSeconds = closeMin * SECONDS_PER_MINUTE;

  if (
    secondsSinceLocalMidnight >= openWindowStartSeconds &&
    secondsSinceLocalMidnight < lastCallWindowStartSeconds
  ) {
    return "open";
  }
  if (
    secondsSinceLocalMidnight >= lastCallWindowStartSeconds &&
    secondsSinceLocalMidnight < orderingCutoffSeconds
  ) {
    return "last_call";
  }
  return "closed";
}

export function getStoreSession(now: Date): StoreSession {
  const { closeMin } = storeClock();
  const override = readHoursOverride();
  const closesAt = closesAtTonight(now, closeMin);

  if (override === "force-open") {
    return { status: "open", closesAt };
  }
  if (override === "force-closed") {
    return { status: "closed", closesAt };
  }

  return { status: naturalStatus(now), closesAt };
}

export function shoppingEnabled(session: StoreSession): boolean {
  return session.status === "open" || session.status === "last_call";
}

export function dineInOrderingEnabled(session: StoreSession): boolean {
  return session.status === "open";
}

export function storeClosedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Store is closed for orders.", code: STORE_CLOSED_CODE },
    { status: 403 },
  );
}

export function dineInUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: "Dine-in is unavailable during last call.", code: DINE_IN_UNAVAILABLE_CODE },
    { status: 403 },
  );
}

export function assertStoreOpenOr403(): NextResponse | null {
  if (readHoursOverride() === "force-open") return null;
  if (shoppingEnabled(getStoreSession(new Date()))) return null;
  return storeClosedResponse();
}

export function assertServiceModeAvailableOr403(serviceMode: OrderServiceMode): NextResponse | null {
  if (serviceMode !== ORDER_SERVICE_MODE_DINE_IN) return null;
  if (dineInOrderingEnabled(getStoreSession(new Date()))) return null;
  return dineInUnavailableResponse();
}
