import {
  EMPLOYMENT_WEEKDAY_ORDER,
  type EmploymentAvailability,
} from "@/lib/employment/domain/application-types";

export function hasAnyAvailability(availability: EmploymentAvailability): boolean {
  return EMPLOYMENT_WEEKDAY_ORDER.some((day) => availability[day].am || availability[day].pm);
}

export function formatAvailabilitySheetCells(availability: EmploymentAvailability): string[] {
  return EMPLOYMENT_WEEKDAY_ORDER.map((day) => {
    const slot = availability[day];
    if (slot.am && slot.pm) return "AM/PM";
    if (slot.am) return "AM";
    if (slot.pm) return "PM";
    return "";
  });
}
