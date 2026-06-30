import type { Weekday } from "@ricos/shared";
import {
  EMPLOYMENT_WEEKDAY_ORDER,
  type EmploymentAvailability,
  type EmploymentDayAvailabilityBits,
  type EmploymentShift,
} from "@/lib/employment/domain/application-types";

/**
 * Employment availability bitmask helpers.
 *
 * Purpose:
 * - Keep all low-level bitwise details in one module.
 * - Expose semantic helpers for UI, validation, and sheet formatting.
 *
 * Data mapping (16-bit unsigned mask):
 * - Every day consumes 2 bits.
 * - Within each day pair: bit0 = AM, bit1 = PM.
 * - Day pair values: 00 = none, 01 = AM, 10 = PM, 11 = AM/PM.
 *
 * Bit layout (least-significant to most-significant):
 * - bits 1:0   => Sun
 * - bits 3:2   => Mon
 * - bits 5:4   => Tue
 * - bits 7:6   => Wed
 * - bits 9:8   => Thu
 * - bits 11:10 => Fri
 * - bits 13:12 => Sat
 * - bits 15:14 => reserved (must remain unset)
 */
const SHIFT_BITS_PER_DAY = 2;
const SHIFT_AM_BIT_OFFSET = 0;
const SHIFT_PM_BIT_OFFSET = 1;
const DAY_SHIFT_MASK = 0b11;
const EMPTY_AVAILABILITY_MASK = 0;
const BITWISE_BASE_ONE = 1;
const MASK_BIT_WIDTH = Uint16Array.BYTES_PER_ELEMENT * 8;
const USED_DAY_COUNT = EMPLOYMENT_WEEKDAY_ORDER.length;
const USED_MASK_BIT_WIDTH = USED_DAY_COUNT * SHIFT_BITS_PER_DAY;
const MAX_MASK_VALUE = (BITWISE_BASE_ONE << MASK_BIT_WIDTH) - BITWISE_BASE_ONE;
const MIN_MASK_VALUE = EMPTY_AVAILABILITY_MASK;
const USED_DAY_MASK = (BITWISE_BASE_ONE << USED_MASK_BIT_WIDTH) - BITWISE_BASE_ONE;
const RESERVED_MASK = MAX_MASK_VALUE ^ USED_DAY_MASK;
const DAY_BITS_NONE = 0b00;
const DAY_BITS_AM = 0b01;
const DAY_BITS_PM = 0b10;
const DAY_BITS_AM_PM = 0b11;
const DAY_CELL_LABEL_NONE = "";
const DAY_CELL_LABEL_AM = "AM";
const DAY_CELL_LABEL_PM = "PM";
const DAY_CELL_LABEL_AM_PM = "AM/PM";

const EMPLOYMENT_WEEKDAY_INDEX: Record<Weekday, number> = {
  sun: EMPLOYMENT_WEEKDAY_ORDER.indexOf("sun"),
  mon: EMPLOYMENT_WEEKDAY_ORDER.indexOf("mon"),
  tue: EMPLOYMENT_WEEKDAY_ORDER.indexOf("tue"),
  wed: EMPLOYMENT_WEEKDAY_ORDER.indexOf("wed"),
  thu: EMPLOYMENT_WEEKDAY_ORDER.indexOf("thu"),
  fri: EMPLOYMENT_WEEKDAY_ORDER.indexOf("fri"),
  sat: EMPLOYMENT_WEEKDAY_ORDER.indexOf("sat"),
};

function shiftBitOffset(shift: EmploymentShift): number {
  return shift === "am" ? SHIFT_AM_BIT_OFFSET : SHIFT_PM_BIT_OFFSET;
}

function dayBitOffset(day: Weekday): number {
  return EMPLOYMENT_WEEKDAY_INDEX[day] * SHIFT_BITS_PER_DAY;
}

function bitOffsetFor(day: Weekday, shift: EmploymentShift): number {
  return dayBitOffset(day) + shiftBitOffset(shift);
}

function dayMask(day: Weekday): number {
  return DAY_SHIFT_MASK << dayBitOffset(day);
}

function sanitizeToUsedBits(mask: number): EmploymentAvailability {
  return mask & USED_DAY_MASK;
}

function isMaskRangeValue(mask: number): boolean {
  return Number.isSafeInteger(mask) && mask >= MIN_MASK_VALUE && mask <= MAX_MASK_VALUE;
}

export function emptyEmploymentAvailability(): EmploymentAvailability {
  return EMPTY_AVAILABILITY_MASK;
}

export function normalizeEmploymentAvailability(mask: number): EmploymentAvailability {
  return sanitizeToUsedBits(mask);
}

export function parseEmploymentAvailability(raw: string): EmploymentAvailability | null {
  const trimmedRaw = raw.trim();
  if (!trimmedRaw) return null;

  const parsedMask = Number(trimmedRaw);
  if (!Number.isInteger(parsedMask)) return null;
  if (!isMaskRangeValue(parsedMask)) return null;
  if (employmentAvailabilityHasReservedBits(parsedMask)) return null;

  return normalizeEmploymentAvailability(parsedMask);
}

export function employmentAvailabilityHasReservedBits(mask: number): boolean {
  return (mask & RESERVED_MASK) !== EMPTY_AVAILABILITY_MASK;
}

export function availabilityHasAnyShift(mask: EmploymentAvailability): boolean {
  return sanitizeToUsedBits(mask) !== EMPTY_AVAILABILITY_MASK;
}

export function readDayAvailability(
  mask: EmploymentAvailability,
  day: Weekday,
): EmploymentDayAvailabilityBits {
  return (mask & dayMask(day)) >> dayBitOffset(day);
}

export function isAvailabilityShiftSelected(
  mask: EmploymentAvailability,
  day: Weekday,
  shift: EmploymentShift,
): boolean {
  const shiftMask = BITWISE_BASE_ONE << bitOffsetFor(day, shift);
  return (mask & shiftMask) !== EMPTY_AVAILABILITY_MASK;
}

export function toggleAvailabilityShift(
  mask: EmploymentAvailability,
  day: Weekday,
  shift: EmploymentShift,
): EmploymentAvailability {
  const shiftMask = BITWISE_BASE_ONE << bitOffsetFor(day, shift);
  return sanitizeToUsedBits(mask ^ shiftMask);
}

export function availabilityToDayCellLabel(mask: EmploymentAvailability, day: Weekday): string {
  const dayBits = readDayAvailability(mask, day);
  if (dayBits === DAY_BITS_NONE) return DAY_CELL_LABEL_NONE;
  if (dayBits === DAY_BITS_AM_PM) return DAY_CELL_LABEL_AM_PM;
  if (dayBits === DAY_BITS_AM) return DAY_CELL_LABEL_AM;
  if (dayBits === DAY_BITS_PM) return DAY_CELL_LABEL_PM;
  return DAY_CELL_LABEL_NONE;
}
