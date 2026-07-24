"use client";

import type { Weekday } from "@ricos/shared";
import type {
  EmploymentAvailability,
  EmploymentShift,
} from "@/lib/employment/domain/application-types";
import { EMPLOYMENT_WEEKDAY_ORDER } from "@/lib/employment/domain/application-types";
import { isAvailabilityShiftSelected } from "@/lib/employment/domain/bitwise-operations";

type AvailabilityGridProps = {
  availability: EmploymentAvailability;
  weekdayLabels: Record<Weekday, string>;
  amLabel: string;
  pmLabel: string;
  dayLabel: string;
  disabled?: boolean;
  onToggle: (day: Weekday, shift: EmploymentShift) => void;
};

export function AvailabilityGrid({
  availability,
  weekdayLabels,
  amLabel,
  pmLabel,
  dayLabel,
  disabled,
  onToggle,
}: AvailabilityGridProps) {
  return (
    <table className="w-full border-separate border-spacing-y-2 text-left text-sm">
      <thead>
        <tr className="text-muted">
          <th className="font-medium">{dayLabel}</th>
          <th className="w-20 text-center font-medium">{amLabel}</th>
          <th className="w-20 text-center font-medium">{pmLabel}</th>
        </tr>
      </thead>
      <tbody>
        {EMPLOYMENT_WEEKDAY_ORDER.map((day) => {
          const isAmSelected = isAvailabilityShiftSelected(availability, day, "am");
          const isPmSelected = isAvailabilityShiftSelected(availability, day, "pm");
          return (
            <tr key={day} className="rounded-lg bg-background">
              <td className="rounded-l-lg px-4 py-3 text-foreground">{weekdayLabels[day]}</td>
              <td className="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={isAmSelected}
                  onChange={() => onToggle(day, "am")}
                  disabled={disabled}
                  aria-label={`${weekdayLabels[day]} ${amLabel}`}
                  className="h-6 w-6 accent-accent"
                />
              </td>
              <td className="rounded-r-lg px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={isPmSelected}
                  onChange={() => onToggle(day, "pm")}
                  disabled={disabled}
                  aria-label={`${weekdayLabels[day]} ${pmLabel}`}
                  className="h-6 w-6 accent-accent"
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
