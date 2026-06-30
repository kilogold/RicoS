import {
  CUSTOMER_NAME_MAX_LEN,
  CUSTOMER_PHONE_FORMATTED_MAX_LEN,
  US_PHONE_DIGIT_COUNT,
  formatUsPhoneInput,
  toUsLocalPhoneDigits,
} from "@/lib/commerce/domain/customer-contact";
import {
  EMPLOYMENT_WEEKDAY_ORDER,
  emptyEmploymentAvailability,
  type EmploymentAvailability,
  type EmploymentRole,
} from "@/lib/employment/domain/application-types";
import { hasAnyAvailability } from "@/lib/employment/domain/format-availability-sheet-cells";

export const EMPLOYMENT_RESUME_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_RESUME_EXTENSIONS = new Set(["pdf", "doc", "docx"]);
const ACCEPTED_RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type ApplicationFieldErrors = Partial<
  Record<"fullName" | "phone" | "role" | "availability" | "resume", string>
>;

export type NormalizedEmploymentApplication = {
  fullName: string;
  phone: string;
  role: EmploymentRole;
  availability: EmploymentAvailability;
  resume: File;
};

export type ValidateEmploymentApplicationResult =
  | { ok: true; value: NormalizedEmploymentApplication }
  | { ok: false; error: string; fieldErrors: ApplicationFieldErrors };

function readTextField(formData: FormData, field: string): string {
  const entry = formData.get(field);
  return typeof entry === "string" ? entry.trim() : "";
}

function fileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1]! : "";
}

function parseAvailabilityJson(raw: string): EmploymentAvailability | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const src = parsed as Record<string, unknown>;
  const availability = emptyEmploymentAvailability();
  for (const day of EMPLOYMENT_WEEKDAY_ORDER) {
    const dayValue = src[day];
    if (!dayValue || typeof dayValue !== "object" || Array.isArray(dayValue)) return null;
    const dayObj = dayValue as Record<string, unknown>;
    if (typeof dayObj.am !== "boolean" || typeof dayObj.pm !== "boolean") return null;
    availability[day] = { am: dayObj.am, pm: dayObj.pm };
  }
  return availability;
}

function validateResumeFile(file: File | null): string | null {
  if (!file) return "Resume is required.";
  if (file.size <= 0) return "Resume file is empty.";
  if (file.size > EMPLOYMENT_RESUME_MAX_BYTES) {
    return `Resume must be 5 MB or less.`;
  }
  const ext = fileExtension(file.name);
  const mimeType = file.type.toLowerCase();
  const validByExt = ACCEPTED_RESUME_EXTENSIONS.has(ext);
  const validByMime = ACCEPTED_RESUME_MIME_TYPES.has(mimeType);
  if (!validByExt && !validByMime) {
    return "Resume must be a PDF, DOC, or DOCX file.";
  }
  return null;
}

export function validateEmploymentApplication(formData: FormData): ValidateEmploymentApplicationResult {
  const fieldErrors: ApplicationFieldErrors = {};
  const fullName = readTextField(formData, "fullName");
  const phoneInput = readTextField(formData, "phone");
  const roleRaw = readTextField(formData, "role");
  const availabilityRaw = readTextField(formData, "availability");
  const resumeEntry = formData.get("resume");
  const resume = resumeEntry instanceof File ? resumeEntry : null;

  if (!fullName) {
    fieldErrors.fullName = "Full name is required.";
  } else if (fullName.length > CUSTOMER_NAME_MAX_LEN) {
    fieldErrors.fullName = `Full name must be at most ${CUSTOMER_NAME_MAX_LEN} characters.`;
  }

  if (!phoneInput) {
    fieldErrors.phone = "Phone number is required.";
  } else if (phoneInput.length > CUSTOMER_PHONE_FORMATTED_MAX_LEN) {
    fieldErrors.phone = `Phone must be at most ${CUSTOMER_PHONE_FORMATTED_MAX_LEN} characters.`;
  }
  const phoneDigits = toUsLocalPhoneDigits(phoneInput);
  if (!fieldErrors.phone && phoneDigits.length !== US_PHONE_DIGIT_COUNT) {
    fieldErrors.phone = "Phone must be a 10-digit US phone number.";
  }

  if (roleRaw !== "kitchen" && roleRaw !== "waiter") {
    fieldErrors.role = "Role must be kitchen or waiter.";
  }
  const role = roleRaw as EmploymentRole;

  const availability = parseAvailabilityJson(availabilityRaw);
  if (!availability) {
    fieldErrors.availability = "Availability is invalid.";
  } else if (!hasAnyAvailability(availability)) {
    fieldErrors.availability = "Select at least one availability slot.";
  }

  const resumeError = validateResumeFile(resume);
  if (resumeError) fieldErrors.resume = resumeError;

  if (Object.keys(fieldErrors).length > 0 || !availability || !resume) {
    return { ok: false, error: "invalid_application", fieldErrors };
  }

  return {
    ok: true,
    value: {
      fullName,
      phone: formatUsPhoneInput(phoneDigits),
      role,
      availability,
      resume,
    },
  };
}
