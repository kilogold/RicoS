import {
  EMPLOYMENT_WEEKDAY_ORDER,
  type EmploymentAvailability,
} from "@/lib/employment/domain/application-types";
import { availabilityToDayCellLabel } from "@/lib/employment/domain/bitwise-operations";

export { availabilityHasAnyShift as hasAnyAvailability } from "@/lib/employment/domain/bitwise-operations";

export function formatAvailabilitySheetCells(availability: EmploymentAvailability): string[] {
  return EMPLOYMENT_WEEKDAY_ORDER.map((day) => availabilityToDayCellLabel(availability, day));
}
