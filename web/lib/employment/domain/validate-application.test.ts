import { describe, expect, test } from "bun:test";
import { emptyEmploymentAvailability } from "@/lib/employment/domain/application-types";
import {
  formatAvailabilitySheetCells,
  hasAnyAvailability,
} from "@/lib/employment/domain/format-availability-sheet-cells";
import {
  EMPLOYMENT_RESUME_MAX_BYTES,
  validateEmploymentApplication,
} from "@/lib/employment/domain/validate-application";

function validAvailabilityJson(): string {
  const availability = emptyEmploymentAvailability();
  availability.mon.am = true;
  availability.thu.pm = true;
  return JSON.stringify(availability);
}

function buildValidFormData(): FormData {
  const formData = new FormData();
  formData.set("fullName", "Ana Rivera");
  formData.set("phone", "(787) 555-1234");
  formData.set("role", "kitchen");
  formData.set("availability", validAvailabilityJson());
  formData.set("resume", new File(["test"], "resume.pdf", { type: "application/pdf" }));
  return formData;
}

describe("validateEmploymentApplication", () => {
  test("accepts valid payload", () => {
    const result = validateEmploymentApplication(buildValidFormData());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.phone).toBe("(787) 555-1234");
    expect(result.value.role).toBe("kitchen");
    expect(result.value.availability.mon.am).toBe(true);
  });

  test("rejects invalid role", () => {
    const formData = buildValidFormData();
    formData.set("role", "manager");
    const result = validateEmploymentApplication(formData);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.role).toBe("Role must be kitchen or waiter.");
  });

  test("rejects invalid phone", () => {
    const formData = buildValidFormData();
    formData.set("phone", "787");
    const result = validateEmploymentApplication(formData);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.phone).toBe("Phone must be a 10-digit US phone number.");
  });

  test("rejects availability with zero selected slots", () => {
    const formData = buildValidFormData();
    formData.set("availability", JSON.stringify(emptyEmploymentAvailability()));
    const result = validateEmploymentApplication(formData);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.availability).toBe("Select at least one availability slot.");
  });

  test("rejects unsupported resume extension", () => {
    const formData = buildValidFormData();
    formData.set("resume", new File(["test"], "resume.png", { type: "image/png" }));
    const result = validateEmploymentApplication(formData);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.resume).toBe("Resume must be a PDF, DOC, or DOCX file.");
  });

  test("rejects oversized resume", () => {
    const formData = buildValidFormData();
    const large = new Uint8Array(EMPLOYMENT_RESUME_MAX_BYTES + 1);
    formData.set("resume", new File([large], "resume.pdf", { type: "application/pdf" }));
    const result = validateEmploymentApplication(formData);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.resume).toBe("Resume must be 5 MB or less.");
  });
});

describe("formatAvailabilitySheetCells", () => {
  test("maps AM/PM flags to sortable day cells", () => {
    const availability = emptyEmploymentAvailability();
    availability.sun.am = true;
    availability.tue.pm = true;
    availability.thu.am = true;
    availability.thu.pm = true;

    expect(hasAnyAvailability(availability)).toBe(true);
    expect(formatAvailabilitySheetCells(availability)).toEqual([
      "AM",
      "",
      "PM",
      "",
      "AM/PM",
      "",
      "",
    ]);
  });
});
