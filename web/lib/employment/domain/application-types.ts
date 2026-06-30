import type { Weekday } from "@ricos/shared";

export type EmploymentRole = "kitchen" | "waiter";
export type EmploymentShift = "am" | "pm";
export type EmploymentAvailabilityDay = Record<EmploymentShift, boolean>;
export type EmploymentAvailability = Record<Weekday, EmploymentAvailabilityDay>;

export const EMPLOYMENT_WEEKDAY_ORDER: Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export function emptyEmploymentAvailability(): EmploymentAvailability {
  return {
    sun: { am: false, pm: false },
    mon: { am: false, pm: false },
    tue: { am: false, pm: false },
    wed: { am: false, pm: false },
    thu: { am: false, pm: false },
    fri: { am: false, pm: false },
    sat: { am: false, pm: false },
  };
}
