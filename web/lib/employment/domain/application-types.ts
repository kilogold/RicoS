import type { Weekday } from "@ricos/shared";

export type EmploymentRole = "kitchen" | "waiter";
export type EmploymentShift = "am" | "pm";
export type EmploymentAvailability = number;

export type EmploymentDayAvailabilityBits = number;

export const EMPLOYMENT_WEEKDAY_ORDER: Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];
